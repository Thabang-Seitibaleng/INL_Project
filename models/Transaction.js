const mongoose = require("mongoose");
const { Schema } = mongoose;


const TransactionSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true, index: true },
 
    // Yodlee description object (simple = display name)
    description: {
      simple:   { type: String, required: true }, // rendered as `merchant` in EJS
      original: { type: String, default: "" },
    },
 
    amount: {
      amount:   { type: Number, required: true }, // negative = debit, positive = credit
      currency: { type: String, default: "ZAR" },
    },
 
    date: { type: Date, required: true },
 
    // Category (flowchart: Auto-Assign → User Selects)
    category:         { type: String, default: "Uncategorized" },
    categoryIsManual: { type: Boolean, default: false }, // true if user overrode auto-assign
 
    // Cashflow direction — derived from amount sign, stored for fast queries
    type: { type: String, enum: ["CREDIT", "DEBIT"], required: true },
 
    // For anomaly detection (Atlas ML model)
    isAnomalous: { type: Boolean, default: false },
 
    // Yodlee transaction ID for deduplication
    externalId: { type: String, default: null, index: true, sparse: true },
 
    status: { type: String, enum: ["POSTED", "PENDING"], default: "POSTED" },
  },
  { timestamps: true }
);

// Fast cashflow queries (used in /cashflow route)
TransactionSchema.index({ userId: 1, date: -1 });
TransactionSchema.index({ userId: 1, accountId: 1, date: -1 });
TransactionSchema.index({ userId: 1, type: 1, date: -1 });

module.exports = mongoose.model("Transaction", TransactionSchema);