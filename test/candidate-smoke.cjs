// Run against the built image with --network none and without production mounts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = process.env.LX_BUILT_SERVER_DIR || '/server/server/server';
const collectionAccess = require(root + '/collectionAccess.js');
const source = fs.readFileSync(root + '/server.js', 'utf8');
const config = { 'admin.password': 'fixture', 'user.enablePublicFavorites': true, 'user.enablePublicNonAdminAccess': true };
(async () => {
  for (const method of ['GET', 'POST']) {
    const start = source.indexOf(`if (pathname === '/api/user/list' && req.method === '${method}')`);
    const end = source.indexOf(method === 'GET' ? '// [新增] Update User List' : '// [新增] 用户 Library API', start);
    assert(start > 0 && end > start);
    let accesses = 0;
    const handler = vm.runInNewContext(`(async function(req,res) {
      const pathname='/api/user/list', urlObj=new URL(req.url,'http://localhost');
      ${source.slice(start, end)}
    })`, {
      URL, global: { lx: { config } }, collectionAccess_1: collectionAccess,
      exports: { verifyUserAuth: req => req.headers['x-user-token'] === 'alice' ? 'alice' : null },
      user_1: { getUserSpace: () => { accesses++; throw new Error('Unexpected private access'); } },
    });
    const res = { status: 200, writeHead(status) { this.status = status; }, end() {} };
    await handler({ method, headers: {}, url: '/api/user/list?user=victim' }, res);
    assert.equal(res.status, 401); assert.equal(accesses, 0);
  }
  assert.equal(collectionAccess.resolveCollectionUser('_open', null, false, true, false), '_open');
  assert.equal(collectionAccess.resolveCollectionUser('_open', null, false, true, true), null);
  console.log('Candidate compiled LX authorization checks: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
