'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { MIME, send } = require('./http');
const render = require('./render');
const api = require('./api');
const guard = require('./guard');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public'); // css, js, images, uploads (served by Vercel directly when deployed there)
const VIEWS = path.join(ROOT, 'views'); // HTML pages, always rendered by the server so the licence footer is injected
const ADMIN = path.join(ROOT, 'admin');

const SECURITY = {
  'content-security-policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};

const inside = (base, file) => {
  const rel = path.relative(base, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

function sendHtml(res, file, status = 200, withNavbar = true) {
  const html = render.page(file, { withNavbar });
  if (html === null) {
    return send(res, 503, 'Licence notice missing. This site can not be served.', { 'content-type': 'text/plain; charset=utf-8' });
  }
  return send(res, status, html, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
}

function notFound(res) {
  return sendHtml(res, path.join(VIEWS, '404.html'), 404);
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname.includes('\0') || pathname.split('/').some((seg) => seg.startsWith('.'))) return notFound(res);

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  let rel = isAdmin ? pathname.slice('/admin'.length) || '/' : pathname;
  if (rel.endsWith('/')) rel += 'index.html';
  const ext = path.extname(rel).toLowerCase();

  // Pages (no extension or .html) come from views/ (or admin/index.html); assets come from public/ (or admin/).
  let file;
  if (isAdmin) {
    file = path.join(ADMIN, rel);
    if (!inside(ADMIN, file) && rel !== '/index.html') return notFound(res);
  } else if (!ext || ext === '.html') {
    const name = rel.replace(/\.html$/i, '');
    file = path.join(VIEWS, `${name}.html`);
    if (!inside(VIEWS, file)) return notFound(res);
  } else {
    file = path.join(PUBLIC, rel);
    if (!inside(PUBLIC, file)) return notFound(res);
  }
  if (isAdmin && !ext) file = path.join(ADMIN, 'index.html');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return notFound(res);

  const fileExt = path.extname(file).toLowerCase();
  if (!MIME[fileExt]) return notFound(res);
  if (fileExt === '.html') return sendHtml(res, file, 200, !isAdmin);
  res.writeHead(200, { 'content-type': MIME[fileExt], 'cache-control': 'public, max-age=300, s-maxage=3600' });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);
  guard.assert();
  if (url.pathname.startsWith('/api/')) return api.handle(req, res, url);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  return serveStatic(req, res, url);
}

module.exports = { handle };
