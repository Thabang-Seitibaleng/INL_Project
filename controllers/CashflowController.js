/**
 * cashflowController.js
 * =====================
 * Replaces the GET "/cashflow" route in server.js.
 * Also adds CRUD for transactions and budget categories
 * (the flowchart's "Add Transaction → Auto-Assign → User Selects Category" branch).
 *
 * Powers: cashflow.ejs
 *   - Total Inflow / Outflow / Net Cashflow cards
 *   - Budget Utilization progress bars (now dynamic, not hardcoded)
 *   - Transaction Ledger with ALL / IN / OUT filter
 */
const { TransactionSchema, BudgetCategorySchema, Account } = require("../models/index");
// ─── Category Auto-Assignment ─────────────────────────────────────────────────
// Flowchart: "Add Transaction → Auto-Assign Category" (s35 → s36)
// Simple keyword-matching engine. Replace with an ML model or Yodlee's own
// category field once the live API integration is active.
//dummyTransactions

const dummyTransactions = require("../sample_yodlee_transactions.json").transaction;

const CATEGORY_RULES = [
  { pattern: /rent|landlord|property/i, category: "Housing & Utilities" },
  { pattern: /electricity|water|eskom|municipal/i, category: "Housing & Utilities" },
  { pattern: /woolworths|checkers|pick n pay|spar|food|grocery/i, category: "Food & Dining" },
  { pattern: /uber eats|mr d|nandos|kfc|mcdonalds|restaurant/i, category: "Food & Dining" },
  { pattern: /uber|bolt|fuel|petrol|engen|shell|bp/i, category: "Transport" },
  { pattern: /netflix|spotify|dstv|showmax|apple|subscription/i, category: "Subscriptions" },
  { pattern: /salary|payroll|income|deposit/i, category: "Income" },
  { pattern: /medical|clicks|dischem|pharmacy|doctor/i, category: "Healthcare" },
  { pattern: /clothing|fashion|zara|h&m|woolworths/i, category: "Shopping" },
];

const autoAssignCategory = (merchantName) => {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(merchantName)) return rule.category;
  }
  return "Uncategorized";
};
 
// ─── Dummy data builder ───────────────────────────────────────────────────────
// Derives all values directly from sample_yodlee_transactions.json — nothing hardcoded.
 
const buildDummyCashflowData = (month, year) => {
  let totalInflow  = 0;
  let totalOutflow = 0;
 
  // Map JSON transaction shape to the shape cashflow.ejs expects
  const transactions = dummyTransactions.map((tx) => {
    const amount = tx.amount?.amount ?? 0;
    if (amount > 0) totalInflow  += amount;
    else            totalOutflow += Math.abs(amount);
 
    return {
      merchant: tx.description?.simple ?? "Unknown",
      category: tx.category            ?? autoAssignCategory(tx.description?.simple ?? ""),
      date:     new Date(tx.date).toLocaleDateString("en-ZA"),
      amount,
    };
  });
 
  const netCashflow = totalInflow - totalOutflow;
 
  // Derive budget utilization by grouping actual spending from the JSON transactions
  // Categories come from the transactions themselves — no hardcoded budget names
  const spendingByCategory = {};
  dummyTransactions.forEach((tx) => {
    const amount   = tx.amount?.amount ?? 0;
    const category = tx.category ?? autoAssignCategory(tx.description?.simple ?? "");
    if (amount < 0) {
      spendingByCategory[category] = (spendingByCategory[category] ?? 0) + Math.abs(amount);
    }
  });
 
  // Build a budget row for each category that has spending
  // Budget cap = 120% of actual spend (gives a realistic utilization bar)
  const COLOURS = ["#6366f1", "#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6"];
  const budgetUtilization = Object.entries(spendingByCategory).map(([name, spent], i) => {
    const budgeted   = Math.round(spent * 1.2);
    const percentage = Math.min(100, Math.round((spent / budgeted) * 100));
    return {
      name,
      spent:     spent.toLocaleString("en-ZA",    { minimumFractionDigits: 2 }),
      budgeted:  budgeted.toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
      percentage,
      isWarning: percentage >= 85,
      colour:    COLOURS[i % COLOURS.length],
    };
  });
 
  return {
    inflow:            totalInflow.toLocaleString("en-ZA",          { minimumFractionDigits: 2 }),
    outflow:           totalOutflow.toLocaleString("en-ZA",         { minimumFractionDigits: 2 }),
    net:               Math.abs(netCashflow).toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
    netIsPositive:     netCashflow >= 0,
    transactions,
    budgetUtilization,
    month,
    year,
  };
};
 
