/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/exam/questions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import dbConnect from "@/lib/mongodb";
import { QuestionModel } from "@/model/Question";

// Performance optimization constants
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour cache
const MAX_CACHE_ENTRIES = 100; // Limit in-memory cache size

// Global in-memory cache for question sets
const QUESTION_CACHE = new Map<
  string,
  {
    questions: any[];
    timestamp: number;
  }
>();

// JWT Secret for session verification
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production"
);

export async function GET(req: NextRequest) {
  // Generate unique request identifier for tracking
  const requestStart = Date.now();
  const requestId = `questions-${requestStart}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  try {
    // 1. Session Token Verification
    const sessionToken = req.cookies.get("session_token")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 401 }
      );
    }

    // 2. JWT Token Validation
    let payload;
    try {
      const { payload: verifiedPayload } = await jwtVerify(
        sessionToken,
        JWT_SECRET
      );
      payload = verifiedPayload;
    } catch (error) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired session" },
        { status: 401 }
      );
    }

    // 3. Extract Form ID
    const formId = req.nextUrl.searchParams.get("formId") || payload.formId;
    if (!formId) {
      return NextResponse.json(
        { success: false, message: "Form ID is required" },
        { status: 400 }
      );
    }

    // 4. Check In-Memory Cache
    const cachedEntry = QUESTION_CACHE.get(formId);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < CACHE_DURATION) {
      return NextResponse.json({
        success: true,
        formId,
        questions: cachedEntry.questions,
        metadata: {
          totalQuestions: cachedEntry.questions.length,
          cacheHit: true,
        },
      });
    }

    // 5. Database Connection
    await dbConnect();

    // 6. Fetch Questions with Minimal Projection
    const form = await QuestionModel.findOne(
      { formId },
      {
        "questions.questionId": 1,
        "questions.question": 1,
        "questions.options": 1,
      }
    ).lean();

    // 7. Validate Form Existence
    if (!form) {
      return NextResponse.json(
        { success: false, message: "Form not found" },
        { status: 404 }
      );
    }

    // 8. Prepare Safe Questions (Remove Sensitive Data)
    const safeQuestions = form.questions.map((q) => ({
      id: q.questionId,
      question: q.question,
      options: q.options,
    }));

    // 9. Shuffle Questions for Exam Integrity
    const shuffledQuestions = shuffleArray(safeQuestions);

    // 10. Cache Management
    QUESTION_CACHE.set(formId, {
      questions: shuffledQuestions,
      timestamp: Date.now(),
    });

    // Prevent cache from growing indefinitely
    if (QUESTION_CACHE.size > MAX_CACHE_ENTRIES) {
      const oldestKey = QUESTION_CACHE.keys().next().value;
      QUESTION_CACHE.delete(oldestKey);
    }

    // 11. Performance Logging
    const processingTime = Date.now() - requestStart;
    console.log(
      `[${requestId}] Questions fetched in ${processingTime}ms - Form: ${formId}`
    );

    // 12. Return Response
    return NextResponse.json({
      success: true,
      formId,
      questions: shuffledQuestions,
      metadata: {
        totalQuestions: shuffledQuestions.length,
        fetchTime: processingTime,
        cacheHit: false,
      },
    });
  } catch (error: any) {
    // 13. Comprehensive Error Handling
    console.error(`[${requestId}] Question fetch error:`, error);

    // Specific error type detection
    if (error.name === "MongoNetworkError") {
      return NextResponse.json(
        {
          success: false,
          message: "Database connectivity issue. Please try again.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: "An error occurred while fetching questions",
      },
      { status: 500 }
    );
  }
}

// Optimized Shuffle Algorithm (Fisher-Yates)
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
