'use strict';
const store = require('./store');
const auth = require('./auth');
const guard = require('./guard');
const { SCHEMAS, SETTINGS_FIELDS, DAYS, ValidationError, clean } = require('./schemas');
const { json, send, readJson, readBody, clientIp, limiter } = require('./http');

const PUBLIC = ['transactions', 'ronda', 'announcements', 'articles', 'agenda', 'contacts', 'inventory'];
const loginLimit = limiter(5, 15 * 60 * 1000);
const aspirasiLimit = limiter(5, 60 * 60 * 1000);
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_SETTINGS = {
  rtName: 'RT 01 / RW 01', area: '', address: '', tagline: 'Informasi dan layanan warga dalam satu tempat.',
  openingBalance: 0, duesName: 'Iuran bulanan', duesAmount: 0, publicDues: false, whatsapp: '',
};
// `fresh` = newest copy from GitHub (admin panel). The public site reads the deployed files.
const getSettings = async (fresh = false) => ({ ...DEFAULT_SETTINGS, ...(await store.read('settings', {}, { fresh })) });
const listOf = async (name, fresh = false) => {
  const arr = await store.read(name, [], { fresh });
  return SCHEMAS[name].sort ? [...arr].sort(SCHEMAS[name].sort) : arr;
};
const httpError = (status, message) => Object.assign(new Error(message), { status });

/* ------------------------------------------------------------------ public */

async function publicApi(req, res, p) {
  const name = p.slice('/api/public/'.length);

  if (req.method === 'GET' && name === 'settings') return json(res, 200, await getSettings());

  if (req.method === 'GET' && name === 'dues') {
    const s = await getSettings();
    const households = await listOf('households');
    const payments = await store.read('payments', {});
    const counts = {};
    for (const [month, ids] of Object.entries(payments)) counts[month] = ids.length;
    const body = { name: s.duesName, amount: s.duesAmount, public: !!s.publicDues, total: households.length, counts };
    if (s.publicDues) Object.assign(body, { households, payments });
    return json(res, 200, body);
  }

  if (req.method === 'GET' && PUBLIC.includes(name)) return json(res, 200, await listOf(name));

  if (req.method === 'POST' && name === 'aspirasi') {
    if (!aspirasiLimit.take(clientIp(req))) throw httpError(429, 'Terlalu banyak kiriman. Coba lagi nanti.');
    const body = await readJson(req, 20 * 1024);
    if (body.website) return json(res, 200, { ok: true }); // honeypot field filled in by a bot
    const message = String(body.message || '').replace(/\r\n?/g, '\n').trim();
    if (message.length < 10) throw new ValidationError('Pesan terlalu pendek (minimal 10 karakter).');
    const row = { id: store.newId(), createdAt: new Date().toISOString(), name: String(body.name || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Anonim', message: message.slice(0, 1000), status: 'baru', note: '' };
    await store.update('complaints', [], (items) => [...items, row].slice(-1000));
    return json(res, 200, { ok: true });
  }

  throw httpError(404, 'Tidak ditemukan');
}

/* ------------------------------------------------------------------- admin */

function detectImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.length > 6 && buf.subarray(0, 4).toString() === 'GIF8') return 'gif';
  return null;
}

function schemaForClient() {
  const collections = {};
  for (const [name, s] of Object.entries(SCHEMAS)) collections[name] = { label: s.label, singular: s.singular, columns: s.columns, fields: s.fields, noCreate: !!s.noCreate };
  return { collections, settingsFields: SETTINGS_FIELDS, days: DAYS };
}

