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
 
  const creditCard = accounts.find((a) => a.accountType === "CREDIT_CARD");
 
  if (creditCard && creditCard.totalCreditLine?.amount > 0) {
    const utilization = creditCard.balance.amount / creditCard.totalCreditLine.amount;
    if (utilization > 0.7) {
      score = 620;
      trend = "↓ Very high credit utilization";
    } else if (utilization > 0.5) {
      score = 680;
      trend = "↓ High credit utilization";
    } else if (utilization > 0.3) {
      score = 750;
      trend = "→ Moderate credit utilization";
    }
  }
 
  // Bonus: positive cashflow
  if (netCashflow > 0) score = Math.min(1000, score + 30);
 
  // Bonus: emergency fund (savings account covers 3 months of expenses)
  const savings = accounts.find((a) => a.accountType === "SAVINGS");
  if (savings && monthlyExpenses > 0 && savings.balance.amount >= monthlyExpenses * 3) {
    score = Math.min(1000, score + 50);
    trend = "↑ Strong emergency fund detected";
  }
 
  return { score, trend };
};
 
/**
 * Builds 4-week spending buckets from a transaction array.
 * Powers the "Monthly Spending Trend" bar chart in dashboard.ejs.
 */
const buildWeeklyTrend = (transactions) => {
  const weeks = [
    { label: "WK 1", inflow: 0, outflow: 0 },
    { label: "WK 2", inflow: 0, outflow: 0 },
    { label: "WK 3", inflow: 0, outflow: 0 },
    { label: "WK 4", inflow: 0, outflow: 0 },
  ];
 
  const now = new Date();
  transactions.forEach((tx) => {
    const daysAgo = Math.floor((now - new Date(tx.date)) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.min(3, Math.floor(daysAgo / 7));
    const slot = weeks[3 - weekIndex]; // most recent = WK 4
    if (tx.amount.amount > 0) slot.inflow  += tx.amount.amount;
    else                       slot.outflow += Math.abs(tx.amount.amount);
  });
 
  return weeks;
};
 
// ─── Controller ─────────────────────────────────────────────────────────────
 
/**
 * GET /
 * Renders dashboard.ejs with live MongoDB data.
 * req.user is injected by the auth middleware.
 */
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
 
    // ── 1. User ──────────────────────────────────────────────────────────────
    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).send("User not found.");
 
    // ── 2. Accounts ──────────────────────────────────────────────────────────
    const accounts = await Account.find({ userId, isActive: true }).lean();
 
    // Net worth: sum assets, subtract liabilities (mirrors original server.js logic)
    let totalBalance = 0;
    accounts.forEach((acc) => {
      totalBalance += acc.isAsset ? acc.balance.amount : -acc.balance.amount;
    });
 
    // Safe to Spend = checking account balance
    const checking = accounts.find((a) => a.accountType === "CHECKING");
    const safeToSpend = checking ? checking.balance.amount : 0;
 
    // ── 3. Transactions (last 30 days) ───────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
    const transactions = await TransactionSchema.find({
      userId,
      date:   { $gte: thirtyDaysAgo },
      status: "POSTED",
    })
      .sort({ date: -1 })
      .lean();
 
    // Monthly income = sum of all CREDIT transactions
    let monthlyIncome  = 0;
    let monthlyExpenses = 0;
    transactions.forEach((tx) => {
      if (tx.amount.amount > 0) monthlyIncome   += tx.amount.amount;
      else                      monthlyExpenses  += Math.abs(tx.amount.amount);
    });
 
    const netCashflow = monthlyIncome - monthlyExpenses;
 
    // ── 4. Health Score ──────────────────────────────────────────────────────
    const { score: healthScore, trend: healthTrend } =
      computeHealthScore(accounts, netCashflow, monthlyExpenses);
 
    // Persist updated health score on the user document (background update)
    User.findByIdAndUpdate(userId, { healthScore, healthTrend }).exec();
 
    // ── 5. Recent Activity (last 10) ─────────────────────────────────────────
    const recentTransactions = transactions.slice(0, 10).map((tx) => ({
      merchant: tx.description.simple,
      category: tx.category,
      date:     new Date(tx.date).toLocaleDateString("en-ZA"),
      amount:   tx.amount.amount,
    }));
 
    // ── 6. Weekly Trend ──────────────────────────────────────────────────────
    const weeklyTrend = buildWeeklyTrend(transactions);
 
    // ── 7. Assemble view data (matches exact shape expected by dashboard.ejs) ─
    const viewData = {
      firstName: user.firstName,
      healthScore,
      healthTrend,
 
      totalBalance: totalBalance.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
 
      monthlyIncome: monthlyIncome.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      incomeTrend: "⏱ Next deposit in 4 days", // TODO: derive from payroll schedule
 
      safeToSpend: safeToSpend.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      spendLimit: "Based on checking balance",
 
      transactions: recentTransactions,
      weeklyTrend,
    };
 
    return res.render("dashboard", { data: viewData });
  } catch (err) {
    console.error("[dashboardController.getDashboard]", err);
    return res.status(500).send("Error loading dashboard data.");
  }
};