/**
 * portfolioController.js
 * ======================
 * Replaces the GET "/portfolio" route in server.js.
 * Also provides CRUD for Accounts (vaults) and Holdings.
 *
 * Powers: portfolio.ejs
 *   - Total Account Value (massive value card)
 *   - Account Vaults (Investec, EasyEquities, Luno)
 *   - Your Holdings list (equities + crypto)
 *   - Top Movers (7-day return data)
 *   - Performance History chart (via PortfolioSnapshot)
 */
 
const { Account, Holding, PortfolioSnapshotSchema } = require("../models/index");
 
// ─── GET /portfolio ───────────────────────────────────────────────────────────
 
/**
 * Renders portfolio.ejs with live MongoDB data.
 * Mirrors the exact data shape expected by the EJS template.
 */
exports.getPortfolio = async (req, res) => {
  try {
    const userId = req.user.id;
 
    // ── Accounts (vaults) ─────────────────────────────────────────────────────
    const accounts = await Account.find({ userId, isActive: true }).lean();
 
    let totalAccountValue  = 0;
    let investecBalance    = 0;
    let easyEquitiesBalance = 0;
    let lunoBalance        = 0;
 
    accounts.forEach((acc) => {
      totalAccountValue += acc.balance.amount;
      if (acc.providerName === "Investec")     investecBalance     = acc.balance.amount;
      if (acc.providerName === "EasyEquities") easyEquitiesBalance = acc.balance.amount;
      if (acc.providerName === "Luno")         lunoBalance         = acc.balance.amount;
    });
 
    // ── Holdings ──────────────────────────────────────────────────────────────
    const holdings = await Holding.find({ userId })
      .sort({ value: -1 }) // highest value first
      .lean();
 
    // Map to shape expected by portfolio.ejs Your Holdings section
    const mappedHoldings = holdings.map((h) => ({
      provider:    h.accountId?.toString() || "Unknown", // will be populated below
      symbol:      h.symbol,
      description: h.description,
      value:       h.value,
      isPositive:  h.isPositive,
    }));
 
    // Populate provider name by joining with Account (efficient: accounts already in memory)
    const accountMap = Object.fromEntries(accounts.map((a) => [a._id.toString(), a.providerName]));
    holdings.forEach((h, i) => {
      mappedHoldings[i].provider = accountMap[h.accountId?.toString()] || "Unknown";
    });
 
    // ── Top Movers (7-day) ────────────────────────────────────────────────────
    const topMovers = [...holdings]
      .sort((a, b) => Math.abs(b.returnPercentage) - Math.abs(a.returnPercentage))
      .slice(0, 5)
      .map((h) => ({
        symbol:           h.symbol,
        description:      h.description,
        assetClass:       h.assetClass,
        value:            h.value,
        returnPercentage: h.returnPercentage,
        returnAmount:     h.returnAmount,
        isPositive:       h.isPositive,
      }));
 
    // ── Performance History (last 12 months for chart) ────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
 
    const snapshots = await PortfolioSnapshot.find({
      userId,
      takenAt: { $gte: twelveMonthsAgo },
    })
      .sort({ takenAt: 1 })
      .lean();
 
    const performanceHistory = snapshots.map((s) => ({
      date:       s.takenAt,
      totalValue: s.totalValue,
    }));
 
    // ── Assemble view data ────────────────────────────────────────────────────
    const portfolioData = {
      totalValue: totalAccountValue.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      investecBalance: investecBalance.toLocaleString("en-ZA", { minimumFractionDigits: 0 }),
      easyEquitiesBalance: easyEquitiesBalance.toLocaleString("en-ZA", { minimumFractionDigits: 0 }),
      lunoBalance: lunoBalance.toLocaleString("en-ZA", { minimumFractionDigits: 0 }),
      holdings:    mappedHoldings,
      topMovers,
      performanceHistory,
    };
 
    return res.render("portfolio", { data: portfolioData });
  } catch (err) {
    console.error("[portfolioController.getPortfolio]", err);
    return res.status(500).send("Error loading portfolio data.");
  }
};
 
// ─── Account (Vault) CRUD ─────────────────────────────────────────────────────
 
/**
 * GET /api/accounts
 * Returns all active accounts for the authenticated user.
 */
exports.getAccounts = async (req, res) => {
  try {
    const accounts = await Account.find({ userId: req.user.id, isActive: true }).lean();
    return res.status(200).json({ accounts });
  } catch (err) {
    console.error("[portfolioController.getAccounts]", err);
    return res.status(500).json({ error: "Could not fetch accounts." });
  }
};
 
/**
 * POST /api/accounts
 * Adds a new account vault (bank account, investment account, crypto wallet).
 *
 * Body: { providerName, accountType, accountName, balance, currency?, isAsset?, accountNumber? }
 */
exports.createAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      providerName,
      accountType,
      accountName,
      container,
      balance,
      currency,
      isAsset,
      accountNumber,
      totalCreditLine,
    } = req.body;
 
    if (!providerName || !accountType || !accountName || balance === undefined) {
      return res.status(400).json({
        error: "providerName, accountType, accountName, and balance are required.",
      });
    }
 
    const account = await Account.create({
      userId,
      providerName,
      accountType,
      accountName,
      container,
      accountNumber,
      currency: currency || "ZAR",
      balance:  { amount: parseFloat(balance), currency: currency || "ZAR" },
      totalCreditLine: totalCreditLine
        ? { amount: parseFloat(totalCreditLine), currency: currency || "ZAR" }
        : undefined,
      isAsset: isAsset !== undefined ? Boolean(isAsset) : true,
    });
 
    return res.status(201).json({ message: "Account created.", account });
  } catch (err) {
    console.error("[portfolioController.createAccount]", err);
    return res.status(500).json({ error: "Could not create account." });
  }
};
 
