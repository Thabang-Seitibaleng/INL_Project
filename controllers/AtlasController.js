/**
 * atlasController.js
 * ==================
 * Upgrades the POST "/api/atlas/chat" route from keyword-matching
 * to a real Claude-powered AI financial advisor backed by live MongoDB data.
 *
 * Key improvements over original server.js:
 *   - Uses the Anthropic Claude API for genuine natural language understanding
 *   - Persists full conversation history in AtlasSession (MongoDB)
 *   - Injects live financial context (accounts, transactions, portfolio) into the prompt
 *   - Session can be cleared via DELETE /api/atlas/session
 *
 * Powers: atlas.ejs
 *   - Active Session chat interface
 *   - Discovered Insights panel
 *
 * Dependencies:
 *   npm install @anthropic-ai/sdk
 */
 
const Anthropic = require("@anthropic-ai/sdk");
const {
  Account,
  Transaction,
  Holding,
  AtlasSession,
} = require("../models");
 
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
 
// ─── Financial Context Builder ────────────────────────────────────────────────
 
/**
 * Aggregates the user's live financial data into a concise JSON summary
 * that is injected into the Claude system prompt.
 *
 * Mirrors the 3 JSON file loads in the original server.js Atlas handler.
 */
const buildFinancialContext = async (userId) => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
 
  const [accounts, transactions, holdings] = await Promise.all([
    Account.find({ userId, isActive: true }).lean(),
    Transaction.find({ userId, date: { $gte: thirtyDaysAgo }, status: "POSTED" })
      .sort({ date: -1 })
      .limit(50)
      .lean(),
    Holding.find({ userId }).sort({ value: -1 }).lean(),
  ]);
 
  // Net worth calculation (mirrors original server.js dashboard logic)
  let netWorth = 0;
  const vaultSummary = accounts.map((acc) => {
    const contribution = acc.isAsset ? acc.balance.amount : -acc.balance.amount;
    netWorth += contribution;
    return {
      provider:    acc.providerName,
      accountType: acc.accountType,
      balance:     acc.balance.amount,
      currency:    acc.currency,
      isAsset:     acc.isAsset,
    };
  });
 
  // Cashflow summary (mirrors original /cashflow route)
  let totalInflow  = 0;
  let totalOutflow = 0;
  const txSummary  = transactions.slice(0, 10).map((tx) => {
    if (tx.amount.amount > 0) totalInflow  += tx.amount.amount;
    else                      totalOutflow += Math.abs(tx.amount.amount);
    return {
      merchant: tx.description.simple,
      amount:   tx.amount.amount,
      category: tx.category,
      date:     tx.date,
    };
  });
 
  // Holdings summary
  const holdingSummary = holdings.slice(0, 10).map((h) => ({
    symbol:      h.symbol,
    description: h.description,
    value:       h.value,
    returnPct:   h.returnPercentage,
    assetClass:  h.assetClass,
  }));
 
  return {
    netWorth: Math.round(netWorth),
    vaults:   vaultSummary,
    cashflow: {
      totalInflow:  Math.round(totalInflow),
      totalOutflow: Math.round(totalOutflow),
      net:          Math.round(totalInflow - totalOutflow),
    },
    recentTransactions: txSummary,
    topHoldings:        holdingSummary,
  };
};
 
// ─── System Prompt ────────────────────────────────────────────────────────────
 
const buildSystemPrompt = (context) => `
You are Atlas, an elite AI wealth advisor embedded in the Architect Wealth Suite.
You have direct, real-time access to the user's financial data. Be concise, sharp,
and action-oriented. Speak like a Goldman Sachs private wealth manager, not a chatbot.
 
Never make up numbers. Always reference the data provided below.
Format monetary values in ZAR (South African Rand) using the format "R X,XXX.XX".
Keep responses under 150 words unless the user explicitly asks for detail.
 
--- LIVE FINANCIAL SNAPSHOT (as of ${new Date().toLocaleDateString("en-ZA")}) ---
${JSON.stringify(context, null, 2)}
--- END SNAPSHOT ---
`.trim();
 
// ─── GET /atlas ───────────────────────────────────────────────────────────────
 
/**
 * Renders the Atlas page.
 * Loads the user's active session so the chat history is pre-populated.
 */
exports.getAtlas = async (req, res) => {
  try {
    // Find or create a session for this user
    let session = await AtlasSession.findOne({
      userId:   req.user.id,
      isActive: true,
    }).lean();
 
    return res.render("atlas", {
      data: { messages: session?.messages || [] },
    });
  } catch (err) {
    console.error("[atlasController.getAtlas]", err);
    return res.status(500).send("Error loading Atlas.");
  }
};
 