// ─── Controller ───────────────────────────────────────────────────────────────
 
const cashFlowController = {
 
  getCashflow: async (req, res) => {
    try {
      const userId = req.user.id;
      const now    = new Date();
      const month  = parseInt(req.query.month) || now.getMonth() + 1;
      const year   = parseInt(req.query.year)  || now.getFullYear();
 
      const startDate = new Date(year, month - 1, 1);
      const endDate   = new Date(year, month, 0, 23, 59, 59);
 
      const transactions = await TransactionSchema.find({
        userId,
        date:   { $gte: startDate, $lte: endDate },
        status: "POSTED",
      })
        .sort({ date: -1 })
        .lean();
 
      // ── Dummy fallback ───────────────────────────────────────────────────────
      if (!transactions || transactions.length === 0) {
        console.log("[Cashflow] No transactions in DB — serving dummy JSON data.");
        return res.render("cashflow", { data: buildDummyCashflowData(month, year) });
      }
 
      // ── Live path ────────────────────────────────────────────────────────────
      let totalInflow  = 0;
      let totalOutflow = 0;
 
      const mappedTransactions = transactions.map((tx) => {
        const amount = tx.amount.amount;
        if (amount > 0) totalInflow  += amount;
        else            totalOutflow += amount;
        return {
          merchant: tx.description.simple,
          category: tx.category,
          date:     new Date(tx.date).toLocaleDateString("en-ZA"),
          amount,
        };
      });
 
      const netCashflow = totalInflow + totalOutflow;
 
      const budgets = await BudgetCategorySchema.find({ userId, month, year }).lean();
 
      const budgetUtilization = budgets.map((budget) => {
        const spent = transactions
          .filter((tx) => tx.amount.amount < 0 && budget.transactionCategories.includes(tx.category))
          .reduce((sum, tx) => sum + Math.abs(tx.amount.amount), 0);
 
        const percentage = budget.budgetedAmount > 0
          ? Math.min(100, Math.round((spent / budget.budgetedAmount) * 100))
          : 0;
 
        return {
          name:      budget.name,
          spent:     spent.toLocaleString("en-ZA",               { minimumFractionDigits: 2 }),
          budgeted:  budget.budgetedAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
          percentage,
          isWarning: percentage >= 85,
          colour:    budget.colour,
        };
      });
 
      return res.render("cashflow", {
        data: {
          inflow:            totalInflow.toLocaleString("en-ZA",           { minimumFractionDigits: 2 }),
          outflow:           Math.abs(totalOutflow).toLocaleString("en-ZA", { minimumFractionDigits: 2 }),
          net:               Math.abs(netCashflow).toLocaleString("en-ZA",  { minimumFractionDigits: 2 }),
          netIsPositive:     netCashflow >= 0,
          transactions:      mappedTransactions,
          budgetUtilization,
          month,
          year,
        },
      });
    } catch (err) {
      console.error("[cashflowController.getCashflow]", err);
      return res.status(500).send("Error loading cashflow data.");
    }
  },
 
  createTransaction: async (req, res) => {
    try {
      const userId = req.user.id;
      const { accountId, merchantName, originalDescription, amount, date, category } = req.body;
 
      if (!accountId || !merchantName || amount === undefined || !date) {
        return res.status(400).json({ error: "accountId, merchantName, amount, and date are required." });
      }
 
      const autoCategory  = autoAssignCategory(merchantName);
      const finalCategory = category || autoCategory;
 
      const transaction = await TransactionSchema.create({
        userId,
        accountId,
        description:      { simple: merchantName, original: originalDescription || merchantName },
        amount:           { amount: parseFloat(amount), currency: "ZAR" },
        date:             new Date(date),
        category:         finalCategory,
        categoryIsManual: !!category,
        type:             parseFloat(amount) >= 0 ? "CREDIT" : "DEBIT",
      });
 
      await Account.findByIdAndUpdate(accountId, {
        $inc: { "balance.amount": parseFloat(amount) },
      });
 
      return res.status(201).json({ message: "Transaction created.", transaction, autoCategory });
    } catch (err) {
      console.error("[cashflowController.createTransaction]", err);
      return res.status(500).json({ error: "Could not create transaction." });
    }
  },
 
  getTransactions: async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type, category, from, to } = req.query;
 
      const filter = { userId, status: "POSTED" };
      if (type)     filter.type     = type.toUpperCase();
      if (category) filter.category = category;
      if (from || to) {
        filter.date = {};
        if (from) filter.date.$gte = new Date(from);
        if (to)   filter.date.$lte = new Date(to);
      }
 
      const [transactions, total] = await Promise.all([
        TransactionSchema.find(filter)
          .sort({ date: -1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        TransactionSchema.countDocuments(filter),
      ]);
 
      return res.status(200).json({
        transactions,
        pagination: { page: parseInt(page), limit: parseInt(limit), total },
      });
    } catch (err) {
      console.error("[cashflowController.getTransactions]", err);
      return res.status(500).json({ error: "Could not fetch transactions." });
    }
  },
 
  updateTransactionCategory: async (req, res) => {
    try {
      const { id }       = req.params;
      const { category } = req.body;
      const userId       = req.user.id;
 
      if (!category) return res.status(400).json({ error: "category is required." });
 
      const tx = await TransactionSchema.findOneAndUpdate(
        { _id: id, userId },
        { category, categoryIsManual: true },
        { new: true }
      );
 
      if (!tx) return res.status(404).json({ error: "Transaction not found." });
      return res.status(200).json({ message: "Category updated.", transaction: tx });
    } catch (err) {
      console.error("[cashflowController.updateTransactionCategory]", err);
      return res.status(500).json({ error: "Could not update category." });
    }
  },
 
  getBudgets: async (req, res) => {
    try {
      const userId = req.user.id;
      const now    = new Date();
      const month  = parseInt(req.query.month) || now.getMonth() + 1;
      const year   = parseInt(req.query.year)  || now.getFullYear();
 
      const budgets = await BudgetCategorySchema.find({ userId, month, year }).lean();
      return res.status(200).json({ budgets });
    } catch (err) {
      console.error("[cashflowController.getBudgets]", err);
      return res.status(500).json({ error: "Could not fetch budgets." });
    }
  },
 
  createBudget: async (req, res) => {
    try {
      const userId = req.user.id;
      const { name, budgetedAmount, transactionCategories, month, year, colour } = req.body;
 
      if (!name || !budgetedAmount || !month || !year) {
        return res.status(400).json({ error: "name, budgetedAmount, month, and year are required." });
      }
 
      const budget = await BudgetCategorySchema.create({
        userId, name, budgetedAmount,
        transactionCategories: transactionCategories || [],
        month, year,
        colour: colour || "#3b82f6",
      });
 
      return res.status(201).json({ message: "Budget category created.", budget });
    } catch (err) {
      console.error("[cashflowController.createBudget]", err);
      return res.status(500).json({ error: "Could not create budget category." });
    }
  },
 
  updateBudget: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
 
      const allowed   = ["budgetedAmount", "transactionCategories", "colour", "name"];
      const sanitized = Object.fromEntries(
        Object.entries(req.body).filter(([k]) => allowed.includes(k))
      );
 
      const budget = await BudgetCategorySchema.findOneAndUpdate(
        { _id: id, userId },
        sanitized,
        { new: true }
      );
 
      if (!budget) return res.status(404).json({ error: "Budget not found." });
      return res.status(200).json({ message: "Budget updated.", budget });
    } catch (err) {
      console.error("[cashflowController.updateBudget]", err);
      return res.status(500).json({ error: "Could not update budget." });
    }
  },
 
  deleteBudget: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
 
      const budget = await BudgetCategorySchema.findOneAndDelete({ _id: id, userId });
      if (!budget) return res.status(404).json({ error: "Budget not found." });
      return res.status(200).json({ message: "Budget deleted." });
    } catch (err) {
      console.error("[cashflowController.deleteBudget]", err);
      return res.status(500).json({ error: "Could not delete budget." });
    }
  },
};
 
module.exports = cashFlowController;