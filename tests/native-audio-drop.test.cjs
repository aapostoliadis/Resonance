const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

function script(name) {
 return fs.readFileSync(path.join(__dirname,'..',name),'utf8');
}

function preload(compact = true) {
 const exposed = {};
 const events = new Map();
 const received = [];
 const registrations = [];
 const released = [];
 const ipcRenderer = {
  on(){},
  send(channel,id){if(channel === 'resonance:close-audio') released.push(id);},
  invoke(channel,filePath){
   assert.equal(channel,'resonance:register-audio-drop');
   return new Promise(resolve => registrations.push({filePath,resolve}));
  }
 };
 vm.runInNewContext(script('desktop-preload.cjs'),{
  require:() => ({
   contextBridge:{exposeInMainWorld:(key,value) => exposed[key] = value}, ipcRenderer,
   webUtils:{getPathForFile:file => file.diskPath || ''}
  }),
  process:{argv:compact ? ['--resonance-compact'] : []},
  window:{addEventListener:(name,listener) => events.set(name,listener)}
 });
 exposed.resonanceFiles.listen(value => received.push(value));
 function drop(files,isTrusted = true) {
  let prevented = false;
  const result = events.get('drop')?.({isTrusted,dataTransfer:{files},preventDefault(){prevented = true;}});
  return {prevented,result};
 }
 return {drop,exposed,events,received,registrations,released};
}

test('trusted native drop registers the first path once and sends only a track descriptor',async () => {
 const {drop,exposed,received,registrations} = preload();
 assert.equal(exposed.resonanceFiles.nativeDrop,true);
 assert.equal(exposed.resonanceFiles.register,undefined);
 const event = drop([{diskPath:'one'},{diskPath:'two'}]);
 assert.equal(event.prevented,true);
 assert.deepEqual(registrations.map(entry => entry.filePath),['one']);
 const descriptor = {id:'1',name:'Track.aiff',url:'/local-audio/1'};
 registrations[0].resolve(descriptor);
 await event.result;
 assert.deepEqual(received,[descriptor]);
 assert.equal(Object.hasOwn(received[0],'path'),false);
});

test('synthetic and pathless drops cannot register a file and a rejected drop reports an error',async () => {
 const {drop,received,registrations} = preload();
 assert.equal(drop([{diskPath:'unexpected'}],false).prevented,false);
 await drop([{}]).result;
 assert.equal(registrations.length,0);
 assert.match(received[0].error,/dropped audio file/);
 const event = drop([{diskPath:'unsupported'}]);
 registrations[0].resolve({error:'Choose an audio file.'});
 await event.result;
 assert.equal(received[1].error,'Choose an audio file.');
});

test('a superseded drop is revoked and non-Windows preload leaves drop handling to the page',async () => {
 const {drop,received,registrations,released} = preload();
 const first = drop([{diskPath:'first'}]);
 const second = drop([{diskPath:'second'}]);
 const current = {id:'second',name:'Second.wma'};
 registrations[1].resolve(current);
 await second.result;
 registrations[0].resolve({id:'first',name:'First.aiff'});
 await first.result;
 assert.deepEqual(received,[current]);
 assert.deepEqual(released,['first']);
 const otherDeck = preload(false);
 assert.equal(otherDeck.exposed.resonanceFiles.nativeDrop,false);
 assert.equal(otherDeck.events.has('drop'),false);
});

test('main only admits an absolute drop path from the deck main frame',async () => {
 const calls = [];
 const handlers = new Map();
 const url = 'http://127.0.0.1:4391/?desktop=1';
 const frame = {url};
 const webContents = {mainFrame:frame,setWindowOpenHandler(){},on(){}};
 class Window {
  constructor() {this.webContents = webContents;}
  once(){}
  on(){}
  loadURL(){}
 }
 const app = {setName(){},quit(){},requestSingleInstanceLock:() => true,on(){},whenReady:async () => {}};
 const profile = {setPermissionCheckHandler(){},setPermissionRequestHandler(){},setDisplayMediaRequestHandler(){}};
 const startupErrors = [];
 const modules = {
  electron:{app,BrowserWindow:Window,dialog:{showErrorBox:(_title,error) => startupErrors.push(error)},session:{fromPartition:() => profile},
   ipcMain:{handle:(name,handler) => handlers.set(name,handler),on(){}}},
  'node:path':path.win32,
  './server.cjs':{startServer:async () => ({address:() => ({port:4391})})},
  './local-audio.cjs':{accepts:() => false,extensions:[],createLocalAudio:() => ({
   add(file){calls.push(file);return file.endsWith('.aiff') ? {id:'test'} : null;}
  })}
 };
 vm.runInNewContext(script('desktop-main.cjs'),{
  require:name => modules[name], URL, __dirname:'C:/Resonance', process:{argv:[],cwd:() => '',platform:'win32'}
 });
 await new Promise(resolve => setImmediate(resolve));
 assert.deepEqual(startupErrors,[]);
 const register = handlers.get('resonance:register-audio-drop');
 const selected = 'C:/Music/Signal.aiff';
 assert.equal(register({sender:{},senderFrame:frame},selected),null);
 assert.equal(register({sender:webContents,senderFrame:{url}},selected),null);
 assert.equal(register({sender:webContents,senderFrame:frame},'relative.aiff'),null);
 frame.url = 'https://example.com/';
 assert.equal(register({sender:webContents,senderFrame:frame},selected),null);
 frame.url = url;
 assert.equal(register({sender:webContents,senderFrame:frame},selected).id,'test');
 assert.match(register({sender:webContents,senderFrame:frame},'C:/Music/Signal.txt').error,/Choose an audio file/);
 assert.deepEqual(calls,[selected,'C:/Music/Signal.txt']);
});