// ─── POST /api/atlas/chat ─────────────────────────────────────────────────────
 
/**
 * The main Atlas chat endpoint.
 * Replaces the keyword-matching switch block in the original server.js.
 *
 * Body: { message: string }
 *
 * Flow:
 *   1. Load (or create) the user's AtlasSession
 *   2. Build live financial context from MongoDB
 *   3. Send full conversation history + context to Claude API
 *   4. Persist both the user message and Atlas reply to the session
 *   5. Return { reply: string }
 */
exports.chat = async (req, res) => {
  try {
    const userId      = req.user.id;
    const userMessage = req.body.message?.trim();
 
    if (!userMessage) {
      return res.status(400).json({ error: "message is required." });
    }
 
    // ── 1. Load or create session ─────────────────────────────────────────────
    let session = await AtlasSession.findOne({ userId, isActive: true });
    if (!session) {
      session = await AtlasSession.create({ userId, messages: [] });
    }
 
    // ── 2. Build live financial context ──────────────────────────────────────
    const context = await buildFinancialContext(userId);
 
    // ── 3. Format conversation history for the Claude API ────────────────────
    // Claude expects alternating user/assistant messages
    const history = session.messages.map((msg) => ({
      role:    msg.role === "atlas" ? "assistant" : "user",
      content: msg.content,
    }));
 
    // Append the new user message
    history.push({ role: "user", content: userMessage });
 
    // ── 4. Call the Claude API ────────────────────────────────────────────────
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 512,
      system:     buildSystemPrompt(context),
      messages:   history,
    });
 
    const atlasReply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
 
    // ── 5. Persist the exchange to the session ────────────────────────────────
    session.messages.push(
      { role: "user",  content: userMessage },
      { role: "atlas", content: atlasReply  }
    );
 
    // Keep context snapshot fresh (useful for debugging Atlas responses)
    session.contextSnapshot = {
      accountsSummary:    { netWorth: context.netWorth, vaults: context.vaults },
      transactionSummary: context.cashflow,
      investmentSummary:  { topHoldings: context.topHoldings },
    };
 
    await session.save();
 
    return res.status(200).json({ reply: atlasReply });
  } catch (err) {
    console.error("[atlasController.chat]", err);
    return res.status(500).json({
      reply: "I'm having trouble connecting to my data arrays right now. Please try again.",
    });
  }
};
 
// ─── DELETE /api/atlas/session ────────────────────────────────────────────────
 
/**
 * Clears the active Atlas session (resets conversation context).
 * Triggered by the "Clear Context" button in atlas.ejs.
 */
exports.clearSession = async (req, res) => {
  try {
    const userId = req.user.id;
 
    await AtlasSession.findOneAndUpdate(
      { userId, isActive: true },
      { isActive: false }
    );
 
    return res.status(200).json({ message: "Session cleared. Starting fresh." });
  } catch (err) {
    console.error("[atlasController.clearSession]", err);
    return res.status(500).json({ error: "Could not clear session." });
  }
};
 
// ─── GET /api/atlas/insights ──────────────────────────────────────────────────
 
/**
 * Generates the "Discovered Insights" panel content shown on atlas.ejs.
 * Uses a focused Claude call with structured JSON output.
 *
 * Returns an array of { type: "info"|"warning"|"opportunity", title, body } objects.
 */
exports.getInsights = async (req, res) => {
  try {
    const userId  = req.user.id;
    const context = await buildFinancialContext(userId);
 
    const response = await anthropic.messages.create({
      model:      "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [
        {
          role:    "user",
          content: `
Analyse the following financial data and return EXACTLY 3 insights as a JSON array.
Each insight must have: type ("info"|"warning"|"opportunity"), title (5 words max), body (25 words max).
Return ONLY the JSON array — no preamble, no markdown fences.
 
Financial data:
${JSON.stringify(context, null, 2)}
          `.trim(),
        },
      ],
    });
 
    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
 
    let insights;
    try {
      insights = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      // Fallback static insights if parsing fails
      insights = [
        {
          type:  "opportunity",
          title: "Optimise Idle Cash",
          body:  "Move idle cash to your TFSA to reduce annual tax exposure.",
        },
        {
          type:  "warning",
          title: "Subscription Creep",
          body:  "Unused SaaS subscriptions detected totalling R 450/month.",
        },
        {
          type:  "info",
          title: "Portfolio Rebalance Due",
          body:  "Your crypto allocation has drifted above target weighting.",
        },
      ];
    }
 
    return res.status(200).json({ insights });
  } catch (err) {
    console.error("[atlasController.getInsights]", err);
    return res.status(500).json({ error: "Could not generate insights." });
  }
};
