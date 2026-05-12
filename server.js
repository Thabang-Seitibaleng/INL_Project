const fs = require("fs");
const path = require("path");
require("dotenv").config();
const axios = require("axios"); // Used to call Stitch
const express = require("express");
const app = express();
app.use(express.json());

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
  try {
    const investRaw = fs.readFileSync(
      path.join(__dirname, "sample_yodlee_investments.json"),
    );
    const investData = JSON.parse(investRaw);

    let totalAccountValue = 0;
    let investecBalance = 0;
    let easyEquitiesBalance = 0;
    let lunoBalance = 0;
    let combinedHoldings = [];

    // Loop through the accounts to calculate totals and extract holdings
    investData.account.forEach((acc) => {
      totalAccountValue += acc.balance.amount;

      // Assign vault balances
      if (acc.providerName === "Investec") investecBalance = acc.balance.amount;
      if (acc.providerName === "EasyEquities")
        easyEquitiesBalance = acc.balance.amount;
      if (acc.providerName === "Luno") lunoBalance = acc.balance.amount;

      // Extract individual stock/crypto holdings
      if (acc.holdings) {
        acc.holdings.forEach((holding) => {
          combinedHoldings.push({
            provider: acc.providerName,
            symbol: holding.symbol,
            description: holding.description,
            value: holding.value,
            // Mocking a positive/negative return for UI purposes
            isPositive: Math.random() > 0.3,
          });
        });
      }
    });

    // Package the data for EJS
    const portfolioData = {
      totalValue: totalAccountValue.toLocaleString("en-ZA", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
      investecBalance: investecBalance.toLocaleString("en-ZA", {
        minimumFractionDigits: 0,
      }),
      easyEquitiesBalance: easyEquitiesBalance.toLocaleString("en-ZA", {
        minimumFractionDigits: 0,
      }),
      lunoBalance: lunoBalance.toLocaleString("en-ZA", {
        minimumFractionDigits: 0,
      }),
      holdings: combinedHoldings,
    };

    res.render("portfolio", { data: portfolioData });
  } catch (error) {
    console.error("Error loading portfolio data:", error);
    res.status(500).send("Error loading portfolio data");
  }
});

app.get("/forecaster", (req, res) => {
  try {
    // 1. Grab inputs from the URL query, or fall back to defaults
    const monthlyContribution = parseFloat(req.query.contribution) || 5000;
    const annualReturn = parseFloat(req.query.returnRate) || 10.5;
    const years = parseInt(req.query.years) || 10;

    // 2. The Financial Math (Future Value of an Annuity)
    const monthlyRate = annualReturn / 100 / 12;
    const totalMonths = years * 12;

    const finalValue =
      monthlyContribution *
      ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate);
    const totalInvested = monthlyContribution * totalMonths;
    const totalInterest = finalValue - totalInvested;
    const interestPercentage = (totalInterest / finalValue) * 100;

    // 3. Calculate exactly when they hit R 1,000,000
    const targetMilestone = 1000000;
    let milestoneText = "Not reached";

    // Logarithmic formula to solve for time (n)
    const numerator = Math.log(
      (targetMilestone * monthlyRate) / monthlyContribution + 1,
    );
    const denominator = Math.log(1 + monthlyRate);
    const monthsToMilestone = numerator / denominator;

    if (monthsToMilestone > 0 && monthsToMilestone <= totalMonths) {
      const yearsToMilestone = (monthsToMilestone / 12).toFixed(1);
      milestoneText = `Year ${yearsToMilestone}`;
    } else if (monthsToMilestone > totalMonths) {
      milestoneText = `> ${years} Yrs`;
    }

    // 4. Package everything cleanly for EJS
    const forecastData = {
      params: {
        contribution: monthlyContribution,
        returnRate: annualReturn,
        years: years,
      },
      metrics: {
        // Formatting with 0 decimal places for a cleaner look on large numbers
        finalValue: finalValue.toLocaleString("en-ZA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
        milestoneText: milestoneText,
        totalInterest: totalInterest.toLocaleString("en-ZA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
        interestPercentage: interestPercentage.toFixed(1),
      },
    };

    res.render("forecaster", { data: forecastData });
  } catch (error) {
    console.error("Error running forecast:", error);
    res.status(500).send("Error generating forecast");
  }
});

app.get("/atlas", (req, res) => {
  res.render("atlas");
});

// 2. The Dynamic Atlas "Brain" API
app.post("/api/atlas/chat", (req, res) => {
  try {
    const userMessage = req.body.message.toLowerCase();
    let aiResponse =
      "I'm still learning! Try asking me about your **balance**, your **spending**, or your **portfolio**.";

    // 1. Load the live data from our JSON files
    const accountsData = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "sample_yodlee_data.json"),
      ),
    );
    const txData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "sample_yodlee_transactions.json")),
    );
    const investData = JSON.parse(
      fs.readFileSync(path.join(__dirname, "sample_yodlee_investments.json")),
    );

    // 2. Dynamic Routing Logic

    // SCENARIO A: User asks about their balance or cash
    if (
      userMessage.includes("balance") ||
      userMessage.includes("cash") ||
      userMessage.includes("money")
    ) {
      const checking = accountsData.account.find(
        (acc) => acc.accountType === "CHECKING",
      );
      const savings = accountsData.account.find(
        (acc) => acc.accountType === "SAVINGS",
      );

      if (checking && savings) {
        aiResponse = `Your everyday checking account currently has **R ${checking.balance.amount.toLocaleString("en-ZA")}**. You also have **R ${savings.balance.amount.toLocaleString("en-ZA")}** sitting in your Wealth Savings. You are looking very healthy!`;
      }

      // SCENARIO B: User asks about spending or expenses
    } else if (
      userMessage.includes("spend") ||
      userMessage.includes("expense") ||
      userMessage.includes("outflow")
    ) {
      let totalSpent = 0;
      let largestExpense = { amount: 0, merchant: "" };

      // Loop through transactions to calculate actual spending
      txData.transaction.forEach((tx) => {
        if (tx.amount.amount < 0) {
          const spent = Math.abs(tx.amount.amount);
          totalSpent += spent;
          if (spent > largestExpense.amount) {
            largestExpense = { amount: spent, merchant: tx.description.simple };
          }
        }
      });

      aiResponse = `You have spent **R ${totalSpent.toLocaleString("en-ZA")}** so far. Your largest single expense was **R ${largestExpense.amount.toLocaleString("en-ZA")}** at ${largestExpense.merchant}.`;

      // SCENARIO C: User asks about investments or crypto
    } else if (
      userMessage.includes("portfolio") ||
      userMessage.includes("crypto") ||
      userMessage.includes("invest")
    ) {
      const luno = investData.account.find(
        (acc) => acc.providerName === "Luno",
      );

      if (luno) {
        // Find Bitcoin dynamically
        const btc = luno.holdings.find((h) => h.symbol === "BTC");
        aiResponse = `Your total Luno crypto wallet is sitting at **R ${luno.balance.amount.toLocaleString("en-ZA")}**. Your largest driver is ${btc.description}, currently valued at **R ${btc.value.toLocaleString("en-ZA")}**.`;
      }
    }

    // 3. Send the dynamically generated response back to the chat interface
    res.json({ reply: aiResponse });
  } catch (error) {
    console.error("Atlas Error:", error);
    res.status(500).json({
      reply: "I'm having trouble connecting to my data arrays right now.",
    });
  }
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
