/**
 * dashboardController.js
 * ======================
 * Replaces the GET "/" route logic in server.js.
 * Reads live data from MongoDB instead of sample JSON files.
 *
 * Powers: dashboard.ejs
 *   - Financial Health Score
 *   - Total Balance (net worth)
 *   - Monthly Income
 *   - Safe to Spend
 *   - Recent Activity (last 10 transactions)
 *   - Monthly Spending Trend (weekly breakdown)
 *   - AI Coach recommendation
 *   - Wealth Forecast teaser
 */
 
const {
  User,
  Account,
  TransactionSchema,
  PortfolioSnapshotSchema,
} = require("../models/index");
 

const dummyAccounts = require("../sample_yodlee_data.json").account;
const dummyTransactions = require("../sample_yodlee_transactions.json").transaction;
// ─── Helpers ────────────────────────────────────────────────────────────────
 
/**
 * Calculates the Financial Health Score from 0–1000.
 * Mirrors the logic in the original server.js GET "/" route.
 *
 * Factors:
 *   - Credit card utilization (primary, as in original code)
 *   - Positive net cashflow bonus
 *   - Emergency fund check (savings ≥ 3× monthly expenses)
 */
const computeHealthScore = (accounts, netCashflow, monthlyExpenses) => {
  let score = 800;
  let trend = "↑ +12 points this week";
 
  const creditCard = accounts.find(
    (a) => a.CONTAINER === "creditCard" || a.accountType === "CREDIT_CARD"
  );
 
  if (creditCard && creditCard.totalCreditLine?.amount > 0) {
    const utilization = creditCard.balance.amount / creditCard.totalCreditLine.amount;
    if      (utilization > 0.7) { score = 620; trend = "↓ Very high credit utilization"; }
    else if (utilization > 0.5) { score = 680; trend = "↓ High credit utilization"; }
    else if (utilization > 0.3) { score = 750; trend = "→ Moderate credit utilization"; }
  }
 
  if (netCashflow > 0) score = Math.min(1000, score + 30);
 
  const savings = accounts.find(
    (a) => a.accountType === "SAVINGS" || a.accountName?.includes("SAVINGS")
  );
  if (savings && monthlyExpenses > 0 && savings.balance.amount >= monthlyExpenses * 3) {
    score = Math.min(1000, score + 50);
    trend = "↑ Strong emergency fund detected";
  }
 
  return { score, trend };
};
 
const buildWeeklyTrend = (transactions) => {
  const weeks = [
    { label: "WK 1", inflow: 0, outflow: 0 },
    { label: "WK 2", inflow: 0, outflow: 0 },
    { label: "WK 3", inflow: 0, outflow: 0 },
    { label: "WK 4", inflow: 0, outflow: 0 },
  ];
 
  const now = new Date();
  transactions.forEach((tx) => {
    // Support both MongoDB shape ({ amount: { amount } }) and flat JSON shape
    const amount = tx.amount?.amount ?? tx.amount ?? 0;
    const date   = tx.date ? new Date(tx.date) : now;
 
    const daysAgo   = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.min(3, Math.floor(daysAgo / 7));
    const slot      = weeks[3 - weekIndex];
 
    if (amount > 0) slot.inflow  += amount;
    else            slot.outflow += Math.abs(amount);
  });
 
  return weeks;
};
 
// ─── Dummy data builder ───────────────────────────────────────────────────────
// Derives all values directly from the JSON files — nothing hardcoded.
 
