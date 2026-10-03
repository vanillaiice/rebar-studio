// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs
//
// Prints one page to PDF with the desktop app's renderer (electron/render.cjs), for the PDF
// fidelity check (test/fidelity.test.ts):
//
//   electron scripts/print-pdf.cjs request.json out.pdf
//
// request.json is what the app sends: {html, header, footer, margins, files: {name: base64}}.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRenderer } = require('../electron/render.cjs');

const [requestPath, outPath] = process.argv.slice(-2);
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'rebar-studio-print-')));
app.whenReady().then(async () => {
  const renderer = createRenderer();
  try {
    const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    const files = Object.fromEntries(Object.entries(request.files || {}).map(([name, b64]) => [name, Buffer.from(b64, 'base64')]));
    fs.writeFileSync(outPath, await renderer.renderPdf({ ...request, files }));
    renderer.destroy();
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
