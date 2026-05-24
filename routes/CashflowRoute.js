const express     = require("express");
const router      = express.Router();
const { protect } = require("../middleware/Auth");
const {
  getCashflow,
  getTransactions,
  createTransaction,
  updateTransactionCategory,
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
} = require("../controllers/CashflowController");

// ── Page ──────────────────────────────────────────────────────────────────────
router.get("/cashflow", protect, getCashflow);

// ── Transactions ──────────────────────────────────────────────────────────────
router.get("/api/transactions",                protect, getTransactions);
router.post("/api/transactions",               protect, createTransaction);
router.patch("/api/transactions/:id/category", protect, updateTransactionCategory);

// ── Budgets ───────────────────────────────────────────────────────────────────
router.get("/api/budgets",        protect, getBudgets);
router.post("/api/budgets",       protect, createBudget);
router.patch("/api/budgets/:id",  protect, updateBudget);
router.delete("/api/budgets/:id", protect, deleteBudget);

module.exports = router;