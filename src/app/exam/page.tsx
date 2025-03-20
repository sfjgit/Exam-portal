/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuizAnswersStore } from "@/store/useQuestions";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// Type definitions
interface StudentInfo {
  university: string;
  college: string;
  name: string;
  rollNumber: string;
  branch: string;
  courseId: number | string;
}

interface Question {
  id: string;
  question: string;
  options: string[];
}

export default function ExamPage() {
  const {
    answers: storedAnswers,
    setAllAnswers,
    clearAnswers,
  } = useQuizAnswersStore();

  // Reduce state updates by using a ref for non-render-dependent data
  const [examState, setExamState] = useState({
    questions: [] as Question[],
    answers: {} as { [key: number]: number | null },
    currentQuestion: 0,
    isSubmitting: false,
    studentInfo: null as StudentInfo | null,
    isLoading: true,
    error: null as string | null,
  });

  const router = useRouter();

  // Memoize calculated values to avoid recalculation on each render
  const answeredCount = useMemo(
    () => Object.keys(examState.answers).length,
    [examState.answers]
  );

  const remainingCount = useMemo(
    () => examState.questions.length - answeredCount,
    [examState.questions.length, answeredCount]
  );

  // Initialize data - run only once
  useEffect(() => {
    const initializeExam = async () => {
      try {
        // Get student info from localStorage (only once)
        const studentInfo = JSON.parse(
          localStorage.getItem("studentSession") || "{}"
        );

        // Use batch state update
        setExamState((prev) => ({
          ...prev,
          answers: storedAnswers || {},
          studentInfo,
        }));

        await fetchQuestions();
      } catch (error) {
        console.error("Initialization error:", error);
        setExamState((prev) => ({
          ...prev,
          error: "Failed to initialize exam",
          isLoading: false,
        }));
      }
    };

    initializeExam();
  }, []);

  // Persist answers with debounce/throttle
  useEffect(() => {
    // Use a timer to batch updates to the store
    const timerId = setTimeout(() => {
      setAllAnswers(examState.answers);
    }, 500); // 500ms debounce

    // Clean up timer
    return () => clearTimeout(timerId);
  }, [examState.answers, setAllAnswers]);

  // Fetch questions - extracted as a separate function
  const fetchQuestions = async () => {
    try {
      setExamState((prev) => ({ ...prev, isLoading: true }));

      const response = await fetch(`/api/exam/questions`, {
        // Add cache headers
        headers: {
          "Cache-Control": "max-age=3600",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        setExamState((prev) => ({
          ...prev,
          questions: data.questions,
          isLoading: false,
        }));
      } else {
        throw new Error(data.message || "Failed to fetch questions");
      }
    } catch (error) {
      console.error("Failed to fetch questions", error);
      setExamState((prev) => ({
        ...prev,
        error: "Failed to load questions. Please refresh the page.",
        isLoading: false,
      }));
    }
  };

  // Memoize handlers to prevent recreation on each render
  const handleAnswerSelect = useCallback((optionIndex: number): void => {
    setExamState((prev) => {
      const newAnswers = {
        ...prev.answers,
        [prev.currentQuestion]: optionIndex,
      };

      // Combine state updates to reduce renders
      return {
        ...prev,
        answers: newAnswers,
        // Only update currentQuestion if not on the last question
        currentQuestion:
          prev.currentQuestion < prev.questions.length - 1
            ? prev.currentQuestion + 1
            : prev.currentQuestion,
      };
    });
  }, []);

  // Memoize navigation handlers
  const handlePrevQuestion = useCallback(() => {
    setExamState((prev) => ({
      ...prev,
      currentQuestion: Math.max(0, prev.currentQuestion - 1),
    }));
  }, []);

  const handleNextQuestion = useCallback(() => {
    setExamState((prev) => ({
      ...prev,
      currentQuestion: Math.min(
        prev.questions.length - 1,
        prev.currentQuestion + 1
      ),
    }));
  }, []);

  // Memoize question navigation handler
  const handleQuestionNav = useCallback((index: number) => {
    setExamState((prev) => ({
      ...prev,
      currentQuestion: index,
    }));
  }, []);

  // Optimized exam submission with retry logic
  const handleSubmitExam = useCallback(async (): Promise<void> => {
    // Prevent multiple submissions
    if (examState.isSubmitting) return;

    setExamState((prev) => ({ ...prev, isSubmitting: true }));

    // Implement retry logic
    const maxRetries = 3;
    let retries = 0;
    let success = false;

    while (retries < maxRetries && !success) {
      try {
        const response = await fetch("/api/exam/submit", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            answers: examState.answers,
          }),
        });

        const result = await response.json();

        if (result.success) {
          // Clear storage
          clearAnswers();
          localStorage.removeItem("examAnswers");
          localStorage.removeItem("examTimeRemaining");
          localStorage.clear();

          success = true;
          router.replace("/completed");
        } else {
          if (retries === maxRetries - 1) {
            toast.error(result?.message ?? "Failed to submit exam");
          }
          retries++;
        }
      } catch (error) {
        console.error(`Submission error (attempt ${retries + 1}):`, error);

        if (retries === maxRetries - 1) {
          toast.error("Network error. Please try again.");
        }
        retries++;
      }
    }

    setExamState((prev) => ({ ...prev, isSubmitting: false }));
  }, [examState.answers, examState.isSubmitting, clearAnswers, router]);

  // Memoize the question status function
  const getQuestionStatus = useCallback(
    (index: number): string => {
      return examState.answers[index] ? "bg-green-500" : "bg-blue-400";
    },
    [examState.answers]
  );

  // Loading state
  if (examState.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <p className="text-lg">Loading exam...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (examState.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg text-red-500">
          <p className="text-lg">{examState.error}</p>
          <button
            onClick={fetchQuestions}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // If no questions or student info, return empty UI
  if (!examState.questions.length || !examState.studentInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-lg">
          <p className="text-lg">No exam data available</p>
        </div>
      </div>
    );
  }

  // Destructure for cleaner JSX
  const { questions, currentQuestion, answers, isSubmitting, studentInfo } =
    examState;

  return (
    <div className="min-h-screen p-2 sm:p-4 lg:p-8 flex flex-col md:w-[80vw] w-full m-auto">
      {/* Main Exam Container */}
      <div className="w-full px-6 flex items-center justify-between">
        <img
          src="/naan-logo.png"
          alt="Naan Logo"
          className="object-cover md:w-40 w-20"
          loading="eager" // Prioritize logo loading
        />
        <img
          src="/sfjlogo.png"
          alt="SFJ Logo"
          className="object-cover md:w-24 w-12"
          loading="eager" // Prioritize logo loading
        />
      </div>
      <div className="flex-grow bg-white sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-500 text-white p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center">
          <div className="text-center sm:text-left mb-2 sm:mb-0">
            <h2 className="text-lg sm:text-2xl font-bold truncate">
              {studentInfo.university}
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 truncate px-3">
              {studentInfo.college}
            </p>
          </div>
          <div className="text-center sm:text-right">
            <p className="font-semibold text-base sm:text-lg truncate">
              {studentInfo.name}
            </p>
            <p className="text-xs sm:text-sm">
              Roll No: {studentInfo.rollNumber}
            </p>
            <p className="text-xs sm:text-sm">Branch: {studentInfo.branch}</p>
          </div>
        </div>

        {/* Timer */}
        <div className="bg-blue-100 p-3 sm:p-4 text-center flex flex-col sm:flex-row justify-between items-center">
          <div className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-0">
            Total: {questions.length} | Answered: {answeredCount} | Remaining:{" "}
            {remainingCount}
          </div>
        </div>

        {/* Question Navigation - Windowed rendering for many questions */}
        <div className="flex gap-2 overflow-x-auto p-2 sm:p-4 scrollbar-hide">
          {questions.map((_, index) => (
            <button
              key={index}
              onClick={() => handleQuestionNav(index)}
              className={`flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 text-[10px] sm:text-xs rounded-full flex items-center justify-center 
              ${getQuestionStatus(index)} text-white 
              ${
                currentQuestion === index
                  ? "ring-2 sm:ring-4 ring-blue-300"
                  : ""
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>

        {/* Current Question */}
        <div className="flex-grow p-4 sm:p-8 overflow-y-auto">
          <div className="bg-gray-100 rounded-lg p-4 sm:p-6">
            <h3 className="text-base sm:text-xl font-semibold mb-2 sm:mb-4">
              Question {currentQuestion + 1} of {questions.length}
            </h3>
            <p className="mb-4 text-sm sm:text-lg font-medium">
              {questions[currentQuestion].question}
            </p>

            {/* Options */}
            <div className="space-y-2 sm:space-y-4">
              {questions[currentQuestion].options.map((option, optionIndex) => (
                <button
                  key={optionIndex}
                  onClick={() => handleAnswerSelect(optionIndex + 1)}
                  className={`w-full text-left p-2 sm:p-4 rounded-lg transition-colors duration-200
                  ${
                    answers[currentQuestion] === optionIndex + 1
                      ? "bg-blue-500 text-white"
                      : "bg-white hover:bg-blue-50 hover:shadow-md border-gray-400"
                  }`}
                >
                  <div className="flex items-center">
                    <span className="mr-2 sm:mr-4 font-bold text-base sm:text-lg">
                      {optionIndex + 1}
                    </span>
                    <span className="text-xs sm:text-base">{option}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation Buttons */}
          <div className="mt-4 sm:mt-6 flex justify-between">
            <button
              onClick={handlePrevQuestion}
              disabled={currentQuestion === 0}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 text-xs sm:text-base"
            >
              Previous
            </button>
            <button
              onClick={handleNextQuestion}
              disabled={currentQuestion === questions.length - 1}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700 text-xs sm:text-base"
            >
              Next
            </button>
          </div>
        </div>

        {/* Submit Dialog */}
        <Dialog>
          <DialogTrigger>
            <div className="p-4 sm:p-6 bg-gray-100 text-right">
              <button
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm sm:text-base"
              >
                {isSubmitting ? "Submitting..." : "Submit Exam"}
              </button>
            </div>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you absolutely sure?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. This will submit the exam.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                  Cancel
                </button>
              </DialogClose>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? "Submitting..." : "Submit Exam"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
