/**
 * routes/dashboard.js
 * ===================
 * Mounted at: /
 *
 * Protected (JWT required):
 *   GET  /      Render dashboard.ejs with live MongoDB data
 */
 
const express             = require("express");
const router              = express.Router();
const { protect }         = require("../middleware/Auth");
const dashboardController = require("../controllers/DashboardController");
 
router.get("/", protect, dashboardController.getDashboard);
 
module.exports = router;