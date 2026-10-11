'use strict';
// Server side page assembly: every HTML page gets the shared navbar and the licence footer injected here.
// The footer can not be removed from a page: if it is missing from the final output the page is refused.
const fs = require('node:fs');
const path = require('node:path');
const LICENSE = require('./license');
const store = require('./store');

const ROOT = path.join(__dirname, '..');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function settings() {
  return store.readLocal('settings', {}) || {};
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in vars ? vars[k] : ''));
}

function page(file, { withNavbar = true } = {}) {
  const s = settings();
  const vars = {
    SITE: esc(s.rtName || 'RT / RW'),
    AREA: esc(s.area || ''),
    YEAR: esc(LICENSE.YEAR),
    GITHUB: esc(LICENSE.GITHUB),
    LICENSE_NAME: esc(LICENSE.LICENSE_NAME),
    OWNER: esc(LICENSE.OWNER),
  };
  const footer = fill(fs.readFileSync(path.join(__dirname, 'footer.html'), 'utf8'), vars);
  const navbar = withNavbar ? fill(fs.readFileSync(path.join(__dirname, 'navbar.html'), 'utf8'), vars) : '';
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace('<!--NAVBAR-->', navbar).replace('<!--FOOTER-->', footer).replace(/\{\{SITE\}\}/g, vars.SITE);
  if (!html.includes('data-license="apriliov"') || !html.includes(LICENSE.GITHUB)) return null;
  return html;
}

module.exports = { page, esc };
