const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomBytes}=require('node:crypto');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');

const types={
 mp3:'audio/mpeg',wav:'audio/wav',wave:'audio/wav',flac:'audio/flac',
 ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',m4a:'audio/mp4',aac:'audio/aac',
 aif:'audio/aiff',aiff:'audio/aiff',aifc:'audio/aiff',wma:'audio/x-ms-wma',
 alac:'audio/mp4',au:'audio/basic',m4b:'audio/mp4',mp2:'audio/mpeg'
};
const extensions=Object.keys(types);
const extension=file=>path.extname(file).slice(1).toLowerCase();
const accepts=file=>Object.hasOwn(types,extension(file));

function createLocalAudio(){
 const tracks=new Map();
 let temp;
 function add(file){
  if(!accepts(file)||!fs.statSync(file,{throwIfNoEntry:false})?.isFile())return null;
  const id=randomBytes(24).toString('hex');
  const name=path.basename(file);
  tracks.set(id,{file});
  return {id,name,url:'/local-audio/'+id};
 }
 function remove(id){
  const track=tracks.get(id);
  tracks.delete(id);
  track?.controller?.abort();
  if(track?.converted)fs.rm(track.converted,{force:true},()=>{});
 }
 async function convert(id){
  const track=tracks.get(id);
  if(!track)return null;
  if(!track.conversion){
   track.controller=new AbortController();
   track.conversion=(async()=>{
    let output;
    try{
     const binary=(process.env.PATH||'').split(path.delimiter).filter(dir=>path.isAbsolute(dir))
      .map(dir=>path.join(dir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'))
      .find(file=>fs.statSync(file,{throwIfNoEntry:false})?.isFile());
     if(!binary)return null;
     temp??=fs.mkdtempSync(path.join(os.tmpdir(),'resonance-audio-'));
     output=path.join(temp,id+'.wav');
     await promisify(execFile)(binary,['-nostdin','-v','error','-protocol_whitelist','file,pipe',
      '-i',track.file,'-map','0:a:0','-vn','-c:a','pcm_s24le',output],
     {windowsHide:true,timeout:120000,signal:track.controller.signal});
     if(tracks.get(id)!==track)throw new Error('Track closed');
     track.converted=output;
     return '/local-audio/'+id+'?decoded=1';
    }catch{
     if(output)fs.rm(output,{force:true},()=>{});
     return null;
    }
   })();
  }
  return track.conversion;
 }
 async function serve(req,res,url,host){
  const track=tracks.get(url.pathname.slice('/local-audio/'.length));
  const file=url.searchParams.has('decoded')?track?.converted:track?.file;
  if(!file||req.headers.host!==host||!['GET','HEAD'].includes(req.method)||
   (req.headers['sec-fetch-site']&&req.headers['sec-fetch-site']!=='same-origin')){
   res.writeHead(404).end();
   return;
  }
  let handle;
  try{
   handle=await fs.promises.open(file,'r');
   const {size}=await handle.stat();
   const range=req.headers.range;
   let start=0,end=size-1;
   const headers={'Content-Type':types[extension(file)],'Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; sandbox",
    'Cache-Control':'no-store','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'};
   if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(match&&(match[1]||match[2])){
     start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]));
     if(match[1]&&match[2])end=Math.min(end,Number(match[2]));
    }else start=size;
    if(start>=size||start>end){
     res.writeHead(416,{'Content-Range':'bytes */'+size}).end();
     return;
    }
    headers['Content-Range']=`bytes ${start}-${end}/${size}`;
   }
   headers['Content-Length']=end-start+1;
   res.writeHead(range?206:200,headers);
   if(req.method==='HEAD'||!size){res.end();return;}
   const stream=handle.createReadStream({start,end});
   handle=null;
   res.once('close',()=>stream.destroy());
   stream.once('error',()=>res.destroy());
   stream.pipe(res);
  }catch{
   if(!res.headersSent)res.writeHead(404).end();
   else res.destroy();
  }finally{
   await handle?.close();
  }
 }
 function close(){
  for(const id of tracks.keys())remove(id);
  if(temp)try{fs.rmSync(temp,{force:true,recursive:true});}catch{}
 }
 return {add,remove,convert,serve,close};
}

module.exports={accepts,extensions,createLocalAudio};
