const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const token = randomBytes(24).toString('hex');
const commands = new Set(['play','pause','previous','next','stop','seek','repeat','shuffle','volume','mute']);
const commandLimits = {seek:86400000,repeat:2,shuffle:1,volume:100,mute:1};
const files = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/reactivity.js':'reactivity.js','/graphics.bundle.js':'graphics.bundle.js','/style.css':'style.css','/player.js':'player.js','/player.css':'player.css'};
files['/apple-music.js']='apple-music.js';
let pendingStatus;
let commandInProgress = false;

function readSpotify(action, position, expectedTrackKey) {
 return new Promise(resolve=>{
  if(process.platform!=='win32')return resolve({available:false,reason:'Spotify transport requires Windows'});
  const shell=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const script=path.join(__dirname,'spotify-media.ps1');
  const args=['-NoProfile','-NonInteractive','-File',script,'-Action',action,'-PositionMs',String(position)];
  if (expectedTrackKey) args.push('-ExpectedTrackKey',expectedTrackKey);
  execFile(shell,args,{windowsHide:true,timeout:4500,maxBuffer:16384},(error,stdout)=>{
   if(!error){
    try{return resolve(JSON.parse(stdout));}catch{}
   }
   resolve({available:false,reason:'Windows media controls unavailable'});
  });
 });
}

function json(res,status,result) {
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'});
 res.end(JSON.stringify(result));
}

async function spotify(req,res,url,host) {
 if(req.headers.host!==host||req.headers['x-resonance-player']!=='1'||(req.headers.origin&&req.headers.origin!=='http://'+host)){
  return json(res,403,{reason:'Same-origin Resonance requests only'});
 }
 if(req.method==='GET'){
  if(!pendingStatus){
   const status=readSpotify('status',0).finally(()=>{if(pendingStatus===status)pendingStatus=null;});
   pendingStatus=status;
  }
  return json(res,200,{...await pendingStatus,token});
 }
 if(req.method!=='POST'||req.headers.origin!=='http://'+host||req.headers['x-resonance-token']!==token){
  return json(res,403,{reason:'Spotify control request rejected'});
 }
 const action=url.searchParams.get('action');
 const position=Number(url.searchParams.get('ms')??0);
 const expectedTrackKey=url.searchParams.get('trackKey');
 if(!commands.has(action)||!Number.isInteger(position)||position<0||position>(commandLimits[action]??0)){
  return json(res,400,{reason:'Invalid playback command'});
 }
 if(expectedTrackKey!==null&&(action!=='seek'||!(/^[a-f0-9]{64}$/).test(expectedTrackKey))){
  return json(res,400,{reason:'Invalid playback track key'});
 }
 if(commandInProgress)return json(res,409,{reason:'A playback command is already running'});
 commandInProgress=true;
 try {
  const result=await readSpotify(action,position,expectedTrackKey);
  return json(res,result.accepted?200:409,result);
 } finally {
  pendingStatus=null;
  commandInProgress=false;
 }
}

function startServer(port=Number(process.env.PORT || 4387),localAudio){
 const server=http.createServer((req,res)=>{
 const host='127.0.0.1:'+server.address().port;
 const url=new URL(req.url,'http://localhost');
 const pathname=url.pathname;
 if(localAudio&&pathname.startsWith('/local-audio/'))return void localAudio.serve(req,res,url,host);
 if(pathname==='/api/spotify')return void spotify(req,res,url,host);
 if(pathname==='/api/apple-music'){
  if(req.method!=='GET'||req.headers.host!==host||req.headers['x-resonance-player']!=='1'||
   (req.headers.origin&&req.headers.origin!=='http://'+host))
   return json(res,403,{reason:'Same-origin Resonance requests only'});
  const developerToken=process.env.APPLE_MUSIC_DEVELOPER_TOKEN?.trim();
  return json(res,200,developerToken?{developerToken}:{available:false});
 }
 const file=files[pathname];
 if(!file){res.writeHead(404);res.end('Not found');return;}
 fs.readFile(path.join(__dirname,file),(err,data)=>{
  if(err){res.writeHead(500);res.end('Unable to read app file');return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(self), display-capture=(self)'});res.end(data);
 });
 });
 return new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(port,'127.0.0.1',()=>resolve(server));
 });
}

module.exports={startServer};
if(require.main===module){
 startServer().then(server=>console.log(`Resonance is running at http://127.0.0.1:${server.address().port}`)).catch(error=>{
  console.error('Could not start Resonance:',error.message);
  process.exitCode=1;
 });
}
