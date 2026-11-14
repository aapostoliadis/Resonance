const {app,BrowserWindow,desktopCapturer,dialog,session,shell}=require('electron');
const {startServer}=require('./server.cjs');

const externalOrigins=new Set(['https://open.spotify.com','https://music.apple.com']);
let server,window;
app.setName('Resonance');

if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',()=>{if(window?.isMinimized())window.restore();window?.focus();});

function openMusic(url){
 const target=new URL(url);
 if(externalOrigins.has(target.origin)||target.href==='spotify:')void shell.openExternal(url);
}

app.whenReady().then(async()=>{
 server=await startServer(4391);
 const origin='http://127.0.0.1:'+server.address().port;
 const profile=session.fromPartition('persist:resonance');
 profile.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>
  contents===window?.webContents&&requestingOrigin===origin&&
  (permission==='fullscreen'||(permission==='media'&&details.mediaType==='audio')));
 profile.setPermissionRequestHandler((contents,permission,reply,details)=>{
  const local=contents===window?.webContents&&details.isMainFrame&&new URL(details.requestingUrl).origin===origin;
  reply(local&&(permission==='fullscreen'||(permission==='media'&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='audio')));
 });
 profile.setDisplayMediaRequestHandler(async(request,reply)=>{
  if(request.securityOrigin!==origin||!request.userGesture||!request.audioRequested||
     request.frame!==window?.webContents.mainFrame||!['win32','darwin'].includes(process.platform))return reply({});
  const {response}=await dialog.showMessageBox(window,{
   type:'question',title:'Resonance',message:'Share system audio with Resonance?',
   detail:'Resonance analyzes the audio on this device. It does not show or record the screen.',
   buttons:['Share audio','Cancel'],defaultId:1,cancelId:1
  });
  if(response!==0)return reply({});
  try{
   const [screen]=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});
   if(screen)reply({video:screen,audio:'loopback'});
   else reply({});
  }catch{reply({});}
 });
 function createWindow(){
  window=new BrowserWindow({
   title:'Resonance',width:1320,height:900,minWidth:360,minHeight:480,
   backgroundColor:'#090b0b',autoHideMenuBar:true,
   webPreferences:{session:profile,nodeIntegration:false,contextIsolation:true,sandbox:true}
  });
  window.webContents.setWindowOpenHandler(({url})=>{openMusic(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{
   if(new URL(url).origin!==origin){event.preventDefault();openMusic(url);}
  });
  window.on('closed',()=>{window=null;});
  void window.loadURL(origin+'/?desktop=1');
 }
 createWindow();
 app.on('activate',()=>{if(!window)createWindow();});
}).catch(error=>{dialog.showErrorBox('Resonance could not start',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>server?.close());
