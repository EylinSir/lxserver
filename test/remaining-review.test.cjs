const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { read, loadTs, quiet } = require('./helpers.cjs');
const app = read('public/music/app.js');
function fn(name) {
    const start = app.indexOf('async function ' + name + '(');
    return app.slice(start, app.indexOf('\n}', start) + 2);
}
const storage = initial => {
    const saved = new Map(Object.entries(initial));
    return { getItem: key => saved.get(key), setItem: (key,value) => saved.set(key,value), removeItem: key => saved.delete(key) };
};

for (const mode of ['row', 'grid']) {
    test(`playlist ${mode} metadata and click arguments cannot inject HTML or script`, () => {
        const source = read('public/music/js/songlist_manager.js');
        const payload = '<img src=x onerror=alert(1)>';
        const id = `x'); alert('injected'); ('`, sourceId = `bad'"<source>`;
        const container = { innerHTML: '' };
        const context = { document: { getElementById: () => container }, window: {}, updateViewModeUI() {},
            SOURCE_LABELS: {}, formatPlayCount: value => value,
            currentState: { viewMode: mode, source: sourceId, list: [{ id, source: sourceId, name: payload,
                author: payload, total: payload, play_count: payload, time: payload }] } };
        const constants = source.slice(source.indexOf('    const API_BASE'),source.indexOf('    let currentState'));
        vm.runInNewContext(constants + source.slice(source.indexOf('    function renderList()'),source.indexOf('    function renderSortTabs()'))+'renderList();',context);
        assert.equal(container.innerHTML.includes(payload),false);
        assert.ok(container.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
        assert.equal(container.innerHTML.includes('<source>'),false);
        const click = container.innerHTML.match(/onclick="([^"]+)"/)[1]
            .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
        let selected;
        vm.runInNewContext(click,{window:{SongListManager:{openDetail:(...args)=>{selected=args;}}},alert:()=>assert.fail('injected script executed')});
        assert.deepEqual(selected,[id,sourceId]);
    });
}

test('Cast owner ignores forged or expired cookies while retaining valid session and token identity', () => {
    const source=read('src/server/server.ts');
    const fragment=source.slice(source.indexOf('const handleCastRequest = createCastHandler'),source.indexOf('const handleStartServer ='));
    const now=Date.now(),sessions=new Map([['guest',{createdAt:now,user:null}],['account',{createdAt:now,user:'listener'}],['expired',{createdAt:0,user:'listener'}]]);
    const {handle}=loadTs('src/server/server.ts',{$globals:{createCastHandler:fn=>fn,
        global:{lx:{config:{'player.enableAuth':false,'user.enablePublicRestriction':false}}},
        verifyUserAuth:req=>req.headers['x-user-token']==='valid'?'token-owner':null,
        parseCookies:raw=>({lx_player_session:raw?.split('=')[1]}),checkPlayerAuth:()=>true,
        playerSessions:sessions,SESSION_COOKIE_NAME:'lx_player_session',SESSION_TTL:60000,
    }},'\nexports.handle=handleCastRequest;',fragment);
    const owner=(cookie,token)=>handle({headers:{cookie:'lx_player_session='+cookie,...(token?{'x-user-token':token}:{})},socket:{}})?.owner;
    for(const cookie of ['forged-a','forged-b','expired',''])assert.equal(owner(cookie),'public');
    assert.equal(owner('guest'),'guest');assert.equal(owner('account'),'listener');assert.equal(owner('guest','valid'),'token-owner');
});

for(const existing of [null,'other-user','expired']) {
    test(`Token verification binds the native session when prior owner is ${existing}`,()=>{
        const source=read('src/server/server.ts');
        const start=source.indexOf("      if (pathname === '/api/music/auth/verify' && req.method === 'GET')");
        const end=source.indexOf('// [新增] 音乐搜索 API',start);
        const sessions=new Map([['old',{createdAt:existing==='expired'?0:Date.now(),user:existing}]]);
        const {handle}=loadTs('src/server/server.ts',{$globals:{
            verifyUserAuth:()=> 'listener',checkPlayerAuth:()=>true,parseCookies:()=>({lx_player_session:'old'}),
            playerSessions:sessions,SESSION_TTL:60000,SESSION_COOKIE_NAME:'lx_player_session',
            generateSessionId:()=> 'new',buildSessionCookieHeader:(_,id)=>'lx_player_session='+id,
        }},'',"exports.handle=(req,res)=>{const pathname='/api/music/auth/verify';"+source.slice(start,end)+'};');
        let body,headers;handle({method:'GET',headers:{'x-user-token':'valid'}},{writeHead:(_,h)=>{headers=h;},end:raw=>{body=JSON.parse(raw);}});
        assert.equal(body.user,'listener');assert.equal(body.valid,true);assert.equal(headers['Set-Cookie'],'lx_player_session=new');
        assert.equal(sessions.get('new').user,'listener');
    });
}

test('existing Token fast path binds the native account cookie before returning',async()=>{
    const saved=storage({lx_sync_user:'listener',lx_user_token:'valid'}),requests=[];
    const context={userToken:'valid',AbortSignal,localStorage:saved,
        fetch:async(url,opts)=>{requests.push(opts);return{ok:true,json:async()=>({valid:true,user:'listener'})};}};
    vm.runInNewContext(fn('ensureUserAuthToken'),context);
    assert.equal(await context.ensureUserAuthToken(),true);assert.equal(requests.length,1);assert.equal(requests[0].headers['x-user-token'],'valid');
});

test('a valid guest cookie is repaired before retrying account-native playback',async()=>{
    const saved=storage({lx_sync_user:'listener',lx_user_token:'valid'}),requests=[];
    const context={userToken:'valid',AbortSignal,localStorage:saved,isUserLoggedIn:()=>true,
        fetch:async(url,opts)=>{requests.push(opts);return{ok:true,json:async()=>({valid:true,user:opts.headers?'listener':null})};}};
    vm.runInNewContext(fn('restorePlaybackSession'),context);
    assert.equal(await context.restorePlaybackSession(),true);assert.equal(requests.length,2);
});

test('local Token login establishes matching native identity before loading library media',async()=>{
    const requests=[],saved=storage({lx_sync_user:'listener',lx_user_token:'valid'});let bound=false;
    const context={userToken:'valid',document:{getElementById:()=>null},localStorage:saved,window:{ListStore:{set:async()=>{}}},settings:{},console:quiet,
        syncManager:{initLocal(){},client:{login:async()=>true},sync:async()=>({})},setSyncStatusHTML(){},updateSyncStatus(){},renderMyLists(){},updateUserUI(){},showError:s=>assert.fail(s),
        loadLibraryData:()=>assert.equal(bound,true),fetch:async(url,opts)=>{requests.push(url);bound=true;return{ok:true,json:async()=>({valid:true,user:'listener'})};}};
    vm.runInNewContext(fn('handleLocalLogin'),context);await context.handleLocalLogin();
    assert.equal(requests[0],'/api/music/auth/verify');assert.equal(bound,true);
});
