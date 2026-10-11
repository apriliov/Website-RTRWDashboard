(() => {
  'use strict';

  const root = document.getElementById('root');
  const pad = (n) => String(n).padStart(2, '0');
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const rp = (n) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0))}`;
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k === 'value') node.value = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  /* ------------------------------------------------------------- network */
  async function api(path, { method = 'GET', body, raw } = {}) {
    const headers = { 'x-requested-with': 'fetch' };
    let payload;
    if (raw) { payload = raw; } else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(`/api/admin/${path}`, { method, headers, body: payload });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* not json */ }
    if (res.status === 401 && path !== 'login') { showLogin(); throw new Error(data.error || 'Sesi berakhir.'); }
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan.');
    return data;
  }

  let toastTimer;
  function toast(text, bad = false) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const t = el('div', { class: `toast ${bad ? 'bad' : ''}`, text, role: 'status' });
    document.body.append(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 3500);
  }
  const guard = (fn) => async (...args) => { try { await fn(...args); } catch (err) { toast(err.message, true); } };

  /* --------------------------------------------------------------- state */
  let schema = null;
  let settings = null;
  let meta = { defaultPassword: false };
  let view = 'dashboard';

  /* --------------------------------------------------------------- login */
  function showLogin() {
    const msg = el('div');
    const pw = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true, autofocus: true });
    const form = el('form', { class: 'card login-card', onsubmit: guard(async (e) => {
      e.preventDefault();
      msg.replaceChildren();
      try {
        await api('login', { method: 'POST', body: { password: pw.value } });
        await start();
      } catch (err) {
        msg.replaceChildren(el('div', { class: 'notice bad', text: err.message }));
      }
    }) },
      el('h1', { text: 'Masuk Admin' }),
      el('p', { class: 'muted', text: 'Khusus pengurus RT/RW.' }),
      msg,
      el('div', { class: 'field' }, el('label', { for: 'pw', text: 'Password' }), pw),
      el('button', { class: 'btn', type: 'submit', text: 'Masuk' }),
      el('p', { class: 'muted mt-sm' }, el('a', { href: '/', text: '< Kembali ke website' })));
    root.replaceChildren(el('div', { class: 'login-wrap' }, form));
  }

  /* -------------------------------------------------------------- layout */
  const NAV = [
    ['dashboard', 'Ringkasan', null],
    ['transactions', 'Keuangan', 'Konten'], ['ronda', 'Jadwal Ronda', null], ['announcements', 'Pengumuman', null], ['articles', 'Artikel', null], ['agenda', 'Agenda', null],
    ['dues', 'Iuran', 'Warga'], ['households', 'Data KK', null], ['contacts', 'Kontak', null], ['inventory', 'Inventaris', null], ['complaints', 'Aspirasi', null],
    ['settings', 'Pengaturan', 'Sistem'],
  ];

  function shell(content) {
    const side = el('aside', { class: 'side' }, el('a', { class: 'brand', href: '/' }, el('span', { class: 'brand-mark', text: 'RT' }), el('span', { text: 'Admin' })));
    for (const [id, label, group] of NAV) {
      if (group) side.append(el('div', { class: 'group', text: group }));
      side.append(el('button', { type: 'button', class: view === id ? 'active' : '', text: label, onclick: () => { view = id; render(); } }));
    }
    side.append(el('div', { class: 'group', text: 'Akun' }), el('a', { class: 'btn btn-ghost btn-sm', href: '/', target: '_blank', rel: 'noopener', text: 'Lihat website' }),
      el('button', { type: 'button', text: 'Keluar', onclick: guard(async () => { await api('logout', { method: 'POST', body: {} }); showLogin(); }) }));
    root.replaceChildren(el('div', { class: 'admin-shell' }, side, el('section', {}, content)));
  }

  const head = (title, ...actions) => el('div', { class: 'panel-head' }, el('h1', { text: title }), el('div', { class: 'actions' }, actions));

  /* ---------------------------------------------------------- form builder */
  function fieldInput(key, def, value) {
    const id = `f-${key}`;
    let input;
    switch (def.type) {
      case 'textarea': input = el('textarea', { id, value: value ?? '', rows: 6 }); break;
      case 'number': input = el('input', { id, type: 'number', step: 'any', value: value ?? '' }); break;
      case 'date': input = el('input', { id, type: 'date', value: value || todayStr }); break;
      case 'time': input = el('input', { id, type: 'time', value: value || '' }); break;
      case 'select': input = el('select', { id }, def.options.map(([v, l]) => el('option', { value: v, text: l, selected: v === value }))); break;
      case 'checkbox': input = el('input', { id, type: 'checkbox' }); input.checked = !!value; break;
      case 'list': input = el('textarea', { id, value: Array.isArray(value) ? value.join('\n') : '', rows: 6 }); break;
      case 'image': {
        const text = el('input', { id, type: 'text', value: value || '', placeholder: 'https://... atau unggah gambar' });
        const preview = el('img', { class: 'img-preview', alt: '' });
        const sync = () => { if (text.value) { preview.src = text.value; preview.hidden = false; } else preview.hidden = true; };
        const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif', hidden: true, onchange: guard(async () => {
          if (!file.files[0]) return;
          const out = await api('upload', { method: 'POST', raw: file.files[0] });
          text.value = out.url; sync(); toast(meta.storage === 'github' ? 'Gambar terunggah. Pratinjau muncul setelah deploy Vercel selesai.' : 'Gambar terunggah.');
        }) });
        text.addEventListener('input', sync); sync();
        return el('div', { class: 'field' }, el('label', { for: id, text: def.label }), el('div', { class: 'img-row' }, text, el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Unggah', onclick: () => file.click() }), file), preview);
      }
      default: input = el('input', { id, type: 'text', value: value ?? '', maxlength: def.max || 120, placeholder: def.placeholder || '' });
    }
    if (def.readonly) { input.disabled = true; }
    if (def.type === 'checkbox') return el('div', { class: 'field check' }, input, el('label', { for: id, text: def.label }));
    return el('div', { class: 'field' }, el('label', { for: id, text: def.label }), input);
  }

  function readForm(fields, root0) {
    const out = {};
    for (const [key, def] of Object.entries(fields)) {
      if (def.readonly) continue;
      const input = root0.querySelector(`#f-${key}`);
      out[key] = def.type === 'checkbox' ? input.checked : input.value;
    }
    return out;
  }

  function openForm({ title, fields, values = {}, onSave }) {
    const dlg = el('dialog');
    const body = el('div', { class: 'dlg-body' }, Object.entries(fields).map(([k, d]) => fieldInput(k, d, values[k])));
    const err = el('div');
    dlg.append(
      el('div', { class: 'dlg-head' }, el('strong', { text: title }), el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Tutup', onclick: () => dlg.close() })),
      el('form', { method: 'dialog', onsubmit: (e) => e.preventDefault() }, body, err,
        el('div', { class: 'dlg-foot' }, el('button', { class: 'btn btn-ghost', type: 'button', text: 'Batal', onclick: () => dlg.close() }),
          el('button', { class: 'btn', type: 'submit', text: 'Simpan', onclick: async (e) => {
            e.preventDefault();
            err.replaceChildren();
            try { await onSave(readForm(fields, body)); dlg.close(); } catch (ex) { err.replaceChildren(el('div', { class: 'notice bad', text: ex.message })); }
          } }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  /* ----------------------------------------------------- generic CRUD view */
  function cell(def, value) {
    if (def.format === 'rp') return rp(value);
    if (def.type === 'select') return (def.options.find(([v]) => v === value) || [, value])[1];
    if (def.type === 'checkbox') return value ? 'Ya' : '';
    if (def.type === 'date') return fmtDate(value);
    if (def.type === 'list') return (value || []).join(', ');
    return value ?? '';
  }

  async function crud(name) {
    const meta0 = schema.collections[name];
    const rows = await api(`c/${name}`);
    const q = el('input', { type: 'search', placeholder: 'Cari...', 'aria-label': 'Cari' });
    const tbody = el('tbody');
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const shown = rows.filter((r) => !term || JSON.stringify(r).toLowerCase().includes(term));
      tbody.replaceChildren(...(shown.length ? shown.map((r) => el('tr', {},
        meta0.columns.map((c) => {
          const def = meta0.fields[c];
          let text = cell(def, r[c]);
          if (c === 'createdAt') text = new Date(r[c]).toLocaleString('id-ID');
          const td = el('td', { class: `${def.type === 'number' ? 'num' : ''} ${def.type === 'textarea' || def.type === 'text' ? 'cell-trunc' : ''}`, text: String(text) });
          if (name === 'transactions' && c === 'amount') td.classList.add(r.type === 'in' ? 'in-text' : 'out-text');
          return td;
        }),
        el('td', {}, el('div', { class: 'actions' },
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: meta0.noCreate ? 'Buka' : 'Ubah', onclick: () => openForm({ title: `${meta0.singular}`, fields: meta0.fields, values: r, onSave: async (data) => { await api(`c/${name}/${r.id}`, { method: 'PUT', body: data }); toast('Tersimpan.'); render(); } }) }),
          el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Hapus', onclick: guard(async () => {
            if (!confirm('Hapus data ini? Tindakan ini tidak bisa dibatalkan.')) return;
            await api(`c/${name}/${r.id}`, { method: 'DELETE' }); toast('Terhapus.'); render();
          }) }))))) : [el('tr', {}, el('td', { colspan: meta0.columns.length + 1, class: 'empty', text: 'Belum ada data.' }))]));
    };
    q.addEventListener('input', draw);
    draw();
    const add = meta0.noCreate ? null : el('button', { class: 'btn', type: 'button', text: `+ Tambah ${meta0.singular.toLowerCase()}`, onclick: () => openForm({ title: `Tambah ${meta0.singular.toLowerCase()}`, fields: meta0.fields, onSave: async (data) => { await api(`c/${name}`, { method: 'POST', body: data }); toast('Ditambahkan.'); render(); } }) });
    shell(el('div', {}, head(meta0.label, add), el('div', { class: 'toolbar' }, q, el('span', { class: 'muted', text: `${rows.length} data` })),
      el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, meta0.columns.map((c) => el('th', { class: meta0.fields[c].type === 'number' ? 'num' : '', text: meta0.fields[c].label.replace(/\s*\(.*\)/, '') })), el('th', { text: '' }))), tbody))));
  }

  /* ------------------------------------------------------------ dashboard */
  async function dashboard() {
    const names = ['transactions', 'announcements', 'articles', 'agenda', 'households', 'complaints'];
    const data = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await api(`c/${n}`)])));
    const tx = data.transactions;
    const inn = tx.filter((t) => t.type === 'in').reduce((a, t) => a + t.amount, 0);
    const out = tx.filter((t) => t.type === 'out').reduce((a, t) => a + t.amount, 0);
    const newComplaints = data.complaints.filter((c) => c.status === 'baru').length;
    const stat = (label, value, sub) => el('div', { class: 'card stat' }, el('span', { class: 'label', text: label }), el('span', { class: 'value', text: value }), el('span', { class: 'sub', text: sub }));
    shell(el('div', {}, head('Ringkasan'),
      meta.defaultPassword ? el('div', { class: 'notice bad' }, meta.canChangePassword ? 'Kamu masih memakai password bawaan dari file .env. ' : 'Password admin masih lemah atau bawaan. Ganti ADMIN_PASSWORD di Environment Variables Vercel lalu deploy ulang. ', meta.canChangePassword ? el('button', { class: 'btn btn-sm', type: 'button', text: 'Ganti sekarang', onclick: () => { view = 'settings'; render(); } }) : null) : null,
      meta.serverless && meta.storage !== 'github' ? el('div', { class: 'notice bad', text: 'Penyimpanan belum diatur. Isi GITHUB_REPO dan GITHUB_TOKEN di Environment Variables Vercel, kalau tidak perubahan tidak bisa disimpan.' }) : null,
      meta.storage === 'github' ? el('div', { class: 'notice info', text: 'Mode Vercel: setiap perubahan disimpan ke GitHub, lalu website publik ikut diperbarui setelah Vercel selesai deploy (sekitar 1 menit). Panel ini selalu menampilkan data terbaru.' }) : null,
      el('div', { class: 'grid grid-4' },
        stat('Saldo kas', rp(Number(settings.openingBalance || 0) + inn - out), `${tx.length} transaksi`),
        stat('Pengumuman', String(data.announcements.length), 'Aktif di website'),
        stat('Artikel', String(data.articles.length), 'Diterbitkan'),
        stat('Aspirasi baru', String(newComplaints), `${data.complaints.length} total`)),
      el('div', { class: 'card mt' }, el('h3', { class: 'item-title', text: 'Mulai cepat' }),
        el('div', { class: 'toolbar' },
          ...[['transactions', 'Catat transaksi'], ['announcements', 'Buat pengumuman'], ['articles', 'Tulis artikel'], ['ronda', 'Atur ronda'], ['dues', 'Catat iuran']].map(([id, label]) => el('button', { class: 'btn btn-ghost', type: 'button', text: label, onclick: () => { view = id; render(); } }))))));
  }

  /* ----------------------------------------------------------------- dues */
  async function dues() {
    const [households, { payments }] = await Promise.all([api('c/households'), api('dues')]);
    let month = todayStr.slice(0, 7);
    const input = el('input', { type: 'month', value: month });
    const stats = el('div', { class: 'grid grid-3' });
    const tbody = el('tbody');
    const draw = () => {
      const paid = new Set(payments[month] || []);
      stats.replaceChildren(
        el('div', { class: 'card stat' }, el('span', { class: 'label', text: 'Sudah bayar' }), el('span', { class: 'value', text: `${paid.size} dari ${households.length}` })),
        el('div', { class: 'card stat' }, el('span', { class: 'label', text: 'Terkumpul' }), el('span', { class: 'value', text: rp(paid.size * Number(settings.duesAmount || 0)) })),
        el('div', { class: 'card stat' }, el('span', { class: 'label', text: 'Nominal per KK' }), el('span', { class: 'value', text: rp(settings.duesAmount) })));
      tbody.replaceChildren(...(households.length ? households.map((h) => el('tr', {},
        el('td', { text: h.name }), el('td', { text: h.block }),
        el('td', {}, el('span', { class: `badge ${paid.has(h.id) ? 'ok' : 'bad'}`, text: paid.has(h.id) ? 'Lunas' : 'Belum' })),
        el('td', {}, el('div', { class: 'actions' }, el('button', { class: `btn btn-sm ${paid.has(h.id) ? 'btn-ghost' : ''}`, type: 'button', text: paid.has(h.id) ? 'Batalkan' : 'Tandai lunas', onclick: guard(async () => {
          const out = await api('dues/toggle', { method: 'POST', body: { householdId: h.id, month } });
          payments[month] = out.paid ? [...(payments[month] || []), h.id] : (payments[month] || []).filter((x) => x !== h.id);
          toast(out.paid ? 'Dicatat lunas dan masuk ke kas.' : 'Pembayaran dibatalkan dan dihapus dari kas.');
          draw();
        }) }))))) : [el('tr', {}, el('td', { colspan: 4, class: 'empty', text: 'Tambahkan dulu data KK di menu Data KK.' }))]));
    };
    input.addEventListener('change', () => { if (input.value) { month = input.value; draw(); } });
    draw();
    shell(el('div', {}, head('Iuran Warga'), el('div', { class: 'notice info', text: 'Menandai lunas otomatis menambah pemasukan di Keuangan. Membatalkan akan menghapus pemasukan itu.' }),
      el('div', { class: 'toolbar' }, el('label', { class: 'muted', text: 'Bulan' }), input), stats,
      el('div', { class: 'table-wrap mt' }, el('table', {}, el('thead', {}, el('tr', {}, ['Kepala keluarga', 'Blok', 'Status', ''].map((t) => el('th', { text: t })))), tbody))));
  }

  /* ------------------------------------------------------------- settings */
  async function settingsView() {
    const form = el('form', { class: 'card', onsubmit: guard(async (e) => {
      e.preventDefault();
      settings = await api('settings', { method: 'PUT', body: readForm(schema.settingsFields, form) });
      toast('Pengaturan tersimpan.');
    }) }, Object.entries(schema.settingsFields).map(([k, d]) => fieldInput(k, d, settings[k])), el('button', { class: 'btn', type: 'submit', text: 'Simpan pengaturan' }));

    const cur = el('input', { type: 'password', autocomplete: 'current-password', id: 'pw-cur' });
    const nxt = el('input', { type: 'password', autocomplete: 'new-password', id: 'pw-new', minlength: 8 });
    const pwForm = !meta.canChangePassword ? el('div', { class: 'card' }, el('h3', { class: 'item-title', text: 'Password admin' }), el('p', { class: 'muted', text: 'Di Vercel, password diatur lewat Environment Variables ADMIN_PASSWORD. Ganti nilainya di dashboard Vercel lalu deploy ulang.' })) : el('form', { class: 'card', onsubmit: guard(async (e) => {
      e.preventDefault();
      await api('password', { method: 'POST', body: { current: cur.value, next: nxt.value } });
      cur.value = ''; nxt.value = ''; meta.defaultPassword = false;
      toast('Password diganti.');
    }) }, el('h3', { class: 'item-title', text: 'Ganti password admin' }),
      el('div', { class: 'field' }, el('label', { for: 'pw-cur', text: 'Password saat ini' }), cur),
      el('div', { class: 'field' }, el('label', { for: 'pw-new', text: 'Password baru (minimal 8 karakter)' }), nxt),
      el('button', { class: 'btn', type: 'submit', text: 'Ganti password' }));

    const file = el('input', { type: 'file', accept: 'application/json', hidden: true, onchange: guard(async () => {
      if (!file.files[0]) return;
      if (!confirm('Pulihkan dari backup? Semua data saat ini akan diganti.')) return;
      const text = await file.files[0].text();
      let payload;
      try { payload = JSON.parse(text); } catch { throw new Error('File bukan JSON yang valid.'); }
      await api('restore', { method: 'POST', body: payload });
      settings = await api('settings');
      toast('Backup dipulihkan.');
      render();
    }) });
    const backup = el('div', { class: 'card' }, el('h3', { class: 'item-title', text: 'Backup dan pemulihan' }),
      el('p', { class: 'muted', text: 'Karena website ini tidak memakai database, simpan backup secara berkala. Gambar yang diunggah ada di folder public/uploads dan perlu disalin manual.' }),
      el('div', { class: 'toolbar' }, el('a', { class: 'btn', href: '/api/admin/backup', text: 'Unduh backup (JSON)' }), el('button', { class: 'btn btn-ghost', type: 'button', text: 'Pulihkan dari backup', onclick: () => file.click() }), file));

    shell(el('div', {}, head('Pengaturan'), el('div', { class: 'grid grid-2' }, el('div', {}, form), el('div', { class: 'list' }, pwForm, backup))));
  }

  /* --------------------------------------------------------------- router */
  const render = guard(async () => {
    if (view === 'dashboard') return dashboard();
    if (view === 'dues') return dues();
    if (view === 'settings') return settingsView();
    return crud(view);
  });

  async function start() {
    const me = await api('me');
    meta = me;
    [schema, settings] = await Promise.all([api('schema'), api('settings')]);
    view = 'dashboard';
    render();
  }

  api('me').then(start).catch(() => showLogin());
})();
