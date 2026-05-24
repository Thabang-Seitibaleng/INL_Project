/**
 * middleware/Auth.js
 * ==================
 * JWT authentication middleware.
 *
 * UPDATED: Now reads the token from EITHER:
 *   1. The httpOnly cookie (set on login — used by EJS page routes)
 *   2. The Authorization: Bearer header (used by API clients / Postman)
 *
 * This means browser page visits and API calls both authenticate
 * through the same single middleware.
 *
 * Usage:
 *   const { protect } = require('../middleware/Auth');
 *   router.get('/cashflow', protect, cashflowController.getCashflow);
 */
 
const jwt      = require("jsonwebtoken");
const { User } = require("../models/index");
 
exports.protect = async (req, res, next) => {
  try {
    // ── 1. Extract token from cookie or Authorization header ─────────────────
    // Cookie is set by login/register (browser flow)
    // Bearer header is used by API clients (Postman, mobile apps, etc.)
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);
 
    if (!token) {
      // API request → return JSON error
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ error: "No token provided. Please log in." });
      }
      // Page request → redirect to login page
      return res.redirect("/login");
    }
 
    // ── 2. Verify token signature ─────────────────────────────────────────────
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Token is expired or tampered with
      res.clearCookie("token"); // Clear bad cookie
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ error: "Token is invalid or expired. Please log in again." });
      }
      return res.redirect("/login?error=Your+session+has+expired.+Please+log+in+again.");
    }
 
    // ── 3. Confirm user still exists and is active ───────────────────────────
    const user = await User.findById(payload.sub)
      .select("_id email firstName isActive")
      .lean();
 
    if (!user || !user.isActive) {
      res.clearCookie("token");
      if (req.path.startsWith("/api/")) {
        return res.status(401).json({ error: "Account not found or deactivated." });
      }
      return res.redirect("/login?error=Account+not+found.+Please+log+in+again.");
    }
 
    // ── 4. Attach user to request ─────────────────────────────────────────────
    // All downstream controllers access the logged-in user via req.user
    req.user = {
      id:        user._id.toString(),
      email:     user.email,
      firstName: user.firstName,
    };
 
    next();
  } catch (err) {
    console.error("[Auth.protect]", err);
    if (req.path.startsWith("/api/")) {
      return res.status(500).json({ error: "Authentication error." });
    }
    return res.redirect("/login");
  }
};