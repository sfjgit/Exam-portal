/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/exam/submit/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import dbConnect from "@/lib/mongodb";
import Student from "@/model/Student";
import { QuestionModel } from "@/model/Question";

// JWT Secret for session verification
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production"
);

function calculateMarks(
  questions: any[],
  userAnswers: { [key: string]: number | null }
): number {
  // Convert the user answers object to an array

  const answerarr = Object.values(userAnswers);
  let mark = 0;
  for (let i = 0; i < questions.length; i++) {
    if (questions[i].correctAnswer.includes(answerarr[i])) {
      mark += 1;
    }
  }

  return mark;
}

export async function POST(req: NextRequest) {
  // Track request for monitoring
  const requestId = `submit-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  const startTime = Date.now();

  try {
    // Verify session token
    const sessionToken = req.cookies.get("session_token")?.value;
    if (!sessionToken) {
      return NextResponse.json(
        { success: false, message: "Unauthorized access" },
        { status: 401 }
      );
    }

    // Verify JWT token
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

    // Parse request body - only answers should be sent
    const body = await req.json();
    const { answers } = body;

    // Validate input
    if (!answers) {
      return NextResponse.json(
        {
          success: false,
          message: "Answers are required",
        },
        { status: 400 }
      );
    }

    // Extract necessary information from token payload
    const { studentId, courseId, name } = payload;

    // Connect to database
    await dbConnect();

    // Find student by ID to ensure token matches database
    const student = await Student.findById(studentId);

    if (!student) {
      return NextResponse.json(
        { success: false, message: "Student not found" },
        { status: 404 }
      );
    }

    // Check if student has already attempted the exam
    if (student.attempted) {
      return NextResponse.json(
        {
          success: false,
          message: "Exam already attempted",
          code: "ALREADY_ATTEMPTED",
        },
        { status: 400 }
      );
    }

    // Retrieve form/questions for the course
    const form = await QuestionModel.findOne({
      formId: courseId?.toString(),
    }).lean();

    if (!form) {
      return NextResponse.json(
        { success: false, message: "Form not found for this course" },
        { status: 404 }
      );
    }

    // Calculate marks
    // @ts-ignore
    const marks = calculateMarks(form?.questions, answers);

    // Update student record
    await Student.findByIdAndUpdate(studentId, {
      $set: {
        marks,
        answers,
        attempted: true,
        "sessionData.isActive": false,
      },
    });

    // Log performance metrics
    const processingTime = Date.now() - startTime;
    console.log(
      `[${requestId}] Exam submission processed in ${processingTime}ms for ${name}`
    );

    // Return success response
    return NextResponse.json({
      success: true,
      message: "Exam submitted successfully",
      // @ts-ignore

      totalQuestions: form?.questions.length,
    });
  } catch (error: any) {
    console.error(`[${requestId}] Exam submission error:`, error);

    // Detect database connectivity issues
    if (
      error?.name === "MongoNetworkError" ||
      error.message.includes("connection") ||
      error.message.includes("timeout")
    ) {
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
        message: "An error occurred during exam submission",
      },
      { status: 500 }
    );
  }
}
