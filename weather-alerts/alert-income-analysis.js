#!/usr/bin/env node

/**
 * Join weather alerts → ZIP codes → income data.
 *
 * Usage:
 *   node weather-alerts/alert-income-analysis.js [alerts-file]
 *
 * Examples:
 *   # Analyze the bundled california-alerts.json
 *   node weather-alerts/alert-income-analysis.js
 *
 *   # Analyze a different alerts file with stricter ZIP filtering
 *   RES_RATIO_THRESHOLD=0.8 node weather-alerts/alert-income-analysis.js path/to/alerts.json
 *
 * Outputs:
 *   - A JSON file alongside the alerts file named:
 *       <alerts-file>-income-analysis.json
 *   - Each entry includes weighted income stats and per-ZIP details.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { alertToZips } from './alert-to-zips.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RES_RATIO_THRESHOLD =
  Number(process.env.RES_RATIO_THRESHOLD ?? '0') || 0;

const ALERTS_PATH =
  process.argv[2] ||
  path.join(__dirname, 'california-alerts.json');

const INCOME_CSV_PATH = path.join(
  __dirname,
  '..',
  'census-acs-income-2023',
  'processed',
  'wealth_by_zip_enhanced.csv'
);

async function loadIncomeData() {
  const raw = await fs.readFile(INCOME_CSV_PATH, 'utf8');
  const [headerLine, ...rows] = raw.trim().split('\n');
  const headers = headerLine.split(',');
  const map = new Map();

  for (const row of rows) {
    if (!row.trim()) continue;
    const values = row.split(',');
    const record = {};
    headers.forEach((key, idx) => {
      record[key] = values[idx] ?? '';
    });
    const zip = record.zip?.padStart(5, '0');
    if (!zip) continue;

    map.set(zip, {
      zip,
      totalHouseholds: Number(record.total_households) || 0,
      meanHouseholdIncome: Number(record.mean_household_income) || 0,
      medianHouseholdIncome: Number(record.median_household_income) || 0,
      perCapitaIncome: Number(record.per_capita_income) || 0,
      meanEarnings: Number(record.mean_earnings) || 0,
      households200kPlus: Number(record.hh_income_200k_plus) || 0,
      pctPeoplePoverty: Number(record.pct_people_poverty) || 0,
      medianEarningsWorkers: Number(record.median_earnings_workers) || 0,
      pctWealthyHouseholds: Number(record.pct_wealthy_households) || 0,
    });
  }

  return map;
}

function aggregateIncomeData(zipResult, incomeMap) {
  const summary = {
    totalHouseholds: 0,
    weightedMeanHouseholdIncome: 0,
    weightedMedianHouseholdIncome: 0,
    weightedPctWealthyHouseholds: 0,
    zipCountWithIncome: 0,
    zipCountMissingIncome: 0,
    zipDetails: [],
  };

  for (const zip of zipResult.zips) {
    const income = incomeMap.get(zip);
    if (!income) {
      summary.zipCountMissingIncome += 1;
      continue;
    }

    summary.zipCountWithIncome += 1;
    summary.totalHouseholds += income.totalHouseholds;
    summary.weightedMeanHouseholdIncome +=
      income.meanHouseholdIncome * income.totalHouseholds;
    summary.weightedMedianHouseholdIncome +=
      income.medianHouseholdIncome * income.totalHouseholds;
    summary.weightedPctWealthyHouseholds +=
      income.pctWealthyHouseholds * income.totalHouseholds;

    summary.zipDetails.push({
      zip,
      totalHouseholds: income.totalHouseholds,
      medianHouseholdIncome: income.medianHouseholdIncome,
      meanHouseholdIncome: income.meanHouseholdIncome,
      pctWealthyHouseholds: income.pctWealthyHouseholds,
      counties: zipResult.zipDetails[zip]?.counties ?? [],
    });
  }

  const households = summary.totalHouseholds || 1;

  return {
    totalHouseholds: summary.totalHouseholds,
    weightedMeanHouseholdIncome:
      summary.weightedMeanHouseholdIncome / households,
    weightedMedianHouseholdIncome:
      summary.weightedMedianHouseholdIncome / households,
    weightedPctWealthyHouseholds:
      summary.weightedPctWealthyHouseholds / households,
    zipCountWithIncome: summary.zipCountWithIncome,
    zipCountMissingIncome: summary.zipCountMissingIncome,
    zipDetails: summary.zipDetails,
  };
}

async function main() {
  try {
    const [alertsRaw, incomeMap] = await Promise.all([
      fs.readFile(ALERTS_PATH, 'utf8'),
      loadIncomeData(),
    ]);

    const alerts = JSON.parse(alertsRaw);
    const results = [];

    for (const alert of alerts.features) {
      const zipResult = alertToZips(alert, {
        residentialRatioThreshold: RES_RATIO_THRESHOLD,
      });
      const incomeSummary = aggregateIncomeData(zipResult, incomeMap);
      results.push({
        alertId: zipResult.alertId,
        event: zipResult.event,
        severity: zipResult.severity,
        zipsAnalyzed: zipResult.zips.length,
        ...incomeSummary,
      });
      console.log(
        `${zipResult.event}: ${incomeSummary.zipCountWithIncome} ZIPs with income data`
      );
    }

    const outputPath = ALERTS_PATH.replace(
      /\.json$/,
      ''
    ).concat('-income-analysis.json');
    await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
    console.log(`\n✓ Income analysis saved to ${outputPath}`);
  } catch (error) {
    console.error('✗ Failed to analyze alerts:', error.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}


