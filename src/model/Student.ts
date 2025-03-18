import mongoose from "mongoose";

const studentSchema = new mongoose.Schema({
  S_No: Number,
  University_Name: String,
  College_Name: String,
  College_Code: String,
  Branch: String,
  District: String,
  Semester: Number,
  Student_Name: String,
  Student_Email: String,
  Student_Phone: String,
  Student_RollNo: String,
  Student_NM_Id: String,
  Course_Name: String,
  Course_ID: Number,
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
      default: false
    },
    startTime: { 
      type: Date 
    },
    deviceId: { 
      type: String 
    },
    expiresAt: {
      type: Date
    }
  }
}, { 
  timestamps: true 
});

const Student = mongoose.model("Student", studentSchema);

export default Student;
