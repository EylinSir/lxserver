const test = require('node:test');
const assert = require('node:assert/strict');
const { read, loadTs } = require('./helpers.cjs');
const { resolveCollectionUser } = loadTs('src/server/collectionAccess.ts');
const source = read('src/server/server.ts');
const config = { 'admin.password': 'admin-fixture', 'user.enablePublicFavorites': true, 'user.enablePublicNonAdminAccess': true };
const verifyUserAuth = req => req.headers['x-user-token'] === 'alice-fixture' ? 'alice' : null;

function route(method) {
  const marker = `if (pathname === '/api/user/list' && req.method === '${method}')`;
  const start = source.indexOf(marker);
  const end = source.indexOf(method === 'GET' ? '// [新增] Update User List' : '// [新增] 用户 Library API', start);
  return loadTs('src/server/server.ts', { $globals: { global: { lx: { config } }, resolveCollectionUser, verifyUserAuth } }, '',
    `export async function handle(req, res, getUserSpace, readBody) {
       const pathname = '/api/user/list'; const urlObj = new URL(req.url, 'http://localhost');
       ${source.slice(start, end)}
     }`).handle;
}
function response() { return { status: 200, writeHead(status) { this.status = status; }, end() {} }; }
for (const method of ['GET', 'POST']) {
  test(`${method} private playlist authorization guards actual storage access`, async () => {
    const handler = route(method);
    for (const headers of [{}, { 'x-user-name': 'victim' }, { 'x-user-token': 'invalid' }, { 'x-user-token': 'alice-fixture' }]) {
      const res = response();
      await handler({ method, headers, url: '/api/user/list?user=victim' }, res,
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
      assert.equal(res.status, 200);
      assert.equal(calls[0], user);
      if (method === 'POST') assert.deepEqual(calls, [user, 'restore', 'snapshot']);
    }
  });
}

test('actual library helper denies private names and public writes without admin', () => {
  const start = source.indexOf('const getLibUsername =');
  const end = source.indexOf('// GET /api/user/library/artists', start);
  const helper = loadTs('src/server/server.ts', { $globals: { global: { lx: { config } }, resolveCollectionUser, verifyUserAuth } }, '',
    source.slice(start, end) + '\nexport { getLibUsername };').getLibUsername;
  assert.equal(helper({ method: 'GET', url: '/api/user/library/artists?user=victim', headers: {} }), null);
  assert.equal(helper({ method: 'POST', url: '/api/user/library/artists?user=_open', headers: {} }), null);
  assert.equal(helper({ method: 'GET', url: '/api/user/library/artists?user=_open', headers: {} }), '_open');
});
