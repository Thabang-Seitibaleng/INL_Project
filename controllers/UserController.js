/**
 * userController.js
 * =================
 * Manages the authenticated user's profile, settings,
 * and financial health score recalculation.
 *
 * Routes this covers:
 *   GET    /api/user/profile
 *   PATCH  /api/user/profile
 *   PATCH  /api/user/password
 *   DELETE /api/user/account
 *   GET    /api/user/health-score     (on-demand recalculation)
 *   PATCH  /api/user/yodlee-link      (store Yodlee loginName for live sync)
 */
 
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Account = require("../models/Account");
const Transaction = require("../models/Transaction");
 
// ─── GET /api/user/profile ────────────────────────────────────────────────────
 
/**
 * Returns the authenticated user's public profile.
 * Strips sensitive fields (password, refreshToken, otpSecret).
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password -refreshToken -otpSecret -otpExpiry")
      .lean();
 
    if (!user) return res.status(404).json({ error: "User not found." });
 
    return res.status(200).json({ user });
  } catch (err) {
    console.error("[userController.getProfile]", err);
    return res.status(500).json({ error: "Could not fetch profile." });
  }
};
 
// ─── PATCH /api/user/profile ──────────────────────────────────────────────────
 
/**
 * Updates editable profile fields.
 * Body: { firstName?, lastName?, email? }
 */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { firstName, lastName, email } = req.body;
 
    // Build update object from only provided fields
    const updates = {};
    if (firstName) updates.firstName = firstName.trim();
    if (lastName)  updates.lastName  = lastName.trim();
    if (email) {
      // Check for email collision
      const existing = await User.findOne({
        email: email.toLowerCase(),
        _id:   { $ne: userId },
      });
      if (existing) {
        return res.status(409).json({ error: "That email is already in use." });
      }
      updates.email = email.toLowerCase();
    }
 
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }
 
    const user = await User.findByIdAndUpdate(userId, updates, { new: true })
      .select("-password -refreshToken -otpSecret -otpExpiry");
 
    return res.status(200).json({ message: "Profile updated.", user });
  } catch (err) {
    console.error("[userController.updateProfile]", err);
    return res.status(500).json({ error: "Could not update profile." });
  }
};
 
// ─── PATCH /api/user/password ─────────────────────────────────────────────────
 
/**
 * Changes the user's password.
 * Body: { currentPassword, newPassword }
 */
exports.changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;
 
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword are required." });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
 
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });
 
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
 
    user.password     = await bcrypt.hash(newPassword, 12);
    user.refreshToken = null; // Invalidate all existing sessions
    await user.save();
 
    return res.status(200).json({ message: "Password updated. Please log in again." });
  } catch (err) {
    console.error("[userController.changePassword]", err);
    return res.status(500).json({ error: "Could not update password." });
  }
};
 
// ─── DELETE /api/user/account ─────────────────────────────────────────────────
 
/**
 * Soft-deletes the user's account (sets isActive = false).
 * Body: { password } — requires confirmation.
 */
exports.deleteAccount = async (req, res) => {
  try {
    const userId   = req.user.id;
    const { password } = req.body;
 
    if (!password) {
      return res.status(400).json({ error: "Password confirmation is required." });
    }
 
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found." });
 
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Password is incorrect." });
    }
 
    user.isActive     = false;
    user.refreshToken = null;
    await user.save();
 
    return res.status(200).json({ message: "Account deactivated successfully." });
  } catch (err) {
    console.error("[userController.deleteAccount]", err);
    return res.status(500).json({ error: "Could not deactivate account." });
  }
};
 
// ─── GET /api/user/health-score ───────────────────────────────────────────────
 
/**
 * Recalculates and returns the user's Financial Health Score.
 * This is the same logic used in dashboardController, exposed as a standalone
 * endpoint so the score can be refreshed on-demand (e.g. after a new transaction).
 *
 * Factors (in priority order):
 *   1. Credit utilization  (high impact)
 *   2. Net cashflow        (positive = bonus)
 *   3. Emergency fund      (savings ≥ 3× monthly expenses = bonus)
 *   4. Debt-to-income      (loan balances vs income)
 */
