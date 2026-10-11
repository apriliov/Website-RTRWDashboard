'use strict';
// Licence guard. The licence footer, the licence data, the LICENSE file and the files that render them are
// fingerprinted (SHA-256) in core/seal.js. If any of them differs, the site refuses to start or stops running.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const FILES = {
  footer: 'core/footer.html',
  license: 'core/license.js',
  licenseFile: 'LICENSE',
  guard: 'core/guard.js',
  render: 'core/render.js',
  server: 'server.js',
  entry: 'api/index.js',
};

const normalize = (text) => text.replace(/\r\n?/g, '\n');

function hashOf(rel) {
  return crypto.createHash('sha256').update(normalize(fs.readFileSync(path.join(ROOT, rel), 'utf8'))).digest('hex');
}

function fingerprints() {
  const out = {};
  for (const [key, rel] of Object.entries(FILES)) out[key] = hashOf(rel);
  return out;
}

// Returns the name of the first modified file, or null when everything matches the seal.
function verify() {
  let seal;
  try {
    seal = require('./seal');
  } catch {
    return 'seal';
  }
  for (const [key, rel] of Object.entries(FILES)) {
    try {
      if (seal[key] !== hashOf(rel)) return rel;
    } catch {
      return rel;
    }
  }
  return null;
}

let broken = null;
let lastCheck = Date.now();

function stop(file) {
  console.error('\n[LICENSE] The licence notice or a protected file was modified (' + file + ').');
  console.error('[LICENSE] This site can not run until the original files are restored.\n');
  process.exit(1);
}

function start() {
  const bad = verify();
  if (bad) stop(bad);
  lastCheck = Date.now();
  setInterval(() => {
    broken = verify();
    if (broken) stop(broken);
  }, 30000).unref();
}

// Called on every request. Also re-verifies every 30 seconds, because serverless instances may not keep timers alive.
function assert() {
  if (broken) stop(broken);
  if (Date.now() - lastCheck > 30000) {
    lastCheck = Date.now();
    const bad = verify();
    if (bad) stop(bad);
  }
}

module.exports = { start, assert, verify, fingerprints, FILES };
