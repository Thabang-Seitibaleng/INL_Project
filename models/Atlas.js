const mongoose = require("mongoose");
const { Schema } = mongoose;


// Stores chat history for the Atlas page (atlas.ejs)
// Replaces the in-memory state in the current POST /api/atlas/chat handler
 
const AtlasMessageSchema = new Schema({
  role:    { type: String, enum: ["user", "atlas"], required: true },
  content: { type: String, required: true },
  sentAt:  { type: Date, default: Date.now },
});
 
const AtlasSessionSchema = new Schema(
  {
    userId:   { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    messages: [AtlasMessageSchema],
    // Track which data context was loaded (matches the 3 JSON files in server.js)
    contextSnapshot: {
      accountsSummary:    { type: Schema.Types.Mixed, default: null },
      transactionSummary: { type: Schema.Types.Mixed, default: null },
      investmentSummary:  { type: Schema.Types.Mixed, default: null },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
 
module.exports = mongoose.model("AtlasSession", AtlasSessionSchema)