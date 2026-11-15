const {app,BrowserWindow,desktopCapturer,dialog,ipcMain,screen,session,shell}=require('electron');
const path=require('node:path');
const {startServer}=require('./server.cjs');
const {accepts,extensions,createLocalAudio}=require('./local-audio.cjs');

const externalOrigins=new Set(['https://open.spotify.com','https://music.apple.com']);
let server,window;
const localAudio=createLocalAudio();
function audioArgument(args,cwd){
 const file=args.find(arg=>!arg.startsWith('-')&&accepts(arg));
 return file&&path.resolve(cwd,file);
}
let pendingFile=audioArgument(process.argv.slice(1),process.cwd());
let rendererReady=false;
app.setName('Resonance');
if (app.isPackaged && process.platform==='win32') app.setAppUserModelId('local.resonance.visualizer');

if(!app.requestSingleInstanceLock())app.quit();
app.on('second-instance',(_event,args,cwd)=>{
 if(window?.isMinimized())window.restore();
 window?.focus();
 const file=audioArgument(args.slice(1),cwd);
 if(file){pendingFile=file;sendPendingFile();}
});

function describeFile(file){
 try{return localAudio.add(file)||{error:'This file could not be opened. Choose an audio file.'};}
 catch{return {error:'Resonance couldn’t read that audio file. Check that it still exists and try again.'};}
}

function sendPendingFile(){
 if(!pendingFile||!rendererReady||!window)return;
 window.webContents.send('resonance:audio-file',describeFile(pendingFile));
 pendingFile=null;
}

function openMusic(url){
 const target=new URL(url);
 if(externalOrigins.has(target.origin)||target.href==='spotify:')void shell.openExternal(url);
}

