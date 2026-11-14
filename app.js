'use strict';
const $ = selector => document.querySelector(selector);
const canvas = $('#visual'), ctx = canvas.getContext('2d', {alpha:false});
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobileSettings = matchMedia('(max-width: 650px)');
const state = {...DEFAULT_SETTINGS,mode:'orb', palette:0, gain:1.4, paused:reduced.matches, musicReactive:true, source:'demo', bass:0, mid:0, high:0, level:0, time:0, beat:0, shockwaves:[], travel:0, adaptive:true,expression:'dynamic',camera:reduced.matches?0:.35,spark:0,build:0,release:0,autoGain:1,cameraTime:0,visualTime:0,lastReleaseAt:-Infinity,transition:null,graphicsDebug:'final'};
const musicResponse=new MusicResponse();
const recentKicks=[];
let musicSignal=null;
const replayDuration=8000;
const replayHistory=[];
let replayClip=null,replayRun=null,paletteDraft=null;
let viewZoom=1,viewFill=false,viewCenter={x:0,y:0};
let savedFormViews={};
const formViewsKey='resonance.formViews.v1';
let savedPalettes=[],paletteEditTarget=null,paletteEditAction=null;
state.horizonSmoke=0;
state.horizonTerrain=0;
state.horizonTerrainDrive=0;
state.baseTravel=0;
const replayFields=['time','cameraTime','visualTime','travel','baseTravel','bass','mid','high','spark','beat','build','release','horizonSmoke','horizonTerrain','horizonTerrainDrive'];

function recordReplayFrame(now){
 if(replayHistory.length&&now-replayHistory.at(-1).at>1000)replayHistory.length=0;
 const snapshot=Object.fromEntries(replayFields.map(key=>[key,state[key]]));
 snapshot.shockwaves=state.shockwaves.map(wave=>({...wave}));
 replayHistory.push({at:now,snapshot});
 while(replayHistory.length>1&&replayHistory[1].at<=now-replayDuration)replayHistory.shift();
}

function captureReplay(){
 const end=replayHistory.at(-1)?.at;
 if(!(end-replayHistory[0]?.at>=replayDuration))return;
 replayClip={start:end-replayDuration,frames:replayHistory.slice(),qualityLevel,
  savedPalettes:savedPalettes.slice(),
  settings:{...currentSettings(),source:state.source,graphicsDebug:state.graphicsDebug,pointerOrbit:false,paused:true,transition:null}};
 const select=$('#replay-palette-b');
 const options=palettes.map((palette,index)=>new Option(palette.name,index));
 select.replaceChildren(...options.filter(option=>+option.value!==replayClip.settings.palette));
 for(const [index,palette] of replayClip.savedPalettes.entries()){
  const captured=replayClip.settings.customPalette;
  if(replayClip.settings.palette===CUSTOM_PALETTE&&sameCustomPalette(palette,captured))continue;
  select.add(new Option(palette.name,'saved-'+index));
 }
 $('#match-palette-frame').setAttribute('aria-pressed','false');
 refreshReplayPaletteSwatches();
 playReplay(true);
}

function replayPaletteChoice(){
 const choice=$('#replay-palette-b').value;
 const savedChoice=choice.startsWith('saved-')?replayClip.savedPalettes[Number(choice.slice(6))]:null;
 return savedChoice?{palette:CUSTOM_PALETTE,customPalette:savedChoice}:{palette:Number(choice),customPalette:null};
}
function refreshReplayPaletteSwatches(){
 const a=replayClip.settings,b=replayPaletteChoice();
 $('#replay-palette-swatches').replaceChildren(...[a,b].map((choice,index)=>{
  const palette=resolvePalette(choice.palette,choice.customPalette);
  const row=document.createElement('div');
  row.className='palette-row';
  row.append(document.createTextNode((index===0?'A · ':'B · ')+palette.name),paletteSwatches(palette));
  return row;
 }));
}
function playReplay(reactive,paletteSide=null){
 if(!replayClip)return;
 const {palette,customPalette}=paletteSide==='B'?replayPaletteChoice():replayClip.settings;
 const label=paletteSide?`Palette ${paletteSide} · ${resolvePalette(palette,customPalette).name}`:`Replay ${reactive?'A':'B'}`;
 const match=$('#match-palette-frame').getAttribute('aria-pressed')==='true';
 const held=match?(replayRun?.held??replayRun?.elapsed??0):null;
 replayRun={started:performance.now(),index:0,reactive,palette,customPalette,label,paletteSide,elapsed:0,finished:false,held};
 $('#music-compare').disabled=true;
 $('#return-live').hidden=false;
 $('#replay-actions').hidden=false;
 $('#replay-timeline').hidden=false;
 $('#replay-palette-controls').hidden=false;
 $('#replay-signal').hidden=false;
 $('#replay-a').setAttribute('aria-pressed',String(!paletteSide&&reactive));
 $('#replay-b').setAttribute('aria-pressed',String(!paletteSide&&!reactive));
 $('#replay-color-a').setAttribute('aria-pressed',String(paletteSide==='A'));
 $('#replay-color-b').setAttribute('aria-pressed',String(paletteSide==='B'));
 $('#replay-status').textContent=(paletteSide?label:reactive?'Playing A · Music response':'Playing B · Base motion')+' · '+FORM_CATALOG.find(form=>form.id===replayClip.settings.mode).name;
 draw();
}

function returnLive(){
 if(!replayRun)return;
 replayRun=null;
 $('#music-compare').disabled=false;
 $('#return-live').hidden=true;
 $('#replay-actions').hidden=true;
 $('#replay-timeline').hidden=true;
 $('#replay-palette-controls').hidden=true;
 $('#replay-signal').hidden=true;
 draw();
}

function replayScene(now){
 const run=replayRun,clip=replayClip;
 run.elapsed=run.held??Math.max(0,Math.min(replayDuration,now-run.started));
 while(run.index+1<clip.frames.length&&clip.frames[run.index+1].at<=clip.start+run.elapsed)run.index++;
 const position=run.elapsed/1000;
 $('#replay-progress').value=position;
 $('#replay-position').value=position.toFixed(2)+' s';
 const snapshot=clip.frames[run.index].snapshot;
 const detail=`Replay bass ${Math.round(snapshot.bass*100)}% · ${snapshot.shockwaves.length} recent kicks`;
 if($('#replay-signal').textContent!==detail)$('#replay-signal').textContent=detail;
 if(run.held!==null){
  $('#replay-status').textContent=`${run.label} · Frame held at ${(run.held/1000).toFixed(2)} s`;
 }else if(run.elapsed===replayDuration&&!run.finished){
  run.finished=true;
  $('#replay-status').textContent=`${run.label} complete · 8 s`;
 }
 const first=clip.frames[0].snapshot;
 return {...clip.settings,...snapshot,baseTravel:snapshot.baseTravel+first.travel-first.baseTravel,
  palette:run.palette,customPalette:run.customPalette,musicReactive:run.reactive};
}
const qualityGovernor=new QualityGovernor(),sceneDirector=new SceneDirector();
let density=1,qualityLevel=2,qualityWarmup=0,listening=false,settingsOpen=false,lastFocus=null,listeningBeforeFullscreen=false,activePreset='current';
let threeView=null,threeCanvas=null,graphicsFailure='',signalPanel=null;
let width=0,height=0,lastFrame=0,stream=null,audioContext=null,analyser=null,input=null,frequency=null,linearFrequency=null,waveform=null,operation=0,pending=false,lastUi=0;
let seed=71;const random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
const particles = Array.from({length:5100},(_,i)=>({y:1-2*(i+.5)/5100,a:i*2.3999632297,r:random(),s:random()}));
const stars = Array.from({length:95},()=>({x:random(),y:random(),r:random()}));
const bars=Array.from({length:40},()=>{const b=document.createElement('i');$('.spectrum').append(b);return b;});
function resize(){returnLive();width=innerWidth;height=innerHeight;const dpr=getRenderScale(width,height,qualityLevel,devicePixelRatio||1,8192);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);threeView?.resize(width,height,qualityLevel);if(state.paused)draw();}
function message(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(message.timer);message.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4200);}
function refreshMotion(){$('#motion').setAttribute('aria-pressed',String(state.paused));$('#motion-icon').textContent=state.paused?'▷':'Ⅱ';$('#motion-text').textContent=state.paused?'Resume visuals':'Pause visuals';$('#listen-pause').textContent=state.paused?'Resume':'Pause';
 const dockPause=$('#dock-pause'),label=state.paused?'Resume visuals':'Pause visuals';
 dockPause.textContent=state.paused?'▷':'Ⅱ';
 dockPause.setAttribute('aria-label',label);
 dockPause.title=label;}
const musicServices={
 spotify:{name:'Spotify',url:'https://open.spotify.com/'},
 apple:{name:'Apple Music',url:'https://music.apple.com/'}
};
let musicProvider='spotify';
const packageMode=new URLSearchParams(location.search).get('desktop')==='1'?'desktop':
 new URLSearchParams(location.search).get('mobile')==='1'?'mobile':'web';
