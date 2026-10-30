// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 hblabs

// Signing a Windows installer after electron-builder made it changes its bytes, so the block map next
// to it and the sha512 and size the update files record (latest.yml, beta.yml) no longer match, and
// electron-updater would refuse the download. This rebuilds both from the files as they are now.
//
//   node scripts/refresh-update-info.mjs release
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { buildBlockMap } = require('app-builder-lib/out/targets/blockmap/blockmap.js');
const yaml = createRequire(require.resolve('app-builder-lib/package.json'))('js-yaml');

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/refresh-update-info.mjs <release dir>');
  process.exit(2);
}

const names = await readdir(dir);
// The update files name each installer as it is uploaded: GitHub refuses spaces, so electron-builder
// turns them into dashes.
const onDisk = new Map(names.map((name) => [name.replace(/ /g, '-'), name]));
const updateFiles = names.filter((name) => /\.ya?ml$/.test(name) && !/^builder-|-linux|-mac/.test(name));
if (updateFiles.length === 0) throw new Error(`no update files in ${dir}`);

const refreshed = new Map();
async function refresh(url) {
  if (!refreshed.has(url)) {
    const name = onDisk.get(url);
    if (!name) throw new Error(`${url} is listed in an update file but is not in ${dir}`);
    const file = path.join(dir, name);
    const info = names.includes(`${name}.blockmap`)
      ? await buildBlockMap(file, 'gzip', `${file}.blockmap`)
      : { sha512: await sha512(file), size: (await stat(file)).size };
    refreshed.set(url, info);
    console.log(`${name}: ${info.size} bytes, sha512 ${info.sha512.slice(0, 16)}…`);
  }
  return refreshed.get(url);
}

for (const updateFile of updateFiles) {
  const file = path.join(dir, updateFile);
  const info = yaml.load(await readFile(file, 'utf8'));
  for (const entry of info.files) Object.assign(entry, pick(await refresh(entry.url)));
  if (info.path) info.sha512 = (await refresh(info.path)).sha512;
  await writeFile(file, yaml.dump(info, { lineWidth: 8000 }));
  console.log(`${updateFile}: updated`);
}

function pick({ sha512, size }) {
  return { sha512, size };
}

async function sha512(file) {
  return createHash('sha512').update(await readFile(file)).digest('base64');
}
