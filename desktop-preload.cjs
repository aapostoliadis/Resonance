const {contextBridge,ipcRenderer,webUtils}=require('electron');

const nativeDrop=process.argv.includes('--resonance-compact');
if(nativeDrop)contextBridge.exposeInMainWorld('resonanceDeck',{
 resize:(width,height,expanded)=>ipcRenderer.send('resonance:deck-size',width,height,expanded),
 onNativeResize:callback=>ipcRenderer.on('resonance:native-resize',(_event,width,height,finished)=>callback(width,height,finished)),
 minimize:()=>ipcRenderer.send('resonance:window-action','minimize'),
 close:()=>ipcRenderer.send('resonance:window-action','close')
});

let fileListener;
let latestDrop=0;
if(nativeDrop){
 window.addEventListener('dragover',event=>{
  if(event.isTrusted&&event.dataTransfer?.types.includes('Files'))event.preventDefault();
 },true);
 window.addEventListener('drop',async event=>{
  const file=event.dataTransfer?.files[0];
  if(!event.isTrusted||!file||!fileListener)return;
  event.preventDefault();
  const drop=++latestDrop;
  const error={error:'Couldn’t open the dropped audio file. Try File → Open audio file.'};
  let result;
  try{
   const diskPath=webUtils.getPathForFile(file);
   result=diskPath?await ipcRenderer.invoke('resonance:register-audio-drop',diskPath):error;
  }catch{result=error;}
  if(drop===latestDrop)fileListener(result||error);
  else if(result?.id)ipcRenderer.send('resonance:close-audio',result.id);
 },true);
}
contextBridge.exposeInMainWorld('resonanceFiles',{
 nativeDrop,
 choose:()=>ipcRenderer.invoke('resonance:choose-audio'),
 decode:id=>ipcRenderer.invoke('resonance:decode-audio',id),
 close:id=>ipcRenderer.send('resonance:close-audio',id),
 listen:callback=>{
  if(fileListener)return;
  fileListener=callback;
  ipcRenderer.on('resonance:audio-file',(_event,file)=>fileListener(file));
  ipcRenderer.send('resonance:audio-ready');
 }
});
