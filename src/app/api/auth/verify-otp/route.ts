/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/auth/verify-otp/route.ts
import dbConnect from "@/lib/mongodb";
import OTP from "@/model/Otp";
import { NextRequest, NextResponse } from "next/server";
// import dbConnect from "@/lib/dbConnect";
// import OTP from "@/models/OTP";
// import { SignJWT } from "jose";

// Secret key for JWT signing
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback-secret-key-change-in-production"
);

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Parse request body
    const body = await req.json();
    const { phone, otp } = body;
    
    // Early validation
    if (!phone || !otp) {
      return NextResponse.json(
        { success: false, message: "Phone number and OTP are required" },
        { status: 400 }
      );
    }
    
    if (!/^\d{10}$/.test(phone) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json(
        { success: false, message: "Invalid phone number or OTP format" },
        { status: 400 }
      );
    }
    
    // Connect to database
    await dbConnect();
    
    // Find the OTP record with minimal projection (only get fields we need)
    const otpRecord = await OTP.findOne(
      { phone, otp }, 
      { _id: 1, createdAt: 1 }
    ).lean();
    
    if (!otpRecord) {
      return NextResponse.json(
        { success: false, message: "Invalid OTP" },
        { status: 400 }
      );
    }
    
    // Check if OTP is expired (should be handled by TTL, but double-check)
    const now = Date.now();
    const otpCreationTime = new Date(otpRecord?.createdAt).getTime();
    if (now - otpCreationTime > 5 * 60 * 1000) { // 5 minutes
      // Delete expired OTP
      await OTP.deleteOne({ _id: otpRecord?._id });
      
      return NextResponse.json(
        { success: false, message: "OTP has expired" },
        { status: 400 }
      );
    }
    
    // Delete the OTP record to prevent reuse - don't wait for this to complete
    OTP.deleteOne({ _id: otpRecord?._id }).catch((err: any) => 
      console.error("Error deleting used OTP:", err)
    );
    
    // Create a phone verification token (valid for 10 minutes)
    // Use a short expiry to reduce security risks
    const token = await new SignJWT({ 
      phone,
      verified: true
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("10m") // Valid for 10 minutes
      .sign(JWT_SECRET);
    
    return NextResponse.json({
      success: true,
      message: "Phone number verified successfully",
      token
    });
    
  } catch (error: any) {
    console.error("Error verifying OTP:", error.message);
    return NextResponse.json(
      { success: false, message: "An error occurred while verifying OTP" },
      { status: 500 }
    );
  }
}