// Storage test UI: reports environment, quota, persistence and pack status; runs search and capacity tests.

const $ = (id) => document.getElementById(id);
const mb = (bytes) => (bytes == null ? 'n/a' : `${(bytes / 1048576).toFixed(1)} MB`);
const gb = (bytes) => (bytes == null ? 'n/a' : `${(bytes / 1073741824).toFixed(2)} GB`);

function render(el, pairs) {
  el.replaceChildren(
    ...pairs.flatMap(([k, v, cls]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (cls) dd.className = cls;
      return [dt, dd];
    }),
  );
}

// --- Environment ---
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
render($('env'), [
  ['Opened from Home Screen', standalone ? 'yes' : 'no (open it from the Home Screen icon for the real test)', standalone ? 'good' : 'bad'],
  ['Online', navigator.onLine ? 'yes' : 'no'],
  ['Secure context', String(window.isSecureContext)],
  ['Service worker', 'serviceWorker' in navigator ? 'supported' : 'not supported'],
  ['OPFS', navigator.storage?.getDirectory ? 'supported' : 'not supported'],
  ['User agent', navigator.userAgent],
]);

// --- Offline caching ---
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch((e) => console.error(e));

// --- Storage numbers ---
async function refreshStorage() {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  render($('storage'), [
    ['Quota', `${gb(est.quota)} (${mb(est.quota)})`],
    ['Used', mb(est.usage)],
    ['Persistent', persisted === null ? 'API not available' : persisted ? 'yes (protected from automatic deletion)' : 'no', persisted ? 'good' : 'bad'],
  ]);
}
$('persist').onclick = async () => {
  const granted = navigator.storage?.persist ? await navigator.storage.persist() : null;
  alert(granted === null ? 'persist() not available' : granted ? 'Persistent storage granted' : 'Persistent storage NOT granted');
  refreshStorage();
};
$('refresh').onclick = refreshStorage;
refreshStorage();

// --- Persistence log ---
const now = new Date().toISOString();
const firstSeen = localStorage.getItem('ok-first-seen') ?? now;
localStorage.setItem('ok-first-seen', firstSeen);
const launches = JSON.parse(localStorage.getItem('ok-launches') ?? '[]');
launches.push({ at: now, standalone });
localStorage.setItem('ok-launches', JSON.stringify(launches.slice(-30)));

// --- Knowledge pack ---
const dbWorker = new Worker('./db-worker.js', { type: 'module' });
let nextId = 1;
const pending = new Map();
dbWorker.onmessage = ({ data }) => {
  const p = pending.get(data.id);
  pending.delete(data.id);
  data.ok ? p.resolve(data.result) : p.reject(new Error(data.error));
};
const call = (msg) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  dbWorker.postMessage({ ...msg, id });
});

call({ type: 'init' })
  .then((info) => {
    if (info.importedNow) localStorage.setItem('ok-pack-imported-at', now);
    render($('pack'), [
      ['Status', 'ready', 'good'],
      ['SQLite', info.sqliteVersion],
      ['Database', info.dbName],
      ['This launch', info.importedNow ? 'pack imported into OPFS now' : 'pack already in OPFS from an earlier launch', info.importedNow ? '' : 'good'],
      ['Foods in pack', String(info.itemCount)],
    ]);
    $('q').disabled = false;
    renderLog();
    refreshStorage();
  })
  .catch((e) => render($('pack'), [['Status', `failed: ${e.message}`, 'bad']]));

$('q').oninput = async (e) => {
  const q = e.target.value;
  if (q.trim().length < 3) return void ($('results').textContent = '');
  try {
    const { rows, ms } = await call({ type: 'search', query: q });
    const ul = document.createElement('ul');
    for (const r of rows) {
      const li = document.createElement('li');
      li.textContent = `${r.name_da} (${r.name_en})`;
      ul.append(li);
    }
    $('results').replaceChildren(`${rows.length} results in ${ms} ms`, ul);
  } catch (err) {
    $('results').textContent = `Search failed: ${err.message}`;
  }
};

function renderLog() {
  render($('log'), [
    ['First seen', localStorage.getItem('ok-first-seen')],
    ['Pack imported', localStorage.getItem('ok-pack-imported-at') ?? 'unknown'],
    ['Launches', `${launches.length} recorded`],
    ['Previous launch', launches.length > 1 ? launches[launches.length - 2].at : 'none'],
  ]);
}

// --- Capacity test ---
const capWorker = new Worker('./capacity-worker.js');
const capButtons = [...document.querySelectorAll('button[data-mb]'), $('delete')];
capWorker.onmessage = ({ data }) => {
  if (data.type === 'progress') render($('capacity'), [['Status', `writing… ${data.writtenMb} MB`]]);
  else {
    const r = data.result;
    render($('capacity'), r.removed
      ? [['Status', 'test file deleted']]
      : [
          ['Status', r.stoppedEarly ? 'stopped early' : 'completed', r.stoppedEarly ? 'bad' : 'good'],
          ['Written', `${r.writtenMb} MB`],
          ...(r.error ? [['Error', r.error, 'bad']] : []),
        ]);
    capButtons.forEach((b) => (b.disabled = false));
    refreshStorage();
  }
};
for (const b of document.querySelectorAll('button[data-mb]')) {
  b.onclick = () => {
    capButtons.forEach((x) => (x.disabled = true));
    render($('capacity'), [['Status', 'starting…']]);
    capWorker.postMessage({ type: 'write', targetMb: Number(b.dataset.mb) });
  };
}
$('delete').onclick = () => {
  capButtons.forEach((x) => (x.disabled = true));
  capWorker.postMessage({ type: 'delete' });
};
