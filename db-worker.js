// Database worker: stores the knowledge pack in the Origin Private File System (OPFS)
// using SQLite's "opfs-sahpool" VFS, which needs no special server headers.

import sqlite3InitModule from './vendor/index.mjs';

let db;

async function init() {
  const sqlite3 = await sqlite3InitModule();
  const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'ok-pool' });
  const packInfo = await (await fetch('./pack/manifest.json')).json();
  const dbName = `/core-${packInfo.version}-${packInfo.sha256.slice(0, 12)}.db`;

  let importedNow = false;
  if (!pool.getFileNames().includes(dbName)) {
    const bytes = new Uint8Array(await (await fetch('./pack/core.sqlite')).arrayBuffer());
    pool.importDb(dbName, bytes);
    importedNow = true;
  }
  db = new pool.OpfsSAHPoolDb(dbName);
  const itemCount = db.selectValue('SELECT count(*) FROM storage_items');
  return { sqliteVersion: sqlite3.version.libVersion, dbName, importedNow, itemCount, files: pool.getFileNames() };
}

function search(query) {
  const started = performance.now();
  const rows = db.selectObjects(
    `SELECT DISTINCT i.id, i.name_da, i.name_en FROM storage_search s JOIN storage_items i ON i.id = s.item_id
     WHERE storage_search MATCH ?`,
    [`"${query.trim().replace(/"/g, '""')}"`],
  );
  return { rows, ms: Math.round((performance.now() - started) * 10) / 10 };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') self.postMessage({ id: data.id, ok: true, result: await init() });
    else if (data.type === 'search') self.postMessage({ id: data.id, ok: true, result: search(data.query) });
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: String(error?.message ?? error) });
  }
};
