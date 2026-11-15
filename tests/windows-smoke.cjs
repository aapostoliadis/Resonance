const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const fs = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {setTimeout: delay} = require('node:timers/promises');
const {sineWav} = require('./fixtures/wav.cjs');

async function until(label,probe,timeout = 10000) {
 const end = Date.now() + timeout;
 do {
  const result = await probe();
  if (result) return result;
  await delay(100);
 } while (Date.now() < end);
 throw new Error('Timed out waiting for '+label);
}

async function freePort() {
 const server = net.createServer().listen(0,'127.0.0.1');
 await once(server,'listening');
 const {port} = server.address();
 await new Promise(resolve => server.close(resolve));
 return port;
}

async function devTools(port) {
 const target = await until('the Resonance window (close any other Resonance instance before the smoke test)',async () => {
  try {
   const pages = await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1000)})).json();
   return pages.find(page => page.type === 'page' && /^http:\/\/127\.0\.0\.1:\d+\/\?desktop=1$/.test(page.url));
  } catch { return null; }
 },50000);
 const ws = new WebSocket(target.webSocketDebuggerUrl);
 await once(ws,'open',{signal:AbortSignal.timeout(3000)});
 const pending = new Map();
 const exceptions = [];
 let serial = 0;
 ws.addEventListener('message',event => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  clearTimeout(request.timer);
  if (message.error) request.reject(new Error(message.error.message));
  else request.resolve(message.result);
 });
 function send(method,params = {}) {
  return new Promise((resolve,reject) => {
   const id = ++serial;
   const timer = setTimeout(() => {
    pending.delete(id);
    reject(new Error('DevTools did not respond to '+method));
   },4000);
   pending.set(id,{resolve,reject,timer});
   ws.send(JSON.stringify({id,method,params}));
  });
 }
 async function evaluate(expression) {
  const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
 }
 async function click(selector) {
  const point = await until(selector,() => evaluate(`(() => {
   const node = document.querySelector(${JSON.stringify(selector)});
   if (!node) return null;
   const {x,y,width,height} = node.getBoundingClientRect();
   const point = {x:x+width/2,y:y+height/2};
   return width && height && node.contains(document.elementFromPoint(point.x,point.y)) && point;
  })()`));
  for (const type of ['mousePressed','mouseReleased']) {
   await send('Input.dispatchMouseEvent',{type,...point,button:'left',clickCount:1});
  }
 }
 await send('Runtime.enable');
 return {send,evaluate,click,exceptions,close:() => ws.close()};
}

