// app/login/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CheckIcon } from "@heroicons/react/24/outline";

// Dynamic imports with loading fallbacks for code splitting
const PhoneVerification = dynamic(
  () => import("@/components/PhoneVerification"),
  {
    loading: () => <LoadingPlaceholder />,
  }
);

const RollNumberVerification = dynamic(
  () => import("@/components/RollNumber"),
  {
    loading: () => <LoadingPlaceholder />,
  }
);

// Simple loading placeholder
function LoadingPlaceholder() {
  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden animate-pulse">
      <div className="px-6 py-8 flex flex-col items-center space-y-4">
        <div className="w-12 h-12 bg-blue-200 rounded-full"></div>
        <div className="h-6 bg-gray-200 rounded w-3/4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        <div className="h-10 bg-gray-200 rounded w-full"></div>
        <div className="h-10 bg-blue-200 rounded w-full"></div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const [step, setStep] = useState<"phone" | "roll">("phone");
  const [token, setToken] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isInitialized, setIsInitialized] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const router = useRouter();

  // Initialize and check for existing session
  useEffect(() => {
    try {
      // Check for an active session
      const sessionExpiry = localStorage.getItem("sessionExpiry");
      if (sessionExpiry && new Date(sessionExpiry).getTime() > Date.now()) {
        router.push("/exam");
        return;
      }

      // Recovery in case of page refresh during verification
      const savedToken = sessionStorage.getItem("verificationToken");
      const savedPhone = sessionStorage.getItem("phoneNumber");
      if (savedToken && savedPhone) {
        setToken(savedToken);
        setPhoneNumber(savedPhone);
        setStep("roll");
      }
    } catch (error) {
      console.error("Session check error:", error);
    } finally {
      // Add a minimal delay to ensure smooth transition
      setTimeout(() => setIsInitialized(true), 10);
    }
  }, [router]);

  // // Global error boundary wrapper for callbacks
  // const safeExecute = useCallback(
  //   <T extends any[]>(fn: (...args: T) => void, ...args: T) => {
  //     try {
  //       fn(...args);
  //     } catch (error) {
  //       console.error("Execution error:", error);
  //       setGlobalError(
  //         "An unexpected error occurred. Please refresh the page."
  //       );
  //     }
  //   },
  //   []
  // );

  // Handle phone verification completion
  const handlePhoneVerified = useCallback((token: string, phone: string) => {
    setToken(token);
    setPhoneNumber(phone);
    setStep("roll");

    // Store in sessionStorage for recovery if page is refreshed
    try {
      sessionStorage.setItem("verificationToken", token);
      sessionStorage.setItem("phoneNumber", phone);
    } catch (error) {
      console.error("Storage error:", error);
      // Continue anyway even if storage fails
    }
  }, []);

  // Handle roll number verification success

  const handleRollVerified = useCallback(
    (expiresAt: string, studentName: string, courseId?: number) => {
      try {
        // Securely store session information
        window.localStorage.setItem("sessionExpiry", expiresAt);
        window.localStorage.setItem("studentName", studentName);

        // Optionally store courseId if provided
        if (courseId !== undefined) {
          window.localStorage.setItem("courseId", courseId.toString());
        }

        // Clear sensitive verification data from session storage
        window.sessionStorage.removeItem("verificationToken");
        window.sessionStorage.removeItem("phoneNumber");

        // Generate a timestamp to prevent browser caching
        const timestamp = Date.now();

        // Redirect to exam page with unique timestamp
        router.push(`/exam?t=${timestamp}`);
      } catch (error) {
        console.error("Session storage error:", error);

        // Fallback redirect if storage fails
        router.push("/exam");

        // Optionally, log the error to a monitoring service
        // logErrorToMonitoringService(error);
      }
    },
    [router]
  );

  const handleTokenExpired = useCallback(() => {
    // Clear verification data
    sessionStorage.removeItem("verificationToken");
    sessionStorage.removeItem("phoneNumber");

    // Reset to phone verification step
    setStep("phone");
    setToken("");
    setPhoneNumber("");

    // Optional: Show notification to user
    setGlobalError(
      "Your verification has expired. Please verify your phone number again."
    );
  }, []);

  // Handle page visibility changes to detect tab switching
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && step === "roll") {
        // Check if token is still valid when user returns to the tab
        const tokenTimestamp = sessionStorage.getItem("tokenTimestamp");
        if (
          tokenTimestamp &&
          Date.now() - parseInt(tokenTimestamp) > 10 * 60 * 1000
        ) {
          // Token likely expired (10 min), reset to phone step
          setGlobalError(
            "Your verification has expired. Please verify your phone number again."
          );
          setStep("phone");
          sessionStorage.removeItem("verificationToken");
          sessionStorage.removeItem("phoneNumber");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [step]);

  // Don't render until initialization check is complete
  if (!isInitialized) {
    return <LoadingPlaceholder />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 flex items-center justify-center p-4 sm:p-6">
      {/* Main Card - Horizontal on desktop, compact on mobile */}
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-lg overflow-hidden border border-gray-100 flex flex-col sm:flex-row">
        {/* Left Section / Header */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-5 sm:p-8 text-white sm:w-2/5 flex flex-col justify-center">
          {/* <div className="flex items-center mb-6">
          
            <span className="ml-3 text-lg font-medium">SecureID</span>
          </div> */}
          <h2 className="text-2xl font-semibold mb-2">Authentication</h2>
          <p className="text-blue-100 text-sm">
            Please verify your identity to continue to your account
          </p>
        </div>

        {/* Right Section - Content */}
        <div className="p-5 sm:p-8 sm:w-3/5">
          {/* Error Message */}
          {globalError && (
            <div className="mb-4 p-2.5 bg-red-50 border border-red-100 rounded-lg text-red-700 text-xs flex items-center justify-between">
              <span>{globalError}</span>
              <button
                className="ml-2 text-red-600 hover:text-red-800 transition"
                onClick={() => setGlobalError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Steps Indicator - More subtle */}
          <div className="flex items-center mb-6">
            <div
              className={`flex items-center ${
                step === "phone" ? "text-blue-600" : "text-green-500"
              }`}
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white border border-current">
                {step === "roll" ? (
                  <CheckIcon className="h-4 w-4" />
                ) : (
                  <span className="text-xs">1</span>
                )}
              </span>
            </div>
            <div className="w-16 h-px mx-1 bg-gray-200"></div>
            <div
              className={`flex items-center ${
                step === "roll" ? "text-blue-600" : "text-gray-300"
              }`}
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-white border border-current">
                <span className="text-xs">2</span>
              </span>
            </div>
            <div className="ml-auto text-xs text-gray-400 font-medium">
              {step === "phone" ? "Step 1 of 2" : "Step 2 of 2"}
            </div>
          </div>

          {/* Form Content */}
          <div>
            {step === "phone" ? (
              <PhoneVerification onVerificationComplete={handlePhoneVerified} />
            ) : (
              <RollNumberVerification
                verificationToken={token}
                phoneNumber={phoneNumber}
                onSuccess={handleRollVerified}
                onTokenExpired={handleTokenExpired}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
