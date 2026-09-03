"use strict";
// Token bookkeeping for the Topin publish automation server (index.js).
// Ported from the IOE Admin Portal's automation server — trimmed to just the
// token save/load helpers that the clone-based publish flow (topin-clone.js)
// actually uses; the direct-REST-API publish path this file originally also
// carried isn't part of that flow, so it's left out here.
const fs   = require("fs");
const path = require("path");

const TOKEN_FILE = path.join(__dirname, "topin-tokens.json");

function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return {};
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch { return {}; }
}

function saveTokens(partial) {
  const existing = loadTokens();
  fs.writeFileSync(TOKEN_FILE, JSON.stringify({ ...existing, ...partial }, null, 2));
}

module.exports = { loadTokens, saveTokens };