/**
 * PATCH /api/accounts/:id/balance
 * Updates an account's balance (called after syncing with Yodlee/Open Banking).
 *
 * Body: { amount }
 */
exports.updateAccountBalance = async (req, res) => {
  try {
    const { id }   = req.params;
    const userId   = req.user.id;
    const { amount } = req.body;
 
    if (amount === undefined) {
      return res.status(400).json({ error: "amount is required." });
    }
 
    const account = await Account.findOneAndUpdate(
      { _id: id, userId },
      {
        "balance.amount": parseFloat(amount),
        lastSyncedAt:     new Date(),
      },
      { new: true }
    );
 
    if (!account) return res.status(404).json({ error: "Account not found." });
 
    return res.status(200).json({ message: "Balance updated.", account });
  } catch (err) {
    console.error("[portfolioController.updateAccountBalance]", err);
    return res.status(500).json({ error: "Could not update balance." });
  }
};
 
/**
 * DELETE /api/accounts/:id
 * Soft-deletes an account (sets isActive = false).
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
 
    const account = await Account.findOneAndUpdate(
      { _id: id, userId },
      { isActive: false },
      { new: true }
    );
 
    if (!account) return res.status(404).json({ error: "Account not found." });
 
    return res.status(200).json({ message: "Account removed." });
  } catch (err) {
    console.error("[portfolioController.deleteAccount]", err);
    return res.status(500).json({ error: "Could not remove account." });
  }
};
 
// ─── Holdings CRUD ────────────────────────────────────────────────────────────
 
/**
 * GET /api/holdings
 * Returns all holdings for the authenticated user, optionally filtered by assetClass.
 *
 * Query: assetClass (Equity | Crypto | ETF | Bond | Cash | Other)
 */
exports.getHoldings = async (req, res) => {
  try {
    const userId = req.user.id;
    const filter = { userId };
    if (req.query.assetClass) filter.assetClass = req.query.assetClass;
 
    const holdings = await Holding.find(filter).sort({ value: -1 }).lean();
    return res.status(200).json({ holdings });
  } catch (err) {
    console.error("[portfolioController.getHoldings]", err);
    return res.status(500).json({ error: "Could not fetch holdings." });
  }
};
 
/**
 * POST /api/holdings
 * Upserts a holding (called by the Yodlee sync job).
 *
 * Body: { accountId, symbol, description, assetClass, quantity, value, costBasis?, returnAmount?, returnPercentage? }
 */
exports.upsertHolding = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      accountId, symbol, description, assetClass,
      quantity, value, costBasis, returnAmount, returnPercentage,
    } = req.body;
 
    if (!accountId || !symbol || !description || value === undefined) {
      return res.status(400).json({ error: "accountId, symbol, description, and value are required." });
    }
 
    const isPositive = (returnPercentage || 0) >= 0;
 
    const holding = await Holding.findOneAndUpdate(
      { userId, accountId, symbol },
      {
        userId, accountId, symbol, description,
        assetClass:       assetClass || "Equity",
        quantity:         parseFloat(quantity) || 0,
        value:            parseFloat(value),
        costBasis:        costBasis !== undefined ? parseFloat(costBasis) : null,
        returnAmount:     parseFloat(returnAmount) || 0,
        returnPercentage: parseFloat(returnPercentage) || 0,
        isPositive,
        lastSyncedAt:     new Date(),
      },
      { upsert: true, new: true }
    );
 
    return res.status(200).json({ message: "Holding upserted.", holding });
  } catch (err) {
    console.error("[portfolioController.upsertHolding]", err);
    return res.status(500).json({ error: "Could not upsert holding." });
  }
};
 
// ─── Portfolio Snapshot ───────────────────────────────────────────────────────
 
/**
 * POST /api/portfolio/snapshot
 * Records the current total portfolio value as a time-series point.
 * Called by a daily cron job — not typically triggered by the user.
 */
exports.takeSnapshot = async (req, res) => {
  try {
    const userId  = req.user.id;
    const accounts = await Account.find({ userId, isActive: true }).lean();
 
    let totalValue = 0;
    const breakdown = [];
 
    accounts.forEach((acc) => {
      totalValue += acc.balance.amount;
      breakdown.push({ providerName: acc.providerName, balance: acc.balance.amount });
    });
 
    const snapshot = await PortfolioSnapshot.create({ userId, totalValue, breakdown });
 
    return res.status(201).json({ message: "Snapshot saved.", snapshot });
  } catch (err) {
    console.error("[portfolioController.takeSnapshot]", err);
    return res.status(500).json({ error: "Could not save snapshot." });
  }
};
 
/**
 * GET /api/portfolio/history
 * Returns portfolio value history for the performance chart.
 *
 * Query: range (1m | 3m | 6m | 1y)  default: 1y
 */
exports.getPortfolioHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const range  = req.query.range || "1y";
 
    const rangeMap = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 };
    const months   = rangeMap[range] || 12;
 
    const from = new Date();
    from.setMonth(from.getMonth() - months);
 
    const snapshots = await PortfolioSnapshot.find({ userId, takenAt: { $gte: from } })
      .sort({ takenAt: 1 })
      .lean();
 
    return res.status(200).json({ snapshots });
  } catch (err) {
    console.error("[portfolioController.getPortfolioHistory]", err);
    return res.status(500).json({ error: "Could not fetch portfolio history." });
  }
};