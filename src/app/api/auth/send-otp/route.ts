/* eslint-disable @typescript-eslint/no-explicit-any */
// app/api/auth/send-otp/route.ts
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import dbConnect from "@/lib/mongodb";
import OTP from "@/model/Otp";

// Environment variables
const SMARTPING_API_URL = process.env.SMARTPING_API_URL || "https://backend.api-wa.co/campaign/smartping/api/v2";
const SMARTPING_API_KEY = process.env.SMARTPING_API_KEY || "";

// In-memory rate limiting cache
// For production with multiple instances, consider using Redis instead
const rateLimitCache = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS = 5; // 5 requests per 15 minutes

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Extract IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Parse request body once
    const body = await req.json();
    const { phone, countryCode = "+91" } = body;
    
    // Early validation to avoid unnecessary processing
    if (!phone || !/^\d{10}$/.test(phone)) {
      return NextResponse.json(
        { success: false, message: "Valid 10-digit phone number is required" },
        { status: 400 }
      );
    }
    
    // Apply rate limiting
    const rateLimitKey = `${ip}:${phone}`;
    const now = Date.now();
    const userRateLimit = rateLimitCache.get(rateLimitKey);
    
    if (userRateLimit) {
      if (now - userRateLimit.timestamp < RATE_LIMIT_WINDOW) {
        if (userRateLimit.count >= MAX_REQUESTS) {
          return NextResponse.json(
            { success: false, message: "Too many OTP requests. Please try again later." },
            { status: 429 }
          );
        }
        
        rateLimitCache.set(rateLimitKey, {
          count: userRateLimit.count + 1,
          timestamp: userRateLimit.timestamp
        });
      } else {
        // Reset if window expired
        rateLimitCache.set(rateLimitKey, { count: 1, timestamp: now });
      }
    } else {
      rateLimitCache.set(rateLimitKey, { count: 1, timestamp: now });
    }
    
    // Connect to database (using the optimized connection handler)
    await dbConnect();
    
    // Check for existing unexpired OTP to prevent spam
    const existingOtp = await OTP.findOne({ phone });
    if (existingOtp) {
      const otpAge = now - existingOtp.createdAt.getTime();
      if (otpAge < 60000) { // 1 minute
        return NextResponse.json({ 
          success: false, 
          message: "Please wait before requesting another OTP" 
        }, { status: 429 });
      }
    }
    
    // Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in MongoDB - use a write operation that doesn't need to return the full document
    await OTP.updateOne(
      { phone },
      { 
        $set: {
          countryCode,
          otp, 
          createdAt: new Date()
        }
      },
      { upsert: true }
    );
    
    // Send OTP via WhatsApp with timeout to avoid hanging
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      await axios.post(
        SMARTPING_API_URL,
        {
          apiKey: SMARTPING_API_KEY,
          campaignName: "Form OTP Verification",
          destination: phone,
          userName: "Bskilling",
          templateParams: [`${otp}`],
          source: "new-landing-page form",
          media: {
            url: "https://whatsapp-media-library.s3.ap-south-1.amazonaws.com/IMAGE/6353da2e153a147b991dd812/4958901_highanglekidcheatingschooltestmin.jpg",
            filename: "sample_media",
          },
          buttons: [
            {
              type: "button",
              sub_type: "url",
              index: 0,
              parameters: [
                {
                  type: "text",
                  text: otp + "",
                },
              ],
            },
          ],
          carouselCards: [],
          location: {},
          attributes: {},
          paramsFallbackValue: {
            code: otp,
          },
        },
        {
          headers: { "Content-Type": "application/json" },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      return NextResponse.json({ 
        success: true, 
        message: "OTP sent successfully",
        // In development mode only, return the OTP
        ...(process.env.NODE_ENV === 'development' && { otp })
      });
      
    } catch (error: any) {
      console.error("WhatsApp API error:", error.message);
      
      // Still return success if we know the OTP was saved - the WhatsApp API might just be slow
      // This helps prevent API failures from blocking the entire flow
      return NextResponse.json({ 
        success: true, 
        message: "OTP generated successfully. If you don't receive it via WhatsApp, please check your phone number and try again.",
        ...(process.env.NODE_ENV === 'development' && { otp })
      });
    }
    
  } catch (error: any) {
    console.error("Error sending OTP:", error.message);
    return NextResponse.json(
      { success: false, message: "An error occurred while processing your request" },
      { status: 500 }
    );
  }
}