app.whenReady().then(async()=>{
 try{
  server=await startServer(4391,localAudio);
 }catch(error){
  if(error.code!=='EADDRINUSE')throw error;
  server=await startServer(0,localAudio);
 }
 const origin='http://127.0.0.1:'+server.address().port;
 const profile=session.fromPartition('persist:resonance');
 const isLocalOrigin=url=>URL.canParse(url)&&new URL(url).origin===origin;
 const fromPlayer=event=>event.sender===window?.webContents&&
  event.senderFrame===window.webContents.mainFrame&&isLocalOrigin(event.senderFrame?.url);
 ipcMain.handle('resonance:choose-audio',async event=>{
  if(!fromPlayer(event))return null;
  const result=await dialog.showOpenDialog(window,{title:'Open audio file',properties:['openFile'],
   filters:[{name:'Audio files',extensions}]});
  return result.canceled||!fromPlayer(event)?null:describeFile(result.filePaths[0]);
 });
 ipcMain.handle('resonance:register-audio-drop',(event,file)=>{
  if(!fromPlayer(event)||process.platform!=='win32'||typeof file!=='string'||!path.isAbsolute(file))return null;
  return describeFile(file);
 });
 ipcMain.handle('resonance:decode-audio',(event,id)=>fromPlayer(event)?localAudio.convert(id):null);
 ipcMain.on('resonance:close-audio',(event,id)=>{if(fromPlayer(event))localAudio.remove(id);});
 ipcMain.on('resonance:audio-ready',event=>{
  if(fromPlayer(event)){rendererReady=true;sendPendingFile();}
 });
 profile.setPermissionCheckHandler((contents,permission,requestingOrigin,details)=>
  contents===window?.webContents&&isLocalOrigin(requestingOrigin)&&
  (permission==='fullscreen'||(permission==='display-capture'&&details.isMainFrame)||
   (permission==='media'&&details.mediaType==='audio')));
 profile.setPermissionRequestHandler((contents,permission,reply,details)=>{
  const local=contents===window?.webContents&&details.isMainFrame&&isLocalOrigin(details.requestingUrl);
  reply(local&&(permission==='fullscreen'||permission==='display-capture'||
   (permission==='media'&&details.mediaTypes?.length===1&&details.mediaTypes[0]==='audio')));
 });
 profile.setDisplayMediaRequestHandler(async(request,reply)=>{
  if(!isLocalOrigin(request.securityOrigin)||!request.userGesture||!request.audioRequested||
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
  const compact=process.platform==='win32';
  window=new BrowserWindow({
   title:'Resonance',useContentSize:true,width:compact?402:1320,height:compact?200:900,
   minWidth:compact?0:360,minHeight:compact?0:480,
   frame:!compact,maximizable:!compact,
   ...(compact ? {accentColor:false,icon:path.join(__dirname,'packaging','windows','resonance.ico')} : {}),
   backgroundColor:'#090b0b',autoHideMenuBar:true,show:false,
   webPreferences:{session:profile,nodeIntegration:false,contextIsolation:true,sandbox:true,
    preload:path.join(__dirname,'desktop-preload.cjs'),additionalArguments:compact?['--resonance-compact']:[]}
  });
  const deckWindow=window;
  if(compact){
   let size,ready=false,shown=false,stage=false,resizing=false;
   const fitDeck=()=>{
    if(!size||stage||resizing||deckWindow.isDestroyed()||deckWindow.isFullScreen())return;
    const {workArea}=screen.getDisplayMatching(deckWindow.getBounds());
    const zoom=deckWindow.webContents.getZoomFactor();
    const width=Math.min(workArea.width,Math.ceil((size.expanded?Math.max(size.width,520):size.width)*zoom));
    const height=Math.min(workArea.height-(deckWindow.getBounds().height-deckWindow.getContentBounds().height),
     Math.ceil((size.expanded?Math.max(size.height,680):size.height)*zoom));
    const [currentWidth,currentHeight]=deckWindow.getContentSize();
    if(width!==currentWidth||height!==currentHeight){
     deckWindow.setContentSize(width,height);
     const bounds=deckWindow.getBounds();
     const x=Math.max(workArea.x,Math.min(bounds.x,workArea.x+workArea.width-bounds.width));
     const y=Math.max(workArea.y,Math.min(bounds.y,workArea.y+workArea.height-bounds.height));
     if(x!==bounds.x||y!==bounds.y)deckWindow.setPosition(x,y);
    }
    if(ready&&!shown){shown=true;deckWindow.show();}
   };
   const fromDeck=event=>event.sender===deckWindow.webContents&&
    event.senderFrame===deckWindow.webContents.mainFrame&&event.senderFrame?.url===origin+'/?desktop=1';
   const onSize=(event,width,height,expanded)=>{
    if(!fromDeck(event)||!Number.isInteger(width)||width<300||width>740||
     !Number.isInteger(height)||height<1||height>2000||typeof expanded!=='boolean')return;
    size={width,height,expanded};
    fitDeck();
   };
   const onWindowAction=(event,action)=>{
    if(!fromDeck(event))return;
    if(action==='minimize')deckWindow.minimize();
    if(action==='close')deckWindow.close();
   };
   ipcMain.on('resonance:deck-size',onSize);
   ipcMain.on('resonance:window-action',onWindowAction);
   deckWindow.once('closed',()=>{
    ipcMain.removeListener('resonance:deck-size',onSize);
    ipcMain.removeListener('resonance:window-action',onWindowAction);
   });
   deckWindow.once('ready-to-show',()=>{ready=true;fitDeck();});
   const reportNativeSize=finished=>{
    const zoom=deckWindow.webContents.getZoomFactor();
    const [width,height]=deckWindow.getContentSize();
    deckWindow.webContents.send('resonance:native-resize',width/zoom,height/zoom,finished);
   };
   deckWindow.on('will-resize',event=>{
    if(!size||size.expanded||stage){event.preventDefault();return;}
    resizing=true;
   });
   deckWindow.on('resize',()=>{if(resizing)reportNativeSize(false);});
   deckWindow.on('resized',()=>{
    if(!resizing)return;
    resizing=false;
    reportNativeSize(true);
   });
   deckWindow.on('enter-html-full-screen',()=>{stage=true;});
   deckWindow.on('leave-html-full-screen',()=>{stage=false;setImmediate(fitDeck);});
   deckWindow.on('leave-full-screen',fitDeck);
  }else{
   deckWindow.once('ready-to-show',()=>deckWindow.show());
  }
  window.webContents.setWindowOpenHandler(({url})=>{openMusic(url);return{action:'deny'};});
  window.webContents.on('will-navigate',(event,url)=>{
   if(new URL(url).origin!==origin){event.preventDefault();openMusic(url);}
  });
  window.on('closed',()=>{window=null;rendererReady=false;localAudio.close();});
  void window.loadURL(origin+'/?desktop=1');
 }
 createWindow();
 app.on('activate',()=>{if(!window)createWindow();});
}).catch(error=>{dialog.showErrorBox('Resonance could not start',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>{localAudio.close();server?.close();});