async function adminApi(req, res, p) {
  const m = req.method;
  const sub = p.slice('/api/admin/'.length);

  if (m === 'POST' && sub === 'login') {
    if (!auth.configured()) throw httpError(503, 'ADMIN_PASSWORD belum diatur di Environment Variables.');
    const ip = clientIp(req);
    if (!loginLimit.take(ip)) throw httpError(429, 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');
    const body = await readJson(req, 4096);
    if (!auth.checkPassword(body.password || '')) {
      await sleep(600); // slows down guessing, also on serverless where the counter above is per instance
      throw httpError(401, 'Password salah.');
    }
    loginLimit.clear(ip);
    return json(res, 200, { ok: true }, { 'set-cookie': auth.sessionCookie(req) });
  }

  if (!auth.isAdmin(req)) throw httpError(401, 'Silakan masuk terlebih dahulu.');
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'fetch') throw httpError(403, 'Permintaan ditolak.');

  if (m === 'POST' && sub === 'logout') return json(res, 200, { ok: true }, { 'set-cookie': auth.clearCookie() });
  if (m === 'GET' && sub === 'me') return json(res, 200, { ok: true, defaultPassword: auth.usingDefaultPassword(), canChangePassword: auth.canChangePassword(), storage: store.mode(), serverless: store.serverless() });
  if (m === 'GET' && sub === 'schema') return json(res, 200, schemaForClient());

  if (sub === 'settings') {
    if (m === 'GET') return json(res, 200, await getSettings(true));
    if (m === 'PUT') {
      const next = clean(SETTINGS_FIELDS, await readJson(req));
      await store.update('settings', {}, () => next);
      return json(res, 200, next);
    }
  }

  if (m === 'POST' && sub === 'password') {
    if (!auth.canChangePassword()) throw new ValidationError('Di Vercel, password diganti lewat Environment Variables ADMIN_PASSWORD lalu deploy ulang.');
    const body = await readJson(req, 4096);
    if (!auth.checkPassword(body.current || '')) throw httpError(403, 'Password saat ini salah.');
    const next = String(body.next || '');
    if (next.length < 8 || next.length > 100) throw new ValidationError('Password baru minimal 8 karakter.');
    auth.setPassword(next);
    return json(res, 200, { ok: true });
  }

  if (m === 'GET' && sub === 'dues') return json(res, 200, { payments: await store.read('payments', {}, { fresh: true }) });

  if (m === 'POST' && sub === 'dues/toggle') {
    const body = await readJson(req, 4096);
    if (!MONTH.test(String(body.month || ''))) throw new ValidationError('Bulan tidak valid.');
    const hh = (await store.read('households', [], { fresh: true })).find((h) => h.id === body.householdId);
    if (!hh) throw httpError(404, 'Data KK tidak ditemukan.');
    const settings = await getSettings(true);
    const ref = `dues:${hh.id}:${body.month}`;
    let paid;
    await store.update('payments', {}, (payments) => {
      const ids = payments[body.month] || [];
      paid = !ids.includes(hh.id);
      return { ...payments, [body.month]: paid ? [...ids, hh.id] : ids.filter((x) => x !== hh.id) };
    });
    await store.update('transactions', [], (tx) => {
      const rest = tx.filter((t) => t.ref !== ref);
      if (!paid || !(settings.duesAmount > 0)) return rest;
      return [...rest, { id: store.newId(), date: store.today(), type: 'in', category: 'Iuran', description: `${settings.duesName} ${body.month}, ${hh.name} (${hh.block})`, amount: settings.duesAmount, ref }];
    });
    return json(res, 200, { paid });
  }

  if (m === 'POST' && sub === 'upload') {
    const buf = await readBody(req, 3 * 1024 * 1024);
    const ext = detectImage(buf);
    if (!ext) throw new ValidationError('File harus berupa gambar JPG, PNG, WEBP, atau GIF (maks 3 MB).');
    const url = await store.saveUpload(`${store.newId()}${store.newId()}.${ext}`, buf);
    return json(res, 200, { url });
  }

  if (m === 'GET' && sub === 'backup') {
    const collections = {};
    for (const name of Object.keys(SCHEMAS)) collections[name] = await store.read(name, [], { fresh: true });
    const dump = { app: 'rtrw-dashboard', version: 1, exportedAt: new Date().toISOString(), settings: await getSettings(true), payments: await store.read('payments', {}, { fresh: true }), collections };
    return send(res, 200, JSON.stringify(dump, null, 2), {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="backup-rtrw-${store.today()}.json"`,
      'cache-control': 'no-store',
    });
  }

  if (m === 'POST' && sub === 'restore') {
    const dump = await readJson(req, store.serverless() ? 4 * 1024 * 1024 : 10 * 1024 * 1024);
    if (!dump || dump.app !== 'rtrw-dashboard' || typeof dump.collections !== 'object') throw new ValidationError('File backup tidak dikenali.');
    const next = {};
    for (const [name, schema] of Object.entries(SCHEMAS)) {
      const items = dump.collections[name];
      if (items === undefined) continue;
      if (!Array.isArray(items) || items.length > 20000) throw new ValidationError(`Data ${schema.label} tidak valid.`);
      next[name] = items.map((item) => {
        const row = { id: String(item.id || store.newId()).slice(0, 40), ...clean(schema.fields, item, item) };
        if (typeof item.ref === 'string') row.ref = item.ref.slice(0, 100);
        return row;
      });
    }
    const settings = clean(SETTINGS_FIELDS, dump.settings || {});
    const payments = {};
    for (const [month, ids] of Object.entries(dump.payments || {})) {
      if (MONTH.test(month) && Array.isArray(ids)) payments[month] = ids.map((x) => String(x).slice(0, 40));
    }
    for (const [name, rows] of Object.entries(next)) await store.update(name, [], () => rows);
    await store.update('settings', {}, () => settings);
    await store.update('payments', {}, () => payments);
    return json(res, 200, { ok: true });
  }

  const match = sub.match(/^c\/([a-z]+)(?:\/([a-f0-9]+))?$/);
  if (match && SCHEMAS[match[1]]) {
    const [, name, id] = match;
    const schema = SCHEMAS[name];
    if (m === 'GET' && !id) return json(res, 200, await listOf(name, true));

    if (m === 'POST' && !id) {
      if (schema.noCreate) throw httpError(405, 'Data ini tidak bisa dibuat dari admin.');
      const row = { id: store.newId(), ...clean(schema.fields, await readJson(req)) };
      await store.update(name, [], (items) => [...items, row]);
      return json(res, 200, row);
    }

    if (id && m === 'PUT') {
      const body = await readJson(req);
      let saved;
      await store.update(name, [], (items) => {
        const idx = items.findIndex((x) => x.id === id);
        if (idx < 0) throw httpError(404, 'Data tidak ditemukan.');
        saved = { ...items[idx], ...clean(schema.fields, body, items[idx]) };
        return items.map((x, i) => (i === idx ? saved : x));
      });
      return json(res, 200, saved);
    }

    if (id && m === 'DELETE') {
      await store.update(name, [], (items) => {
        if (!items.some((x) => x.id === id)) throw httpError(404, 'Data tidak ditemukan.');
        return items.filter((x) => x.id !== id);
      });
      if (name === 'households') {
        await store.update('payments', {}, (payments) => Object.fromEntries(Object.entries(payments).map(([month, ids]) => [month, ids.filter((x) => x !== id)])));
      }
      return json(res, 200, { ok: true });
    }
  }

  throw httpError(404, 'Tidak ditemukan');
}

async function handle(req, res, url) {
  guard.assert();
  const p = url.pathname.replace(/\/+$/, '');
  try {
    if (p.startsWith('/api/public/')) return await publicApi(req, res, p);
    if (p.startsWith('/api/admin/')) return await adminApi(req, res, p);
    throw httpError(404, 'Tidak ditemukan');
  } catch (err) {
    if (err instanceof ValidationError) return json(res, 400, { error: err.message });
    if (err instanceof store.StorageError) return json(res, 503, { error: err.message });
    if (err.status) return json(res, err.status, { error: err.message });
    console.error('[API]', err);
    return json(res, 500, { error: 'Terjadi kesalahan pada server.' });
  }
}

module.exports = { handle };
