const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const player = fs.readFileSync(path.join(__dirname,'../player.js'),'utf8');
const start = player.indexOf('function readSeekTarget()') >= 0
 ? player.indexOf('function readSeekTarget()')
 : player.indexOf('async function seekTo(');
const queueSource = player.slice(start,player.indexOf('function update()',start));

function deck() {
 const calls = [];
 const responses = [];
 const context = vm.createContext({
  applePlayback:{snapshot:() => null}, state:{source:'demo'}, musicProvider:'spotify',
  localTrack:null, appleCapture:false, appleTrack:null, edgeAppleTrack:null,
  edgeAppleTarget:null, edgeAppleSampledAt:0, session:null, sampledAt:0, performance,
  pendingSeek:null, seekDraining:false, seekTarget:null, dragging:false, remaining:false,
  seek:{value:0}, time:{}, formatTime:String, refreshControls(){}, feedback:{textContent:''},
  async command(action,position,request) {
   calls.push({action,position,key:request?.target.spotifyKey ?? context.session?.trackKey});
   await new Promise(resolve => responses.push(resolve));
  }
 });
 vm.runInContext(queueSource,context);
 const track = (key,positionMs = 2000,playing = false) => {
  context.session = {available:true,trackKey:key,positionMs,durationMs:90000,playing,supported:{seek:true}};
  context.sampledAt = performance.now();
  context.syncSeekTarget?.();
  context.renderSeek();
 };
 const waitFor = async count => {
  for(let attempt = 0; attempt < 10 && responses.length < count; attempt++) await Promise.resolve();
  assert.equal(responses.length,count);
 };
 return {context,calls,responses,track,waitFor};
}

test('a queued seek never follows the next Spotify track',async () => {
 const {context,calls,responses,track} = deck();
 track('A');
 const first = context.seekTo(10000);
 await context.seekTo(20000);
 assert.equal(context.seek.value,20000);
 track('B');
 const redDispatch = () => { if (responses[1]) responses[1](); };
 responses[0]();
 if (!context.syncSeekTarget) {
  await new Promise(resolve => setImmediate(resolve));
  redDispatch();
 }
 await first;
 assert.deepEqual(calls.map(call => [call.key,call.position]),[['A',10000]]);
 assert.equal(context.seek.value,2000);
});

test('seeks coalesce on the same track even as position and play state change',async () => {
 const {context,calls,responses,track,waitFor} = deck();
 track('A');
 const first = context.seekTo(10000);
 await context.seekTo(20000);
 await context.seekTo(30000);
 track('A',4000,true);
 assert.equal(context.seek.value,30000);
 responses[0]();
 await waitFor(2);
 responses[1]();
 await first;
 assert.deepEqual(calls.map(call => [call.key,call.position]),[['A',10000],['A',30000]]);
});

test('source changes invalidate old intent and preserve a newer seek',async () => {
 const {context,calls,responses,track,waitFor} = deck();
 track('A');
 const first = context.seekTo(10000);
 await context.seekTo(20000);
 context.state.source = 'shared';
 context.musicProvider = 'apple';
 context.syncSeekTarget();
 assert.equal(context.pendingSeek,null);
 context.state.source = 'demo';
 track('A');
 await context.seekTo(30000);
 responses[0]();
 await waitFor(2);
 assert.equal(context.seek.value,30000);
 responses[1]();
 await first;
 assert.deepEqual(calls.map(call => [call.key,call.position]),[['A',10000],['A',30000]]);
});
