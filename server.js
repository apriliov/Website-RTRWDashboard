'use strict';
const http = require('node:http');
require('./core/env').load();
const guard = require('./core/guard');
const LICENSE = require('./core/license');

// Licence check first: the site does not start when a protected file was changed.
guard.start();

const { handle } = require('./core/router');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('[SERVER]', err);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  RT/RW Dashboard is running');
  console.log(`  Website : http://localhost:${PORT}`);
  console.log(`  Admin   : http://localhost:${PORT}/admin`);
  console.log(`  ${LICENSE.LICENSE_NAME} - ${LICENSE.GITHUB}`);
  console.log('');
});
