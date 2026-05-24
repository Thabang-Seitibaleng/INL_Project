/**
 * routes/index.js
 * ===============
 * Barrel file — mounts all domain route modules onto the Express app.
 *
 * Usage in server.js:
 *   const registerRoutes = require('./routes');
 *   registerRoutes(app);
 */
const authRoutes       = require("./AuthRoute");
const dashboardRoutes  = require("./DashboardRoute");
const cashflowRoutes   = require("./CashflowRoute");
const portfolioRoutes  = require("./PortfolioRoute");
const forecasterRoutes = require("./ForecasterRoute");
const atlasRoutes      = require("./AtlasRoute");
const userRoutes       = require("./UserRoute");
 
module.exports = (app) => {
  app.use("/",     authRoutes);       // POST /auth/register, /auth/login …
  app.use("/",         dashboardRoutes);  // GET  /
  app.use("/",         cashflowRoutes);   // GET  /cashflow, /api/transactions …
  app.use("/",         portfolioRoutes);  // GET  /portfolio, /api/accounts …
  app.use("/",         forecasterRoutes); // GET  /forecaster, /api/forecaster
  app.use("/",         atlasRoutes);      // GET  /atlas, POST /api/atlas/chat …
  app.use("/api/user", userRoutes);       // GET  /api/user/profile …
};

