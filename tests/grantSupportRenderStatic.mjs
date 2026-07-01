import fs from "fs";

const source = fs.readFileSync("js/app.js", "utf8");
const match = source.match(/function\s+grantSupportField\s*\(\)\s*\{([\s\S]*?)\n\}/);
if (!match) throw new Error("grantSupportField function not found");
const body = match[1];
if (/grantSupportField\s*\(/.test(body)) {
  throw new Error("grantSupportField must not call itself recursively");
}
if (!body.includes('inputField("grantSupport"')) {
  throw new Error("grantSupportField must render the base grantSupport input field");
}
if (!body.includes("grantSupportStatusHtml")) {
  throw new Error("grantSupportField must render ZEVI funding status helper");
}
console.log("✓ grant support render static check passed");
