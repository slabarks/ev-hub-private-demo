import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("js/app.js", "utf8");
const css = fs.readFileSync("assets/styles.css", "utf8");

assert.ok(app.includes('name="portfolio-filter"'), "Portfolio filter details should share a name so only one opens in supporting browsers");
assert.ok(app.includes("closePortfolioFilterMenus(details)"), "Opening one portfolio filter should close the others");
assert.ok(app.includes("closePortfolioFilterMenus();"), "Portfolio filters should close on outside click / Escape / resize / scroll");
assert.ok(css.includes("grid-template-columns: 20px minmax(0, 1fr)"), "Filter menu options should render as one checkbox + label row");
assert.ok(css.includes("width: max(100%, 270px)"), "Filter menus should be wide enough to avoid cramped wrapping");

console.log("Portfolio filter layout static regression passed.");
