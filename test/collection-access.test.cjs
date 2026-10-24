const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { require: requireTs } = require('tsx/cjs/api');

const root = path.resolve(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'src/server/server.ts'), 'utf8');
const fixtures = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-collection-auth-'));
test.after(() => fs.rmSync(fixtures, { recursive: true, force: true }));
let fixtureNumber = 0;
function loadFactory(source) {
  const filename = path.join(fixtures, `${fixtureNumber++}.ts`);
  fs.writeFileSync(filename, `export function factory(resolveCollectionUser, verifyUserAuth, global) { ${source} }`);
  return requireTs(filename, __filename).factory;
}
const { resolveCollectionUser } = requireTs(path.join(root, 'src/server/collectionAccess.ts'), __filename);
const config = { 'admin.password': 'admin-fixture', 'user.enablePublicFavorites': true, 'user.enablePublicNonAdminAccess': true };
const verifyUserAuth = req => req.headers['x-user-token'] === 'alice-fixture' ? 'alice' : null;
const instantiate = factory => factory(resolveCollectionUser, verifyUserAuth, { lx: { config } });
function route(method) {
  const marker = `if (pathname === '/api/user/list' && req.method === '${method}')`;
  const start = serverSource.indexOf(marker);
  const end = serverSource.indexOf(method === 'GET' ? '// [新增] Update User List' : '// [新增] 用户 Library API', start);
  assert(start > 0 && end > start, 'Expected playlist route in server source');
  return instantiate(loadFactory(`return async function handle(req, res, getUserSpace, readBody) {
    const pathname = '/api/user/list'; const urlObj = new URL(req.url, 'http://localhost');
    ${serverSource.slice(start, end)}
  }`));
}
function response() { return { status: 200, writeHead(status) { this.status = status; }, end() {} }; }

test('private collection names require verified ownership or explicit administrator authorization', () => {
  for (const write of [false, true]) {
    assert.equal(resolveCollectionUser('victim', null, false, true, write), null);
    assert.equal(resolveCollectionUser('victim', 'other', false, true, write), null);
    assert.equal(resolveCollectionUser('victim', 'victim', false, false, write), 'victim');
    assert.equal(resolveCollectionUser('', 'victim', false, false, write), 'victim');
    assert.equal(resolveCollectionUser('victim', null, true, false, write), 'victim');
  }
});

test('public collection reads follow configuration and writes require administrator authorization', () => {
  assert.equal(resolveCollectionUser('_open', null, false, true, false), '_open');
  assert.equal(resolveCollectionUser('_open', 'user', false, true, true), null);
  assert.equal(resolveCollectionUser('', null, false, false, false), null);
  assert.equal(resolveCollectionUser('_open', null, true, false, false), null);
  assert.equal(resolveCollectionUser('_open', null, true, true, true), '_open');
  assert.equal(resolveCollectionUser('', null, false, true, true), null);
});

for (const method of ['GET', 'POST']) {
  test(`${method} playlist route rejects unverified names before storage access`, async () => {
    const handler = route(method);
    for (const [url, headers] of [
      ['/api/user/list?user=victim', {}],
      ['/api/user/list', { 'x-user-name': 'victim' }],
      ['/api/user/list?user=victim', { 'x-user-token': 'invalid' }],
      ['/api/user/list?user=victim', { 'x-user-token': 'alice-fixture' }],
    ]) {
      const res = response();
      await handler({ method, headers, url }, res,
        () => { throw new Error('Unauthorized storage access'); }, () => Promise.resolve('{}'));
      assert.equal(res.status, 401);
    }
    for (const [user, headers] of [['alice', { 'x-user-token': 'alice-fixture' }], ['victim', { 'x-frontend-auth': 'admin-fixture' }]]) {
      const calls = [];
      const getUserSpace = name => {
        calls.push(name);
        return { listManage: { getListData: async () => ({}),
          listDataManage: { restore: async () => calls.push('restore') },
          createSnapshot: async () => calls.push('snapshot') } };
      };
      const res = response();
      await handler({ method, headers, url: '/api/user/list?user=' + user }, res, getUserSpace, () => Promise.resolve('{}'));
      for (let i = 0; i < 8; i++) await Promise.resolve();
      assert.equal(res.status, 200); assert.equal(calls[0], user);
      if (method === 'POST') assert.deepEqual(calls, [user, 'restore', 'snapshot']);
    }
  });
}

test('library helper enforces private identity and public read/write policy', () => {
  const start = serverSource.indexOf('const getLibUsername =');
  const end = serverSource.indexOf('// GET /api/user/library/artists', start);
  assert(start > 0 && end > start, 'Expected library identity helper');
  const helper = instantiate(loadFactory(serverSource.slice(start, end) + '\nreturn getLibUsername;'));
  assert.equal(helper({ method: 'GET', url: '/api/user/library/artists?user=victim', headers: {} }), null);
  assert.equal(helper({ method: 'POST', url: '/api/user/library/artists?user=_open', headers: {} }), null);
  assert.equal(helper({ method: 'GET', url: '/api/user/library/artists?user=_open', headers: {} }), '_open');
  config['user.enablePublicFavorites'] = false;
  try {
    assert.equal(helper({ method: 'GET', url: '/api/user/library/artists?user=_open', headers: {} }), null);
  } finally { config['user.enablePublicFavorites'] = true; }
});
