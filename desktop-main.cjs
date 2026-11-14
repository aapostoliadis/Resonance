const {app,BrowserWindow,desktopCapturer,dialog,ipcMain,screen,session,shell}=require('electron');
const path=require('node:path');
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
 try{
  server=await startServer(4391);
 }catch(error){
  if(error.code!=='EADDRINUSE')throw error;
  server=await startServer(0);
 }
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
  const compact=process.platform==='win32';
  window=new BrowserWindow({
   title:'Resonance',useContentSize:true,width:compact?402:1320,height:compact?200:900,
   minWidth:compact?0:360,minHeight:compact?0:480,
   frame:!compact,maximizable:!compact,
   backgroundColor:'#090b0b',autoHideMenuBar:true,show:false,
   webPreferences:{session:profile,nodeIntegration:false,contextIsolation:true,sandbox:true,
    ...(compact?{preload:path.join(__dirname,'desktop-preload.cjs')}:{})}
  });
  const deckWindow=window;
  if(compact){
   let size,ready=false,shown=false,stage=false;
   const fitDeck=()=>{
    if(!size||stage||deckWindow.isDestroyed()||deckWindow.isFullScreen())return;
    const {workArea}=screen.getDisplayMatching(deckWindow.getBounds());
    const width=Math.min(workArea.width,size.expanded?Math.max(size.width,520):size.width);
    const height=Math.min(workArea.height-(deckWindow.getBounds().height-deckWindow.getContentBounds().height),
     size.expanded?Math.max(size.height,680):size.height);
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
   deckWindow.on('will-resize',event=>{if(!stage)event.preventDefault();});
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
  window.on('closed',()=>{window=null;});
  void window.loadURL(origin+'/?desktop=1');
 }
 createWindow();
 app.on('activate',()=>{if(!window)createWindow();});
}).catch(error=>{dialog.showErrorBox('Resonance could not start',error.message);app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('before-quit',()=>server?.close());
