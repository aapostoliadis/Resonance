const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const {test} = require('node:test');

test('Spotify seek forwards valid track identity and reports a stale target as a conflict',
 {skip:process.platform !== 'win32'},async t => {
 const trackKey = 'a'.repeat(64);
 const staleKey = 'b'.repeat(64);
 const helper = t.mock.method(childProcess,'execFile',(_shell,args,_options,callback) => {
  const action = args[args.indexOf('-Action') + 1];
  const index = args.indexOf('-ExpectedTrackKey');
  const target = index < 0 ? null : args[index + 1];
  const result = action === 'status' ? {available:true,trackKey} :
   target === staleKey ? {accepted:false,reason:'Spotify track changed'} : {accepted:true};
  callback(null,JSON.stringify(result));
 });
 const {startServer} = require('../server.cjs');
 const server = await startServer(0);
 t.after(() => new Promise(resolve => server.close(resolve)));
 const origin = 'http://127.0.0.1:' + server.address().port;
 const url = origin + '/api/spotify';
 const headers = {'X-Resonance-Player':'1'};
 const status = await (await fetch(url,{headers})).json();
 assert.equal(status.trackKey,trackKey);
 const post = key => fetch(url + '?' + new URLSearchParams({action:'seek',ms:'5000',...key}),{
  method:'POST',headers:{...headers,Origin:origin,'X-Resonance-Token':status.token}
 });
 assert.equal((await post({trackKey:'invalid'})).status,400);
 assert.equal(helper.mock.callCount(),1);
 assert.equal((await post({trackKey})).status,200);
 assert.deepEqual(helper.mock.calls.at(-1).arguments[1].slice(-2),['-ExpectedTrackKey',trackKey]);
 const stale = await post({trackKey:staleKey});
 assert.equal(stale.status,409);
 assert.equal((await stale.json()).reason,'Spotify track changed');
 assert.equal((await post({})).status,200);
 assert.equal(helper.mock.calls.at(-1).arguments[1].includes('-ExpectedTrackKey'),false);
});
