(() => {
  'use strict';

  /* ------------------------------------------------------------ helpers */
  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');

  // Builds DOM nodes with textContent only, so user content can never inject HTML.
  function el(tag, props, ...kids) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const rp = (n) => `Rp ${new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0))}`;
  const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const parts = (s) => String(s).split('-').map(Number);
  const fmtDate = (s) => {
    if (!s) return '';
    const [y, m, d] = parts(s);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  };
  const monthLabel = (key) => {
    const [y, m] = parts(key);
    return `${MONTHS[m - 1]} ${y}`;
  };
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const todayName = DAYS[now.getDay()];

  async function get(path) {
    const res = await fetch(`/api/public/${path}`);
    if (!res.ok) throw new Error('Gagal memuat data');
    return res.json();
  }

  const failBox = (msg = 'Data belum bisa dimuat. Coba muat ulang halaman.') => el('div', { class: 'notice bad', text: msg });
  const emptyBox = (msg) => el('div', { class: 'empty', text: msg });

  // Paragraphs separated by a blank line; a line that starts with "## " is a sub heading.
  function bodyNodes(text) {
    return String(text || '')
      .split(/\n{2,}/)
      .map((block) => {
        if (block.startsWith('## ')) return el('h3', { text: block.slice(3) });
        const lines = block.split('\n');
        const p = el('p');
        lines.forEach((line, i) => {
          if (i) p.append(document.createElement('br'));
          p.append(document.createTextNode(line));
        });
        return p;
      });
  }

  const badgeClass = (cat) => ({ Penting: 'bad', Keamanan: 'warn', Kegiatan: 'info', Kebersihan: 'ok' }[cat] || '');

  let settings = {};

  /* ----------------------------------------------------- shared layout */
  function initLayout() {
    const burger = $('#burger');
    const links = $('#nav-links');
    if (burger && links) {
      burger.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        burger.setAttribute('aria-expanded', String(open));
      });
    }
    const page = document.body.dataset.page;
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === page));
    const toggle = $('#theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', () => {
        const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('theme', next); } catch { /* ignore */ }
      });
    }
  }

  const statCard = (label, value, sub, cls = '') => el('div', { class: `card stat ${cls}` }, el('span', { class: 'label', text: label }), el('span', { class: 'value', text: value }), sub ? el('span', { class: 'sub', text: sub }) : null);

  const announcementCard = (a, full = false) => {
    const body = full ? bodyNodes(a.body) : bodyNodes(a.body.length > 180 ? `${a.body.slice(0, 180).trim()}...` : a.body.split('\n\n')[0]);
    return el('article', { class: 'card' },
      el('div', { class: 'item-meta' }, a.pinned ? el('span', { class: 'pin', text: 'Disematkan' }) : null, el('span', { class: `badge ${badgeClass(a.category)}`, text: a.category }), el('span', { text: fmtDate(a.date) })),
      el('h3', { class: 'item-title', text: a.title }),
      a.image && full ? el('img', { src: a.image, alt: '', class: 'cover' }) : null,
      el('div', { class: 'item-body' }, body));
  };

  const agendaCard = (a) => {
    const [, m, d] = parts(a.date);
    return el('article', { class: 'card row' },
      el('div', { class: 'date-box' }, el('b', { text: String(d) }), el('span', { text: MON_SHORT[m - 1] })),
      el('div', {},
        el('h3', { class: 'item-title', text: a.title }),
        el('div', { class: 'item-meta' }, a.time ? el('span', { text: `${a.time.replace(':', '.')} WIB` }) : null, a.place ? el('span', { text: a.place }) : null, el('span', { text: fmtDate(a.date) })),
        a.description ? el('p', { class: 'muted', text: a.description }) : null));
  };

  const articleCard = (a) => el('a', { class: 'card article-card', href: `/artikel?id=${encodeURIComponent(a.id)}` },
    el('div', { class: 'article-cover' }, a.image ? el('img', { src: a.image, alt: '', loading: 'lazy' }) : (a.category || 'A').slice(0, 1)),
    el('div', { class: 'article-text' },
      el('div', { class: 'item-meta' }, el('span', { class: 'badge info', text: a.category }), el('span', { text: fmtDate(a.date) })),
      el('h3', { text: a.title }), el('p', { text: a.excerpt })));

  const callBtn = (c) => {
    const digits = String(c.phone || '').replace(/[^\d+]/g, '');
    if (!digits) return null;
    const wa = digits.startsWith('0') ? `62${digits.slice(1)}` : digits.replace('+', '');
    const isShort = digits.length <= 4;
    return el('div', { class: 'contact-actions' },
      el('a', { class: 'btn btn-sm btn-ghost', href: `tel:${digits}`, text: 'Telepon' }),
      isShort ? null : el('a', { class: 'btn btn-sm', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener noreferrer', text: 'WhatsApp' }));
  };

  const totals = (tx) => tx.reduce((acc, t) => { acc[t.type] += t.amount; return acc; }, { in: 0, out: 0 });

  /* --------------------------------------------------------------- pages */
  const pages = {};

  pages.home = async () => {
    $('#hero-title').textContent = settings.rtName;
    $('#hero-tagline').textContent = settings.tagline || '';
    if (settings.area) $('#hero-area').textContent = settings.area;
    const [tx, ronda, ann, agenda, articles, contacts] = await Promise.all(['transactions', 'ronda', 'announcements', 'agenda', 'articles', 'contacts'].map(get));

    const all = totals(tx);
    const monthKey = todayStr.slice(0, 7);
    const mt = totals(tx.filter((t) => t.date.startsWith(monthKey)));
    const balance = Number(settings.openingBalance || 0) + all.in - all.out;
    const stats = $('#home-stats');
    stats.replaceChildren(
      statCard('Saldo kas', rp(balance), 'Per hari ini'),
      statCard('Pemasukan bulan ini', rp(mt.in), monthLabel(monthKey), 'in'),
      statCard('Pengeluaran bulan ini', rp(mt.out), monthLabel(monthKey), 'out'),
      statCard('Warga ronda malam ini', String((ronda.find((r) => r.day === todayName) || { members: [] }).members.length), todayName));

    const tonight = ronda.find((r) => r.day === todayName);
    const box = $('#tonight');
    box.replaceChildren(el('h3', { text: `Ronda malam ini (${todayName})` }));
    if (tonight) {
      box.append(el('div', { class: 'big', text: tonight.group }), el('div', { text: [tonight.post, tonight.time].filter(Boolean).join(' | ') }), el('div', { class: 'chips' }, tonight.members.map((m) => el('span', { class: 'chip', text: m }))));
    } else {
      box.append(el('div', { class: 'big', text: 'Tidak ada jadwal' }));
    }

    $('#home-ann').replaceChildren(...(ann.slice(0, 3).map((a) => announcementCard(a)).concat(ann.length ? [] : [emptyBox('Belum ada pengumuman.')])));
    const upcoming = agenda.filter((a) => a.date >= todayStr).slice(0, 3);
    $('#home-agenda').replaceChildren(...(upcoming.length ? upcoming.map(agendaCard) : [emptyBox('Belum ada agenda mendatang.')]));
    $('#home-art').replaceChildren(...(articles.length ? articles.slice(0, 3).map(articleCard) : [emptyBox('Belum ada artikel.')]));
    const emergency = contacts.filter((c) => c.group === 'Darurat').slice(0, 4);
    $('#home-emergency').replaceChildren(...emergency.map((c) => el('div', { class: 'card contact' }, el('div', {}, el('b', { text: c.name }), el('small', { text: c.role })), callBtn(c))));
  };

  /* chart: income and expense bars for the last six months */
  function barChart(rows) {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 680; const H = 250; const L = 56; const B = 28; const T = 12;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Grafik pemasukan dan pengeluaran per bulan');
    const max = Math.max(1, ...rows.flatMap((r) => [r.in, r.out]));
    const compact = new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 });
    const mk = (tag, attrs, text) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      if (text !== undefined) n.textContent = text;
      svg.append(n);
    };
    for (let i = 0; i <= 4; i += 1) {
      const y = T + ((H - B - T) * i) / 4;
      mk('line', { x1: L, x2: W - 8, y1: y, y2: y, class: 'grid-line' });
      mk('text', { x: L - 8, y: y + 4, 'text-anchor': 'end' }, compact.format(max * (1 - i / 4)));
    }
    const slot = (W - L - 8) / rows.length;
    const bw = Math.min(26, slot / 3);
    rows.forEach((r, i) => {
      const cx = L + slot * i + slot / 2;
      for (const [key, dx] of [['in', -bw - 2], ['out', 2]]) {
        const h = ((H - B - T) * r[key]) / max;
        mk('rect', { x: cx + dx, y: H - B - h, width: bw, height: Math.max(h, 0), rx: 4, class: `bar-${key}` });
      }
      mk('text', { x: cx, y: H - 8, 'text-anchor': 'middle' }, `${MON_SHORT[parts(r.month)[1] - 1]} ${String(parts(r.month)[0]).slice(2)}`);
    });
    return svg;
  }

  pages.keuangan = async () => {
    const tx = await get('transactions');
    const all = totals(tx);
    const balance = Number(settings.openingBalance || 0) + all.in - all.out;
    const months = [...new Set(tx.map((t) => t.date.slice(0, 7)))].sort();
    const state = { month: '', type: '', category: '', q: '' };
    const categories = [...new Set(tx.map((t) => t.category))].sort();

    $('#fin-chart').replaceChildren(barChart(months.slice(-6).map((month) => ({ month, ...totals(tx.filter((t) => t.date.startsWith(month))) }))));

    const monthSel = el('select', { 'aria-label': 'Bulan' }, el('option', { value: '', text: 'Semua bulan' }), months.slice().reverse().map((m) => el('option', { value: m, text: monthLabel(m) })));
    const typeSel = el('select', { 'aria-label': 'Jenis' }, el('option', { value: '', text: 'Semua jenis' }), el('option', { value: 'in', text: 'Pemasukan' }), el('option', { value: 'out', text: 'Pengeluaran' }));
    const catSel = el('select', { 'aria-label': 'Kategori' }, el('option', { value: '', text: 'Semua kategori' }), categories.map((c) => el('option', { value: c, text: c })));
    const search = el('input', { type: 'search', placeholder: 'Cari keterangan...', 'aria-label': 'Cari' });
    let current = [];
    const csvBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Unduh CSV', onclick: () => {
      const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const lines = [['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Jumlah'].map(q).join(',')].concat(current.map((t) => [t.date, t.type === 'in' ? 'Pemasukan' : 'Pengeluaran', t.category, t.description, t.amount].map(q).join(',')));
      const url = URL.createObjectURL(new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }));
      const a = el('a', { href: url, download: `kas-${state.month || 'semua'}.csv` });
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } });
    const printBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cetak laporan', onclick: () => window.print() });
    $('#fin-toolbar').append(monthSel, typeSel, catSel, search, el('span', { class: 'spacer' }), csvBtn, printBtn);

    function render() {
      current = tx.filter((t) => (!state.month || t.date.startsWith(state.month)) && (!state.type || t.type === state.type) && (!state.category || t.category === state.category) && (!state.q || `${t.description} ${t.category}`.toLowerCase().includes(state.q)));
      const sum = totals(current);
      $('#fin-title').textContent = state.month ? `Transaksi ${monthLabel(state.month)}` : 'Semua transaksi';
      $('#fin-stats').replaceChildren(
        statCard('Saldo kas', rp(balance), `Saldo awal ${rp(settings.openingBalance || 0)}`),
        statCard('Pemasukan', rp(sum.in), state.month ? monthLabel(state.month) : 'Seluruh periode', 'in'),
        statCard('Pengeluaran', rp(sum.out), state.month ? monthLabel(state.month) : 'Seluruh periode', 'out'),
        statCard('Selisih', rp(sum.in - sum.out), `${current.length} transaksi`));
      const body = $('#fin-body');
      body.replaceChildren(...(current.length ? current.map((t) => el('tr', {},
        el('td', { text: fmtDate(t.date) }), el('td', { text: t.description }), el('td', {}, el('span', { class: 'badge', text: t.category })),
        el('td', { class: 'num in-text', text: t.type === 'in' ? rp(t.amount) : '' }), el('td', { class: 'num out-text', text: t.type === 'out' ? rp(t.amount) : '' }))) : [el('tr', {}, el('td', { colspan: 5, class: 'empty', text: 'Tidak ada transaksi.' }))]));
      $('#fin-foot').replaceChildren(el('tr', {}, el('td', { colspan: 3, text: 'Total' }), el('td', { class: 'num', text: rp(sum.in) }), el('td', { class: 'num', text: rp(sum.out) })));
    }
    monthSel.addEventListener('change', () => { state.month = monthSel.value; render(); });
    typeSel.addEventListener('change', () => { state.type = typeSel.value; render(); });
    catSel.addEventListener('change', () => { state.category = catSel.value; render(); });
    search.addEventListener('input', () => { state.q = search.value.trim().toLowerCase(); render(); });
    render();
  };

  pages.ronda = async () => {
    const ronda = await get('ronda');
    const grid = $('#ronda-grid');
    if (!ronda.length) return grid.replaceChildren(emptyBox('Jadwal ronda belum diisi.'));
    grid.replaceChildren(...ronda.map((r) => el('article', { class: `card day-card ${r.day === todayName ? 'today' : ''}` },
      el('h3', {}, el('span', { text: r.day }), r.day === todayName ? el('span', { class: 'badge warn', text: 'Malam ini' }) : null),
      el('strong', { text: r.group }),
      el('div', { class: 'day-meta', text: [r.post, r.time].filter(Boolean).join(' | ') }),
      el('div', { class: 'chips' }, r.members.map((m) => el('span', { class: 'chip', text: m }))),
      r.note ? el('p', { class: 'muted', text: r.note }) : null)));
  };

  pages.pengumuman = async () => {
    const list = await get('announcements');
    const state = { cat: '', q: '' };
    const cats = ['', ...new Set(list.map((a) => a.category))];
    const chips = $('#ann-chips');
    const draw = () => {
      chips.replaceChildren(...cats.map((c) => el('button', { type: 'button', class: `chip ${state.cat === c ? 'active' : ''}`, text: c || 'Semua', onclick: () => { state.cat = c; draw(); } })));
      const rows = list.filter((a) => (!state.cat || a.category === state.cat) && (!state.q || `${a.title} ${a.body}`.toLowerCase().includes(state.q)));
      $('#ann-list').replaceChildren(...(rows.length ? rows.map((a) => announcementCard(a, true)) : [emptyBox('Tidak ada pengumuman yang cocok.')]));
    };
    $('#ann-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); draw(); });
    draw();
  };

  pages.artikel = async () => {
    const list = await get('articles');
    const id = new URLSearchParams(location.search).get('id');
    const root = $('#art-root');
    if (id) {
      const a = list.find((x) => x.id === id);
      if (!a) return root.replaceChildren(failBox('Artikel tidak ditemukan.'), el('a', { class: 'btn', href: '/artikel', text: 'Kembali ke daftar artikel' }));
      document.title = `${a.title} | ${settings.rtName}`;
      const others = list.filter((x) => x.id !== id).slice(0, 3);
      return root.replaceChildren(...[
        el('article', { class: 'article-full' },
          el('a', { class: 'muted', href: '/artikel', text: '< Semua artikel' }),
          el('div', { class: 'item-meta mt-sm' }, el('span', { class: 'badge info', text: a.category }), el('span', { text: fmtDate(a.date) }), a.author ? el('span', { text: `oleh ${a.author}` }) : null),
          el('h1', { text: a.title }),
          a.image ? el('img', { class: 'cover', src: a.image, alt: '' }) : null,
          el('div', { class: 'item-body' }, bodyNodes(a.body)),
          el('div', { class: 'toolbar mt' }, el('button', { class: 'btn btn-ghost', type: 'button', text: 'Bagikan', onclick: async () => {
            const data = { title: a.title, url: location.href };
            if (navigator.share) { try { await navigator.share(data); } catch { /* cancelled */ } } else if (navigator.clipboard) { await navigator.clipboard.writeText(location.href); alert('Tautan disalin.'); }
          } }))),
        others.length ? el('div', { class: 'mt-lg' }, el('div', { class: 'section-title' }, el('h2', { text: 'Artikel lainnya' })), el('div', { class: 'grid grid-3' }, others.map(articleCard))) : null].filter(Boolean));
    }
    const state = { cat: '', q: '' };
    const cats = ['', ...new Set(list.map((a) => a.category))];
    const draw = () => {
      $('#art-chips').replaceChildren(...cats.map((c) => el('button', { type: 'button', class: `chip ${state.cat === c ? 'active' : ''}`, text: c || 'Semua', onclick: () => { state.cat = c; draw(); } })));
      const rows = list.filter((a) => (!state.cat || a.category === state.cat) && (!state.q || `${a.title} ${a.excerpt}`.toLowerCase().includes(state.q)));
      $('#art-list').replaceChildren(...(rows.length ? rows.map(articleCard) : [emptyBox('Belum ada artikel yang cocok.')]));
    };
    $('#art-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); draw(); });
    draw();
  };

  pages.agenda = async () => {
    const list = await get('agenda');
    const up = list.filter((a) => a.date >= todayStr);
    const past = list.filter((a) => a.date < todayStr).reverse();
    $('#agenda-upcoming').replaceChildren(...(up.length ? up.map(agendaCard) : [emptyBox('Belum ada agenda mendatang.')]));
    $('#agenda-past').replaceChildren(...past.map(agendaCard));
  };

  pages.iuran = async () => {
    const data = await get('dues');
    const input = $('#due-month');
    input.value = todayStr.slice(0, 7);
    const draw = () => {
      const month = input.value;
      if (!month) return;
      const paidCount = data.public ? (data.payments[month] || []).length : (data.counts[month] || 0);
      const pct = data.total ? Math.round((paidCount / data.total) * 100) : 0;
      $('#due-stats').replaceChildren(
        statCard(data.name, rp(data.amount), 'Per KK per bulan'),
        statCard('Sudah bayar', `${paidCount} dari ${data.total} KK`, `${pct}% (${monthLabel(month)})`, 'in'),
        statCard('Terkumpul', rp(paidCount * data.amount), `Belum: ${Math.max(0, data.total - paidCount)} KK`));
      const out = $('#due-list');
      if (!data.public) return out.replaceChildren(el('div', { class: 'notice info', text: 'Rincian per warga hanya dapat dilihat oleh pengurus. Hubungi bendahara untuk memastikan status iuran kamu.' }));
      const paid = new Set(data.payments[month] || []);
      out.replaceChildren(el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Kepala keluarga' }), el('th', { text: 'Blok' }), el('th', { text: 'Status' }))),
        el('tbody', {}, data.households.map((h) => el('tr', {}, el('td', { text: h.name }), el('td', { text: h.block }), el('td', {}, el('span', { class: `badge ${paid.has(h.id) ? 'ok' : 'bad'}`, text: paid.has(h.id) ? 'Lunas' : 'Belum' }))))))));
    };
    input.addEventListener('change', draw);
    draw();
  };

  pages.layanan = async () => {
    const [contacts, inventory] = await Promise.all([get('contacts'), get('inventory')]);
    const groups = ['Pengurus', 'Darurat', 'Layanan'];
    $('#contacts').replaceChildren(...groups.map((g) => el('div', { class: 'card' },
      el('h3', { class: 'item-title', text: g }),
      ...(contacts.filter((c) => c.group === g).map((c) => el('div', { class: 'contact' }, el('div', {}, el('b', { text: c.name }), el('small', { text: [c.role, c.phone].filter(Boolean).join(' | ') })), callBtn(c)))))));
    $('#inv-body').replaceChildren(...(inventory.length ? inventory.map((i) => el('tr', {}, el('td', { text: i.name }), el('td', { class: 'num', text: String(i.qty) }), el('td', {}, el('span', { class: `badge ${i.condition === 'Baik' ? 'ok' : i.condition === 'Rusak' ? 'bad' : 'warn'}`, text: i.condition })), el('td', { text: i.note }))) : [el('tr', {}, el('td', { colspan: 4, class: 'empty', text: 'Belum ada data inventaris.' }))]));

    // Letter generator: everything stays in the browser.
    const chair = contacts.find((c) => /ketua rt/i.test(c.role || ''));
    const city = (settings.area || '').split(',').pop().trim().replace(/^Kota |^Kabupaten /i, '') || '..........';
    const printBtn = $('#letter-print');
    $('#letter-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = (id) => $(`#${id}`).value.trim();
      const rows = [['Nama', v('l-name')], ['NIK', v('l-nik')], ['Tempat/Tgl. lahir', v('l-ttl')], ['Pekerjaan', v('l-job')], ['Alamat', v('l-addr') || settings.address || '']].filter((r) => r[1]);
      const [y, m, d] = parts(todayStr);
      $('#letter').replaceChildren(
        el('h3', { text: 'SURAT PENGANTAR' }), el('p', { class: 'center', text: 'Nomor: ............................' }),
        el('p', { text: `Yang bertanda tangan di bawah ini, Ketua ${settings.rtName}${settings.area ? `, ${settings.area}` : ''}, menerangkan bahwa:` }),
        el('table', {}, rows.map((r) => el('tr', {}, el('td', { text: r[0] }), el('td', { text: ':' }), el('td', { text: r[1] })))),
        el('p', { text: `Orang tersebut benar warga kami dan surat pengantar ini dibuat untuk keperluan: ${v('l-need')}.` }),
        el('p', { text: 'Demikian surat pengantar ini dibuat untuk dipergunakan sebagaimana mestinya.' }),
        el('div', { class: 'sign' }, el('div', { text: `${city}, ${d} ${MONTHS[m - 1]} ${y}` }), el('div', { text: `Ketua ${settings.rtName}` }), el('div', { class: 'space' }), el('strong', { text: chair ? chair.name : '(..............................)' })));
      printBtn.disabled = false;
    });
    printBtn.addEventListener('click', () => window.print());

    // Suggestion box
    $('#asp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = $('#asp-msg');
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        const res = await fetch('/api/public/aspirasi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('#a-name').value, message: $('#a-text').value, website: $('#a-web').value }) });
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || 'Gagal mengirim.');
        msg.replaceChildren(el('div', { class: 'notice ok', text: 'Terima kasih, aspirasi kamu sudah diterima pengurus.' }));
        e.target.reset();
      } catch (err) {
        msg.replaceChildren(el('div', { class: 'notice bad', text: err.message }));
      } finally {
        btn.disabled = false;
      }
    });
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  };

  /* ---------------------------------------------------------------- boot */
  async function boot() {
    initLayout();
    try {
      settings = await get('settings');
    } catch {
      settings = { rtName: 'RT / RW', openingBalance: 0 };
    }
    const run = pages[document.body.dataset.page];
    if (!run) return;
    try {
      await run();
    } catch (err) {
      console.error(err);
      const main = document.querySelector('main .container') || document.querySelector('main');
      if (main) main.prepend(failBox());
    }
  }
  boot();
})();
