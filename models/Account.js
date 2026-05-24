const mongoose = require("mongoose");
const { Schema } = mongoose;


const AccountSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
 
    // Provider info (mirrors Yodlee providerName field)
    providerName: {
      type: String,
      required: true,
      enum: ["Investec", "EasyEquities", "Luno", "Manual", "Other"],
    },
 
    accountType: {
      type: String,
      required: true,
      enum: ["CHECKING", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "CRYPTO", "LOAN"],
    },
 
    // Matches Yodlee CONTAINER field
    container: {
      type: String,
      enum: ["bank", "investment", "creditCard", "loan", "insurance", "realEstate"],
    },
 
    accountName:   { type: String, required: true }, // e.g. "Private Wealth Portfolio"
    accountNumber: { type: String, default: null },   // masked, e.g. "****4821"
    currency:      { type: String, default: "ZAR" },
 
    balance: {
      amount:   { type: Number, required: true, default: 0 },
      currency: { type: String, default: "ZAR" },
    },
 
    // For credit cards (used in Health Score calculation in server.js)
    totalCreditLine: {
      amount:   { type: Number, default: null },
      currency: { type: String, default: "ZAR" },
    },
 
    // isAsset drives the net worth calculation in the dashboard route
    isAsset: { type: Boolean, default: true },
 
    // Last sync timestamp from Yodlee / Open Banking
    lastSyncedAt: { type: Date, default: null },
 
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);


module.exports = mongoose.model("Account", AccountSchema);