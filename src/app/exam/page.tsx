"use client";

import React, { useState, useEffect } from "react";
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

// Type definitions remain the same
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

interface AnswerMap {
  [key: number]: number;
}

export default function ExamPage() {
  // State for questions and exam management
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<AnswerMap>(() => {
    // Initialize answers from localStorage
    const savedAnswers = localStorage.getItem("examAnswers");
    return savedAnswers ? JSON.parse(savedAnswers) : {};
  });
  const [currentQuestion, setCurrentQuestion] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(() => {
    // Initialize time from localStorage or default to 5 hours
    const savedTime = localStorage.getItem("examTimeRemaining");
    return savedTime ? parseInt(savedTime) : 5 * 60 * 60;
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Student information from localStorage
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);

  // Persist answers whenever they change
  useEffect(() => {
    localStorage.setItem("examAnswers", JSON.stringify(answers));
  }, [answers]);

  // Persist time remaining
  useEffect(() => {
    localStorage.setItem("examTimeRemaining", timeRemaining.toString());
  }, [timeRemaining]);

  // Fetch questions on component mount
  useEffect(() => {
    // Retrieve student info and course ID
    const storedStudentInfo = JSON.parse(
      localStorage.getItem("studentSession") || "{}"
    ) as StudentInfo;
    setStudentInfo(storedStudentInfo);

    // Fetch questions for the course
    const fetchQuestions = async () => {
      try {
        const response = await fetch(
          `/api/exam/questions?formId=${storedStudentInfo.courseId}`
        );
        const data = await response.json();

        if (data.success) {
          setQuestions(data.questions);
        }
      } catch (error) {
        console.error("Failed to fetch questions", error);
      }
    };

    fetchQuestions();
  }, []);

  // Timer management
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Format time
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Answer selection handler
  const handleAnswerSelect = (optionIndex: number): void => {
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion]: optionIndex,
    }));

    // Auto-navigate to next question
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  // Exam submission handler
  const handleSubmitExam = async (): Promise<void> => {
    if (isSubmitting || !studentInfo) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/exam/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          courseId: studentInfo.courseId,
          rollNo: studentInfo.rollNumber,
          answers: Object.entries(answers).reduce((acc: any, [key, value]) => {
            acc[questions[parseInt(key)].id] = value;
            return acc;
          }, {}),
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Clear local storage after successful submission
        localStorage.removeItem("examAnswers");
        localStorage.removeItem("examTimeRemaining");
        console.log("Exam submitted successfully");
      }
    } catch (error) {
      console.error("Submission error", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine question status
  const getQuestionStatus = (index: number): string => {
    if (answers[index]) return "bg-green-500";
    return "bg-blue-400";
  };

  // If no questions or student info, return null
  if (!questions.length || !studentInfo) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 p-2 sm:p-4 lg:p-8 flex flex-col sm:flex-row">
      {/* Main Exam Container */}
      <div className="flex-grow bg-white sm:rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-blue-500 text-white p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-center">
          <div className="text-center sm:text-left mb-2 sm:mb-0">
            <h2 className="text-lg sm:text-2xl font-bold truncate">
              {studentInfo.university}
            </h2>
            <p className="text-xs sm:text-sm text-blue-100 truncate">
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
            Total: {questions.length} | Answered: {Object.keys(answers).length}{" "}
            | Remaining: {questions.length - Object.keys(answers).length}
          </div>
          <span className="text-base sm:text-xl text-red-600">
            Time: {formatTime(timeRemaining)}
          </span>
        </div>

        {/* Question Navigation */}
        <div className="flex gap-2 overflow-x-auto p-2 sm:p-4 scrollbar-hide">
          {questions.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentQuestion(index)}
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
                  className={`w-full text-left p-2 sm:p-4 rounded-lg transition-all duration-300 ease-in-out transform 
                  ${
                    answers[currentQuestion] === optionIndex + 1
                      ? "bg-blue-500 text-white sm:scale-105"
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
              onClick={() =>
                setCurrentQuestion((prev) => Math.max(0, prev - 1))
              }
              disabled={currentQuestion === 0}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 text-xs sm:text-base"
            >
              Previous
            </button>
            <button
              onClick={() =>
                setCurrentQuestion((prev) =>
                  Math.min(questions.length - 1, prev + 1)
                )
              }
              disabled={currentQuestion === questions.length - 1}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700 text-xs sm:text-base"
            >
              Next
            </button>
          </div>
        </div>

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
              <DialogClose>Cancel</DialogClose>
              <button
                onClick={handleSubmitExam}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm sm:text-base"
              >
                {isSubmitting ? "Submitting..." : "Submit Exam"}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Submit Exam Button */}
        {/* <div className="p-4 sm:p-6 bg-gray-100 text-right">
          <button
            onClick={handleSubmitExam}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2 sm:px-6 sm:py-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors text-sm sm:text-base"
          >
            {isSubmitting ? "Submitting..." : "Submit Exam"}
          </button>
        </div> */}
      </div>
    </div>
  );
}