exports.getHealthScore = async (req, res) => {
  try {
    const userId = req.user.id;
 
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
    const [accounts, transactions] = await Promise.all([
      Account.find({ userId, isActive: true }).lean(),
      Transaction.find({ userId, date: { $gte: thirtyDaysAgo }, status: "POSTED" }).lean(),
    ]);
 
    let score = 800;
    const factors = [];
 
    // ── Factor 1: Credit utilization ─────────────────────────────────────────
    const creditCard = accounts.find((a) => a.accountType === "CREDIT_CARD");
    if (creditCard && creditCard.totalCreditLine?.amount > 0) {
      const utilization = creditCard.balance.amount / creditCard.totalCreditLine.amount;
      if (utilization > 0.7) {
        score -= 180;
        factors.push({ name: "Credit Utilization", impact: -180, detail: `${Math.round(utilization * 100)}% used — very high` });
      } else if (utilization > 0.5) {
        score -= 120;
        factors.push({ name: "Credit Utilization", impact: -120, detail: `${Math.round(utilization * 100)}% used — high` });
      } else if (utilization > 0.3) {
        score -= 50;
        factors.push({ name: "Credit Utilization", impact: -50, detail: `${Math.round(utilization * 100)}% used — moderate` });
      } else {
        factors.push({ name: "Credit Utilization", impact: 0, detail: `${Math.round(utilization * 100)}% used — healthy` });
      }
    }
 
    // ── Factor 2: Net cashflow ────────────────────────────────────────────────
    let income   = 0;
    let expenses = 0;
    transactions.forEach((tx) => {
      if (tx.amount.amount > 0) income   += tx.amount.amount;
      else                      expenses += Math.abs(tx.amount.amount);
    });
    const net = income - expenses;
 
    if (net > 0) {
      score += 30;
      factors.push({ name: "Net Cashflow", impact: +30, detail: `Positive: R ${net.toLocaleString("en-ZA")}` });
    } else {
      score -= 40;
      factors.push({ name: "Net Cashflow", impact: -40, detail: `Negative: R ${Math.abs(net).toLocaleString("en-ZA")} overspend` });
    }
 
    // ── Factor 3: Emergency fund ──────────────────────────────────────────────
    const savings = accounts.find((a) => a.accountType === "SAVINGS");
    if (savings && expenses > 0) {
      const monthsCovered = savings.balance.amount / expenses;
      if (monthsCovered >= 3) {
        score += 50;
        factors.push({ name: "Emergency Fund", impact: +50, detail: `${monthsCovered.toFixed(1)} months of expenses covered` });
      } else {
        factors.push({ name: "Emergency Fund", impact: 0, detail: `Only ${monthsCovered.toFixed(1)} months covered — target 3+` });
      }
    }
 
    // ── Factor 4: Debt-to-income ──────────────────────────────────────────────
    const totalDebt = accounts
      .filter((a) => !a.isAsset)
      .reduce((sum, a) => sum + a.balance.amount, 0);
 
    if (income > 0) {
      const dti = totalDebt / income;
      if (dti > 0.43) {
        score -= 60;
        factors.push({ name: "Debt-to-Income", impact: -60, detail: `${Math.round(dti * 100)}% DTI — above recommended 43%` });
      } else {
        factors.push({ name: "Debt-to-Income", impact: 0, detail: `${Math.round(dti * 100)}% DTI — healthy` });
      }
    }
 
    // Clamp to [0, 1000]
    score = Math.max(0, Math.min(1000, score));
 
    const trend = score >= 780
      ? "↑ Strong financial position"
      : score >= 680
        ? "→ Room for improvement"
        : "↓ Action required";
 
    // Persist the refreshed score
    await User.findByIdAndUpdate(userId, { healthScore: score, healthTrend: trend });
 
    return res.status(200).json({ score, trend, factors });
  } catch (err) {
    console.error("[userController.getHealthScore]", err);
    return res.status(500).json({ error: "Could not calculate health score." });
  }
};
 
// ─── PATCH /api/user/yodlee-link ─────────────────────────────────────────────
 
/**
 * Stores the Yodlee loginName on the user record.
 * Called once during the Open Banking account-linking flow.
 *
 * Body: { yodleeLoginName }
 */
exports.linkYodlee = async (req, res) => {
  try {
    const { yodleeLoginName } = req.body;
 
    if (!yodleeLoginName) {
      return res.status(400).json({ error: "yodleeLoginName is required." });
    }
 
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { yodleeLoginName },
      { new: true }
    ).select("-password -refreshToken -otpSecret");
 
    return res.status(200).json({ message: "Yodlee account linked.", user });
  } catch (err) {
    console.error("[userController.linkYodlee]", err);
    return res.status(500).json({ error: "Could not link Yodlee account." });
  }
};