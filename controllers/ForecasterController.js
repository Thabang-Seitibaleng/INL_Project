/**
 * forecasterController.js
 * =======================
 * Replaces the GET "/forecaster" route in server.js.
 * All financial math is identical to the original — now just routed through
 * a controller so it can be tested and reused by the Atlas AI engine.
 *
 * Powers: forecaster.ejs
 *   - Projected Final Value card
 *   - R 1M Milestone card
 *   - Total Interest Earned card
 *   - Growth Trajectory SVG chart data
 *   - Simulation Parameters form
 */
 
// ─── Core Financial Engine ────────────────────────────────────────────────────
 
/**
 * Future Value of an Annuity formula.
 * FV = PMT × [ ((1 + r)^n - 1) / r ]
 *
 * @param {number} monthlyContribution - PMT in ZAR
 * @param {number} annualReturnRate    - e.g. 10.5 for 10.5%
 * @param {number} years               - projection horizon
 * @returns {{ finalValue, totalInvested, totalInterest, interestPercentage, monthlyRate, totalMonths }}
 */
const computeFutureValue = (monthlyContribution, annualReturnRate, years) => {
  const monthlyRate  = annualReturnRate / 100 / 12;
  const totalMonths  = years * 12;
 
  const finalValue =
    monthlyContribution *
    ((Math.pow(1 + monthlyRate, totalMonths) - 1) / monthlyRate);
 
  const totalInvested       = monthlyContribution * totalMonths;
  const totalInterest       = finalValue - totalInvested;
  const interestPercentage  = (totalInterest / finalValue) * 100;
 
  return { finalValue, totalInvested, totalInterest, interestPercentage, monthlyRate, totalMonths };
};
 
/**
 * Logarithmic formula to find the month at which a target milestone is hit.
 * n = ln( (M × r / PMT) + 1 ) / ln(1 + r)
 *
 * @param {number} monthlyContribution
 * @param {number} monthlyRate
 * @param {number} totalMonths  - cap (projection horizon)
 * @param {number} target       - default R 1,000,000
 * @returns {string}  e.g. "Year 7.4" | "> 10 Yrs" | "Not reached"
 */
const computeMilestone = (monthlyContribution, monthlyRate, totalMonths, target = 1_000_000) => {
  const numerator   = Math.log((target * monthlyRate) / monthlyContribution + 1);
  const denominator = Math.log(1 + monthlyRate);
  const months      = numerator / denominator;
  const years       = Math.floor(totalMonths / 12);
 
  if (isNaN(months) || months <= 0) return "Not reached";
  if (months > totalMonths)         return `> ${years} Yrs`;
 
  return `Year ${(months / 12).toFixed(1)}`;
};
 
/**
 * Builds a year-by-year data series for the Growth Trajectory chart.
 * Returns an array of { year, value } objects.
 */
const buildChartSeries = (monthlyContribution, monthlyRate, totalMonths) => {
  const series = [];
  for (let month = 12; month <= totalMonths; month += 12) {
    const value =
      monthlyContribution *
      ((Math.pow(1 + monthlyRate, month) - 1) / monthlyRate);
    series.push({ year: month / 12, value: Math.round(value) });
  }
  return series;
};
 
// ─── Controllers ─────────────────────────────────────────────────────────────
 
/**
 * GET /forecaster
 * Renders forecaster.ejs. Reads params from the query string (form GET submission).
 * Identical params as original: contribution, returnRate, years.
 */
exports.getForecaster = (req, res) => {
  try {
    const monthlyContribution = parseFloat(req.query.contribution) || 5000;
    const annualReturn        = parseFloat(req.query.returnRate)   || 10.5;
    const years               = parseInt(req.query.years)          || 10;
 
    const {
      finalValue,
      totalInterest,
      interestPercentage,
      monthlyRate,
      totalMonths,
    } = computeFutureValue(monthlyContribution, annualReturn, years);
 
    const milestoneText = computeMilestone(
      monthlyContribution, monthlyRate, totalMonths
    );
 
    const chartSeries = buildChartSeries(monthlyContribution, monthlyRate, totalMonths);
 
    // Assemble exactly the data shape forecaster.ejs expects
    const forecastData = {
      params: {
        contribution: monthlyContribution,
        returnRate:   annualReturn,
        years,
      },
      metrics: {
        finalValue: finalValue.toLocaleString("en-ZA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
        milestoneText,
        totalInterest: totalInterest.toLocaleString("en-ZA", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
        interestPercentage: interestPercentage.toFixed(1),
      },
      chartSeries, // available for a dynamic chart upgrade (Chart.js / D3)
    };
 
    return res.render("forecaster", { data: forecastData });
  } catch (err) {
    console.error("[forecasterController.getForecaster]", err);
    return res.status(500).send("Error generating forecast.");
  }
};
 
/**
 * GET /api/forecaster
 * JSON endpoint — used by Atlas AI when generating the "Wealth Forecast" insight.
 *
 * Query params: contribution, returnRate, years, milestone (custom target, default 1000000)
 */
exports.getForecastJson = (req, res) => {
  try {
    const monthlyContribution = parseFloat(req.query.contribution) || 5000;
    const annualReturn        = parseFloat(req.query.returnRate)   || 10.5;
    const years               = parseInt(req.query.years)          || 10;
    const milestone           = parseFloat(req.query.milestone)    || 1_000_000;
 
    const {
      finalValue,
      totalInvested,
      totalInterest,
      interestPercentage,
      monthlyRate,
      totalMonths,
    } = computeFutureValue(monthlyContribution, annualReturn, years);
 
    const milestoneText  = computeMilestone(monthlyContribution, monthlyRate, totalMonths, milestone);
    const chartSeries    = buildChartSeries(monthlyContribution, monthlyRate, totalMonths);
 
    return res.status(200).json({
      params: { monthlyContribution, annualReturn, years, milestone },
      results: {
        finalValue:          Math.round(finalValue),
        totalInvested:       Math.round(totalInvested),
        totalInterest:       Math.round(totalInterest),
        interestPercentage:  parseFloat(interestPercentage.toFixed(2)),
        milestoneText,
      },
      chartSeries,
    });
  } catch (err) {
    console.error("[forecasterController.getForecastJson]", err);
    return res.status(500).json({ error: "Forecast calculation failed." });
  }
};