async function checkLocal({evaluate,click}) {
 const media = () => evaluate(`({
  title:document.getElementById('player-track').textContent,
  duration:localTrack?.audio.duration, position:localTrack?.audio.currentTime,
  paused:localTrack?.audio.paused, signal:state.level
 })`);
 await until('compact deck',() => evaluate(`!!window.resonanceDeck && !document.fullscreenElement &&
  !document.getElementById('visual').getClientRects().length &&
  !document.body.classList.contains('settings-open') &&
  document.querySelector('.retro-player').getClientRects().length > 0`));
 const menuPlacement = await evaluate(`(async () => {
  const menus = [...document.querySelectorAll('.retro-dropdown')];
  const menuBar = document.querySelector('.retro-menu');
  const result = [];
  for (const menu of menus) {
   menu.querySelector('summary').click();
   // Check before the native toggle event gets its own task.
   await Promise.resolve();
   const popup = menu.querySelector('.retro-popup').getBoundingClientRect();
   result.push(menu.open && menus.filter(item => item.open).length === 1 &&
    popup.top >= menuBar.getBoundingClientRect().bottom && popup.bottom <= innerHeight + 1);
  }
  menus.at(-1).querySelector('summary').click();
  return result;
 })()`);
 assert.deepEqual(menuPlacement, Array(7).fill(true), 'every menu opens below the compact deck menu bar before the first paint');
 console.log('PASS all seven dropdowns positioned before the first paint');
 const missing = await evaluate(`Promise.all([...document.querySelectorAll('script[src],link[rel="stylesheet"]')]
  .map(node => node.src || node.href).filter(url => new URL(url).origin === location.origin)
  .map(async url => (await fetch(url)).ok ? null : url)).then(results => results.filter(Boolean))`);
 assert.deepEqual(missing,[]);
 await until('local WAV title, duration and positive analyser level',async () => {
  const {title,duration,signal} = await media();
  return title === 'Resonance smoke.wav' && Math.abs(duration-12) < .02 && signal > .002;
 });
 await click('.retro-transport [data-player-command="pause"]');
 await until('local pause',async () => (await media()).paused);
 await evaluate(`(() => {
  const slider = document.getElementById('player-seek');
  slider.value = '5200';
  slider.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await until('local seek to 5.2 seconds',async () => Math.abs((await media()).position-5.2) < .05);
 await click('.retro-transport [data-player-command="play"]');
 await until('analyser after seeking',async () => {
  const {position,signal} = await media();
  return position > 5.25 && signal > .002;
 });
 await click('#player-visualize');
 await until('full-screen VIS with settings open',() => evaluate(`Boolean(document.fullscreenElement) &&
  document.body.classList.contains('settings-open') &&
  [...document.querySelectorAll('#visual,#visual-3d')].some(el => el.getClientRects().length) &&
  document.getElementById('visual-settings').getClientRects().length > 0`));
 console.log('PASS compact launch, runtime assets, local WAV, seek, analyser, fullscreen VIS and Settings');
}

function simulateSpotify() {
 const load = window.fetch.bind(window);
 const state = window.seekTest = {key:'a'.repeat(64),pos:2000,posts:[],release:null,rejectNext:false};
 window.fetch = async (url,options) => {
  if (!String(url).startsWith('/api/spotify')) return load(url,options);
  if (options?.method !== 'POST') return Response.json({
   available:true,title:state.key[0] === 'a' ? 'Track A' : 'Track B', token:'test',trackKey:state.key,
   durationMs:120000,positionMs:state.pos,playing:false,supported:{seek:true}
  });
  const params = new URL(url,location.href).searchParams;
  const key = params.get('trackKey');
  const position = Number(params.get('ms'));
  state.posts.push({key,position});
  await new Promise(resolve => {state.release = resolve;});
  state.release = null;
  if (state.rejectNext || key !== state.key) {
   state.rejectNext = false;
   return Response.json({accepted:false},{status:409});
  }
  state.pos = position;
  return Response.json({accepted:true});
 };
}

async function checkSpotifySeek({send,evaluate}) {
 await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:'('+simulateSpotify.toString()+')()'});
 await send('Page.reload');
 await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 const read = () => evaluate(`(() => {
  const slider = document.getElementById('player-seek');
  if (!window.seekTest || !slider) return null;
  return {title:document.getElementById('player-track').textContent,enabled:!slider.disabled,
   position:Number(slider.value),posts:seekTest.posts,waiting:Boolean(seekTest.release)};
 })()`);
 const seekTo = position => evaluate(`(() => {
  const slider = document.getElementById('player-seek');
  slider.value = ${position};
  slider.dispatchEvent(new Event('input',{bubbles:true}));
  slider.dispatchEvent(new Event('change',{bubbles:true}));
 })()`);
 await until('simulated Spotify Track A',async () => {
  const deck = await read();
  return deck?.title === 'Track A' && deck.enabled && deck.position === 2000;
 }).catch(async error => {
  console.error('Spotify test setup:',await read(),await evaluate('({hidden:document.hidden, source:state.source})'));
  throw error;
 });
 await seekTo(10000);
 await until('first seek in flight',async () => (await read())?.waiting);
 await seekTo(20000);
 assert.equal((await read()).position,20000);
 await evaluate("seekTest.key = 'b'.repeat(64); seekTest.pos = 3000; seekTest.release();");
 const next = await until('Track B at its original position',async () => {
  const deck = await read();
  return deck?.title === 'Track B' && deck.position === 3000 && deck.enabled && deck;
 });
 assert.deepEqual(next.posts,[{key:'a'.repeat(64),position:10000}]);
 await seekTo(15000);
 await until('seek for B in flight',async () => (await read())?.waiting);
 await seekTo(25000);
 await seekTo(35000);
 assert.equal((await read()).position,35000);
 await evaluate('seekTest.release()');
 await until('latest seek for B in flight',async () => {
  const deck = await read();
  return deck?.waiting && deck.posts.length === 3;
 });
 await evaluate('seekTest.release()');
 await until('latest seek applied to B',() => evaluate('seekTest.pos === 35000'));
 assert.deepEqual((await read()).posts,[
  {key:'a'.repeat(64),position:10000},
  {key:'b'.repeat(64),position:15000},
  {key:'b'.repeat(64),position:35000}
 ]);
 await seekTo(40000);
 await until('rejection test in flight',async () => (await read())?.waiting);
 await evaluate('seekTest.rejectNext = true; seekTest.release();');
 await until('rejected seek restored the confirmed position',async () => (await read())?.position === 35000);
 console.log('PASS packaged seek: queued Track A request discarded after switch to Track B, Track B seeks coalesced, rejected seek restored position');
}

async function run() {
 if (process.platform !== 'win32') throw new Error('Run the portable EXE smoke test on Windows.');
 const executable = path.resolve(process.argv[2] || 'dist/windows/Resonance-Windows-x64.exe');
 await fs.access(executable);
 const dir = await fs.mkdtemp(path.join(os.tmpdir(),'resonance-windows-smoke-'));
 let child, cdp;
 try {
  const wav = path.join(dir,'Resonance smoke.wav');
  await fs.writeFile(wav,sineWav());
  const port = await freePort();
  child = spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,
   '--user-data-dir='+path.join(dir,'profile'),wav],{stdio:'ignore'});
  await once(child,'spawn');
  cdp = await devTools(port);
  await cdp.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await checkLocal(cdp);
  await cdp.evaluate('document.exitFullscreen()');
  await cdp.evaluate("document.getElementById('player-audio').click()");
  await checkSpotifySeek(cdp);
  assert.deepEqual(cdp.exceptions,[],'renderer exceptions');
 } finally {
  if (cdp) {
   await Promise.race([cdp.evaluate('window.close()').catch(() => {}),delay(500)]);
   cdp.close();
  }
  if (child?.pid && child.exitCode === null) {
   await Promise.race([once(child,'exit'),delay(3500)]);
   if (child.exitCode === null) child.kill();
  }
  await fs.rm(dir,{recursive:true,force:true,maxRetries:6,retryDelay:200});
 }
}

if (require.main === module) run().catch(error => {console.error(error);process.exitCode = 1;});
module.exports = {devTools, freePort, until};
