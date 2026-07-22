#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
const start = source.indexOf("async function resetApplicationFromLogo(");
assert.ok(start >= 0, "logo reset function must exist");
const brace = source.indexOf("{", start);
let depth = 0;
let quote = null;
let escaped = false;
let end = -1;
for (let i = brace; i < source.length; i += 1) {
  const ch = source[i];
  if (quote) {
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === quote) quote = null;
    continue;
  }
  if (ch === '"' || ch === "'" || ch === "`") { quote = ch; continue; }
  if (ch === "{") depth += 1;
  else if (ch === "}") {
    depth -= 1;
    if (depth === 0) { end = i + 1; break; }
  }
}
assert.ok(end > start);
const fnSource = source.slice(start, end);

let confirmed = false;
let localClears = 0;
let sessionClears = 0;
let deleted = [];
let unregistered = 0;
let replaced = "";
const context = {
  URL,
  Date,
  window: {
    confirm: () => confirmed,
    location: {
      href: "https://example.test/app/#portfolioFinancials",
      replace: value => { replaced = value; }
    },
    caches: {
      keys: async () => ["a", "b"],
      delete: async name => { deleted.push(name); return true; }
    }
  },
  localStorage: { clear: () => { localClears += 1; } },
  sessionStorage: { clear: () => { sessionClears += 1; } },
  navigator: {
    serviceWorker: {
      getRegistrations: async () => [{ unregister: async () => { unregistered += 1; return true; } }]
    }
  }
};
vm.createContext(context);
vm.runInContext(`${fnSource}; this.reset = resetApplicationFromLogo;`, context);
await context.reset();
assert.equal(localClears, 0, "cancelled reset must preserve local data");
assert.equal(replaced, "");

confirmed = true;
await context.reset();
assert.equal(localClears, 1);
assert.equal(sessionClears, 1);
assert.deepEqual(deleted.sort(), ["a", "b"]);
assert.equal(unregistered, 1);
assert.match(replaced, /_evhub_reset=/);
assert.match(replaced, /#site$/);
console.log("PASS — logo reset requires confirmation, clears application data/caches and reloads the default view.");
