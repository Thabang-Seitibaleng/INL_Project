const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true },
    password:  { type: String, required: true }, // Store bcrypt hash only
 
    // Two-Factor Auth (flowchart: 2FA Required? → Send OTP)
    twoFactorEnabled: { type: Boolean, default: false },
    otpSecret:        { type: String, default: null }, // TOTP secret or last SMS OTP hash
    otpExpiry:        { type: Date,   default: null },
 
    // JWT refresh token tracking
    refreshToken: { type: String, default: null },
 
    // Financial Health Score (computed & cached, shown on dashboard)
    healthScore: { type: Number, default: 800, min: 0, max: 1000 },
    healthTrend: { type: String, default: "" },
 
    // Yodlee linkage (for when real Open Banking replaces sample JSON)
    yodleeLoginName: { type: String, default: null },
 
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);