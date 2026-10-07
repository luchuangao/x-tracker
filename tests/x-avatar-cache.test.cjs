const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '..', 'x-avatar-cache.js'), 'utf8');
const source = 'https://pbs.twimg.com/profile_images/123/avatar.jpg';
const prefix = 'xAvatar.v2.';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCrkAAAAASUVORK5CYII=', 'base64');
const data = 'data:image/png;base64,' + png.toString('base64');
function cache(store = {}, options = {}) {
  let requests = 0;
  const ctx = vm.createContext({ Date, URL, AbortSignal, Uint8Array, btoa, chrome: { storage: { local: {
    async get(key) { return key === null ? {...store} : { [key]: store[key] }; },
    async set(values) { if (options.quota) throw Error('quota'); Object.assign(store, values); },
    async remove(keys) { keys.forEach(key => delete store[key]); }
  } } }, fetch: async () => { requests++; if (options.offline) throw Error('offline'); return { ok: true, blob: async () => ({size: png.length, type: options.html ? 'text/html' : 'image/png'}) }; },
  createImageBitmap: async () => ({width: 200, height: 200, close() {}}),
  OffscreenCanvas: class { getContext() { return {drawImage() {}}; } async convertToBlob() { return {arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength)}; } }
  });
  vm.runInContext(code, ctx);
  return { api: ctx.xAvatarCache, requests: () => requests, store };
}
test('persists actual PNG bytes and reuses them after a worker restart with network offline', async () => {
  const first = cache();
  assert.equal(await first.api.resolve('@Someone', source), data);
  assert.equal(first.store[prefix+'someone'].data, data);
  assert.equal(first.requests(), 1);
  const restarted = cache(first.store, {offline: true});
  assert.equal(await restarted.api.resolve('SOMEONE', source), data);
  assert.equal(await restarted.api.resolve('someone', ''), data);
  assert.equal(restarted.requests(), 0);
});
test('failed avatar changes preserve the cached image and throttle repeated failures', async () => {
  const store = {[prefix+'someone']: {data, source, updatedAt: Date.now()}};
  const instance = cache(store, {offline: true});
  const changed = source.replace('123', '456');
  assert.equal(await instance.api.resolve('someone', changed), data);
  assert.equal(await instance.api.resolve('someone', changed), data);
  assert.equal(instance.requests(), 1);
  assert.equal(store[prefix+'someone'].source, source);
});
test('concurrent posts share one download and different users never share cache entries', async () => {
  const instance = cache();
  const results = await Promise.all([instance.api.resolve('someone', source), instance.api.resolve('someone', source)]);
  assert.deepEqual(results, [data, data]);
  assert.equal(instance.requests(), 1);
  assert.equal(await instance.api.resolve('other', ''), null);
});
test('invalid hosts, non-avatar URLs and invalid usernames cannot populate the cache', async () => {
  const instance = cache();
  assert.equal(await instance.api.resolve('someone', 'https://example.com/image.png'), null);
  assert.equal(await instance.api.resolve('someone', 'https://pbs.twimg.com/media/photo.png'), null);
  assert.equal(await instance.api.resolve('../bad', source), null);
  assert.equal(instance.requests(), 0);
});
test('HTML image responses are not saved; quota failures still allow current display', async () => {
  const invalid = cache({}, {html: true});
  assert.equal(await invalid.api.resolve('someone', source), null);
  assert.equal(Object.keys(invalid.store).length, 0);
  const full = cache({}, {quota: true});
  assert.equal(await full.api.resolve('someone', source), data);
});
test('cache stays bounded and preserves user settings even with identical timestamps', async () => {
  const store = {users: ['keep'], lang: 'zh'};
  for (let i = 0; i < 100; i++) store[prefix+'user'+i] = {data, source, updatedAt: Date.now()};
  const instance = cache(store);
  await instance.api.resolve('newuser', source);
  assert.equal(Object.keys(store).filter(key => key.startsWith(prefix)).length, 100);
  assert.ok(store[prefix+'newuser']);
  assert.deepEqual(store.users, ['keep']);
  assert.equal(store.lang, 'zh');
});

test('storage failures are reported and never marked as cached', async () => {
  const instance = cache({}, {quota: true});
  assert.equal(await instance.api.resolve('someone', source), data);
  const state = await instance.api.inspect('someone');
  assert.equal(state.saved, false);
  assert.match(state.error, /未存入本地/);
});
test('manually uploaded avatars are persisted and not replaced by remote defaults', async () => {
  const instance = cache();
  const result = await instance.api.importFile('someone', {type: 'image/png', size: png.length});
  assert.equal(result.saved, true);
  assert.equal(await instance.api.resolve('someone', source), data);
  assert.equal(instance.requests(), 0);
});

test('X default avatars on abs.twimg.com are supported', async () => {
  const instance = cache();
  assert.equal(await instance.api.resolve('someone', 'https://abs.twimg.com/sticky/default_profile_images/default_profile_400x400.png'), data);
  assert.equal((await instance.api.inspect('someone')).saved, true);
});


test('migration discards old automatic images and preserves manual avatars and settings', async () => {
  const store = {users: ['keep'], 'xAvatar.v1.auto': {data, source, updatedAt: Date.now()}, 'xAvatar.v1.manual': {data, source: '', updatedAt: Date.now()}};
  const instance = cache(store);
  assert.equal(await instance.api.resolve('auto', ''), null);
  assert.equal(await instance.api.resolve('manual', source), data);
  assert.equal(store[prefix+'manual'].origin, 'manual');
  assert.equal(Object.keys(store).some(key => key.startsWith('xAvatar.v1.')), false);
  assert.deepEqual(store.users, ['keep']);
  assert.equal(instance.requests(), 0);
});
