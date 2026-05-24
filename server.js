const fs = require("fs");
const path = require("path");
require("dotenv").config();
const axios = require("axios"); // Used to call Yodlee / Stitch
const express = require("express");
 
// ── NEW: Production-grade middleware ──────────────────────────────────────────
const mongoose  = require("mongoose");   // Replaces fs.readFileSync JSON files
const helmet    = require("helmet");     // Secure HTTP headers
const cors      = require("cors");       // Cross-origin policy
const rateLimit     = require("express-rate-limit"); // Brute-force protection
const cookieParser  = require("cookie-parser");   // Reads httpOnly auth cookie set on login
 
// ── NEW: Modular routes (replaces the inline app.get handlers below) ──────────
const registerRoutes = require("./routes");
 
const app = express();
app.use(express.json());
app.use(cookieParser()); // Must be before any route that reads req.cookies
 
// ── NEW: Trust the first proxy (required on Heroku / Railway / Nginx) ─────────
app.set("trust proxy", 1);
 
 
// =============================================================================
// YODLEE AUTHENTICATION FUNCTIONS
// (Kept intact — will be wired to the sync job once Open Banking goes live)
// =============================================================================
 
// Yodlee Authentication Function
async function getYodleeToken() {
  try {
    console.log("Initiating handshake with Yodlee Servers...");
 
    const tokenUrl = `${process.env.YODLEE_BASE_URL}/auth/token`;
 
    // Package the credentials in the strict URL-encoded format Yodlee requires
    const params = new URLSearchParams();
    params.append("clientId", process.env.YODLEE_CLIENT_ID);
    params.append("secret", process.env.YODLEE_SECRET);
 
    // Send the request with the updated Content-Type header
    const response = await axios.post(tokenUrl, params, {
      headers: {
        "Api-Version": "1.1",
        "Content-Type": "application/x-www-form-urlencoded",
        loginName: process.env.YODLEE_LOGIN_NAME,
      },
    });
 
    console.log("Yodlee Authentication Successful!");
    return response.data.token.accessToken;
  } catch (error) {
    // Detailed error logging to catch any future enterprise rejections
    console.error(
      "Yodlee Auth Failed:",
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}
 
// User Token engine for Yodlee
async function getUserToken(username) {
  try {
    console.log(`Requesting User Token for '${username}...`);
 
    const tokenUrl = `${process.env.YODLEE_BASE_URL}/auth/token`;
 
    const params = new URLSearchParams();
    params.append("clientId", process.env.YODLEE_CLIENT_ID);
    params.append("secret", process.env.YODLEE_SECRET);
 
    const response = await axios.post(tokenUrl, params, {
      headers: {
        "Api-Version": "1.1",
        "Content-Type": "application/x-www-form-urlencoded",
        loginName: username, // This is where the specific user string will go
      },
    });
    console.log(`User Token Secured for '${username}'!`);
    return response.data.token.accessToken;
  } catch (error) {
    console.error(
      `Failed to get User Token for '${username}':`,
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}
 
async function getAccounts(userToken) {
  try {
    console.log("Fetching linked bank accounts...");
 
    const accountsUrl = `${process.env.YODLEE_BASE_URL}/accounts`;
    const response = await axios.get(accountsUrl, {
      headers: {
        "Api-Version": "1.1",
        Authorization: `Bearer ${userToken}`, // Passes the User room key
      },
    });
    console.log("Accounts retrieved successfully!");
 
    console.log(JSON.stringify(response.data, null, 2)); // Prints raw JSON data structure to terminal
 
    return response.data.account;
  } catch (error) {
    console.error(
      "Failed to fetch accounts:",
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}
 
async function getTransactions(userToken) {
  try {
    console.log("Getting transaction history from last 30 days...");
 
    const transactionsUrl = `${process.env.YODLEE_BASE_URL}/transactions`;
 
    const today = new Date();
    const toDate = today.toISOString().split("T")[0];
 
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const fromDate = thirtyDaysAgo.toISOString().split("T")[0];
 
    const response = await axios.get(transactionsUrl, {
      headers: {
        "Api-Version": "1.1",
        Authorization: `Bearer ${userToken}`,
      },
      params: {
        fromDate: fromDate,
        toDate: toDate,
      },
    });
 
    console.log("Transactions retrieved successfully!");
 
    console.log(JSON.stringify(response.data, null, 2));
    return response.data.transaction;
  } catch (error) {
    console.error(
      "Failed to fetch transactions:",
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}
 
 
// =============================================================================
// APP CONFIGURATION
// =============================================================================
 
app.set("view engine", "ejs");
 
app.use(express.static("public"));
 
 
// =============================================================================
// NEW: SECURITY MIDDLEWARE
// Added helmet, CORS, and rate limiting — not present in the original server.
// =============================================================================
 
// Sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        styleSrc:   ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
        fontSrc:    ["'self'", "fonts.gstatic.com"],
        connectSrc: ["'self'"],
        imgSrc:     ["'self'", "data:"],
      },
    },
  })
);
 
// CORS — restrict to your frontend origin in production
// Set CLIENT_ORIGIN in .env for deployed environments
app.use(
  cors({
    origin:      process.env.CLIENT_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
 
app.use(express.urlencoded({ extended: false }));
 
// Global limiter — 200 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      200,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many requests. Please slow down." },
});
app.use(globalLimiter);
 
// Stricter limiter for auth endpoints — 20 attempts per 15 minutes per IP
// Prevents brute-force attacks on the login and registration endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      20,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: "Too many authentication attempts. Please try again later." },
});
app.use("/auth/login",      authLimiter);
app.use("/auth/register",   authLimiter);
app.use("/auth/verify-otp", authLimiter);
 
 
// =============================================================================
// NEW: MODULAR ROUTES
// The original inline app.get("/"), app.get("/cashflow") etc. have been moved
// into dedicated controller + route files and are mounted here via registerRoutes.
//
// Route map:
//   /auth/*             → routes/auth.js         (register, login, 2FA, JWT)
//   /                   → routes/dashboard.js    (was: inline app.get "/")
//   /cashflow           → routes/cashflow.js     (was: inline app.get "/cashflow")
//   /api/transactions   → routes/cashflow.js     (NEW: transaction CRUD)
//   /api/budgets        → routes/cashflow.js     (NEW: budget CRUD)
//   /portfolio          → routes/portfolio.js    (was: inline app.get "/portfolio")
//   /api/accounts       → routes/portfolio.js    (was: inline app.get "/api/accounts")
//   /api/holdings       → routes/portfolio.js    (NEW: holdings CRUD)
//   /forecaster         → routes/forecaster.js   (was: inline app.get "/forecaster")
//   /atlas              → routes/atlas.js        (was: inline app.get "/atlas")
//   /api/atlas/chat     → routes/atlas.js        (was: inline app.post "/api/atlas/chat")
//   /api/atlas/insights → routes/atlas.js        (NEW: AI-generated insights panel)
//   /api/user/*         → routes/user.js         (NEW: profile, password, health score)
// =============================================================================
registerRoutes(app);
 
 
// =============================================================================
// NEW: 404 + GLOBAL ERROR HANDLERS
// =============================================================================
 
// 404 — returns JSON for API calls, plain text for page requests
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
  }
  return res.status(404).render("404", { message: "Page not found." });
});
 
