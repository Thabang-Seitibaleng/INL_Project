/**
 * authController.js
 * =================
 * Handles the full auth flowchart:
 *   Register/Sign Up → Login → Valid Credentials?
 *   → 2FA Required? → Send OTP → OTP Valid? → Generate JWT Token
 *
 * Dependencies (add to package.json):
 *   npm install bcryptjs jsonwebtoken speakeasy nodemailer
 */
 
const bcrypt    = require("bcryptjs");
const jwt       = require("jsonwebtoken");
const speakeasy = require("speakeasy");
const { User }  = require("../models/index");
 
// ─── Cookie Config ────────────────────────────────────────────────────────────
// Centralised so it's easy to update in one place
const COOKIE_OPTIONS = {
  httpOnly: true,                                          // JS cannot read it — XSS safe
  secure:   process.env.NODE_ENV === "production",         // HTTPS only in prod
  sameSite: "lax",                                         // CSRF protection
  maxAge:   15 * 60 * 1000,                                // 15 minutes (matches JWT)
};
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
const signTokens = (userId) => {
  const accessToken = jwt.sign(
    { sub: userId },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
  const refreshToken = jwt.sign(
    { sub: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
  return { accessToken, refreshToken };
};
 
const generateOtp = () => {
  const otp    = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
  const expiry = new Date(Date.now() + 10 * 60 * 1000);                  // 10 minutes
  return { otp, expiry };
};
 
// ─── Page Renders ─────────────────────────────────────────────────────────────
 
/**
 * GET /login
 * Renders the login page. Redirects to dashboard if already logged in.
 */
exports.showLogin = (req, res) => {
  // If token cookie already exists, skip login and go straight to dashboard
  if (req.cookies?.token) {
    return res.redirect("/");
  }
  // Pass error from query string (e.g. ?error=Invalid+credentials)
  return res.render("login", { error: req.query.error || null });
};
 
/**
 * GET /register
 * Renders the registration page.
 */
exports.showRegister = (req, res) => {
  if (req.cookies?.token) {
    return res.redirect("/");
  }
  return res.render("register", { error: req.query.error || null });
};
 
/**
 * GET /verify-otp
 * Renders the OTP entry page after a 2FA login attempt.
 * Expects ?userId= in the query string.
 */
exports.showOtp = (req, res) => {
  return res.render("otp", {
    userId: req.query.userId || "",
    error:  req.query.error  || null,
  });
};
 
// ─── POST /auth/register ──────────────────────────────────────────────────────
 
/**
 * Registers a new user, sets the auth cookie, and redirects to the dashboard.
 * Flowchart node: Register / Sign Up (s34)
 *
 * Body: { firstName, lastName, email, password }
 */
exports.register = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
 
    if (!firstName || !lastName || !email || !password) {
      return res.redirect("/register?error=All+fields+are+required.");
    }
 
    if (password.length < 8) {
      return res.redirect("/register?error=Password+must+be+at+least+8+characters.");
    }
 
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.redirect("/register?error=An+account+with+that+email+already+exists.");
    }
 
    const hashedPassword = await bcrypt.hash(password, 12);
 
    const user = await User.create({
      firstName,
      lastName,
      email: email.toLowerCase(),
      password: hashedPassword,
    });
 
    const { accessToken, refreshToken } = signTokens(user._id);
 
    // Persist refresh token on user document
    user.refreshToken = refreshToken;
    await user.save();
 
    // Set the access token as an httpOnly cookie
    res.cookie("token", accessToken, COOKIE_OPTIONS);
 
    // Redirect to dashboard — the cookie will authenticate all future page loads
    return res.redirect("/");
  } catch (err) {
    console.error("[authController.register]", err);
    return res.redirect("/register?error=Registration+failed.+Please+try+again.");
  }
};
 
// ─── POST /auth/login ─────────────────────────────────────────────────────────
 