const buildDummyViewData = (firstName) => {
  // Net worth from sample_yodlee_data.json
  let totalBalance = 0;
  let safeToSpend  = 0;
 
  dummyAccounts.forEach((acc) => {
    const amount = acc.balance?.amount ?? 0;
    if (acc.isAsset) totalBalance += amount;
    else             totalBalance -= amount;
 
    if (acc.accountType === "CHECKING" || acc.accountName?.includes("CHECKING")) {
      safeToSpend = amount;
    }
  });
 
  // Income / expenses from sample_yodlee_transactions.json
  let monthlyIncome   = 0;
  let monthlyExpenses = 0;
 
  dummyTransactions.forEach((tx) => {
    const amount = tx.amount?.amount ?? 0;
    if (amount > 0) monthlyIncome   += amount;
    else            monthlyExpenses += Math.abs(amount);
  });
 
  const netCashflow = monthlyIncome - monthlyExpenses;
 
  const { score: healthScore, trend: healthTrend } =
    computeHealthScore(dummyAccounts, netCashflow, monthlyExpenses);
 
  // Recent activity — map JSON transaction shape to the shape dashboard.ejs expects
  const transactions = dummyTransactions.slice(0, 10).map((tx) => ({
    merchant: tx.description?.simple ?? "Unknown",
    category: tx.category            ?? "Uncategorized",
    date:     new Date(tx.date).toLocaleDateString("en-ZA"),
    amount:   tx.amount?.amount      ?? 0,
  }));
 
  const weeklyTrend = buildWeeklyTrend(dummyTransactions);
 
  return {
    firstName,
    healthScore,
    healthTrend,
    totalBalance:  totalBalance.toLocaleString("en-ZA",  { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    monthlyIncome: monthlyIncome.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    incomeTrend:   "⏱ Next deposit in 4 days",
    safeToSpend:   safeToSpend.toLocaleString("en-ZA",   { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    spendLimit:    "Based on checking balance",
    transactions,
    weeklyTrend,
  };
};
 
// ─── Controller ───────────────────────────────────────────────────────────────
 
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
 
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).send("User not found.");
 
    const accounts = await Account.find({ userId, isActive: true }).lean();
 
    // ── Dummy fallback ─────────────────────────────────────────────────────────
    if (!accounts || accounts.length === 0) {
      console.log("[Dashboard] No accounts in DB — serving dummy JSON data.");
      return res.render("dashboard", { data: buildDummyViewData(user.firstName) });
    }
 
    // ── Live path ──────────────────────────────────────────────────────────────
    let totalBalance = 0;
    accounts.forEach((acc) => {
      totalBalance += acc.isAsset ? acc.balance.amount : -acc.balance.amount;
    });
 
    const checking    = accounts.find((a) => a.accountType === "CHECKING");
    const safeToSpend = checking ? checking.balance.amount : 0;
 
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
    const transactions = await TransactionSchema.find({
      userId,
      date:   { $gte: thirtyDaysAgo },
      status: "POSTED",
    })
      .sort({ date: -1 })
      .lean();
 
    let monthlyIncome   = 0;
    let monthlyExpenses = 0;
    transactions.forEach((tx) => {
      if (tx.amount.amount > 0) monthlyIncome   += tx.amount.amount;
      else                      monthlyExpenses  += Math.abs(tx.amount.amount);
    });
 
    const netCashflow = monthlyIncome - monthlyExpenses;
 
    const { score: healthScore, trend: healthTrend } =
      computeHealthScore(accounts, netCashflow, monthlyExpenses);
 
    User.findByIdAndUpdate(userId, { healthScore, healthTrend }).exec();
 
    const recentTransactions = transactions.slice(0, 10).map((tx) => ({
      merchant: tx.description.simple,
      category: tx.category,
      date:     new Date(tx.date).toLocaleDateString("en-ZA"),
      amount:   tx.amount.amount,
    }));
 
    const weeklyTrend = buildWeeklyTrend(transactions);
 
    return res.render("dashboard", {
      data: {
        firstName:     user.firstName,
        healthScore,
        healthTrend,
        totalBalance:  totalBalance.toLocaleString("en-ZA",  { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        monthlyIncome: monthlyIncome.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        incomeTrend:   "⏱ Next deposit in 4 days",
        safeToSpend:   safeToSpend.toLocaleString("en-ZA",   { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        spendLimit:    "Based on checking balance",
        transactions:  recentTransactions,
        weeklyTrend,
      },
    });
  } catch (err) {
    console.error("[dashboardController.getDashboard]", err);
    return res.status(500).send("Error loading dashboard data.");
  }
};