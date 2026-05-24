/**
 * routes/AuthRoute.js
 * ===================
 * Mounted at: /
 *
 * Public page renders:
 *   GET   /login           Render login.ejs
 *   GET   /register        Render register.ejs
 *   GET   /verify-otp      Render OTP entry page (after 2FA login)
 *
 * Public form submissions:
 *   POST  /auth/register   Register → sets cookie → redirects to /
 *   POST  /auth/login      Login    → sets cookie → redirects to /
 *   POST  /auth/verify-otp Verify OTP → sets cookie → redirects to /
 *
 * Protected:
 *   GET   /auth/logout     Clear cookie → redirect to /login
 *   POST  /auth/refresh    Exchange refresh token (API clients)
 *   PATCH /auth/toggle-2fa Enable/disable 2FA
 */
 
const express          = require("express");
const router           = express.Router();
const { protect }      = require("../middleware/Auth");
const authController   = require("../controllers/AuthController");

 
// ── Public page renders ───────────────────────────────────────────────────────
router.get("/login",      authController.showLogin);
router.get("/register",   authController.showRegister);
router.get("/verify-otp", authController.showOtp);
 
// ── Public form submissions ───────────────────────────────────────────────────
router.post("/auth/register",    authController.register);
router.post("/auth/login",       authController.login);
router.post("/auth/verify-otp",  authController.verifyOtp);
router.post("/auth/refresh",     authController.refreshToken);
 
// ── Protected ─────────────────────────────────────────────────────────────────
router.get("/auth/logout",       protect, authController.logout);
router.patch("/auth/toggle-2fa", protect, authController.toggle2FA);
 
module.exports = router;
 
 