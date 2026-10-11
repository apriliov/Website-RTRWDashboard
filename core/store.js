'use strict';
// JSON storage without a database.
//  - Local / VPS: every collection is a file in /data (atomic writes).
//  - Vercel: the disk is read only, so the admin panel saves changes as commits to your GitHub repository
//    (GITHUB_TOKEN + GITHUB_REPO). Vercel then redeploys and the public site shows the new data.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const UPLOADS = path.join(ROOT, 'public', 'uploads');
const fileOf = (name) => path.join(DATA, `${name}.json`);

class StorageError extends Error {}

const serverless = () => !!process.env.VERCEL;
const github = () => {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO) return null;
  return { token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPO, branch: process.env.GITHUB_BRANCH || 'main', api: process.env.GITHUB_API_URL || 'https://api.github.com' };
};
const mode = () => (github() ? 'github' : 'local');

/* ------------------------------------------------------------- local files */

function readLocal(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(fileOf(name), 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new Error(`Could not read data/${name}.json: ${err.message}`);
  }
}

function writeLocal(name, value) {
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = `${fileOf(name)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, fileOf(name));
}

/* ------------------------------------------------------------ GitHub files */

async function gh(cfg, route, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${cfg.api}/repos/${cfg.repo}/${route}`, {
      method,
      headers: {
        authorization: `Bearer ${cfg.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'rtrw-dashboard',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new StorageError(`Tidak bisa menghubungi GitHub: ${err.message}`);
  }
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { /* not json */ }
  return { status: res.status, ok: res.ok, data };
}

const encodePath = (rel) => rel.split('/').map(encodeURIComponent).join('/');

async function ghRead(cfg, rel) {
  const r = await gh(cfg, `contents/${encodePath(rel)}?ref=${encodeURIComponent(cfg.branch)}`);
  if (r.status === 404) return { text: null, sha: null };
  if (!r.ok) throw new StorageError(`GitHub menolak permintaan (${r.status}): ${r.data.message || 'periksa GITHUB_TOKEN dan GITHUB_REPO'}`);
  let b64 = r.data.content;
  if (!b64 && r.data.sha) b64 = (await gh(cfg, `git/blobs/${r.data.sha}`)).data.content; // files above 1 MB
  return { text: Buffer.from(b64 || '', 'base64').toString('utf8'), sha: r.data.sha };
}

const ghWrite = (cfg, rel, buf, sha, message) =>
  gh(cfg, `contents/${encodePath(rel)}`, { method: 'PUT', body: { message, content: buf.toString('base64'), branch: cfg.branch, ...(sha ? { sha } : {}) } });

/* ------------------------------------------------------------------ public */

// Reads a collection. `fresh` asks GitHub for the newest copy (admin panel); the public site reads the deployed files.
async function read(name, fallback, { fresh = false } = {}) {
  const cfg = github();
  if (fresh && cfg) {
    const cur = await ghRead(cfg, `data/${name}.json`);
    return cur.text === null ? fallback : JSON.parse(cur.text);
  }
  return readLocal(name, fallback);
}

// Read, change and save one collection. `fn` gets the current value and returns the new value.
async function update(name, fallback, fn) {
  const cfg = github();
  if (!cfg) {
    if (serverless()) throw new StorageError('Penyimpanan belum diatur. Isi GITHUB_TOKEN dan GITHUB_REPO di Environment Variables Vercel.');
    const next = fn(readLocal(name, fallback));
    writeLocal(name, next);
    return next;
  }
  const rel = `data/${name}.json`;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cur = await ghRead(cfg, rel);
    const next = fn(cur.text === null ? fallback : JSON.parse(cur.text));
    const r = await ghWrite(cfg, rel, Buffer.from(`${JSON.stringify(next, null, 2)}\n`), cur.sha, `Admin: update ${name}`);
    if (r.ok) return next;
    if (r.status !== 409 && r.status !== 422) throw new StorageError(`GitHub gagal menyimpan (${r.status}): ${r.data.message || ''}`);
  }
  throw new StorageError('Gagal menyimpan karena ada perubahan bersamaan. Coba lagi.');
}

// Stores an uploaded image and returns its public URL.
async function saveUpload(name, buf) {
  const cfg = github();
  if (cfg) {
    const r = await ghWrite(cfg, `public/uploads/${name}`, buf, null, 'Admin: upload image');
    if (!r.ok) throw new StorageError(`GitHub gagal menyimpan gambar (${r.status}): ${r.data.message || ''}`);
  } else if (serverless()) {
    throw new StorageError('Penyimpanan belum diatur. Isi GITHUB_TOKEN dan GITHUB_REPO di Environment Variables Vercel.');
  } else {
    fs.mkdirSync(UPLOADS, { recursive: true });
    fs.writeFileSync(path.join(UPLOADS, name), buf);
  }
  return `/uploads/${name}`;
}

const newId = () => crypto.randomBytes(6).toString('hex');

// "Today" as YYYY-MM-DD in the configured time zone.
function today() {
  const tz = process.env.TZ_NAME || 'Asia/Jakarta';
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Local only (password hash and session secret). Never used on Vercel.
const readLocalOnly = readLocal;
const writeLocalOnly = writeLocal;

module.exports = { read, update, saveUpload, newId, today, mode, serverless, StorageError, readLocal: readLocalOnly, writeLocal: writeLocalOnly, DATA };
