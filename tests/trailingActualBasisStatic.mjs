import fs from 'node:fs';

const server = fs.readFileSync('server.py', 'utf8');

if (!server.includes('annualisation_method = "trailing365"')) {
  throw new Error('Mature uploaded actuals must expose annualisation_method = trailing365.');
}

if (!server.includes('annualised_kwh = round(trailing_kwh, 3)')) {
  throw new Error('Mature uploaded actuals must use trailing 365-day actual kWh, not rolling30 annualised kWh.');
}

if (!server.includes('annualisation_method = "partial_cumulative" if tier == "near" else "daily_cumulative"')) {
  throw new Error('Near-mature uploaded actuals must use partial cumulative annualisation rather than rolling30.');
}

if (server.includes('annualised_kwh = round(rolling_kwh / 30 * 365')) {
  throw new Error('Rolling30 annualisation must not be used for Portfolio Calibration benchmark actuals.');
}

if (!server.includes('"trailing365Kwh": round(trailing_kwh, 3)')) {
  throw new Error('Trailing 365-day audit field missing from uploaded actual response.');
}

const readme = fs.readFileSync('README.md', 'utf8');
if (!readme.includes('No demand target recalibration or AADT override changes')) {
  throw new Error('README must retain the v35.48 actual-basis change note.');
}

console.log('Trailing actual basis static regression passed.');
