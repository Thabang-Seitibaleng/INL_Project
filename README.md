# Wealth and Budget 💰

A mobile/web application designed to track spending, financial habits, and provide AI-driven financial advice.

## 📁 Repository Structure

*   `client/`: Frontend application (React/Mobile).
*   `server/`: Backend API (Node.js/Express).
*   `ai-engine/`: Logic for spending categorization and market-based returns.
*   `docs/`: Project documentation and research.

## 🚀 CI/CD Pipeline

This repository is protected by **GitHub Actions**. Every Push or Pull Request triggers:
1.  **Backend CI:** Linting, Security Audits (`npm audit`), and Unit Testing.
2.  **Frontend CI:** Build validation and Linting.
3.  **AI Quality Check:** Ensures the logic for the Financial Advisor remains accurate.

## 🛠️ Tech Stack
- **Backend:** Node.js (Express)
- **Database:** MongoDB (Flexible schema for financial logs)
- **Frontend:** React / React Native (Planned)
- **Security:** JWT Authentication + BCrypt + OTP