if(packageMode!=='web')$('.brand').href=location.pathname+location.search;
if(packageMode==='mobile'){
 $('#setup ol').innerHTML='<li>Play music through speakers near this device.</li><li>Choose Use microphone and allow access.</li>';
 $('#setup .note').textContent='Audio from apps on this phone is not captured directly.';
 $('#share').hidden=true;
}
if(packageMode==='desktop'){
 $('#setup ol').innerHTML='<li>Start a track in your music app or browser.</li><li>Choose Share music audio and confirm system audio capture.</li>';
 $('#setup .note').textContent='Use your music app for playback controls when they are unavailable in Resonance.';
}
function selectMusicProvider(provider){
 const selected=musicServices[provider];
 $('#music-provider').value=provider;
 const link=$('#setup-service-link');
 link.href=selected.url;
 link.textContent='Open '+selected.name+' Web Player ↗';
}
$('#music-provider').addEventListener('change',event=>selectMusicProvider(event.target.value));
function updateSource(){const live=state.source!=='demo';$('#source-state').textContent=live?'AUDIO CONNECTED':'PREVIEW MODE';$('.intro').hidden=live;$('#source-description').textContent=live?'Connected, waiting for audio.':'Connect audio to make the visuals yours.';$('#connect').innerHTML=live?'Disconnect audio <span>×</span>':'Connect audio <span>↗</span>';$('#signal-status').textContent=live?'CONNECTED · WAITING FOR AUDIO':'SIMULATED SIGNAL · NO AUDIO CONNECTED';$('#listen-source').textContent=live?'CONNECTED · WAITING':'PREVIEW · SIMULATED';}
function release(){replayHistory.length=0;const old=stream;stream=null;if(old)old.getTracks().forEach(t=>t.stop());if(input)input.disconnect();input=null;analyser=null;frequency=null;linearFrequency=null;waveform=null;const oldContext=audioContext;audioContext=null;if(oldContext&&oldContext.state!=='closed')oldContext.close().catch(()=>{});musicResponse.reset();recentKicks.length=0;musicSignal=null;state.source='demo';state.bass=state.mid=state.high=state.level=state.beat=state.spark=state.build=state.release=0;state.autoGain=1;state.lastReleaseAt=-Infinity;state.transition=null;state.shockwaves=[];sceneDirector.reset();updateSource();}
function disconnect(){operation++;release();message('Audio disconnected. Back to simulated preview.');}
async function connectAudio(kind,{ownTab=false}={}){
 if(pending)return;const id=++operation;const provider=$('#music-provider').value;
 pending=true;$('#setup-error').textContent='';['#share','#microphone','#demo','#music-provider'].forEach(s=>$(s).disabled=true);let captured=null;
 try{
  if(!navigator.mediaDevices)throw new Error('Audio capture needs a secure browser context. Launch with Start.cmd and open the localhost address in Chrome or Edge.');
  if(kind==='shared'&&!navigator.mediaDevices.getDisplayMedia)throw new Error('This browser cannot share tab audio. Open this app in desktop Chrome or Edge, or use your microphone.');
  if(kind==='mic'){
   const audio=packageMode==='mobile'?true:{echoCancellation:false,noiseSuppression:false,autoGainControl:false};
   captured=await navigator.mediaDevices.getUserMedia({audio,video:false});
  }else{
   captured=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false},systemAudio:'include',selfBrowserSurface:ownTab?'include':'exclude',surfaceSwitching:'exclude'});
  }
  if(id!==operation){captured.getTracks().forEach(t=>t.stop());return;}
  if(!captured.getAudioTracks().length)throw new Error('No audio was shared. Share the music tab with tab audio enabled, or share your entire screen with system audio enabled.');
  release();stream=captured;audioContext=new AudioContext();await audioContext.resume();
  if(id!==operation){release();return;}
  analyser=audioContext.createAnalyser();analyser.fftSize=2048;analyser.smoothingTimeConstant=.35;frequency=new Uint8Array(analyser.frequencyBinCount);linearFrequency=new Float32Array(analyser.frequencyBinCount);waveform=new Float32Array(analyser.fftSize);input=audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));input.connect(analyser);
  // No connection to audioContext.destination: avoid replay and feedback.
  state.source=kind==='mic'?'mic':'shared';if(kind==='shared')musicProvider=provider;
  stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(stream===captured){release();message('Audio sharing ended. Back to simulated preview.');}},{once:true}));
  updateSource();$('#setup').close();message('Audio connected. '+(kind==='shared'?'Start a track in '+musicServices[musicProvider].name+'.':'The microphone is listening.'));
 }catch(error){if(captured)captured.getTracks().forEach(t=>t.stop());if(stream===captured)release();const text=error.name==='NotAllowedError'||error.name==='AbortError'?(state.source==='demo'?'Sharing was cancelled or denied. Nothing is connected. You can try again.':'Sharing was cancelled or denied. Your previous audio source is still connected.'):error.name==='NotFoundError'?'No audio input is available. Try sharing your music tab.':error.message;$('#setup-error').textContent=text;}
 finally{pending=false;['#share','#microphone','#demo','#music-provider'].forEach(s=>$(s).disabled=false);}
}
function applyMusic(bass,mid,high,rms,dt,now){
 const response=musicResponse.update({bass,mid,high,rms},dt,{gain:state.gain,adaptive:state.adaptive,releaseThreshold:state.releaseThreshold});
 musicSignal=response;
 if(response.hit)recentKicks.push(now);
 while(recentKicks.length&&now-recentKicks[0]>5000)recentKicks.shift();
 if(!state.paused){
  for(const key of ['bass','mid','high','beat','spark','build','release','autoGain'])state[key]=response[key];
  if(response.hit)state.shockwaves.push({age:0,power:response.beat});
  if(response.released)state.lastReleaseAt=state.visualTime;
  if(state.shockwaves.length>5)state.shockwaves.shift();
 }
}
function analyse(now,dt){
 if(!analyser){const previewTime=now/1000,phase=previewTime%.5,kick=Math.exp(-phase*24),build=.5+.5*Math.sin(previewTime*.20-1.5),hat=Math.exp(-(previewTime%.25)*60);state.level=.045+build*.08+kick*.05;applyMusic(.014+kick*(.055+build*.08),.025+build*.06,.004+hat*.035,state.level,dt,now);return;}
 analyser.getByteFrequencyData(frequency);analyser.getFloatTimeDomainData(waveform);
 const hz=audioContext.sampleRate/analyser.fftSize;
 state.level=Math.sqrt(waveform.reduce((sum,v)=>sum+v*v,0)/waveform.length);
 analyser.getFloatFrequencyData(linearFrequency);
 function energy(lo,hi){let sum=0;for(let i=Math.max(1,Math.ceil(lo/hz));i<Math.min(linearFrequency.length,Math.ceil(hi/hz));i++)sum+=10**(linearFrequency[i]/10);return Math.sqrt(sum);}
 applyMusic(energy(30,180),energy(180,2400),energy(2400,14000),state.level,dt,now);
 if(now-lastUi>350){lastUi=now;const audible=state.level>.002;$('#source-description').textContent=audible?'Live audio · bass, mids & treble drive the visuals.':'Connected, waiting for audio. Play music or check audio sharing.';$('#signal-status').textContent=audible?(state.source==='mic'?'MICROPHONE':'SHARED AUDIO')+' · LIVE SIGNAL':'CONNECTED · WAITING FOR AUDIO';$('#source-state').textContent=audible?'LIVE AUDIO':'AUDIO CONNECTED';$('#listen-source').textContent=audible?'LIVE AUDIO':'CONNECTED · WAITING';}
}
const canvasPaletteCache=new WeakMap();
function canvasPaletteInk(palette){
 if(!canvasPaletteCache.has(palette)){
  canvasPaletteCache.set(palette,PALETTE_ROLES.map(role=>palette[role].slice(1).match(/../g).map(hex=>parseInt(hex,16))));
 }
 const [shadow,body,highlight,spark]=canvasPaletteCache.get(palette);
 return (depth,kick,treble,alpha)=>{
  const light=Math.min(1,kick),glint=Math.min(1,treble);
  const color=body.map((channel,i)=>{
   const pigment=shadow[i]+(channel-shadow[i])*Math.max(0,Math.min(1,depth));
   const lit=pigment+(highlight[i]-pigment)*light;
   return Math.round(lit+(spark[i]-lit)*glint);
  });
  return `rgba(${color.join(',')},${Math.min(1,alpha)})`;
 };
}
const canvasFormExtents={
 orb:[1.6,1.6],cascade:[1.05,1.55],strata:[1.27,1.12],
 vortex:[1.37,1.37],pulse:[1.28,1.28],ember:[1.05,1.38],flux:[1.5,1.24],
 relic:[1.5,1.24],swarm:[1.42,.94],fractal:[1.9,2.12]
};
const canvasFillExtents={
 orb:[.86,.86],cascade:[.58,1.08],strata:[1.09,.9],
 vortex:[1.08,1.08],pulse:[1.06,1.06],ember:[.84,1.04],flux:[1.4,.82],
 relic:[1.4,.82],swarm:[.98,.56],fractal:[1.44,1.52]
};
function drawCanvas(state){
 ctx.fillStyle='#090b0b';ctx.fillRect(0,0,width,height);
 const camera=formCameraPose(state.mode,state.cameraTime,state.camera);
 if(state.mode==='horizon'){drawHorizonCanvas(state,camera);drawCanvasTransition(state);return;}
 const mobile=width<651,cx=width*.5,cy=height*.5;
 const base=height*.5,t=state.time,p=resolvePalette(state.palette,state.customPalette);
 const reaction=getVisualReactions(state),bass=reaction.bass,radius=base,rot=t*.24+camera.yaw,ink=canvasPaletteInk(p);
 if(state.mode==='tunnel'){
  drawTunnelCanvas(state,reaction,ink);
  drawCanvasTransition(state);
  return;
 }
 ctx.save();
 ctx.translate(cx+width*(viewCenter.x+camera.x),cy+height*(viewCenter.y+camera.y));
 if(state.mode!=='wave')ctx.rotate(camera.roll);
 ctx.scale(camera.zoom,camera.zoom);
 ctx.translate(-cx,-cy);
 // Background stars follow only the ambient camera drift.
 for(let starIndex=0;starIndex<Math.min(stars.length,Math.max(30,Math.floor(stars.length*density)));starIndex++){const star=stars[starIndex];const z=.3+star.r*.7,drift=1+Math.sin(state.cameraTime*.08+star.r*6)*.06*state.camera;const x=cx+(star.x*width-cx)*drift,y=cy+(star.y*height-cy)*drift;ctx.fillStyle=`hsla(${p.hue},50%,75%,${.08+z*.16})`;ctx.fillRect(x,y,.6+z,.6+z);}
 const glow=ctx.createRadialGradient(cx,cy,radius*.05,cx,cy,radius*1.9);glow.addColorStop(0,`hsla(${p.hue},75%,48%,.06)`);glow.addColorStop(.55,`hsla(${p.hue},70%,40%,.035)`);glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.fillRect(cx-radius*2,cy-radius*2,radius*4,radius*4);
 ctx.save();ctx.globalCompositeOperation='lighter';
 const bounds=(viewFill?canvasFillExtents:canvasFormExtents)[state.mode];
 if(bounds){
  const scaleX=width/(height*bounds[0]),scaleY=1/bounds[1];
  const fit=viewFill?Math.max(scaleX,scaleY):.9*Math.min(scaleX,scaleY);
  ctx.translate(cx,cy);
  ctx.scale(fit*viewZoom,fit*viewZoom);
  ctx.translate(-cx,-cy);
 }
 if(state.mode==='orb'){
  const radius=base*(1+reaction.kick*.20);
  const count=Math.floor((mobile?3300:particles.length)*density);
  for(let i=0;i<count;i++){const dot=particles[Math.floor(i*particles.length/count)],y=dot.y,a=dot.a+rot,r=Math.sqrt(1-y*y);const ripple=1+Math.sin(a*5+y*12+t*.8)*.025;const accent=kickSweep(reaction.pulses,y+.65+.12*Math.sin(a*5),4,5);let x=Math.cos(a)*r*ripple,z=Math.sin(a)*r*ripple,yy=y*ripple;const tilt=.22+camera.pitch;const py=yy*Math.cos(tilt)-z*Math.sin(tilt);z=yy*Math.sin(tilt)+z*Math.cos(tilt);const perspective=2.8/(2.8-z*.48),sx=cx+x*radius*perspective,sy=cy+py*radius*perspective;const alpha=(.15+(z+1)*.29)*(1+accent*.75);ctx.fillStyle=ink(.70+z*.28+reaction.mid*dot.r*.22,accent,dot.s>.91?reaction.treble*.7:0,alpha);const size=(.45+dot.s*.8)*perspective;ctx.fillRect(sx,sy,size,size);}
  for(let ring=0;ring<3;ring++){ctx.beginPath();for(let j=0;j<=360;j++){const a=j*Math.PI/180,x=Math.cos(a)*base*(1.13+ring*.13),y=Math.sin(a)*base*.23;const angle=-.4+ring*.24+t*(.10+ring*.035);const px=cx+x*Math.cos(angle)-y*Math.sin(angle),py=cy+x*Math.sin(angle)+y*Math.cos(angle);j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.strokeStyle=`hsla(${p.hue},75%,75%,${.12-ring*.025})`;ctx.lineWidth=.5;ctx.stroke();}
  // Curving meridians give the orbital skin an organic, filament structure.
  for(let filament=0;filament<Math.max(3,Math.round(7*density));filament++){
   ctx.beginPath();for(let j=0;j<=100;j++){const theta=j/100*Math.PI,phi=filament*.88+rot+Math.sin(theta*3+t*.3)*(.18+0),r=radius*(1+Math.sin(theta*7+t*.5)*bass*.07);const x=cx+Math.sin(theta)*Math.cos(phi)*r,y=cy+Math.cos(theta)*r;j?ctx.lineTo(x,y):ctx.moveTo(x,y);}
   ctx.strokeStyle=`hsla(${p.hue+8},75%,75%,${.06+reaction.mid*.12+bass*.12})`;ctx.lineWidth=.6;ctx.stroke();
  }
 }else if(state.mode==='wave'){
  // Four fluid ribbons with their own phase and depth, rather than a spectrum trace.
  const zoom=camera.zoom;
  const halfSpan=(width/2+2)*viewZoom/zoom;
  const center=cx-width*camera.x/zoom;
  const left=center-halfSpan,right=center+halfSpan;
  const threads=Math.max(4,Math.round(12*density)),waveSteps=Math.max(80,Math.round(180*density));
  for(let ribbon=0;ribbon<4;ribbon++)for(let thread=0;thread<threads;thread++){
   ctx.beginPath();
   for(let j=0;j<=waveSteps;j++){
    const u=j/waveSteps,x=left+u*(right-left),edge=Math.sin(u*Math.PI),phase=u*7+t*.55+ribbon*.95;
    const swell=Math.sin(phase)*.20;
    const y=((ribbon-1.5)*base*(viewFill?.65:.38)+(thread-threads/2)*base*.009+edge*base*swell+Math.cos(u*4+ribbon+t*.2)*base*.17)*viewZoom;
    const bank=(x-cx)*Math.tan(camera.roll);
    j?ctx.lineTo(x,cy+y+bank):ctx.moveTo(x,cy+y+bank);
   }
   const opacity=.10+thread/threads*.28+bass*.06;
   ctx.strokeStyle=ink(.65+ribbon*.12,0,0,opacity);
   if(reaction.pulses.some(pulse=>pulse.strength>.015)){
    const sweep=ctx.createLinearGradient(left,cy,right,cy);
    for(let stop=0;stop<=16;stop++){
     const u=stop/16,accent=kickSweep(reaction.pulses,u-.24+ribbon*.045,1.45,8);
     sweep.addColorStop(u,ink(.65+ribbon*.12,accent,0,opacity+accent*.54));
    }
    ctx.strokeStyle=sweep;
   }
   ctx.lineWidth=.6+reaction.treble*.5+reaction.spark*.3+bass*.2;ctx.stroke();
  }
 }
 if(state.mode==='fractal')drawFractalCanvas(cx,cy,base,t,p,reaction,state.distortion);
 else if(!['orb','wave','tunnel'].includes(state.mode))drawReferenceCanvas(state,{cx,cy,base,t,bass,p,reaction});
 ctx.restore();ctx.restore();
 drawCanvasTransition(state);
}

function drawCanvasTransition(state){
 if(state.transition){const fade=Math.sin(Math.PI*Math.min(1,state.transition.progress))**2*.96;ctx.fillStyle=`rgba(9,11,11,${fade})`;ctx.fillRect(0,0,width,height);}
}

function drawTunnelCanvas(state,reaction,ink){
 const distance=state.musicReactive===false?state.baseTravel:state.travel;
 const ride=tunnelRide(distance,state.camera),cx=width*(.5+viewCenter.x),cy=height*(.5+viewCenter.y);
 const focal=height*.5/Math.tan(43*Math.PI/360)*viewZoom*(viewFill?1.22:1);
 const yaw=Math.atan2(ride.x,-ride.z),pitch=Math.atan2(ride.y,Math.hypot(ride.x,ride.z));
 const cyaw=Math.cos(yaw),syaw=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
 const cb=Math.cos(ride.bank),sb=Math.sin(ride.bank),sides=32,frames=[];
 const step=2.07,start=Math.floor(distance/step)*step;
 for(let row=0;row<15;row++){
  const along=start+row*step,depth=along-distance,section=tunnelSection(along),points=[];
  for(let i=0;i<sides;i++){
   const angle=i/sides*Math.PI*2+section.twist;
   const x=section.x-ride.here.x+Math.cos(angle)*section.radius-ride.seatX;
   const y=section.y-ride.here.y+Math.sin(angle)*section.radius-ride.seatY;
   const across=x*cyaw-depth*syaw,forward=depth*cyaw+x*syaw;
   const up=y*cp-forward*sp,z=forward*cp+y*sp;
   points.push(z>.2?[cx+focal*(across*cb-up*sb)/z,cy-focal*(up*cb+across*sb)/z]:null);
  }
  frames.push({points,depth});
 }
 for(let row=frames.length-1;row>=0;row--){
  const {points,depth}=frames[row],accent=kickSweep(reaction.pulses,(depth-1)*.08,2.6,8);
  const opacity=Math.max(0,1-depth/28);
  const shimmer=.5+.5*Math.cos(depth*.56+state.time*2.1);
  ctx.strokeStyle=ink(.58+shimmer*.29,accent,shimmer**4*reaction.treble*.30,opacity*(.40+shimmer*.14+accent*.38));ctx.lineWidth=1.15+accent;
  ctx.beginPath();
  for(let i=0;i<sides;i++){
   const point=points[i],next=points[(i+1)%sides];
   if(point&&next){ctx.moveTo(...point);ctx.lineTo(...next);}
   const rail=frames[row+1]?.points[i];
   if(i%4===0&&point&&rail){ctx.moveTo(...point);ctx.lineTo(...rail);}
  }
  ctx.stroke();
 }
}
let horizonImage;
function prepareHorizon(){
 if(horizonImage)return;
 horizonImage=window.ResonanceGraphics?.getHorizonImage();
 if(!horizonImage)return;
 horizonImage.addEventListener('load',()=>{if(state.mode==='horizon')draw();},{once:true});
 horizonImage.addEventListener('error',()=>{if(state.mode==='horizon')draw();},{once:true});
}
function drawHorizonCanvas(scene,camera){
 if(!horizonImage?.naturalWidth){
  ctx.fillStyle='#dae2dc';
  ctx.font='14px sans-serif';
  ctx.textAlign='center';
  ctx.fillText(!horizonImage||horizonImage.complete?'Horizon image unavailable':'Loading Horizon…',width/2,height/2);
  ctx.textAlign='start';
  return;
 }
 const image=horizonImage,iw=image.naturalWidth,ih=image.naturalHeight;
 const fit=(viewFill?Math.max:Math.min)(width/iw,height/ih)*viewZoom*horizonCameraZoom(camera,width/height,viewFill);
 const reaction=getVisualReactions(scene),t=scene.time;
 const terrainDrive=scene.horizonTerrainDrive??0;
 const distortion=Math.min(scene.distortion,1.5);
 ctx.save();
 ctx.translate(width*(.5+viewCenter.x+camera.x),height*(.5+viewCenter.y+camera.y));
 ctx.rotate(camera.roll);
 ctx.translate(-iw*fit/2,-ih*fit/2);
 ctx.scale(fit,fit);
 ctx.drawImage(image,0,0);
 const rows=64;
 for(let row=0;row<rows;row++){
  const v=(row+.5)/rows,y=row*ih/rows,h=ih/rows;
  const rim=(.418+.39*(v-.77)**2)*iw;
  const window=Math.min(1,v*12,(1-v)*12);
  const plumeDistance=.06+(1-v)*.29+.025*Math.sin(v*9);
  const kick=Math.min(1.25,reaction.pulses.reduce((sum,pulse)=>{
   const front=plumeDistance-pulse.age*.66;
   return sum+pulse.strength*Math.exp(-((front*(front>0?30:8))**2));
  },0));
  const smokePhase=(t*.085+(scene.horizonSmoke??0)+v*.23)%1;
  const band=.68+.32*Math.sin(v*21);
  const baseLandClock=t*.055+(scene.horizonTerrain??0);
  const landClock=baseLandClock+.10*terrainDrive*Math.sin(v*9.45-baseLandClock*Math.PI*2);
  const landPhase=landClock+v*.13-Math.floor(landClock+v*.13);
  const strength=window*distortion;
  const wind=.035+.009*Math.sin(v*27-t*.65);
  drawHorizonStrip(image,.065*iw,rim-.048*iw,y,h,smokePhase,wind*iw*strength,.036*ih*strength,kick*.26,true);
  const terrainRise=(.051+terrainDrive*.11)*strength*(.75+.25*band);
  const shear=Math.sin(v*21-landClock*Math.PI*2)*terrainDrive*.038;
  const sampleRim=(.418+.39*(v+terrainRise-.77)**2)*iw;
  const terrainLeft=rim+.055*iw;
  const terrainShift=Math.max(Math.min(0,Math.max(rim,sampleRim)+.025*iw-terrainLeft),((v-.77)*.035+shear)*iw*strength);
  drawHorizonStrip(image,terrainLeft,.935*iw,y,h,landPhase,terrainShift,terrainRise*ih,0);
 }
 ctx.restore();
}
function drawHorizonStrip(image,left,right,y,height,phase,dx,dy,push,smoke=false){
 const width=right-left;
 const drawSample=(value,opacity)=>{
  const travel=value+push;
  const sy=Math.min(image.naturalHeight-height,y+dy*travel);
  let rightLimit=image.naturalWidth;
  if(smoke){
   // Use the closest point of the rim across the entire shifted source strip.
   const nearestRimY=Math.max(sy,Math.min(sy+height,.77*image.naturalHeight));
   rightLimit=(.406+.39*(nearestRimY/image.naturalHeight-.77)**2)*image.naturalWidth;
  }
  const sx=Math.max(0,Math.min(rightLimit-width,left+dx*travel));
  ctx.globalAlpha=opacity;
  ctx.drawImage(image,sx,sy,width,height,left,y,width,height);
 };
 drawSample((phase+.5)%1,.8);
 drawSample(phase,1-Math.abs(phase*2-1));
}
let fractalBranches,fractalContours;
function drawFractalCanvas(cx,cy,base,time,palette,reaction,distortion){
 fractalBranches??=buildFractalBranches();
 fractalContours??=buildFractalContours();
 const count=getFractalBranchCount(qualityLevel),scale=base*.94,ink=canvasPaletteInk(palette);
 const smooth=(min,max,value)=>{
  const t=Math.max(0,Math.min(1,(value-min)/(max-min)));
  return t*t*(3-2*t);
 };
 const pulseAt=(radius,arm)=>kickSweep(reaction.pulses,radius+.06-arm*.017,3.65,8);
 // Shared coordinates keep parent and daughter branches joined while bending.
 const nodes=Array.from({length:6},()=>new Map());
 function node(x,y,arm){
  const key=x+','+y,cached=nodes[arm].get(key);
  if(cached)return cached;
  const radius=Math.hypot(x,y),phase=radius*10-time*2.65+arm*.88;
  const room=smooth(.12,.68,radius)*(1-smooth(1.94,2.22,radius))*distortion;
  const pulse=pulseAt(radius,arm);
  const tangent=((.016+reaction.mid*.047)*Math.sin(phase)+.009*Math.sin(phase*1.67+x*5)
   +pulse*(.012+.028*reaction.bass))*room/Math.max(radius,.001);
  const radial=1+room*Math.sin(phase*.72)*reaction.mid*.014;
  const point={x:cx+(x*radial-y*tangent)*scale,y:cy-(y*radial+x*tangent)*scale,pulse,radius};
  nodes[arm].set(key,point);
  return point;
 }
 const contourCount=getFractalContourCount(qualityLevel);
 for(let i=0;i<contourCount;i++){
  const {x,y,endX,endY,arm,level,phase}=fractalContours[i];
  const start=node(x,y,arm),end=node(endX,endY,arm);
  const pulse=(start.pulse+end.pulse)*.5;
  const wave=.5+.5*Math.sin((start.radius+end.radius)*14+level*1.6-time*3.4);
  const glint=(.5+.5*Math.sin(phase*Math.PI*2+time*4))**10;
  ctx.strokeStyle=ink(.56+wave*.34,.18+reaction.mid*wave*.24+pulse*.62,glint*(reaction.treble*.28+reaction.spark*.18),.30+wave*.24+pulse*.26);
  ctx.lineWidth=level===0?1.15:.75;
  ctx.beginPath();
  ctx.moveTo(start.x,start.y);
  ctx.lineTo(end.x,end.y);
  ctx.stroke();
 }
 for(let i=0;i<count;i++){
  const {x,y,endX,endY,level,arm,phase}=fractalBranches[i];
  const start=node(x,y,arm),end=node(endX,endY,arm);
  const pulse=(start.pulse+end.pulse)*.5;
  const wave=.5+.5*Math.sin((start.radius+end.radius)*11-time*4.4+level*1.4+arm*.7);
  const midLight=level>0?reaction.mid*wave:0;
  ctx.strokeStyle=ink(.78+wave*.18,.18+wave*.18+pulse*1.3+midLight*.48,0,.62-level*.068+wave*.12+pulse*.28);
  ctx.lineWidth=.65+1.65*.58**level;
  ctx.beginPath();
  ctx.moveTo(start.x,start.y);
  ctx.lineTo(end.x,end.y);
  ctx.stroke();
  if(i%2===0){
   const travel=(time*(.20+phase*.35)+phase+level*.17)%1;
   const envelope=smooth(.05,.28,travel)*(1-smooth(.72,.98,travel));
   const flash=(.5+.5*Math.sin(time*(3+phase*6)+phase*40))**5;
   const sparkle=flash*(reaction.treble*.58+reaction.spark*.48)+pulse*.66;
   ctx.fillStyle=ink(.86,pulse,.42+sparkle,envelope*(.20+sparkle));
   const size=.9+flash*.8+pulse*1.5;
   ctx.fillRect(start.x+(end.x-start.x)*travel-size/2,start.y+(end.y-start.y)*travel-size/2,size,size);
  }
 }
}

function drawDataCanvas(state,{cx,cy,base,t,bass,p,reaction}){
 const percussion=reaction.spark+reaction.treble*.5,ink=canvasPaletteInk(p);
 if(state.mode==='swarm'){
  const cloudScale=base;
  const count=Math.floor(6500*density);
  for(let i=0;i<count;i++){const y=1-2*((i*.41421356237)%1),a=i*2.39996323+t*.18,r=(.3+((i*.75487766625)%1)*.7)*Math.sqrt(1-y*y),z=Math.sin(a)*r,x=Math.cos(a)*r*1.4;const interior=Math.max(0,1-Math.hypot(x/1.4,y));const accent=kickSweep(reaction.pulses,x+.9,4,5)*interior;ctx.fillStyle=ink(.68+z*.32+reaction.mid*interior*.22,accent,i%19===0?percussion*.6:0,.27+(z+1)*.15+accent*.45+interior*(percussion+bass)*.12);ctx.fillRect(cx+x*cloudScale,cy+(y*.7+Math.sin(x*2+t*.2)*.2)*cloudScale,2.1,2.1);}
  return;
 }
 const layers=Math.floor(28*density);
 for(let i=0;i<layers;i++){const v=i/layers;const accent=kickSweep(reaction.pulses,v-.14,1.8,10);ctx.beginPath();for(let j=0;j<=160;j++){const u=j/160,x=(u-.5)*base*3,y=(v-.5)*base*2+Math.sin(u*9+v*6+t*(state.mode==='relic'?.22:.48))*base*.12+Math.sin(u*17-v*4-t*.3)*base*.08;j?ctx.lineTo(cx+x,cy+y):ctx.moveTo(cx+x,cy+y);}ctx.lineTo(cx+base*1.5,cy+base*1.4);ctx.lineTo(cx-base*1.5,cy+base*1.4);ctx.closePath();ctx.fillStyle=ink(.30+v*.64+reaction.mid*.22,0,0,1);ctx.fill();ctx.strokeStyle=ink(.8,accent,i%7===0?percussion*.45:0,.18+accent*.75);ctx.lineWidth=.6+accent*.85;ctx.stroke();}
}

function drawReferenceCanvas(state,{cx,cy,base,t,bass,p,reaction}){
 if(['flux','relic','swarm'].includes(state.mode)){drawDataCanvas(state,{cx,cy,base,t,bass,p,reaction});return;}
 const mode=state.mode,seed=state.visualSeed*.013,clock=t*.24,d=state.distortion,percussion=reaction.spark+reaction.treble*.5;
 const ink=canvasPaletteInk(p);
 const count=Math.floor(({cascade:170,strata:140,vortex:150,pulse:60,ember:85}[mode]||60)*density),steps=mode==='cascade'?100:160;
 for(let i=0;i<count;i++){
  const v=(i*.61803398875)%1;ctx.beginPath();
  for(let j=0;j<=steps;j++){
   const u=j/steps,a=u*Math.PI*2;let x=0,y=0;
   if(mode==='cascade'){
    const spread=.13+u**1.8*(1.1);
    x=(v-.5)*spread*2+Math.sin(u*5+v*5+clock)*u*.22+Math.sin(u*5+v*6+clock)*Math.sin(u*Math.PI)*.13*d;
    y=-(u*3.8-1.8)+Math.sin(v*6.28318+seed)*.22;
   }else if(mode==='strata'){
    const ridge=Math.sin(a*5+Math.sin(a*3+clock)*1.4+v*10+seed)*.12,r=(.22+v*1.65+ridge*.4*d);x=Math.cos(a)*r;y=Math.sin(a)*r*.82;
   }else if(mode==='vortex'){
    const r=(.38+u**.85*1.65+Math.sin(u*9+v*6+clock)*.045*d),angle=v*Math.PI*2+u*3.5+clock*.3;x=Math.cos(angle)*r;y=Math.sin(angle)*r;
   }else if(mode==='pulse'){
    const r=.25+v*1.65+Math.sin(v*19-clock*2)*.018;x=Math.cos(a)*r;y=Math.sin(a)*r;
   }else if(mode==='ember'){
    const scale=.23+v*.88,tip=(.5+.5*Math.sin(a))**5,taper=1-.68*(.5+.5*Math.sin(a))**2;x=Math.cos(a)*taper*1.45*scale+Math.sin(a*3+clock*2+v*6)*.022*d*(.5+.5*Math.sin(a));y=(Math.sin(a)*1.45+tip*.55-.12)*scale;
   }
   const px=cx+x*base*.66,py=cy-y*base*.66;j?ctx.lineTo(px,py):ctx.moveTo(px,py);
  }
  const depth=.58+v*.35+reaction.mid*.18*(1-v);
  const ember=mode==='ember';
  let ridgeAccent=kickSweep(reaction.pulses,v-(ember?.32:.04),ember?1.25:2.7,ember?10:9);
  if(ember)ridgeAccent*=Math.min(1,Math.max(0,(v-.20)*8))*Math.min(1,Math.max(0,(.90-v)*5));
  const opacity=mode==='cascade'?.26:mode==='vortex'?.30:.52;
  ctx.strokeStyle=ink(depth,ridgeAccent,0,opacity+ridgeAccent*.48);ctx.lineWidth=mode==='strata'?1.1:.65;ctx.stroke();
 }
 // Steady decorative beads plus bounded treble-transient accents.
 for(let i=0;i<Math.round(180*density);i++){
  const a=i*2.39996323+t*.024,r=base*(.24+(i*.61803398875)%1*.98),spark=percussion;
  ctx.fillStyle=ink(.85,0,spark,.15+Math.min(.6,spark*.5));ctx.fillRect(cx+Math.cos(a)*r,cy+Math.sin(a)*r,1+spark,1+spark);
 }
}

function draw(now=performance.now()){
 const preview=paletteDraft?{...state,mode:$('#palette-preview-form').value||state.mode,palette:CUSTOM_PALETTE,customPalette:paletteDraft,transition:null}:state;
 const scene=visualFrame(replayRun?replayScene(now):preview);
 if(scene.mode==='horizon')prepareHorizon();
 if(state.graphics==='auto'&&threeView?.ready){try{if(threeView.render(scene,{width:innerWidth,height:innerHeight,level:replayRun?replayClip.qualityLevel:qualityLevel,zoom:viewZoom,fill:viewFill,center:viewCenter,palette:resolvePalette(scene.palette,scene.customPalette)})){canvas.hidden=true;threeCanvas.hidden=false;threeCanvas.style.opacity=String(scene.transition?1-Math.sin(Math.PI*Math.min(1,scene.transition.progress))**2*.96:1);return;}}catch(error){handleGraphicsFailure('3D rendering stopped: '+error.message);}}
 canvas.hidden=false;if(threeCanvas)threeCanvas.hidden=true;drawCanvas(scene);
}
function handleGraphicsFailure(reason){graphicsFailure=reason;if(threeView)threeView.ready=false;canvas.hidden=false;if(threeCanvas)threeCanvas.hidden=true;refreshGraphicsControls();const old=threeView;queueMicrotask(()=>{if(old===threeView&&!old?.ready){old?.dispose();threeView=null;threeCanvas?.remove();threeCanvas=null;refreshGraphicsControls();draw();}});}
function initializeGraphics(){
 threeView?.dispose();threeView=null;threeCanvas?.remove();threeCanvas=null;canvas.hidden=false;
 if(state.graphics==='auto'){
  if(!window.ResonanceGraphics?.Resonance3D)graphicsFailure='3D library did not load. Canvas remains available.';
  else try{graphicsFailure='';threeCanvas=document.createElement('canvas');threeCanvas.id='visual-3d';threeCanvas.setAttribute('aria-label','Three-dimensional audio visualization');canvas.after(threeCanvas);threeView=new window.ResonanceGraphics.Resonance3D({canvas:threeCanvas,onFailure:handleGraphicsFailure});threeView.resize(innerWidth,innerHeight,qualityLevel);}catch(error){graphicsFailure='WebGL is unavailable: '+error.message;threeView?.dispose();threeView=null;threeCanvas?.remove();threeCanvas=null;}
 }
 refreshGraphicsControls();draw();
}
function refreshGraphicsControls(){
 if(!$('#graphics-backend'))return;const active=state.graphics==='auto'&&threeView?.ready;
 $('#graphics-backend').value=state.graphics;$('#graphics-status').textContent=active?'Three.js · WebGL2 · local HDR pipeline':state.graphics==='canvas'?'Canvas classic · simplified fallback':'Canvas fallback · '+(graphicsFailure||'Preparing 3D…');$('#retry-graphics').hidden=state.graphics!=='auto'||!!active;
 for(const [id,key] of [['distortion','distortion'],['glow','glow']]){$('#'+id).value=state[key];$('#'+id).disabled=!active||(key==='glow'&&['strata','relic'].includes(state.mode));$('#'+id+'-value').textContent=key==='glow'&&['strata','relic'].includes(state.mode)?'Matte':Math.round(state[key]*100)+'%';}
 $('#pointer-orbit').setAttribute('aria-checked',String(state.pointerOrbit));$('#pointer-orbit').textContent=state.pointerOrbit?'On':'Off';$('#pointer-orbit').disabled=!active;$('#graphics-debug').value=state.graphicsDebug;$('#graphics-debug').disabled=!active;$('#visual-seed').value=state.visualSeed;$('#visual-seed').disabled=!active;if(!active)$('#graphics-stats').textContent='Canvas fallback does not run the 3D image pipeline.';
}
function initializeGraphicsControls(){
 $('#graphics-backend').addEventListener('change',event=>{state.graphics=event.target.value;initializeGraphics();qualityWarmup=0;});$('#retry-graphics').addEventListener('click',initializeGraphics);
 for(const key of ['distortion','glow'])$('#'+key).addEventListener('input',event=>{state[key]=+event.target.value;refreshGraphicsControls();draw();});$('#pointer-orbit').addEventListener('click',()=>{state.pointerOrbit=!state.pointerOrbit;refreshGraphicsControls();});$('#graphics-debug').addEventListener('change',event=>{state.graphicsDebug=event.target.value;draw();});$('#visual-seed').addEventListener('change',event=>{state.visualSeed=Math.max(1,Math.min(9999,Math.round(Number(event.target.value)||71)));refreshGraphicsControls();draw();});
 initializeSignalPanel();
 $('#signal-drag-handle').addEventListener('keydown',event=>{const steps={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]};if(event.key==='Home'){event.preventDefault();signalPanel?.reset();}else if(steps[event.key]){event.preventDefault();signalPanel?.moveBy(...steps[event.key]);}});initializeGraphics();
}
function initializeSignalPanel(){
 if(window.ResonanceGraphics?.createSignalPanel)try{signalPanel=window.ResonanceGraphics.createSignalPanel($('#listening-feedback'),$('#signal-drag-handle'),$('#reset-signal-panel'));}catch{message('Signal panel stays fixed in this browser.');}

}
function frame(now){const frameMs=lastFrame?now-lastFrame:16.7,delta=Math.min(frameMs/1000,.05);lastFrame=now;if(!document.hidden){
 signalPanel?.sync(state.paused,reduced.matches,document.hidden);

 analyse(now,delta);
 updateMeters(now);
 if(!state.paused){
  const speed=state.expression==='restrained'?.65:1;
  state.time+=delta*speed*FORM_MOTION[state.mode].flow;
  if(state.mode==='horizon'){
   const response=getVisualReactions(state);
   state.horizonSmoke=(state.horizonSmoke+delta*speed*response.bass*.68)%1;
   const mids=Math.max(0,Math.min(1,(response.mid-.025)/.425));
   const target=mids*mids*(3-2*mids);
   const timeConstant=target>state.horizonTerrainDrive?.16:.62;
   state.horizonTerrainDrive+=(target-state.horizonTerrainDrive)*(-Math.expm1(-delta/timeConstant));
   state.horizonTerrain+=delta*speed*state.horizonTerrainDrive*.82;
  }
  state.visualTime+=delta;
  state.cameraTime+=delta*(state.camera>0?speed:0);
  if(state.mode==='tunnel'&&state.camera>0){
   const reaction=getVisualReactions(state);
   const baseline=4.7*speed*Math.min(1,state.camera/.35);
   state.baseTravel+=delta*baseline;
   const surge=state.musicReactive?(reaction.bass*2.8+reaction.kick*3.1)*Math.min(1,state.camera/.35):0;
   state.travel+=delta*(baseline+surge);
  }
  state.shockwaves=state.shockwaves.filter(w=>{w.age+=delta;return w.age<.85;});
  if(state.musicReactive&&!replayRun&&!paletteDraft)advanceScenes(delta);
  recordReplayFrame(now);
  const drawStart=performance.now();
  if(!replayRun||(!replayRun.finished&&replayRun.held===null))draw(now);
  const drawMs=performance.now()-drawStart;
  qualityWarmup+=delta;
  if(!replayRun&&state.quality==='auto'&&qualityWarmup>2&&qualityGovernor.update(frameMs,drawMs,delta))refreshQuality();
 }else if(replayRun&&!replayRun.finished&&replayRun.held===null){draw(now);}
 bars.forEach((bar,i)=>{const v=frequency?frequency[Math.floor((i/40)**2*(frequency.length-1))]/255:(Math.sin(now/1000*3+i*.7)*.5+.5)*(.3+(musicSignal?.bass??0));bar.style.height=`${2+v*22}px`;});
 }requestAnimationFrame(frame);}