/**
 * Logs in a user.
 * Flowchart: Login (s28) → Valid Credentials? → 2FA Required? (s30)
 *
 * Body: { email, password }
 *
 * Flow:
 *   - Invalid creds    → redirect back to /login with error
 *   - 2FA disabled     → set cookie, redirect to dashboard
 *   - 2FA enabled      → redirect to /verify-otp?userId=...
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
 
    if (!email || !password) {
      return res.redirect("/login?error=Email+and+password+are+required.");
    }
 
    // Flowchart: Valid Credentials? (s27)
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });
    if (!user) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }
 
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.redirect("/login?error=Invalid+email+or+password.");
    }
 
    // Flowchart: 2FA Required? (s30)
    if (user.twoFactorEnabled) {
      const { otp, expiry } = generateOtp();
 
      user.otpSecret = await bcrypt.hash(otp, 10);
      user.otpExpiry = expiry;
      await user.save();
 
      // In production: send OTP via SMS/email (Twilio, Africa's Talking, etc.)
      console.log(`[2FA OTP for ${user.email}]: ${otp}`);
 
      // Redirect to OTP entry page — pass userId so we know who to verify
      return res.redirect(`/verify-otp?userId=${user._id}`);
    }
 
    // No 2FA — issue tokens and set cookie (Flowchart: Generate JWT Token s33)
    const { accessToken, refreshToken } = signTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();
 
    res.cookie("token", accessToken, COOKIE_OPTIONS);
 
    return res.redirect("/");
  } catch (err) {
    console.error("[authController.login]", err);
    return res.redirect("/login?error=Login+failed.+Please+try+again.");
  }
};
 
// ─── POST /auth/verify-otp ───────────────────────────────────────────────────
 
/**
 * Verifies the OTP for 2FA login.
 * Flowchart: OTP Valid? (s34) → Generate JWT Token (s33) | Show Error & Retry (s32)
 *
 * Body: { userId, otp }
 */
exports.verifyOtp = async (req, res) => {
  try {
    const { userId, otp } = req.body;
 
    if (!userId || !otp) {
      return res.redirect(`/verify-otp?userId=${userId}&error=OTP+is+required.`);
    }
 
    const user = await User.findById(userId);
    if (!user || !user.otpSecret) {
      return res.redirect("/login?error=Session+expired.+Please+log+in+again.");
    }
 
    // Flowchart: OTP Valid? (s34)
    if (user.otpExpiry < new Date()) {
      return res.redirect(`/verify-otp?userId=${userId}&error=OTP+has+expired.+Please+log+in+again.`);
    }
 
    const otpMatch = await bcrypt.compare(otp, user.otpSecret);
    if (!otpMatch) {
      // Flowchart: Show Error & Retry (s32)
      return res.redirect(`/verify-otp?userId=${userId}&error=Invalid+OTP.+Please+try+again.`);
    }
 
    // Clear OTP fields after successful verification
    user.otpSecret = null;
    user.otpExpiry = null;
 
    // Flowchart: Generate JWT Token (s33)
    const { accessToken, refreshToken } = signTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();
 
    res.cookie("token", accessToken, COOKIE_OPTIONS);
 
    return res.redirect("/");
  } catch (err) {
    console.error("[authController.verifyOtp]", err);
    return res.redirect("/login?error=Verification+failed.+Please+try+again.");
  }
};
 
// ─── GET /auth/logout ────────────────────────────────────────────────────────
 
/**
 * Clears the auth cookie and redirects to login.
 */
exports.logout = async (req, res) => {
  try {
    // Invalidate the refresh token in the database
    if (req.user?.id) {
      await User.findByIdAndUpdate(req.user.id, { refreshToken: null });
    }
 
    // Clear the cookie
    res.clearCookie("token");
 
    return res.redirect("/login");
  } catch (err) {
    console.error("[authController.logout]", err);
    res.clearCookie("token");
    return res.redirect("/login");
  }
};
 
// ─── POST /auth/refresh ──────────────────────────────────────────────────────
 
/**
 * Exchanges a valid refresh token for a new access token.
 * Used by API clients — not needed for the cookie-based browser flow.
 *
 * Body: { refreshToken }
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required." });
    }
 
    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token." });
    }
 
    const user = await User.findById(payload.sub);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ error: "Refresh token has been revoked." });
    }
 
    const { accessToken, refreshToken: newRefreshToken } = signTokens(user._id);
    user.refreshToken = newRefreshToken;
    await user.save();
 
    res.cookie("token", accessToken, COOKIE_OPTIONS);
 
    return res.status(200).json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("[authController.refreshToken]", err);
    return res.status(500).json({ error: "Token refresh failed." });
  }
};
 
// ─── PATCH /auth/toggle-2fa ──────────────────────────────────────────────────
 
/**
 * Enables or disables 2FA for the authenticated user.
 * Body: { enable: true | false }
 */
exports.toggle2FA = async (req, res) => {
  try {
    const { enable } = req.body;
    const user = await User.findById(req.user.id);
 
    user.twoFactorEnabled = Boolean(enable);
    if (!enable) {
      user.otpSecret = null;
      user.otpExpiry = null;
    }
    await user.save();
 
    return res.status(200).json({
      message:          `2FA has been ${enable ? "enabled" : "disabled"}.`,
      twoFactorEnabled: user.twoFactorEnabled,
    });
  } catch (err) {
    console.error("[authController.toggle2FA]", err);
    return res.status(500).json({ error: "Could not update 2FA settings." });
  }
};