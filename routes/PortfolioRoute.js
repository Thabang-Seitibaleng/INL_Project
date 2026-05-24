/**
 * routes/portfolio.js
 * ===================
 * Mounted at: /
 *
 * All routes are protected (JWT required).
 *
 * Page render:
 *   GET    /portfolio                      Render portfolio.ejs
 *
 * Accounts (Vaults) API:
 *   GET    /api/accounts                   List all active account vaults
 *   POST   /api/accounts                   Add a new vault
 *   PATCH  /api/accounts/:id/balance       Update a vault's balance (post-sync)
 *   DELETE /api/accounts/:id               Soft-delete a vault
 *
 * Holdings API:
 *   GET    /api/holdings                   List holdings (Query: assetClass)
 *   POST   /api/holdings                   Upsert a holding (called by Yodlee sync job)
 *
 * Portfolio History API:
 *   POST   /api/portfolio/snapshot         Record current total value (called by cron)
 *   GET    /api/portfolio/history          Historical value series (Query: range 1m|3m|6m|1y)
 */
 
const express             = require("express");
const router              = express.Router();
const { protect }         = require("../middleware/Auth");
const portfolioController = require("../controllers/PortfolioController");
 
// ── Page ──────────────────────────────────────────────────────────────────────
router.get("/portfolio", protect, portfolioController.getPortfolio);
 
// ── Accounts ──────────────────────────────────────────────────────────────────
router.get("/api/accounts",               protect, portfolioController.getAccounts);
router.post("/api/accounts",              protect, portfolioController.createAccount);
router.patch("/api/accounts/:id/balance", protect, portfolioController.updateAccountBalance);
router.delete("/api/accounts/:id",        protect, portfolioController.deleteAccount);
 
// ── Holdings ──────────────────────────────────────────────────────────────────
router.get("/api/holdings",  protect, portfolioController.getHoldings);
router.post("/api/holdings", protect, portfolioController.upsertHolding);
 
// ── Snapshots & History ───────────────────────────────────────────────────────
router.post("/api/portfolio/snapshot", protect, portfolioController.takeSnapshot);
router.get("/api/portfolio/history",   protect, portfolioController.getPortfolioHistory);
 
module.exports = router;