let lastMeters=0;
function updateMeters(now){if(now-lastMeters<90)return;lastMeters=now;
 const capturedSeconds=state.paused?0:Math.min(8,((replayHistory.at(-1)?.at??0)-(replayHistory[0]?.at??0))/1000);
 $('#capture-replay').disabled=capturedSeconds<8;
 if(!replayRun)$('#replay-status').textContent=capturedSeconds>=8?(state.source==='demo'?'Ready · preview signal':'Ready · last 8 s'):`Collecting visual data · ${Math.floor(capturedSeconds)}/8 s`;
 const signal=musicSignal??{bass:0,mid:0,high:0,beat:0};
 const kickTimes=recentKicks.map(time=>((now-time)/1000).toFixed(1)+' s');
 const status=`Bass ${Math.round(signal.bass*100)}% · Kicks (5 s): ${kickTimes.length}`;
 $('#comparison-bass').value=signal.bass;
 $('#comparison-kicks').textContent=status;
 $('#comparison-timing').textContent=kickTimes.length?'Kick ages · '+kickTimes.reverse().slice(0,5).join(' / '):'Waiting for a kick';
 for(const [id,value] of [['bass',signal.bass],['mid',signal.mid],['high',signal.high]])$('#'+id+'-meter').value=value;$('#beat-led').style.opacity=String(.15+signal.beat*.85);$('#beat-led').style.boxShadow=`0 0 ${signal.beat*12}px var(--accent)`;$('#dynamics-state').textContent=state.source==='demo'?'PREVIEW':state.level<=.002?'WAITING':signal.release>.2?'RELEASE':signal.build>.2?'BUILDING':'LISTENING';$('#adaptive').title=state.adaptive?`Visual level compensation: ${state.autoGain.toFixed(2)}×`:'Original audio dynamics';updateStudioMeters(signal);}
