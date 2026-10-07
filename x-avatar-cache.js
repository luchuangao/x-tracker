// Persist image bytes, not an expiring remote URL. Shared by worker and panel.
globalThis.xAvatarCache = (() => {
  const PREFIX = 'xAvatar.v2.';
  let migration;
  function migrate() {
    if (!migration) migration = (async () => {
      const all = await chrome.storage.local.get(null);
      const legacy = Object.keys(all).filter(name => name.startsWith('xAvatar.v1.'));
      const manual = {};
      for (const name of legacy) {
        const old = all[name], next = name.replace('xAvatar.v1.', PREFIX);
        if (!all[next] && old?.source === '' && validData(old.data)) manual[next] = {...old, origin: 'manual'};
      }
      if (Object.keys(manual).length) await chrome.storage.local.set(manual);
      if (legacy.length) await chrome.storage.local.remove(legacy);
    })().catch(error => { migration = null; throw error; });
    return migration;
  }
  const MAX_ENTRIES = 100, MAX_DATA_LENGTH = 65536;
  const REFRESH_MS = 7 * 86400000, RETRY_MS = 5 * 60000;
  const pending = new Map(), failures = new Map(), reports = new Map();
  let writes = Promise.resolve();
  function validData(value) {
    return typeof value === 'string' && value.length <= MAX_DATA_LENGTH && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
  }
  function sourceUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'https:' && ((url.hostname === 'pbs.twimg.com' && /^\/(profile_images|default_profile_images)\//.test(url.pathname)) || (url.hostname === 'abs.twimg.com' && /^\/sticky\/default_profile_images\//.test(url.pathname)))) return url.href;
    } catch (_) { /* Only X profile images can populate this cache. */ }
    return null;
  }
  function key(handle) {
    const normalized = String(handle || '').replace(/^@/, '').toLowerCase();
    return /^[A-Za-z0-9_]{1,15}$/.test(normalized) ? PREFIX + normalized : null;
  }
  async function get(cacheKey) {
    try {
      await migrate();
      const record = (await chrome.storage.local.get(cacheKey))[cacheKey];
      return validData(record?.data) ? record : null;
    } catch (_) { return null; }
  }
  async function download(source) {
    const response = await fetch(source, { credentials: 'omit', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Avatar download failed');
    const blob = await response.blob();
    if (blob.size > 2 * 1024 * 1024 || !blob.type.startsWith('image/')) throw Error('Invalid avatar response');
    const bitmap = await createImageBitmap(blob);
    try {
      if (!bitmap.width || !bitmap.height) throw Error('Invalid avatar dimensions');
      const size = Math.min(96, bitmap.width, bitmap.height);
      const canvas = new OffscreenCanvas(size, size);
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
      const png = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await png.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const data = 'data:image/png;base64,' + btoa(binary);
      if (!validData(data)) throw Error('Avatar exceeds cache size');
      return data;
    } finally { bitmap.close(); }
  }
  async function persist(cacheKey, record) {
    // Serialize writes/eviction in this context; unrelated storage is preserved.
    const job = writes.catch(() => {}).then(async () => {
      await chrome.storage.local.set({ [cacheKey]: record });
      const saved = (await chrome.storage.local.get(cacheKey))[cacheKey];
      if (saved?.data !== record.data) throw Error('写入后校验未通过');
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter(name => name.startsWith(PREFIX)).sort((a, b) => a === cacheKey ? -1 : b === cacheKey ? 1 : (all[b]?.updatedAt || 0) - (all[a]?.updatedAt || 0));
      const remove = keys.slice(MAX_ENTRIES).filter(name => name !== cacheKey);
      if (remove.length) await chrome.storage.local.remove(remove);
    });
    writes = job;
    await job;
  }
  async function resolve(handle, source) {
    const cacheKey = key(handle);
    if (!cacheKey) return null;
    const cached = await get(cacheKey);
    const url = sourceUrl(source);
    if (cached && cached.origin === 'manual') return cached.data;
    if (!url) return cached?.data || (validData(source) ? source : null);
    if (cached && cached.source === url && Date.now() - cached.updatedAt < REFRESH_MS) return cached.data;
    if ((failures.get(cacheKey) || 0) > Date.now()) return cached?.data || null;
    if (pending.has(cacheKey)) return pending.get(cacheKey);
    const request = (async () => {
      try {
        const data = await download(url);
        // Storage quota failures must not prevent displaying downloaded bytes.
        await saveData(handle, data, url);
        failures.delete(cacheKey);
        return data;
      } catch (error) {
        reports.set(cacheKey, { error: `头像下载失败：${error.message}` });
        failures.set(cacheKey, Date.now() + RETRY_MS);
        return cached?.data || null;
      }
    })();
    pending.set(cacheKey, request);
    try { return await request; } finally { pending.delete(cacheKey); }
  }
  async function saveData(handle, data, source = '', origin = 'account') {
    const cacheKey = key(handle);
    if (!cacheKey || !validData(data)) throw Error('头像数据格式不正确');
    try {
      await migrate();
      await persist(cacheKey, { data, source: sourceUrl(source) || '', origin, updatedAt: Date.now() });
      reports.delete(cacheKey);
      failures.delete(cacheKey);
      return { data, saved: true };
    } catch (error) {
      const result = { data, saved: false, error: `头像未存入本地：${error.message}` };
      reports.set(cacheKey, result);
      return result;
    }
  }
  async function inspect(handle) {
    const cacheKey = key(handle);
    const cached = cacheKey ? await get(cacheKey) : null;
    return { saved: !!cached, updatedAt: cached?.updatedAt || null, error: reports.get(cacheKey)?.error || null };
  }
  async function importFile(handle, file) {
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) throw Error('请选择小于 5 MB 的图片');
    const bitmap = await createImageBitmap(file);
    try {
      const size = Math.min(96, bitmap.width, bitmap.height);
      const canvas = new OffscreenCanvas(size, size);
      const side = Math.min(bitmap.width, bitmap.height);
      canvas.getContext('2d').drawImage(bitmap, (bitmap.width-side)/2, (bitmap.height-side)/2, side, side, 0, 0, size, size);
      const png = await canvas.convertToBlob({type: 'image/png'});
      let binary = '';
      for (const byte of new Uint8Array(await png.arrayBuffer())) binary += String.fromCharCode(byte);
      const result = await saveData(handle, 'data:image/png;base64,' + btoa(binary), '', 'manual');
      if (!result.saved) throw Error(result.error);
      return result;
    } finally { bitmap.close(); }
  }
  function onChange(callback) {
    const listener = (changes, area) => {
      if (area !== 'local') return;
      for (const [name, change] of Object.entries(changes)) {
        if (!name.startsWith(PREFIX)) continue;
        callback(name.slice(PREFIX.length), validData(change.newValue?.data) ? change.newValue.data : null);
      }
    };
    chrome.storage.onChanged?.addListener(listener);
    return () => chrome.storage.onChanged?.removeListener(listener);
  }
  return { resolve, validData, saveData, inspect, importFile, onChange };
})();
