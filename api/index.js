'use strict';
// Vercel entry point: every request is rewritten here (see vercel.json) and handled by the same router as server.js.
require('../core/env').load();
const guard = require('../core/guard');

// Licence check first, exactly like server.js.
guard.start();

const { handle } = require('../core/router');

module.exports = (req, res) => {
  handle(req, res).catch((err) => {
    console.error('[VERCEL]', err);
    if (!res.headersSent) res.statusCode = 500;
    res.end('Server error');
  });
};
