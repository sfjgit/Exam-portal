/* eslint-disable @typescript-eslint/no-unused-vars */
// components/RollNumberVerification.tsx
"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  IdentificationIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

interface RollNumberVerificationProps {
  verificationToken: string;
  phoneNumber: string;
  onSuccess: (
    expiresAt: string,
    studentName: string,
    courseId?: number
  ) => void;
  onTokenExpired: () => void; // Add callback for token expiration
}

// Optimized fetch function with retry logic
const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 2,
  timeout = 12000
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
      // Exponential backoff
      const backoffTime = 1000 * 2 ** (2 - retries);
      await new Promise((resolve) => setTimeout(resolve, backoffTime));
      return fetchWithRetry(url, options, retries - 1, timeout);
    }
    throw error;
  }
};

export default function RollNumberVerification({
  verificationToken,
  phoneNumber,
  onSuccess,
  onTokenExpired,
}: RollNumberVerificationProps) {
  const [rollNumber, setRollNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastSubmitTime, setLastSubmitTime] = useState(0);

  // Check token validity on component mount
  useEffect(() => {
    // Simple validation - tokens are typically longer than 50 chars
    if (!verificationToken || verificationToken.length < 50) {
      onTokenExpired();
    }

    // Decode token without verification to check expiry
    try {
      const tokenParts = verificationToken.split(".");
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        const expTime = payload.exp * 1000; // Convert to milliseconds

        if (expTime < Date.now()) {
          onTokenExpired();
        }
      }
    } catch (e) {
      // If token can't be decoded, it's likely invalid
      onTokenExpired();
    }
  }, [verificationToken, onTokenExpired]);

  // Error handler with categorization
  const handleApiError = useCallback(
    (error: unknown) => {
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        return "Network error. Please check your connection.";
      }

      if (error instanceof Error && error.name === "AbortError") {
        return "Server is busy. Please try again in a moment.";
      }

      if (
        error instanceof Error &&
        (error.message.includes("not found") ||
          error.message.includes("Student not found"))
      ) {
        return "Roll number not found. Please check and try again.";
      }

      if (error instanceof Error && error.message.includes("session")) {
        return "You already have an active session from another device.";
      }

      // Handle token expiration errors specifically
      if (
        error instanceof Error &&
        error.message.includes("token") &&
        (error.message.includes("expired") ||
          error.message.includes("invalid") ||
          error.message.includes("verification"))
      ) {
        // Trigger token expired callback
        setTimeout(() => onTokenExpired(), 1500);
        return "Your verification has expired. Redirecting to phone verification...";
      }

      return error instanceof Error
        ? error.message
        : "Failed to verify roll number";
    },
    [onTokenExpired]
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");

      const trimmedRollNumber = rollNumber.trim();
      if (!trimmedRollNumber) {
        setError("Please enter your roll number");
        return;
      }

      // Prevent rapid multiple submissions
      const now = Date.now();
      if (now - lastSubmitTime < 2000) {
        // 2 second threshold
        setError("Please wait before trying again");
        return;
      }
      setLastSubmitTime(now);

      setIsLoading(true);

      try {
        // Add small random delay to distribute server load (0-500ms)
        const randomDelay = Math.floor(Math.random() * 500);
        await new Promise((resolve) => setTimeout(resolve, randomDelay));

        // Generate request ID
        const requestId = `roll-${Date.now()}-${Math.random()
          .toString(36)
          .substring(2, 9)}`;

        const response = await fetchWithRetry(
          "/api/auth/verify-roll",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Request-ID": requestId,
            },
            body: JSON.stringify({
              rollNumber: trimmedRollNumber,
              token: verificationToken,
            }),
          },
          2,
          15000
        ); // 2 retries, 15 second timeout

        // Parse response
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          throw new Error("Invalid response from server");
        }

        if (!response.ok) {
          // Check for token-related errors
          if (response.status === 401) {
            // Clear local stored token data
            try {
              sessionStorage.removeItem("verificationToken");
              sessionStorage.removeItem("phoneNumber");
            } catch (e) {
              console.error("Error clearing session storage:", e);
            }

            throw new Error(
              "Verification token expired. Please verify your phone number again."
            );
          }
          throw new Error(data.message || "Failed to verify roll number");
        }

        // Call success callback with session expiry time, student name, and courseId
        onSuccess(data.expiresAt, data.studentName, data.studentInfo?.courseId);
        localStorage.setItem(
          "studentSession",
          JSON.stringify(data.studentInfo)
        );

        // Clear the roll number from state for security
        setRollNumber("");
      } catch (err) {
        setError(handleApiError(err));

        // If the error suggests a server overload, wait longer before allowing retry
        if (err instanceof Error && err.name === "AbortError") {
          setLastSubmitTime(Date.now() + 3000);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [rollNumber, verificationToken, onSuccess, lastSubmitTime, handleApiError]
  );

  // Memoize the form to prevent unnecessary re-renders
  const rollNumberForm = useMemo(
    () => (
      <form onSubmit={handleSubmit} className="w-full">
        <div className="mb-4">
          <label
            htmlFor="rollNumber"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Roll Number
          </label>
          <input
            id="rollNumber"
            type="text"
            className="block w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
            placeholder="Enter your roll number"
            value={rollNumber}
            onChange={(e) => setRollNumber(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck="false"
            aria-describedby="rollNumberHelp"
            required
            disabled={isLoading}
          />
          <p id="rollNumberHelp" className="mt-1 text-xs text-gray-500">
            Enter the roll number exactly as provided by your institution
          </p>
        </div>

        <button
          type="submit"
          className={`w-full py-3 px-4 rounded-md text-white font-medium flex items-center justify-center ${
            isLoading
              ? "bg-green-400 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700"
          }`}
          disabled={isLoading}
        >
          {isLoading ? (
            "Verifying..."
          ) : (
            <>
              Start Exam
              <ArrowRightIcon className="ml-2 h-5 w-5" />
            </>
          )}
        </button>
      </form>
    ),
    [rollNumber, isLoading, handleSubmit]
  );

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden">
      <div className="px-6 py-8">
        <div className="flex items-center justify-center mb-6">
          <div className="bg-green-100 p-3 rounded-full">
            <IdentificationIcon className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">
          Enter Your Roll Number
        </h2>

        <p className="text-center text-gray-600 mb-6">
          Your WhatsApp number{" "}
          <span className="font-medium">{phoneNumber}</span> has been verified
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700">
            {error}
          </div>
        )}

        {rollNumberForm}
      </div>
    </div>
  );
}
