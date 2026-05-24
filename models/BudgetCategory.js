const mongoose = require("mongoose");
const { Schema } = mongoose;

const BudgetCategorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
 
    name:          { type: String, required: true }, // e.g. "Housing & Utilities"
    budgetedAmount: { type: Number, required: true }, // e.g. 18000
    currency:      { type: String, default: "ZAR" },
 
    // Which transaction categories roll up into this budget bucket
    transactionCategories: [{ type: String }], // e.g. ["Rent", "Electricity", "Water"]
 
    // Period this budget applies to
    month: { type: Number, min: 1, max: 12, required: true },
    year:  { type: Number, required: true },
 
    colour: { type: String, default: "#3b82f6" }, // for progress bar theming
  },
  { timestamps: true }
);

// Budget utilization lookups per month
BudgetCategorySchema.index({ userId: 1, year: 1, month: 1 });

module.exports = mongoose.model("BudgetCategory", BudgetCategorySchema);