const {contextBridge,ipcRenderer}=require('electron');

contextBridge.exposeInMainWorld('resonanceDeck',{
 resize:(width,height,expanded)=>ipcRenderer.send('resonance:deck-size',width,height,expanded),
 minimize:()=>ipcRenderer.send('resonance:window-action','minimize'),
 close:()=>ipcRenderer.send('resonance:window-action','close')
});
