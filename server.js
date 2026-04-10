require("dotenv").config();
const axios = require("axios"); // Used to call Stitch

async function getStitchToken() {
  try {
    const tokenURL = "https://api.stitch.money/v1/auth/token";

    const params = new URLSearchParams();
    params.append("client_id", process.env.STITCH_CLIENT_ID);
    params.append("client_secret", process.env.STITCH_CLIENT_SECRET);
    params.append("grant_type", "client_credentials");
    params.append("audience", "https://secure.stitch.money/connect/token");

    const responce = await axios.post(tokenURL, params, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    console.log("🟢 Stitch Authentication Successful");
    return responce.data.access_token;
  } catch (error) {
    console.error(
      "🔴 Stitch Auth Failed:",
      error.response ? error.response.data : error.message,
    );
    return null;
  }
}

const express = require("express");
const app = express();
const port = 3000;

app.set("view engine", "ejs");

app.use(express.static("public"));

app.get("/", (req, res) => {
  // Simulating a parsed GraphQL response from the Stitch API
  const mockStitchResponse = {
    user: {
      firstName: "Drew",
      financialHealth: "800",
      healthTrend: "↗ +12 points this month",
    },
    // Stitch returns all linked bank accounts in an array
    accounts: [
      { institution: "FNB", type: "Cheque Account", balance: 35000.0 },
      { institution: "Capitec", type: "Savings", balance: 14200.0 },
      { institution: "Investec", type: "Private Cash", balance: 4842920.0 },
    ],
    // Stitch returns a unified list of transactions across all linked accounts
    transactions: [
      {
        merchant: "Checkers Sixty60",
        category: "Groceries",
        date: "Today",
        amount: -850.5,
      },
      {
        merchant: "City Utility Grid",
        category: "Bills",
        date: "Yesterday",
        amount: -820.0,
      },
      {
        merchant: "Apple Store",
        category: "Electronics",
        date: "Oct 12",
        amount: -1200.0,
      },
      {
        merchant: "TechCorp Salary",
        category: "Income",
        date: "Oct 01",
        amount: 85000.0,
      },
    ],
  };

  // --- Backend Logic: Processing the API Data ---

  // 1. Calculate the true Total Balance by summing up all account balances
  let calculatedTotalBalance = 0;
  mockStitchResponse.accounts.forEach((account) => {
    calculatedTotalBalance += account.balance;
  });

  // 2. Identify the Monthly Income (finding the Salary transaction)
  const incomeTx = mockStitchResponse.transactions.find(
    (tx) => tx.category === "Income",
  );
  const calculatedIncome = incomeTx ? incomeTx.amount : 0;

  // 3. Package the processed data for the frontend
  const viewData = {
    firstName: mockStitchResponse.user.firstName,
    healthScore: mockStitchResponse.user.financialHealth,
    healthTrend: mockStitchResponse.user.healthTrend,
    totalBalance: calculatedTotalBalance.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
    }),
    monthlyIncome: calculatedIncome.toLocaleString("en-ZA", {
      minimumFractionDigits: 2,
    }),
    incomeTrend: "⏱ Next deposit in 4 days",
    safeToSpend: "12,300.00", // We will write an algorithm for this later
    spendLimit: "Daily limit: R 450",
    transactions: mockStitchResponse.transactions,
  };

  res.render("dashboard", { data: viewData });
});
app.get("/cashflow", (req, res) => {
  res.render("cashflow");
});

app.get("/portfolio", (req, res) => {
  res.render("portfolio");
});

app.get("/forecaster", (req, res) => {
  res.render("forecaster");
});

app.get("/atlas", (req, res) => {
  res.render("atlas");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