const formDescriptions={orb:'The sphere expands on each bass kick while its rings keep orbiting.',wave:'Four ribbons twist through the spectrum.',tunnel:'Ride through a twisting tube. Bass and kicks add bursts of speed.',cascade:'Dense cyan filaments, turbulent crest, and a foaming base.',strata:'Sculpted mineral layers with fine fibers and deep creases.',vortex:'Scarlet and gold filaments spiral around a dark cyan-rimmed eye.',pulse:'Filled amber rings and luminous beads surround a teal iris.',ember:'A layered golden flame glows against magenta rings and embers.',flux:'Flowing coral and cyan pigment folds with granular depth.',relic:'Ivory sculpted folds, carved ridges, and deep cavities.',swarm:'A true 3D particle volume with rolling currents and beat-driven bursts.',fractal:'A sixfold fractal with nested snowflakes and recursively jagged edges. Kicks sweep outward, mids light the inner contours, and treble lights the glints.',horizon:'Bass pushes smoke outward. Mids ripple the terrain, and treble lights its mineral flecks.'};
const formIconPaths={
 orb:'M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0M2 15c2 4 22-4 20-7S0 11 2 15',
 wave:'M2 6c4-7 7 7 11 0s7 0 9 0M2 12c4-7 7 7 11 0s7 0 9 0M2 18c4-7 7 7 11 0s7 0 9 0',
 tunnel:'M7 2h10l5 5v10l-5 5H7l-5-5V7zM9 6h6l3 3v6l-3 3H9l-3-3V9zM10 10h4v4h-4z',
 cascade:'M3 21C7 15 4 3 12 2M8 22C5 15 15 9 12 2M13 22C17 14 8 8 12 2M20 21C15 15 20 6 12 2',
 strata:'M2 10c5-11 16-11 20 0-1 13-17 15-20 0zM5 10c4-7 12-7 14 0 0 9-12 10-14 0zM8 11c2-4 7-4 8 0 0 5-7 6-8 0z',
 vortex:'M12 12c-3-4 4-8 7-3 5 8-9 17-16 7C-4 5 14-7 22 7M12 12c4 1 2 6-2 5-6-1-4-11 3-12',
 pulse:'M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0M6 12a6 6 0 1 0 12 0 6 6 0 1 0-12 0M10 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
 ember:'M12 2C13 8 21 10 20 16a8 8 0 0 1-16 0C3 10 10 8 12 2zM12 10c1 4 5 5 4 8a4 4 0 0 1-8 0c-1-3 3-4 4-8z',
 flux:'M2 8c4-10 8 12 13 2s10-1 5 4S9 25 4 17s12-13 13-5M6 3c8-2 1 18 12 18',
 relic:'M3 7l9-4 9 4-9 4zM3 11l9 4 9-4M3 15l9 4 9-4M3 19l9 4 9-4',
 swarm:'M5 6h.1M11 3h.1M17 5h.1M21 11h.1M17 17h.1M10 21h.1M3 16h.1M3 11h.1M10 9h.1M13 14h.1M8 16h.1M17 11h.1',
 fractal:'M12 2v20M3.34 7l17.32 10M3.34 17 20.66 7M9 4l3 3 3-3M9 20l3-3 3 3M3.6 10.6l4.1-1.1-1.1-4.1M17.4 18.6l-1.1-4.1 4.1-1.1M6.6 18.6l1.1-4.1-4.1-1.1M20.4 10.6l-4.1-1.1 1.1-4.1',
 horizon:'M22 3a20 20 0 0 0-13 19M2 9c3-4 4 4 8 0M2 15c2-3 3 2 5 1M15 17c3-2 4 1 7 0M17 10c2-1 3 0 5-1'
};
function makeFormIcon(id){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width',id==='swarm'?'3':'1.4');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('focusable','false');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',formIconPaths[id]);svg.append(path);return svg;}
FORM_CATALOG.forEach((form,index)=>{const button=document.createElement('button');button.dataset.mode=form.id;button.setAttribute('aria-label',`(${index+1}) ${form.name}`);button.setAttribute('aria-pressed',String(form.id===state.mode));const icon=document.createElement('span');icon.className='mode-art';icon.setAttribute('aria-hidden','true');icon.append(makeFormIcon(form.id));const preview=document.createElement('span');preview.className='form-preview';preview.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent=form.name;const number=document.createElement('small');number.textContent=String(index+1).padStart(2,'0');const caption=document.createElement('span');caption.className='form-card-caption';caption.append(icon,label,number);button.append(preview,caption);button.addEventListener('click',()=>chooseScene(form.id,true));$('#form-picker').append(button);});
function paletteSwatches(palette){
 const ns='http://www.w3.org/2000/svg';
 const svg=document.createElementNS(ns,'svg');
 svg.setAttribute('viewBox','0 0 48 12');
 svg.setAttribute('class','palette-swatches');
 svg.setAttribute('aria-hidden','true');
 PALETTE_ROLES.forEach((role,index)=>{
  const chip=document.createElementNS(ns,'rect');
  chip.setAttribute('x',String(index*12));
  chip.setAttribute('width','12');
  chip.setAttribute('height','12');
  chip.setAttribute('fill',palette[role]);
  svg.append(chip);
 });
 return svg;
}
function activeSavedPalette(){
 return state.palette===CUSTOM_PALETTE?savedPalettes.find(item=>sameCustomPalette(item,state.customPalette)):undefined;
}
function sameCustomPalette(first,second){
 return first.name===second?.name&&PALETTE_ROLES.every(role=>first[role]===second[role]);
}
function refreshPaletteControls(){
 const palette=resolvePalette(state.palette,state.customPalette);
 document.documentElement.style.setProperty('--palette-accent',palette.accent);
 $('#palette-name').textContent=palette.name;
 const selected=activeSavedPalette();
 $('#manage-palette').hidden=!selected;
 $('#saved-palette').querySelectorAll('button').forEach((button,index)=>{
  button.setAttribute('aria-pressed',String(savedPalettes[index]===selected));
 });
 document.querySelectorAll('[data-palette]').forEach(button=>button.setAttribute('aria-pressed',String(+button.dataset.palette===state.palette)));
}
function closePaletteEditor(){
 paletteDraft=null;
 paletteEditTarget=paletteEditAction=null;
 $('#palette-editor').hidden=true;
 $('#edit-palette').setAttribute('aria-expanded','false');
}
document.querySelectorAll('[data-palette]').forEach(button=>button.addEventListener('click',()=>{
 returnLive();closePaletteEditor();
 state.palette=+button.dataset.palette;
 refreshPaletteControls();draw();
}));
$('#sensitivity').addEventListener('input',event=>{state.gain=+event.target.value;$('#gain-value').textContent=state.gain.toFixed(1)+'×';});
$('#adaptive').addEventListener('click',()=>{state.adaptive=!state.adaptive;$('#adaptive').setAttribute('aria-checked',String(state.adaptive));$('#adaptive').textContent=state.adaptive?'On':'Off';});
document.querySelectorAll('[data-expression]').forEach(button=>button.addEventListener('click',()=>{state.expression=button.dataset.expression;document.querySelectorAll('[data-expression]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));draw();}));
function refreshCamera(){$('#camera').value=state.camera;$('#camera-value').textContent=state.camera===0?'Off':Math.round(state.camera*100)+'%';}
$('#camera').addEventListener('input',event=>{state.camera=+event.target.value;refreshCamera();draw();});
refreshCamera();
$('#motion').addEventListener('click',()=>{state.paused=!state.paused;refreshMotion();});
reduced.addEventListener('change',event=>{if(event.matches){state.paused=true;state.camera=0;state.transition=null;sceneDirector.reset();refreshCamera();refreshMotion();refreshStudioControls();draw();}});
$('#help').addEventListener('click',()=>$('#setup').showModal());$('#connect').addEventListener('click',()=>state.source==='demo'?$('#setup').showModal():disconnect());
$('#close-setup').addEventListener('click',()=>$('#setup').close());$('#setup').addEventListener('close',()=>{if(pending)operation++;});
$('#share').addEventListener('click',()=>connectAudio('shared'));$('#microphone').addEventListener('click',()=>connectAudio('mic'));$('#demo').addEventListener('click',()=>{disconnect();$('#setup').close();});
function setViewZoom(value){
 viewZoom=Math.max(.5,Math.min(2,Math.round(value*100)/100));
 for(const prefix of ['','listen-']){
  const reset=$('#'+prefix+'zoom-reset');
  reset.textContent=Math.round(viewZoom*100)+'%';
  reset.setAttribute('aria-label','Zoom '+reset.textContent+'. Reset to 100%');
  for(const direction of ['in','out']){
   const button=$('#'+prefix+'zoom-'+direction);
   button.disabled=direction==='in'?viewZoom>=2:viewZoom<=.5;
   button.title='Zoom '+direction+' · '+Math.round(viewZoom*100)+'%';
  }
 }
}
function setViewFill(fill){
 viewFill=fill;
 for(const prefix of ['','listen-']){
  const button=$('#'+prefix+'framing-toggle');
  button.textContent=fill?'Fill':'Fit';
  button.setAttribute('aria-pressed',String(fill));
 }
}
function setViewCenter(x,y){
 viewCenter={x,y};
 $('#view-center-x').value=Math.round(x*100);
 $('#view-center-y').value=Math.round(y*100);
}
function applyFormView(mode){
 const saved=savedFormViews[mode];
 setViewZoom(saved?.zoom??1);
 setViewFill(saved?.fill===true);
 setViewCenter(saved?.x??0,saved?.y??0);
 $('#clear-form-view').disabled=!saved;
 $('#form-view-status').textContent=saved?'Saved view for '+FORM_CATALOG.find(form=>form.id===mode).name+'.':'';
}
function changeZoom(value){
 setViewZoom(value);
 draw();
}
for(const prefix of ['','listen-']){
 $('#'+prefix+'zoom-reset').addEventListener('click',()=>changeZoom(1));
 $('#'+prefix+'framing-toggle').addEventListener('click',()=>{setViewFill(!viewFill);draw();});
 for(const [direction,delta] of [['out',-.1],['in',.1]]){
  $('#'+prefix+'zoom-'+direction).addEventListener('click',()=>{
   changeZoom(viewZoom+delta);
  });
 }
}
async function toggleFullscreen(){
 try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
 }catch{message('Fullscreen is unavailable in this browser window.');}
}
$('#fullscreen').addEventListener('click',toggleFullscreen);
let chromeTimer;
function revealChrome(event){
 if(!listening&&!document.fullscreenElement)return;
 document.body.classList.add('ui-visible');clearTimeout(chromeTimer);
 if(event?.type==='focusin'&&document.activeElement?.matches(':focus-visible'))return;
 chromeTimer=setTimeout(()=>{if(!settingsOpen&&!document.activeElement?.matches(':focus-visible'))document.body.classList.remove('ui-visible');},2400);
}
document.addEventListener('pointermove',revealChrome,{passive:true});document.addEventListener('pointerdown',revealChrome,{passive:true});document.addEventListener('keydown',revealChrome);document.addEventListener('focusin',revealChrome);document.addEventListener('focusout',revealChrome);
document.addEventListener('fullscreenchange',()=>{const full=!!document.fullscreenElement;clearTimeout(chromeTimer);document.body.classList.toggle('immersive',full);$('#fullscreen').setAttribute('aria-label',full?'Exit fullscreen':'Enter fullscreen');$('#listen-fullscreen').textContent=full?'Windowed':'Fullscreen';if(full){listeningBeforeFullscreen=listening;setListening(true);}else setListening(listeningBeforeFullscreen);draw();});
function chooseScene(mode,manual=false){
 if(manual)returnLive();
 if(!FORM_IDS.includes(mode))return;
 if(mode!==state.mode)applyFormView(mode);
 state.mode=mode;document.body.classList.toggle('reference-art',!['orb','wave','tunnel'].includes(mode));if(manual){state.sceneLock=true;state.transition=null;sceneDirector.reset();}
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 const index=FORM_IDS.indexOf(mode);$('#mode-number').textContent=String(index+1).padStart(2,'0');$('#mode-caption').textContent=FORM_CATALOG[index].caption;$('#form-description').textContent=formDescriptions[mode];refreshStudioControls();draw();
}
function advanceScenes(dt){
 if(state.sceneLock||!state.autoScenes||reduced.matches||(state.source!=='demo'&&state.level<=.002))state.transition=null;
 if(state.transition){state.transition.progress+=dt/.9;if(state.transition.progress>=.5&&!state.transition.switched){state.transition.switched=true;chooseScene(state.transition.to);}if(state.transition&&state.transition.progress>=1)state.transition=null;return;}
 const next=sceneDirector.update({mode:state.mode,auto:state.autoScenes,locked:state.sceneLock,paused:state.paused,reduced:reduced.matches,audible:state.source==='demo'||state.level>.002,build:state.build,release:state.release,bass:state.bass},dt);
 if(next)state.transition={to:next,progress:0,switched:false};
}
function refreshQuality(){const next=state.quality==='auto'?qualityGovernor.level:{low:0,medium:1,high:2,ultra:3}[state.quality];const changed=qualityLevel!==next;qualityLevel=next;density=[.38,.65,1,1.25][next];$('#quality-status').textContent=(state.quality==='auto'?'Auto · ':'')+['Low','Medium','High','Ultra'][next]+(next===3?' · supersampled up to 4K':'');if(changed)resize();}
function refreshStudioControls(){
 for(const [id,key] of [['bass-weight','bassWeight'],['kick-impact','kickImpact'],['spark-amount','sparkAmount'],['element-intensity','elementIntensity']]){if(!$('#'+id))continue;$('#'+id).value=state[key];$('#'+id+'-value').textContent=state[key]===0?'Off':Math.round(state[key]*100)+'%';}
 $('#release-threshold').value=state.releaseThreshold;$('#release-threshold-value').textContent=state.releaseThreshold.toFixed(2);$('#threshold-marker').style.left=state.releaseThreshold*100+'%';$('#tension-meter').title=`Release threshold ${state.releaseThreshold.toFixed(2)}; also requires sustained rise and a bass onset`;
 for(const [id,key] of [['auto-scenes','autoScenes'],['scene-lock','sceneLock'],['listen-meters','listeningMeters']]){$('#'+id).setAttribute('aria-checked',String(state[key]));if(id!=='listen-meters')$('#'+id).textContent=state[key]?'On':'Off';}
 $('#choreography-state').textContent=reduced.matches?'Auto held: reduced motion':!state.autoScenes?'Manual scenes':state.sceneLock?'Locked · choose Unlock to resume auto':!state.musicReactive?'Auto held · base motion comparison':'Auto · waits at least 12 seconds between scenes';$('#quality').value=state.quality;
 $('#listening-feedback').hidden=!listening||!state.listeningMeters||document.body.classList.contains('stage-mode');refreshGraphicsControls();signalPanel?.clamp();
}
function updateStudioMeters(signal){
 $('#tension-meter').value=signal.build??0;$('#listen-tension-meter').value=signal.build??0;
 const age=state.visualTime-state.lastReleaseAt;$('#release-history').textContent=Number.isFinite(age)?age<1?'Release detected just now':`Release detected ${Math.floor(age)}s ago`:'No release yet';$('#release-history').classList.toggle('recent',age<8);
 for(const [id,key] of [['listen-bass','bass'],['listen-mid','mid'],['listen-high','high']])$('#'+id).value=signal[key];
 $('#listen-source').textContent=state.source==='demo'?'PREVIEW · SIMULATED':state.level>.002?'LIVE AUDIO':'CONNECTED · WAITING';$('#listen-phase').textContent=$('#dynamics-state').textContent;if(threeView?.ready){const d=threeView.diagnostics();$('#graphics-stats').textContent=`Seed ${d.seed} · ${d.geometries} geometries · ${d.textures} textures · pixel ratio ${d.dpr?.toFixed(2)}. GPU timing not measured.`;}
}
const inspectorScroll=new Map();
function activeInspectorTab(){return $('.inspector-tabs [aria-selected=true]');}
function saveInspectorScroll(){
 inspectorScroll.set(activeInspectorTab().id,$('.inspector-content').scrollTop);
}
function restoreInspectorScroll(){
 $('.inspector-content').scrollTop=inspectorScroll.get(activeInspectorTab().id)??0;
}
function selectInspectorTab(tab){
 saveInspectorScroll();
 for(const item of $('.inspector-tabs').children){
  const selected=item===tab;
  item.setAttribute('aria-selected',String(selected));
  item.tabIndex=selected?0:-1;
  document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;
 }
 restoreInspectorScroll();
}
function expandSettings(open){
 document.body.classList.toggle('settings-expanded',open);
 $('#expand-settings').setAttribute('aria-expanded',String(open));
 $('#expand-settings').textContent=open?'Collapse':'Expand';
}
function syncSettingsVisibility(){
 $('.inspector').inert=(listening||mobileSettings.matches)&&!settingsOpen;
 $('.audio-panel').inert=listening||(mobileSettings.matches&&settingsOpen);
 $('#listening-toolbar').inert=mobileSettings.matches&&settingsOpen;
 $('#listen-settings').setAttribute('aria-expanded',String(listening&&settingsOpen));
 if(mobileSettings.matches)$('#mobile-settings').setAttribute('aria-expanded',String(!listening&&settingsOpen));
 else $('#mobile-settings').removeAttribute('aria-expanded');
}
function setSettingsOpen(open){
 if(!open&&settingsOpen)saveInspectorScroll();
 settingsOpen=open;
 document.body.classList.toggle('settings-open',open);
 syncSettingsVisibility();
 if(open){
  document.body.classList.add('ui-visible');
  clearTimeout(chromeTimer);
  restoreInspectorScroll();
  activeInspectorTab().focus({preventScroll:true});
 }else{
  if(listening||mobileSettings.matches)(listening?$('#listen-settings'):$('#mobile-settings')).focus();
  revealChrome();
 }
}
function setListening(enabled){
 returnLive();
 enabled=!!enabled;if(enabled===listening){if(enabled)revealChrome();return;}
 if(enabled)lastFocus=document.activeElement;
 if(settingsOpen||!mobileSettings.matches&&!listening)saveInspectorScroll();
 if(!enabled)document.body.classList.remove('stage-mode');
 $('#listen-exit').textContent=document.body.classList.contains('stage-mode')?'Exit Stage':'Exit listening';
 listening=enabled;document.body.classList.toggle('listening',listening);$('#listening-toolbar').hidden=!listening;
 $('header').inert=listening;$('.audio-panel').inert=listening;$('footer').inert=listening;
 settingsOpen=false;document.body.classList.remove('settings-open');syncSettingsVisibility();refreshStudioControls();
 if(listening){(document.body.classList.contains('stage-mode')?$('#listen-prev'):$('#listen-settings')).focus();revealChrome();}else{clearTimeout(chromeTimer);document.body.classList.remove('ui-visible');if(lastFocus?.isConnected&&!lastFocus.closest('[hidden]'))lastFocus.focus();else $('#listening').focus();
  if(!mobileSettings.matches)restoreInspectorScroll();
 }
 draw();
}
function currentSettings(){return normalizeSettings(state);}
let profiles;
function refreshPresetList(){const group=$('#custom-presets');group.replaceChildren();for(const p of profiles.profiles){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;group.append(option);}$('#preset').value=activePreset;const custom=profiles.profiles.some(p=>p.id===activePreset);$('#update-preset').disabled=!custom;$('#remove-preset').disabled=!custom;}
function applyPreset(settings,id){
 returnLive();closePaletteEditor();
 const previousBackend=state.graphics,previousMode=state.mode;Object.assign(state,normalizeSettings(settings));if(state.mode!==previousMode)applyFormView(state.mode);state.transition=null;sceneDirector.reset();if(reduced.matches){state.camera=0;state.paused=true;}
 activePreset=id;chooseScene(state.mode);refreshPaletteControls();$('#sensitivity').value=state.gain;$('#gain-value').textContent=state.gain.toFixed(1)+'×';$('#adaptive').setAttribute('aria-checked',String(state.adaptive));$('#adaptive').textContent=state.adaptive?'On':'Off';document.querySelectorAll('[data-expression]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.expression===state.expression)));refreshCamera();refreshMotion();refreshStudioControls();qualityGovernor.reset();qualityWarmup=0;refreshQuality();refreshPresetList();if(previousBackend!==state.graphics)initializeGraphics();draw();
}
function initializeStudio(){
 let storage;try{storage=window.localStorage;}catch{storage={getItem:()=>null,setItem:()=>{throw new Error('Storage unavailable');}};}
 const paletteStorageKey='resonance.palettes.v2';
 try{
  const saved=JSON.parse(storage.getItem(paletteStorageKey));
  if(Array.isArray(saved)){
   savedPalettes=saved.map(normalizeCustomPalette).filter(Boolean);
  }else{
   const previous=normalizeCustomPalette(JSON.parse(storage.getItem('resonance.palette.v1')));
   if(previous)savedPalettes=[previous];
  }
 }catch{}
 const libraryStatus=$('#palette-library-status');
 let deletedPalette=null,pendingImport=null,importRequest=0;
 const nameKey=name=>name.trim().toLowerCase();
 function availableName(name,items){
  const used=new Set(items.map(palette=>nameKey(palette.name)));
  let candidate=name;
  for(let index=2;used.has(nameKey(candidate));index++){
   const suffix=' ('+index+')';
   candidate=name.slice(0,40-suffix.length)+suffix;
  }
  return candidate;
 }
 function refreshSavedPalettes(){
  $('#saved-palette').replaceChildren(...savedPalettes.map(palette=>{
   const button=document.createElement('button');
   button.type='button';
   button.className='palette-row';
   const name=document.createElement('span');
   name.textContent=palette.name;
   button.append(name,paletteSwatches(palette));
   button.addEventListener('click',()=>{
    returnLive();closePaletteEditor();
    state.customPalette=palette;
    state.palette=CUSTOM_PALETTE;
    refreshPaletteControls();draw();
   });
   return button;
  }));
  $('#saved-palette-controls').hidden=!savedPalettes.length;
  $('#export-palettes').disabled=!savedPalettes.length;
  $('#undo-palette-delete').hidden=!deletedPalette;
  refreshPaletteControls();
 }
 function persistPalettes(next,status=libraryStatus){
  try{storage.setItem(paletteStorageKey,JSON.stringify(next));}
  catch{status.textContent='Could not save the palette library.';return false;}
  savedPalettes=next;
  return true;
 }
 refreshSavedPalettes();
 function openPaletteEditor(action='new',target=null){
  returnLive();
  const source=target??resolvePalette(state.palette,state.customPalette);
  paletteEditTarget=target;
  paletteEditAction=action;
  paletteDraft=normalizePaletteColors(source);
  document.querySelectorAll('[data-palette-role]').forEach(input=>input.value=paletteDraft[input.dataset.paletteRole]);
  const previewForm=$('#palette-preview-form');
  previewForm.options[0].textContent='Current Form · '+FORM_CATALOG.find(form=>form.id===state.mode).name;
  previewForm.value='';
  $('#palette-status').textContent='';
  const name=$('#custom-palette-name');
  name.value=action==='duplicate'?availableName(target.name,savedPalettes):target?.name??'';
  const rename=action==='rename',update=action==='update';
  name.readOnly=update;
  $('#palette-editor').classList.toggle('rename-palette',rename);
  $('#palette-editor-title').textContent=rename?'Rename palette':update?'Update palette':'Custom palette';
  $('#save-palette').textContent=rename?'Save name':update?'Update palette':'Save palette';
  $('#palette-editor').hidden=false;
  $('#edit-palette').setAttribute('aria-expanded','true');
  if(mobileSettings.matches&&settingsOpen)expandSettings(true);
  $('#palette-editor').scrollIntoView({block:'nearest'});
  (update?$('#palette-editor input[type=color]'):name).focus({preventScroll:true});
  draw();
 }
 $('#edit-palette').addEventListener('click',()=>{
  if(paletteDraft){closePaletteEditor();draw();return;}
  openPaletteEditor();
 });
 for(const action of ['rename','update','duplicate']){
  $('#'+action+'-palette').addEventListener('click',()=>{
   const target=activeSavedPalette();
   if(target)openPaletteEditor(action,target);
  });
 }
 function updatePaletteDraft(event){
  if(!paletteDraft)return;
  const role=event.target.dataset.paletteRole;
  if(role)paletteDraft[role]=event.target.value;
  draw();
 }
 $('#palette-editor').addEventListener('input',updatePaletteDraft);
 $('#palette-editor').addEventListener('change',updatePaletteDraft);
 $('#cancel-palette').addEventListener('click',()=>{closePaletteEditor();$('#edit-palette').focus();draw();});
 $('#save-palette').addEventListener('click',()=>{
  if(!paletteDraft)return;
  const nameInput=$('#custom-palette-name');
  const name=nameInput.value.trim();
  const target=['rename','update'].includes(paletteEditAction)?paletteEditTarget:null;
  if(!name||savedPalettes.some(item=>item!==target&&nameKey(item.name)===nameKey(name))){
   $('#palette-status').textContent=name?'Choose a different name. That palette already exists.':'Enter a palette name.';
   nameInput.focus();
   return;
  }
  const palette=normalizeCustomPalette({...paletteDraft,name});
  const next=target?savedPalettes.map(item=>item===target?palette:item):[...savedPalettes,palette];
  if(!persistPalettes(next,$('#palette-status')))return;
  state.customPalette=palette;
  state.palette=CUSTOM_PALETTE;
  closePaletteEditor();refreshSavedPalettes();$('#edit-palette').focus();draw();
  message('Saved '+palette.name+'.');
 });
 $('#delete-palette').addEventListener('click',()=>{
  const palette=activeSavedPalette();
  if(!palette)return;
  returnLive();closePaletteEditor();
  const index=savedPalettes.indexOf(palette);
  if(!persistPalettes(savedPalettes.filter(item=>item!==palette)))return;
  deletedPalette={palette,index};
  state.palette=0;
  state.customPalette=null;
  refreshSavedPalettes();draw();
  libraryStatus.textContent='Deleted '+palette.name+'.';
  $('#undo-palette-delete').focus();
 });
 $('#undo-palette-delete').addEventListener('click',()=>{
  if(!deletedPalette)return;
  const {palette,index}=deletedPalette;
  const restored={...palette,name:availableName(palette.name,savedPalettes)};
  const next=savedPalettes.slice();
  next.splice(index,0,restored);
  if(!persistPalettes(next))return;
  deletedPalette=null;
  returnLive();closePaletteEditor();
  state.customPalette=restored;
  state.palette=CUSTOM_PALETTE;
  refreshSavedPalettes();draw();
  libraryStatus.textContent='Restored '+restored.name+'.';
  $('#saved-palette button[aria-pressed=true]').focus();
 });
 $('#export-palettes').addEventListener('click',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,palettes:savedPalettes},null,2)],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download='resonance-palettes.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 function finishImport(replace){
  const active=activeSavedPalette();
  const next=savedPalettes.slice();
  for(const palette of pendingImport){
   const index=next.findIndex(item=>nameKey(item.name)===nameKey(palette.name));
   if(replace&&index>=0)next[index]=palette;
   else next.push({...palette,name:availableName(palette.name,next)});
  }
  const activeIndex=savedPalettes.indexOf(active);
  if(!persistPalettes(next))return;
  if(activeIndex>=0)state.customPalette=next[activeIndex];
  libraryStatus.textContent=`Imported ${pendingImport.length} palette${pendingImport.length===1?'':'s'}.`;
  pendingImport=null;
  $('#palette-import-conflict').hidden=true;
  returnLive();closePaletteEditor();refreshSavedPalettes();draw();
 }
 $('#import-palettes').addEventListener('click',()=>$('#palette-import-file').click());
 $('#palette-import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];
  event.target.value='';
  if(!file)return;
  const request=++importRequest;
  pendingImport=null;
  $('#palette-import-conflict').hidden=true;
  let incoming;
  try{
   if(file.size>1024*1024)throw new Error();
   const data=JSON.parse(await file.text());
   if(data?.version!==1||!Array.isArray(data.palettes)||!data.palettes.length)throw new Error();
   incoming=data.palettes.map(palette=>typeof palette?.name==='string'&&palette.name.trim()?normalizeCustomPalette(palette):null);
   if(incoming.some(palette=>!palette))throw new Error();
   if(new Set(incoming.map(palette=>nameKey(palette.name))).size!==incoming.length)throw new Error();
  }catch{
   if(request===importRequest)libraryStatus.textContent='Choose a valid Resonance palette backup.';
   return;
  }
  if(request!==importRequest)return;
  pendingImport=incoming;
  const names=[...savedPalettes,...pendingImport].map(palette=>nameKey(palette.name));
  if(new Set(names).size===names.length){finishImport(false);return;}
  libraryStatus.textContent='Some names already exist. Choose how to import them.';
  $('#palette-import-policy').value='keep';
  $('#palette-import-conflict').hidden=false;
  $('#palette-import-policy').focus();
 });
 $('#confirm-palette-import').addEventListener('click',()=>{if(pendingImport)finishImport($('#palette-import-policy').value==='replace');});
 $('#cancel-palette-import').addEventListener('click',()=>{
  pendingImport=null;
  $('#palette-import-conflict').hidden=true;
  libraryStatus.textContent='Import cancelled.';
  $('#import-palettes').focus();
 });
 $('#custom-palette-name').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.isComposing){event.preventDefault();$('#save-palette').click();}
 });
 $('#capture-replay').addEventListener('click',()=>{
  closePaletteEditor();captureReplay();
  if(replayRun&&mobileSettings.matches&&settingsOpen)expandSettings(true);
 });
 $('#replay-a').addEventListener('click',()=>playReplay(true));
 $('#replay-b').addEventListener('click',()=>playReplay(false));
 $('#replay-color-a').addEventListener('click',()=>playReplay(true,'A'));
 $('#replay-color-b').addEventListener('click',()=>playReplay(true,'B'));
 $('#replay-palette-b').addEventListener('change',()=>{
  refreshReplayPaletteSwatches();
  if(replayRun?.paletteSide==='B')playReplay(true,'B');
 });
 $('#replay-progress').addEventListener('input',event=>{
  if(!replayRun)return;
  replayRun.held=Number(event.target.value)*1000;
  replayRun.index=0;
  $('#match-palette-frame').setAttribute('aria-pressed','true');
  draw();
 });
 $('#match-palette-frame').addEventListener('click',event=>{
  if(!replayRun)return;
  const button=event.currentTarget;
  const hold=button.getAttribute('aria-pressed')==='false';
  button.setAttribute('aria-pressed',String(hold));
  if(hold){replayRun.held=replayRun.elapsed;draw();return;}
  replayRun.started=performance.now()-replayRun.elapsed;
  replayRun.held=null;
  replayRun.finished=false;
  $('#replay-status').textContent=replayRun.label;
  draw();
 });
 $('#return-live').addEventListener('click',returnLive);
 for(const eventName of ['input','change'])$('.inspector').addEventListener(eventName,event=>{
  if(!event.target.closest('#replay-palette-controls,#replay-timeline,.view-settings'))returnLive();
 },true);
 $('#music-compare').addEventListener('click',event=>{
  state.travel=state.baseTravel=state.musicReactive?state.travel:state.baseTravel;
  state.musicReactive=!state.musicReactive;
  state.transition=null;
  sceneDirector.reset();
  event.currentTarget.setAttribute('aria-checked',String(state.musicReactive));
  event.currentTarget.textContent=state.musicReactive?'A · Music response':'B · Base motion';
  refreshStudioControls();
  draw();
 });
 profiles=new ProfileLibrary(storage);refreshPresetList();if(profiles.error)$('#preset-status').textContent='Saved presets could not be loaded. Built-in presets remain available.';
 for(const [id,key] of [['bass-weight','bassWeight'],['kick-impact','kickImpact'],['spark-amount','sparkAmount'],['element-intensity','elementIntensity'],['release-threshold','releaseThreshold']])$('#'+id).addEventListener('input',event=>{state[key]=+event.target.value;refreshStudioControls();draw();});
 for(const [id,key] of [['auto-scenes','autoScenes'],['scene-lock','sceneLock'],['listen-meters','listeningMeters']])$('#'+id).addEventListener('click',()=>{state[key]=!state[key];state.transition=null;sceneDirector.reset();refreshStudioControls();});
 $('#quality').addEventListener('change',event=>{state.quality=event.target.value;qualityGovernor.reset();qualityWarmup=0;refreshQuality();draw();});
 $('#preset').addEventListener('change',event=>{const id=event.target.value,item=BUILTIN_PRESETS[id]||profiles.profiles.find(p=>p.id===id);if(item){applyPreset(item.settings,id);$('#preset-name').value=id.startsWith('custom-')?item.name:'';$('#preset-status').textContent=`Loaded ${item.name}. Audio connection unchanged.`;}});
 function savePreset(update){try{const item=profiles.save($('#preset-name').value,currentSettings(),update?activePreset:undefined);activePreset=item.id;refreshPresetList();$('#preset-status').textContent=`Saved ${item.name} in this browser.`;}catch(error){$('#preset-status').textContent=error.message;}}
 $('#save-preset').addEventListener('click',()=>savePreset(false));$('#update-preset').addEventListener('click',()=>savePreset(true));$('#remove-preset').addEventListener('click',()=>{try{const old=profiles.profiles.find(p=>p.id===activePreset);if(!old)return;profiles.remove(activePreset);activePreset='current';refreshPresetList();$('#preset-name').value='';$('#preset-status').textContent=`Removed ${old.name}. Current settings kept.`;}catch(error){$('#preset-status').textContent=error.message;}});
 function stepForm(direction){
  const next=(FORM_IDS.indexOf(state.mode)+direction+FORM_IDS.length)%FORM_IDS.length;
  chooseScene(FORM_IDS[next],true);
 }
 for(const id of ['dock-prev','listen-prev'])$('#'+id).addEventListener('click',()=>stepForm(-1));
 for(const id of ['dock-next','listen-next'])$('#'+id).addEventListener('click',()=>stepForm(1));
 for(const id of ['dock-pause','listen-pause'])$('#'+id).addEventListener('click',()=>$('#motion').click());
 $('#listening').addEventListener('click',()=>setListening(true));
 $('#stage').addEventListener('click',()=>{
  document.body.classList.add('stage-mode');
  setListening(true);
 });
 $('#listen-settings').addEventListener('click',()=>setSettingsOpen(!settingsOpen));
 $('#listen-exit').addEventListener('click',async()=>{if(document.fullscreenElement)await document.exitFullscreen();setListening(false);});
 $('#listen-fullscreen').addEventListener('click',toggleFullscreen);
 const tabs=[...$('.inspector-tabs').children];
 for(const tab of tabs)tab.addEventListener('click',()=>selectInspectorTab(tab));
 $('.inspector-tabs').addEventListener('keydown',event=>{
  const index=tabs.indexOf(event.target);
  const offsets={ArrowLeft:-1,ArrowRight:1};
  if(index<0||!(event.key in offsets||event.key==='Home'||event.key==='End'))return;
  event.preventDefault();
  const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+offsets[event.key]+tabs.length)%tabs.length;
  selectInspectorTab(tabs[next]);
  tabs[next].focus({preventScroll:true});
 });
 $('#mobile-settings').addEventListener('click',()=>{
  if(mobileSettings.matches){setSettingsOpen(!settingsOpen);return;}
  activeInspectorTab().focus({preventScroll:true});
 });
 const transparency=$('#reduce-transparency');
 function applyTransparency(value){
  document.body.classList.toggle('reduced-transparency',value);
  transparency.setAttribute('aria-checked',String(value));
  transparency.textContent=value?'On':'Off';
 }
 try{applyTransparency(storage.getItem('resonance.reduceTransparency')==='true');}catch{}
 transparency.addEventListener('click',()=>{
  const value=transparency.getAttribute('aria-checked')!=='true';
  applyTransparency(value);
  try{storage.setItem('resonance.reduceTransparency',String(value));}catch{message('Transparency changed for this session.');}
 });
 $('#close-settings').addEventListener('click',()=>setSettingsOpen(false));
 $('#expand-settings').addEventListener('click',()=>expandSettings(!document.body.classList.contains('settings-expanded')));
 mobileSettings.addEventListener('change',()=>{
  if(!listening){
   if(settingsOpen)saveInspectorScroll();
   settingsOpen=false;
   document.body.classList.remove('settings-open');
   if(!mobileSettings.matches)restoreInspectorScroll();
  }
  syncSettingsVisibility();
 });
 syncSettingsVisibility();
 try{
  const stored=JSON.parse(storage.getItem(formViewsKey));
  for(const mode of FORM_IDS){
   const view=stored?.[mode];
   if(!view||![view.zoom,view.x,view.y].every(Number.isFinite))continue;
   savedFormViews[mode]={zoom:Math.max(.5,Math.min(2,view.zoom)),fill:view.fill===true,
    x:Math.max(-.25,Math.min(.25,view.x)),y:Math.max(-.25,Math.min(.25,view.y))};
  }
 }catch{}
 applyFormView(state.mode);
 for(const axis of ['x','y'])$('#view-center-'+axis).addEventListener('input',()=>{
  setViewCenter(Number($('#view-center-x').value)/100,Number($('#view-center-y').value)/100);
  draw();
 });
 function storeFormViews(next){
  try{storage.setItem(formViewsKey,JSON.stringify(next));}
  catch{$('#form-view-status').textContent='Could not save views in this browser.';return false;}
  savedFormViews=next;
  return true;
 }
 $('#save-form-view').addEventListener('click',()=>{
  const view={zoom:viewZoom,fill:viewFill,...viewCenter};
  if(!storeFormViews({...savedFormViews,[state.mode]:view}))return;
  $('#clear-form-view').disabled=false;
  $('#form-view-status').textContent='Saved view for '+FORM_CATALOG.find(form=>form.id===state.mode).name+'.';
 });
 $('#clear-form-view').addEventListener('click',()=>{
  const next={...savedFormViews};
  delete next[state.mode];
  if(storeFormViews(next)){applyFormView(state.mode);draw();}
 });
 document.addEventListener('keydown',event=>{
  if($('#setup').open)return;
  const editing=event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable]');
  if(!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!editing){
   const zoomKeys={'+':viewZoom+.1,'=':viewZoom+.1,'-':viewZoom-.1,'0':1};
   if(Object.hasOwn(zoomKeys,event.key)){event.preventDefault();changeZoom(zoomKeys[event.key]);return;}
  }
  if(event.key!=='Escape')return;
  if(settingsOpen){event.preventDefault();setSettingsOpen(false);}
  else if(listening&&document.fullscreenElement){event.preventDefault();document.exitFullscreen().catch(()=>message('Use the Windowed control to leave fullscreen.'));}
  else if(listening)setListening(false);
 });
 document.addEventListener('visibilitychange',()=>{replayHistory.length=0;state.transition=null;sceneDirector.reset();qualityWarmup=0;qualityGovernor.slow=qualityGovernor.fast=0;lastFrame=0;signalPanel?.sync(state.paused,reduced.matches,document.hidden);});
 $('.inspector').addEventListener('input',event=>{if(event.target.closest('#palette-editor,#replay-palette-controls,#replay-timeline,.view-settings')||['preset','preset-name'].includes(event.target.id))return;$('#preset').value='current';$('#preset-status').textContent='Working settings changed. Save new or Update to keep them.';});refreshStudioControls();refreshQuality();
}
window.addEventListener('pagehide',()=>{operation++;release();threeView?.dispose();signalPanel?.dispose();});window.addEventListener('pageshow',event=>{if(event.persisted){initializeSignalPanel();initializeGraphics();}});window.addEventListener('resize',resize);
initializeStudio();initializeGraphicsControls();refreshMotion();resize();requestAnimationFrame(frame);
