const mongoose = require("mongoose");
const { Schema } = mongoose;

const PortfolioSnapshotSchema = new Schema(
  {
    userId:     { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    takenAt:    { type: Date, required: true, default: Date.now },
    totalValue: { type: Number, required: true }, // net worth at point in time (ZAR)
 
    // Breakdown by provider for the vault cards
    breakdown: [
      {
        providerName: String,
        balance:      Number,
      },
    ],
  },
  { timestamps: false } // takenAt is the canonical timestamp
);
 
// Portfolio history range queries (Performance History chart)
PortfolioSnapshotSchema.index({ userId: 1, takenAt: -1 });

module.exports = mongoose.model("Portfolio", PortfolioSnapshotSchema);