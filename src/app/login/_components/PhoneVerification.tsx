// components/PhoneVerification.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PhoneIcon } from "@heroicons/react/24/outline";

// Define the props interface
interface PhoneVerificationProps {
  onVerificationComplete?: (token: string, phoneNumber: string) => void;
}

// Optimized fetch with timeout and retry logic
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 3,
  timeout = 10000
) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (retries > 0 && error instanceof Error && error.name === "AbortError") {
      // Wait with increasing backoff before retrying
      const backoffTime = 1000 * 2 ** (3 - retries);
      await new Promise((resolve) => setTimeout(resolve, backoffTime));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    throw error;
  }
};

export default function PhoneVerification({
  onVerificationComplete,
}: PhoneVerificationProps) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [token, setToken] = useState("");
  const [requestId, setRequestId] = useState<string>("");

  // Handle cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [cooldown]);

  // Restore phone number from localStorage
  useEffect(() => {
    const savedPhone = localStorage.getItem("lastPhoneNumber");
    if (savedPhone) {
      setPhoneNumber(savedPhone);
    }
  }, []);

  // Handle API errors with better categorization
  const handleApiError = useCallback(
    (error: unknown, defaultMessage: string) => {
      // Network errors - could be retried
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        return "Network error. Please check your connection.";
      }

      // Timeout errors - server might be overloaded
      if (error instanceof Error && error.name === "AbortError") {
        return "Server is busy. Please try again in a moment.";
      }

      // Known API errors
      if (error instanceof Error && error.message.includes("rate limit")) {
        return "Too many requests. Please wait before trying again.";
      }

      // Default case
      return error instanceof Error ? error.message : defaultMessage;
    },
    []
  );

  const handlePhoneChange = useCallback((value: string) => {
    const cleaned = value.replace(/\D/g, "");
    setPhoneNumber(cleaned);
    localStorage.setItem("lastPhoneNumber", cleaned);
  }, []);

  const handleSendOTP = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      // Validate phone number
      if (!/^\d{10}$/.test(phoneNumber)) {
        setError("Please enter a valid 10-digit phone number");
        return;
      }

      setIsLoading(true);

      try {
        // Generate a request ID for tracking
        const reqId = Math.random().toString(36).substring(2, 15);
        setRequestId(reqId);

        // Add small random delay to distribute server load (0-1000ms)
        const randomDelay = Math.floor(Math.random() * 1000);
        await new Promise((resolve) => setTimeout(resolve, randomDelay));

        const response = await fetchWithRetry(
          "/api/auth/send-otp",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": reqId,
            },
            body: JSON.stringify({
              phone: phoneNumber,
            }),
          },
          2,
          15000
        ); // 2 retries, 15 second timeout

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to send OTP");
        }

        // Start cooldown timer (60 seconds)
        setCooldown(60);
        setStep("otp");

        // For development, auto-fill OTP if returned
        if (data.otp) {
          setOtp(data.otp);
        }
      } catch (err) {
        setError(handleApiError(err, "Failed to send OTP"));
      } finally {
        setIsLoading(false);
      }
    },
    [phoneNumber, handleApiError]
  );

  const handleVerifyOTP = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      // Validate OTP
      if (!/^\d{6}$/.test(otp)) {
        setError("Please enter a valid 6-digit OTP");
        return;
      }

      setIsLoading(true);

      try {
        const response = await fetchWithRetry(
          "/api/auth/verify-otp",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": requestId,
            },
            body: JSON.stringify({
              phone: phoneNumber,
              otp,
            }),
          },
          2,
          10000
        ); // 2 retries, 10 second timeout

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Failed to verify OTP");
        }

        // Store verification token
        setToken(data.token);

        // Notify parent component that verification is complete
        if (onVerificationComplete) {
          onVerificationComplete(data.token, phoneNumber);
        }
      } catch (err) {
        setError(handleApiError(err, "Failed to verify OTP"));
      } finally {
        setIsLoading(false);
      }
    },
    [otp, phoneNumber, requestId, onVerificationComplete, handleApiError]
  );

  // Memoize form elements to reduce re-renders
  const phoneForm = useMemo(
    () => (
      <form onSubmit={handleSendOTP}>
        <div className="mb-4">
          <label
            htmlFor="phone"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            WhatsApp Number
          </label>
          <div className="flex">
            <span className="inline-flex items-center px-3 bg-gray-100 text-gray-700 border border-r-0 border-gray-300 rounded-l-md">
              +91
            </span>
            <input
              id="phone"
              type="tel"
              className="block w-full px-4 py-3 border border-gray-300 rounded-r-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="10-digit number"
              value={phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={10}
              inputMode="numeric"
              autoComplete="tel"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-md text-white font-medium ${
            isLoading || cooldown > 0
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={isLoading || cooldown > 0}
        >
          {isLoading
            ? "Sending..."
            : cooldown > 0
            ? `Resend in ${cooldown}s`
            : "Send OTP"}
        </button>
      </form>
    ),
    [phoneNumber, isLoading, cooldown, handleSendOTP, handlePhoneChange]
  );

  const otpForm = useMemo(
    () => (
      <form onSubmit={handleVerifyOTP}>
        <div className="mb-4">
          <label
            htmlFor="otp"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            OTP Code
          </label>
          <input
            id="otp"
            type="text"
            className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </div>

        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-md text-white font-medium ${
            isLoading
              ? "bg-blue-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={isLoading}
        >
          {isLoading ? "Verifying..." : "Verify OTP"}
        </button>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            Didn&apos;t receive the code?{" "}
            {cooldown > 0 ? (
              <span className="text-gray-500">Resend in {cooldown}s</span>
            ) : (
              <button
                type="button"
                className="text-blue-600 hover:text-blue-800 font-medium"
                onClick={() => {
                  setStep("phone");
                  setOtp("");
                }}
              >
                Resend OTP
              </button>
            )}
          </p>
        </div>
      </form>
    ),
    [otp, isLoading, cooldown, handleVerifyOTP]
  );

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      <div className="px-6 py-8">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-blue-100 p-3 rounded-full">
            <PhoneIcon className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
          {step === "phone" ? "Enter your WhatsApp number" : "Enter OTP"}
        </h2>

        <p className="text-center text-gray-600 mb-6">
          {step === "phone"
            ? "We will send a verification code to your WhatsApp"
            : "Enter the 6-digit code sent to your WhatsApp"}
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}

        {step === "phone" ? phoneForm : otpForm}
      </div>
    </div>
  );
}
