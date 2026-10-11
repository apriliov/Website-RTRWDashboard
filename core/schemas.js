'use strict';
// One place that describes every collection: used for validation on the server and to build the admin forms.
const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const pairs = (list) => list.map((x) => [x, x]);

class ValidationError extends Error {}

const SCHEMAS = {
  transactions: {
    label: 'Keuangan',
    singular: 'Transaksi',
    columns: ['date', 'type', 'category', 'description', 'amount'],
    sort: (a, b) => String(b.date).localeCompare(String(a.date)),
    fields: {
      date: { type: 'date', label: 'Tanggal', required: true },
      type: { type: 'select', label: 'Jenis', required: true, options: [['in', 'Pemasukan'], ['out', 'Pengeluaran']] },
      category: { type: 'text', label: 'Kategori', required: true, max: 40, placeholder: 'Iuran, Kebersihan, Keamanan, Sosial...' },
      description: { type: 'text', label: 'Keterangan', required: true, max: 160 },
      amount: { type: 'number', label: 'Jumlah (Rp)', required: true, min: 1, format: 'rp' },
    },
  },
  ronda: {
    label: 'Jadwal Ronda',
    singular: 'Jadwal ronda',
    columns: ['day', 'group', 'members', 'post', 'time'],
    sort: (a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day),
    fields: {
      day: { type: 'select', label: 'Hari', required: true, options: pairs(DAYS) },
      group: { type: 'text', label: 'Nama kelompok', required: true, max: 40, placeholder: 'Kelompok A' },
      members: { type: 'list', label: 'Anggota (satu nama per baris)', required: true },
      post: { type: 'text', label: 'Pos jaga', max: 60, placeholder: 'Pos Utama' },
      time: { type: 'text', label: 'Jam', max: 30, placeholder: '22:00 - 04:00' },
      note: { type: 'text', label: 'Catatan', max: 160 },
    },
  },
  announcements: {
    label: 'Pengumuman',
    singular: 'Pengumuman',
    columns: ['title', 'category', 'date', 'pinned'],
    sort: (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || String(b.date).localeCompare(String(a.date)),
    fields: {
      title: { type: 'text', label: 'Judul', required: true, max: 120 },
      category: { type: 'select', label: 'Kategori', required: true, options: pairs(['Umum', 'Penting', 'Kegiatan', 'Kebersihan', 'Keamanan']) },
      date: { type: 'date', label: 'Tanggal', required: true },
      pinned: { type: 'checkbox', label: 'Sematkan di atas' },
      body: { type: 'textarea', label: 'Isi pengumuman', required: true, max: 5000 },
      image: { type: 'image', label: 'Gambar (opsional)' },
    },
  },
  articles: {
    label: 'Artikel',
    singular: 'Artikel',
    columns: ['title', 'category', 'author', 'date'],
    sort: (a, b) => String(b.date).localeCompare(String(a.date)),
    fields: {
      title: { type: 'text', label: 'Judul', required: true, max: 140 },
      category: { type: 'select', label: 'Kategori', required: true, options: pairs(['Lingkungan', 'Keamanan', 'Kesehatan', 'Tips', 'Info Warga']) },
      author: { type: 'text', label: 'Penulis', max: 60 },
      date: { type: 'date', label: 'Tanggal', required: true },
      excerpt: { type: 'text', label: 'Ringkasan singkat', required: true, max: 220 },
      body: { type: 'textarea', label: 'Isi artikel (pisahkan paragraf dengan baris kosong, awali ## untuk subjudul)', required: true, max: 20000 },
      image: { type: 'image', label: 'Gambar sampul (opsional)' },
    },
  },
  agenda: {
    label: 'Agenda',
    singular: 'Agenda',
    columns: ['title', 'date', 'time', 'place'],
    sort: (a, b) => String(a.date).localeCompare(String(b.date)),
    fields: {
      title: { type: 'text', label: 'Nama kegiatan', required: true, max: 120 },
      date: { type: 'date', label: 'Tanggal', required: true },
      time: { type: 'time', label: 'Jam' },
      place: { type: 'text', label: 'Tempat', max: 100 },
      description: { type: 'textarea', label: 'Keterangan', max: 600 },
    },
  },
  contacts: {
    label: 'Kontak',
    singular: 'Kontak',
    columns: ['name', 'role', 'phone', 'group'],
    sort: (a, b) => ['Pengurus', 'Darurat', 'Layanan'].indexOf(a.group) - ['Pengurus', 'Darurat', 'Layanan'].indexOf(b.group),
    fields: {
      name: { type: 'text', label: 'Nama', required: true, max: 80 },
      role: { type: 'text', label: 'Jabatan / keterangan', max: 80, placeholder: 'Ketua RT, Puskesmas, Damkar...' },
      phone: { type: 'text', label: 'Nomor telepon / WhatsApp', max: 25, placeholder: '081234567890' },
      group: { type: 'select', label: 'Kelompok', required: true, options: [['Pengurus', 'Pengurus'], ['Darurat', 'Darurat'], ['Layanan', 'Layanan']] },
    },
  },
  inventory: {
    label: 'Inventaris',
    singular: 'Barang',
    columns: ['name', 'qty', 'condition', 'note'],
    fields: {
      name: { type: 'text', label: 'Nama barang', required: true, max: 80 },
      qty: { type: 'number', label: 'Jumlah', required: true, min: 0 },
      condition: { type: 'select', label: 'Kondisi', required: true, options: pairs(['Baik', 'Cukup', 'Rusak']) },
      note: { type: 'text', label: 'Catatan / cara pinjam', max: 160 },
    },
  },
  households: {
    label: 'Data KK',
    singular: 'Kepala keluarga',
    columns: ['name', 'block'],
    sort: (a, b) => String(a.block).localeCompare(String(b.block), 'id', { numeric: true }) || String(a.name).localeCompare(String(b.name)),
    fields: {
      name: { type: 'text', label: 'Nama kepala keluarga', required: true, max: 80 },
      block: { type: 'text', label: 'Blok / nomor rumah', required: true, max: 30, placeholder: 'A-01' },
    },
  },
  complaints: {
    label: 'Aspirasi',
    singular: 'Aspirasi',
    columns: ['createdAt', 'name', 'message', 'status'],
    sort: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    noCreate: true,
    fields: {
      createdAt: { type: 'text', label: 'Dikirim', readonly: true },
      name: { type: 'text', label: 'Pengirim', readonly: true },
      message: { type: 'textarea', label: 'Pesan', readonly: true },
      status: { type: 'select', label: 'Status', required: true, options: [['baru', 'Baru'], ['diproses', 'Diproses'], ['selesai', 'Selesai']] },
      note: { type: 'textarea', label: 'Catatan pengurus (tampil hanya untuk admin)', max: 600 },
    },
  },
};

const SETTINGS_FIELDS = {
  rtName: { type: 'text', label: 'Nama RT / RW', required: true, max: 60, placeholder: 'RT 05 / RW 03' },
  area: { type: 'text', label: 'Kelurahan, kecamatan, kota', max: 120 },
  address: { type: 'text', label: 'Alamat sekretariat / pos', max: 160 },
  tagline: { type: 'text', label: 'Slogan di halaman depan', max: 160 },
  openingBalance: { type: 'number', label: 'Saldo awal kas (Rp)', required: true, min: -1000000000, format: 'rp' },
  duesName: { type: 'text', label: 'Nama iuran bulanan', required: true, max: 60 },
  duesAmount: { type: 'number', label: 'Nominal iuran per KK (Rp)', required: true, min: 0, format: 'rp' },
  publicDues: { type: 'checkbox', label: 'Tampilkan status iuran per warga di halaman publik' },
  whatsapp: { type: 'text', label: 'WhatsApp pengurus (untuk tombol hubungi)', max: 25, placeholder: '6281234567890' },
};

function fail(label, msg) {
  throw new ValidationError(`${label}: ${msg}`);
}

function cleanValue(def, raw) {
  const label = def.label.replace(/\s*\(.*\)\s*$/, '');
  switch (def.type) {
    case 'text': {
      const s = String(raw ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, def.max || 120);
      if (def.required && !s) fail(label, 'wajib diisi');
      return s;
    }
    case 'textarea': {
      const s = String(raw ?? '').replace(/\r\n?/g, '\n').trim().slice(0, def.max || 5000);
      if (def.required && !s) fail(label, 'wajib diisi');
      return s;
    }
    case 'number': {
      if (raw === '' || raw === null || raw === undefined) fail(label, 'wajib diisi');
      const n = Number(raw);
      if (!Number.isFinite(n)) fail(label, 'harus berupa angka');
      if (def.min !== undefined && n < def.min) fail(label, `minimal ${def.min}`);
      if (Math.abs(n) > 1e12) fail(label, 'terlalu besar');
      return Math.round(n * 100) / 100;
    }
    case 'date': {
      const s = String(raw ?? '').trim();
      if (!s && !def.required) return '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) fail(label, 'tanggal tidak valid');
      return s;
    }
    case 'time': {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) fail(label, 'jam tidak valid');
      return s;
    }
    case 'select': {
      const s = String(raw ?? '');
      if (!def.options.some(([v]) => v === s)) fail(label, 'pilihan tidak valid');
      return s;
    }
    case 'checkbox':
      return raw === true || raw === 'true' || raw === 'on' || raw === 1;
    case 'list': {
      const arr = Array.isArray(raw) ? raw : String(raw ?? '').split(/[\n,]+/);
      const out = arr.map((x) => String(x).trim().slice(0, 60)).filter(Boolean).slice(0, 30);
      if (def.required && !out.length) fail(label, 'minimal satu isian');
      return out;
    }
    case 'image': {
      const s = String(raw ?? '').trim();
      if (!s) return '';
      if (s.length > 500 || !(/^\/uploads\/[a-f0-9]+\.(jpg|png|webp|gif)$/.test(s) || /^https?:\/\/[^\s"'<>]+$/i.test(s))) fail(label, 'alamat gambar tidak valid');
      return s;
    }
    default:
      return raw;
  }
}

// Validates a body against a field map. Read-only fields keep their old value.
function clean(fields, body, existing = {}) {
  const out = {};
  for (const [key, def] of Object.entries(fields)) {
    if (def.readonly) {
      if (existing[key] !== undefined) out[key] = existing[key];
      continue;
    }
    out[key] = cleanValue(def, body ? body[key] : undefined);
  }
  return out;
}

module.exports = { SCHEMAS, SETTINGS_FIELDS, DAYS, ValidationError, clean };
