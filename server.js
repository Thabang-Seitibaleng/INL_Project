const fs = require("fs");
const path = require("path");
require("dotenv").config();
const axios = require("axios"); // Used to call Stitch

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
        loginName: username, // This is where the specefic user string will go
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
    console.log("Fetching linnked bank accounts...");

    const accountsUrl = `${process.env.YODLEE_BASE_URL}/accounts`;
    const response = await axios.get(accountsUrl, {
      headers: {
        "Api-Version": "1.1",
        Authorization: `Bearer ${userToken}`, // Passes the User room key
      },
    });
    console.log("Accounts retrieved successfully!");

    console.log(JSON.stringify(response.data, null, 2)); //this should print raw JSON data structure to terminal

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

const express = require("express");
const app = express();
const port = 3000;

app.set("view engine", "ejs");

app.use(express.static("public"));

app.get("/", (req, res) => {
  try {
    // 1. Read BOTH Yodlee JSON files
    const yodleeAccountsRaw = fs.readFileSync(
      path.join(__dirname, "sample_yodlee_data.json"),
    );
    const yodleeData = JSON.parse(yodleeAccountsRaw);

    const yodleeTxRaw = fs.readFileSync(
      path.join(__dirname, "sample_yodlee_transactions.json"),
    );
    const txData = JSON.parse(yodleeTxRaw);

    // --- CARD 1: TOTAL BALANCE ---
    let calculatedTotalBalance = 0;
    yodleeData.account.forEach((acc) => {
      if (acc.isAsset) {
        calculatedTotalBalance += acc.balance.amount;
      } else {
        calculatedTotalBalance -= acc.balance.amount;
      }
    });

    // --- CARD 2: FINANCIAL HEALTH SCORE ---
    const creditCard = yodleeData.account.find(
      (acc) => acc.CONTAINER === "creditCard",
    );
    let healthScore = 800;
    let healthTrend = "Looking good";

    if (creditCard) {
      const utilization =
        creditCard.balance.amount / creditCard.totalCreditLine.amount;
      if (utilization > 0.5) {
        healthScore = 680;
        healthTrend = "↓ High credit utilization";
      } else {
        healthScore = 780;
        healthTrend = "↑ +12 points this week";
      }
    }

    // --- CARD 3: SAFE TO SPEND ---
    const checkingAccount = yodleeData.account.find(
      (acc) => acc.accountType === "CHECKING",
    );
    const safeToSpend = checkingAccount ? checkingAccount.balance.amount : 0;

    // --- TRANSACTIONS & INCOME ---
    // Map the complex Yodlee transaction structure to match what your EJS file expects
    const mappedTransactions = txData.transaction.map((tx) => {
      return {
        merchant: tx.description.simple,
        category: tx.category,
        date: tx.date,
        amount: tx.amount.amount,
      };
    });

    // Calculate Monthly Income by summing ALL positive transactions
    let calculatedIncome = 0;
    mappedTransactions.forEach((tx) => {
      if (tx.amount > 0) {
        calculatedIncome += tx.amount;
      }
    });

    // --- PACKAGE DATA FOR EJS ---
    const viewData = {
      firstName: "Claudine",
      healthScore: healthScore,
      healthTrend: healthTrend,

      totalBalance: calculatedTotalBalance.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),

      monthlyIncome: calculatedIncome.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      incomeTrend: "⏱ Next deposit in 4 days",

      safeToSpend: safeToSpend.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      spendLimit: "Based on checking balance",

      // Injecting the mapped Yodlee transactions directly into the Recent Activity list!
      transactions: mappedTransactions,
    };

    res.render("dashboard", { data: viewData });
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    res.status(500).send("Error loading dashboard data");
  }
});

app.get("/cashflow", (req, res) => {
  try {
    // 1. We only need the Transactions file for Cashflow!
    const yodleeTxRaw = fs.readFileSync(
      path.join(__dirname, "sample_yodlee_transactions.json"),
    );
    const txData = JSON.parse(yodleeTxRaw);

    let totalInflow = 0;
    let totalOutflow = 0;

    // 2. Map the data and calculate Inflow vs Outflow
    const mappedTransactions = txData.transaction.map((tx) => {
      const amount = tx.amount.amount;

      if (amount > 0) {
        totalInflow += amount;
      } else {
        // We add it to outflow (it remains a negative number for now)
        totalOutflow += amount;
      }

      return {
        merchant: tx.description.simple,
        category: tx.category,
        date: tx.date,
        amount: amount,
      };
    });

    // 3. Net Cashflow is Inflow + Outflow (since Outflow is already negative)
    const netCashflow = totalInflow + totalOutflow;

    // 4. Package it for the EJS template
    const cashflowData = {
      inflow: totalInflow.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      // We use Math.abs() here so the UI doesn't print "--R 42,000"
      outflow: Math.abs(totalOutflow).toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      net: Math.abs(netCashflow).toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      netIsPositive: netCashflow >= 0,
      transactions: mappedTransactions,
    };

    res.render("cashflow", { data: cashflowData });
  } catch (error) {
    console.error("Error loading cashflow data:", error);
    res.status(500).send("Error loading cashflow data");
  }
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

app.get("/api/accounts", (req, res) => {
  res.sendFile(path.join(__dirname, "sample_yodlee_data.json"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server is running at http://localhost:${PORT}`);

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
});
