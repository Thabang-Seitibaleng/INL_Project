const mongoose = require("mongoose");
const { Schema } = mongoose;

const HoldingSchema = new Schema(
  {
    userId:    { type: Schema.Types.ObjectId, ref: "User",    required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
 
    symbol:      { type: String, required: true }, // e.g. "BTC", "AAPL", "NPN"
    description: { type: String, required: true }, // e.g. "Bitcoin", "Apple Inc."
    assetClass:  { type: String, enum: ["Equity", "Crypto", "ETF", "Bond", "Cash", "Other"], default: "Equity" },
 
    // Current position
    quantity:  { type: Number, default: 0 },
    value:     { type: Number, required: true }, // ZAR value at last sync
    costBasis: { type: Number, default: null },  // original purchase price (ZAR)
    currency:  { type: String, default: "ZAR" },
 
    // 7-day mover stats (rendered in portfolio.ejs Top Movers)
    returnAmount:     { type: Number, default: 0 },
    returnPercentage: { type: Number, default: 0 },
    isPositive:       { type: Boolean, default: true },
 
    lastSyncedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Holding", HoldingSchema);