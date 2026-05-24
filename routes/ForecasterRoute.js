/**
 * routes/forecaster.js
 * ====================
 * Mounted at: /
 *
 * All routes are protected (JWT required).
 *
 * Page render:
 *   GET  /forecaster        Render forecaster.ejs
 *                           Query: contribution, returnRate, years
 *                           (matches the form GET submission in the original server.js)
 *
 * JSON API:
 *   GET  /api/forecaster    Returns raw forecast numbers (consumed by Atlas AI)
 *                           Query: contribution, returnRate, years, milestone
 */
 
const express              = require("express");
const router               = express.Router();
const { protect }          = require("../middleware/Auth");
const forecasterController = require("../controllers/ForecasterController");
 
// ── Page ──────────────────────────────────────────────────────────────────────
router.get("/forecaster", protect, forecasterController.getForecaster);
 
// ── JSON API ──────────────────────────────────────────────────────────────────
router.get("/api/forecaster", protect, forecasterController.getForecastJson);
 
module.exports = router;
 