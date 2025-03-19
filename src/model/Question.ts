import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  question: { type: String, required: true },
  options: { type: [String], required: true },
  correctAnswer: { type: [Number], required: true },
});

const formSchema = new mongoose.Schema({
  formId: { type: String, required: true },
  questions: [questionSchema],
});

export const QuestionModel =
  mongoose.models.questions || mongoose.model("questions", formSchema);
