import mongoose, { InferSchemaType } from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    "S No": Number,
    "University Name": String,
    "College Name": String,
    "College Code": String,
    Branch: String,
    District: String,
    Semester: Number,
    "Student Name": String,
    "Student Email": {
      type: String,
      unique: true,
    },
    "Student Phone": {
      type: String,
      unique: true,
    },
    Student_Phone: {
      type: String,
      unique: true,
    },
    "Student RollNo": {
      type: String,
      unique: true,
    },
    "Student NM Id": String,
    "Course Name": String,
    "Course ID": Number,
    marks: Number,
    answers: {
      type: Object,
      default: {},
    },
    attempted: {
      type: Boolean,
      default: false,
    },
    sessionData: {
      isActive: {
        type: Boolean,
        default: false,
      },
      startTime: {
        type: Date,
      },
      deviceId: {
        type: String,
      },
      expiresAt: {
        type: Date,
      },
    },
  },
  {
    timestamps: true,
  }
);

export type IStudent = InferSchemaType<typeof studentSchema>;

// Add only the essential indexes for high-volume operations
studentSchema.index({ "Student RollNo": 1 });
studentSchema.index({ "sessionData.isActive": 1 });

// const Student = mongoose.model("Student", studentSchema);
const Student =
  mongoose.models.Student || mongoose.model("Student", studentSchema);

export default Student;