// Global error handler — catches anything thrown inside route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  if (req.path.startsWith("/api/")) {
    return res.status(500).json({ error: "An unexpected error occurred." });
  }
  return res.status(500).send("Something went wrong. Please try again.");
});
 
 
// =============================================================================
// NEW: DATABASE CONNECTION + SERVER START
// The original used app.listen() directly. We now connect to MongoDB first,
// then start the server — so routes never fire against an unready database.
//
// Required .env variables:
//   PORT               (default 3000)
//   MONGO_URI          MongoDB Atlas connection string
//   JWT_SECRET         Access token signing secret
//   JWT_REFRESH_SECRET Refresh token signing secret
//   ANTHROPIC_API_KEY  Claude API key (powers Atlas AI)
//   YODLEE_BASE_URL    (optional — uncomment the token calls below to activate)
//   YODLEE_CLIENT_ID   (optional)
//   YODLEE_SECRET      (optional)
//   YODLEE_LOGIN_NAME  (optional)
//   YODLEE_TEST_USER   (optional)
// =============================================================================
 
const PORT      = process.env.PORT      || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/architect";
 
const start = async () => {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000, // Fail fast if Mongo is unreachable
    });
    console.log(`MongoDB connected → ${mongoose.connection.host}`);
 
    const server = app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
 
    // ── Graceful Shutdown ─────────────────────────────────────────────────────
    // Closes the HTTP server and MongoDB connection cleanly on SIGTERM / SIGINT
    // (Docker stop, Ctrl+C, Railway/Heroku restart signals)
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await mongoose.connection.close();
        console.log("MongoDB connection closed. Goodbye.");
        process.exit(0);
      });
    };
 
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT",  () => shutdown("SIGINT"));
 
    // ── Yodlee Live Sync (uncomment to activate once credentials are live) ────
    //const adminToken = await getYodleeToken();
 
    //if (adminToken) {
    //const userToken = await getUserToken(process.env.YODLEE_TEST_USER);
 
    //if (userToken) {
    //console.log(
    // "Both Admin and User Tokens successfully retrieved. Ready to make API calls!",
    // );
 
    //await getTransactions(userToken);
    // }
    // }
 
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};
 
start();