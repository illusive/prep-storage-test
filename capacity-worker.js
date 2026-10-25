// Capacity test: writes a large file into OPFS in chunks until the target size
// is reached or the browser refuses, then reports how far it got.

const FILE = 'capacity-test.bin';
const CHUNK = 8 * 1024 * 1024; // 8 MB

async function write(targetMb) {
  const dir = await navigator.storage.getDirectory();
  const handle = await dir.getFileHandle(FILE, { create: true });
  const access = await handle.createSyncAccessHandle();
  const chunk = new Uint8Array(CHUNK);
  // Non-zero, varied content so nothing can be stored as a sparse or compressed file.
  for (let i = 0; i < chunk.length; i += 4096) crypto.getRandomValues(chunk.subarray(i, i + 4096));

  const target = targetMb * 1024 * 1024;
  let written = access.getSize();
  try {
    while (written < target) {
      const n = access.write(chunk, { at: written });
      if (n !== chunk.length) throw new Error(`Short write: ${n} of ${chunk.length} bytes`);
      written += n;
      if (written % (128 * 1024 * 1024) < CHUNK) {
        access.flush();
        self.postMessage({ type: 'progress', writtenMb: Math.round(written / 1048576) });
      }
    }
    access.flush();
    return { writtenMb: Math.round(written / 1048576), stoppedEarly: false };
  } catch (error) {
    return { writtenMb: Math.round(written / 1048576), stoppedEarly: true, error: String(error?.message ?? error) };
  } finally {
    access.close();
  }
}

async function remove() {
  const dir = await navigator.storage.getDirectory();
  await dir.removeEntry(FILE).catch(() => {});
  return { removed: true };
}

self.onmessage = async ({ data }) => {
  const result = data.type === 'write' ? await write(data.targetMb) : await remove();
  self.postMessage({ type: 'done', result });
};
