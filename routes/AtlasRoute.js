


/**
 * routes/atlas.js
 * ===============
 * Mounted at: /
 *
 * All routes are protected (JWT required).
 *
 * Page render:
 *   GET     /atlas                  Render atlas.ejs with session chat history
 *
 * Chat API:
 *   POST    /api/atlas/chat         Send a user message; returns Atlas (Claude) reply
 *                                   Body: { message: string }
 *   DELETE  /api/atlas/session      Clear the active session (Clear Context button)
 *
 * Insights API:
 *   GET     /api/atlas/insights     Generate the Discovered Insights panel (Claude-powered)
 */
 
const express          = require("express");
const router           = express.Router();
const { protect }      = require("../middleware/Auth");
const atlasController  = require("../controllers/AtlasController");
 
// ── Page ──────────────────────────────────────────────────────────────────────
router.get("/atlas", protect, atlasController.getAtlas);
 
// ── Chat ──────────────────────────────────────────────────────────────────────
router.post("/api/atlas/chat",      protect, atlasController.chat);
router.delete("/api/atlas/session", protect, atlasController.clearSession);
 
// ── Insights ──────────────────────────────────────────────────────────────────
router.get("/api/atlas/insights", protect, atlasController.getInsights);
 
module.exports = router;