// models/OTP.ts
import mongoose from "mongoose";

const OTPSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    unique: true,
  },
  countryCode: {
    type: String,
    default: "+91",
  },
  otp: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 300, // OTP expires after 5 minutes
  },
});

// Create index on createdAt for TTL (automatic expiration)
// OTPSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });

const OTP = mongoose.models.OTP || mongoose.model("OTP", OTPSchema);

export default OTP;
