/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/auth/verify-roll/route.ts
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import Student, { IStudent } from "@/model/Student";

// Secret key for JWT verification
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production"
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Track request for monitoring
  const requestId =
    req.headers.get("x-request-id") ||
    `roll-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const startTime = Date.now();

  try {
    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, message: "Invalid request format" },
        { status: 400 }
      );
    }

    const { rollNumber, token } = body;

    // Input validation
    if (!rollNumber || !token) {
      return NextResponse.json(
        { success: false, message: "Roll number and token required" },
        { status: 400 }
      );
    }

    // Verify token before database operations
    let payload;
    try {
      const { payload: verifiedPayload } = await jwtVerify(token, JWT_SECRET);
      payload = verifiedPayload;
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Verification token expired or invalid. Please verify your phone number again.",
        },
        { status: 401 }
      );
    }

    const { phone, verified } = payload as any;

    if (!verified) {
      return NextResponse.json(
        { success: false, message: "Phone number not verified" },
        { status: 401 }
      );
    }

    // Connect to database
    await dbConnect();

    // Find student by roll number with minimal projection
    const student = (await Student.findOne(
      { "Student RollNo": rollNumber.trim() },
      {
        "Student Name": 1,
        "Student RollNo": 1,
        Branch: 1,
        "College Name": 1,
        attempted: 1,
        sessionData: 1,
        "Course ID": 1,
        "University Name": 1,
      }
    ).lean()) as IStudent | null;

    if (!student) {
      return NextResponse.json(
        {
          success: false,
          message: "Student not found. Please check your roll number.",
        },
        { status: 404 }
      );
    }

    // Check if student has already attempted the exam
    if (student.attempted) {
      return NextResponse.json(
        { success: false, message: "You have already attempted this exam." },
        { status: 400 }
      );
    }

    // Check for existing active session
    if (student.sessionData?.isActive) {
      const expiryTime = new Date(student.sessionData.expiresAt || 0);

      if (expiryTime > new Date()) {
        const deviceInfo = student.sessionData.deviceId || "another device";
        return NextResponse.json(
          {
            success: false,
            message: `You already have an active session on ${deviceInfo}. Only one device can be used at a time.`,
          },
          { status: 409 }
        );
      }
    }

    // Create session expiry time (5 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 5);

    // Get device info
    const userAgent = req.headers.get("user-agent") || "unknown";
    const deviceId = userAgent.substring(0, 50); // Truncate for storage

    // Update student record with phone and session data
    await Student.updateOne(
      // @ts-expect-error ts(2349)
      { _id: student._id },
      {
        $set: {
          Student_Phone: phone, // Update phone number from verification
          "sessionData.isActive": true,
          "sessionData.startTime": new Date(),
          "sessionData.deviceId": deviceId,
          "sessionData.expiresAt": expiresAt,
        },
      }
    );

    // Create session token
    const sessionToken = await new SignJWT({
      // @ts-expect-error ts(2349)

      studentId: student._id.toString(),
      rollNumber: student["Student RollNo"],
      phone,
      name: student["Student Name"],
      sessionStart: new Date().toISOString(),
      sessionExpires: expiresAt.toISOString(),
      courseId: student["Course ID"],
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("5h") // 5 hours, matching session length
      .sign(JWT_SECRET);

    // Set HTTP-only cookie
    (
      await // Set HTTP-only cookie
      cookies()
    ).set("session_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 5 * 60 * 60, // 5 hours in seconds
      path: "/",
    });

    // Log performance metrics
    const processingTime = Date.now() - startTime;
    console.log(
      `[${requestId}] Roll verification completed in ${processingTime}ms`
    );

    // Return success response
    return NextResponse.json({
      success: true,
      message: "Login successful",
      studentName: student["Student Name"],
      expiresAt: expiresAt.toISOString(),
      studentInfo: {
        name: student["Student Name"],
        rollNumber: student["Student RollNo"],
        branch: student.Branch,
        college: student["College Name"],
        courseId: student["Course ID"],
        university: student["University Name"],
      },
    });
  } catch (error: any) {
    console.error(`[${requestId}] Error verifying roll number:`, error);

    // Detect database connectivity issues
    if (
      error?.name === "MongoNetworkError" ||
      error.message.includes("connection") ||
      error.message.includes("timeout")
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            "We're experiencing high traffic. Please try again in a moment.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message:
          "An error occurred while verifying your roll number. Please try again.",
      },
      { status: 500 }
    );
  }
}
