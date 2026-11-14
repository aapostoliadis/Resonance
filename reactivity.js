// Audio-only bass onset detection, independent of the renderer and frame rate.
// A sustained tone produces one onset; new bass transients produce fresh pulses.
class BassResponse {
 constructor(){this.reset();}
 reset(){this.average=.003;this.fluxMean=0;this.previous=0;this.envelope=0;this.pulse=0;this.elapsed=10;this.beats=0;}
 update(energy,rms,dt,gain=1.4){
  dt=Math.max(0,Math.min(dt,.1));energy=Number.isFinite(energy)?Math.max(0,energy):0;
  const audible=rms>.002,previousAverage=this.average;
  this.elapsed+=dt;this.pulse*=Math.exp(-dt/.22);
  const rise=energy-this.previous;
  const hit=audible&&energy>.0018&&energy>previousAverage*1.12&&rise>Math.max(.0008,previousAverage*.08,this.fluxMean*1.6)&&this.elapsed>.23;
  if(hit){this.pulse=Math.min(1,.55+(energy-previousAverage)*gain*3);this.elapsed=0;this.beats++;}
  this.average+=(energy-this.average)*(1-Math.exp(-dt/.85));
  this.fluxMean+=(Math.max(0,rise)-this.fluxMean)*(1-Math.exp(-dt/.7));
  this.previous=energy;
  const target=audible?1-Math.exp(-energy*gain*8):0;
  this.envelope+=(target-this.envelope)*(1-Math.exp(-dt/(target>this.envelope?.025:.16)));
  if(this.pulse<.0001)this.pulse=0;
  return {bass:this.envelope,pulse:this.pulse,hit};
 }
}
// Musical dynamics are inferred from energy trends, not a BPM grid or song metadata.
class MusicResponse {
 constructor(){this.reset();}
 reset(){this.kick=new BassResponse();this.normalizer=1;this.bass=0;this.mid=0;this.high=0;this.spark=0;this.previousHigh=0;this.fast=0;this.slow=0;this.initialized=false;this.build=0;this.risingFor=0;this.release=0;this.releaseWait=0;}
 update(input,dt,{gain=1.4,adaptive=true,releaseThreshold=.24}={}){
  dt=Math.max(0,Math.min(.1,dt));
  const clean=v=>Number.isFinite(v)?Math.max(0,v):0;
  const rms=clean(input.rms),audible=rms>.002;
  const follow=(value,target,tau)=>value+(target-value)*(1-Math.exp(-dt/tau));
  const target=adaptive?(audible?Math.max(.65,Math.min(3.5,.11/Math.max(.008,rms))):this.normalizer):1;
  // Never amplify silence, and limit both boost and attenuation.
  this.normalizer=follow(this.normalizer,target,target<this.normalizer?.25:1.1);
  const scale=adaptive?this.normalizer:1,bass=clean(input.bass)*scale,mid=clean(input.mid)*scale,high=clean(input.high)*scale;
  const kick=this.kick.update(clean(input.bass),audible?rms:0,dt,gain);
  const body=audible?1-Math.exp(-bass*gain*7):0;
  this.bass=follow(this.bass,body,body>this.bass?.11:.34);
  const midTarget=audible?1-Math.exp(-mid*gain*5):0,highTarget=audible?1-Math.exp(-high*gain*7):0;
  this.mid=follow(this.mid,midTarget,.09);this.high=follow(this.high,highTarget,.07);
  const highFlux=audible?Math.max(0,clean(input.high)-this.previousHigh):0;
  this.spark=Math.max(this.spark*Math.exp(-dt/.11),Math.min(1,highFlux*scale*gain*14));this.previousHigh=clean(input.high);
  this.release*=Math.exp(-dt/.65);this.releaseWait+=dt;
  if(audible&&!this.initialized){this.fast=this.slow=rms;this.initialized=true;}
  this.fast=follow(this.fast,audible?rms:0,.25);this.slow=follow(this.slow,audible?rms:0,3.2);
  const rising=audible?Math.max(0,Math.min(1,(this.fast/Math.max(.006,this.slow)-1)*1.3)):0;
  this.risingFor=rising>.18?this.risingFor+dt:Math.max(0,this.risingFor-dt*2);
  const tension=this.risingFor>.55?rising:0;
  this.build=follow(this.build,tension,tension>this.build?1.2:2.0);
  const threshold=Number.isFinite(releaseThreshold)?Math.max(.1,Math.min(.6,releaseThreshold)):.24;
  const released=kick.hit&&this.build>threshold&&this.fast>this.slow*1.16&&this.releaseWait>1.6;
  if(released){this.release=Math.min(1,.4+this.build*.65);this.build*=.3;this.releaseWait=0;}
  if(!audible){this.build=follow(this.build,0,.35);if(rms===0&&this.slow<.001)this.initialized=false;}
  return {bass:this.bass,mid:this.mid,high:this.high,beat:kick.pulse,hit:kick.hit,spark:this.spark,build:this.build,release:this.release,released,autoGain:scale};
 }
}
const FORM_CATALOG=Object.freeze([
 {id:'orb',name:'Orbital',caption:'ORBITAL FIELD',icon:'◎'},
 {id:'wave',name:'Waveform',caption:'WAVE INTERFERENCE',icon:'≋'},
 {id:'tunnel',name:'Hyperspace',caption:'HYPERSPACE',icon:'◇'},
 {id:'cascade',name:'Cascade',caption:'FALLING FILAMENTS',icon:'⋒'},
 {id:'strata',name:'Strata',caption:'FRACTAL CONTOURS',icon:'▱'},
 {id:'vortex',name:'Vortex',caption:'SPIRAL CURRENT',icon:'◉'},
 {id:'pulse',name:'Pulse',caption:'RESONANT RINGS',icon:'⊚'},
 {id:'ember',name:'Ember',caption:'LIVING FLAME',icon:'♧'},
 {id:'flux',name:'Flux',caption:'FLOWING PIGMENT',icon:'◈'},
 {id:'relic',name:'Relic',caption:'MELTING RELIEF',icon:'▧'},
 {id:'swarm',name:'Swarm',caption:'BILLOWING PARTICLES',icon:'⁙'},
 {id:'fractal',name:'Fractal',caption:'RECURSIVE CRYSTAL',icon:'❄'},
 {id:'horizon',name:'Horizon',caption:'PLANETARY CURRENTS',icon:'◒'}
].map(Object.freeze));
const FORM_IDS=Object.freeze(FORM_CATALOG.map(form=>form.id));

// Travel in viewport fractions, orbit and bank in radians, push as a lens multiplier.
const FORM_MOTION={
 orb:{cycle:.43,orbit:[.37,.19],pan:[.018,.015],bank:.07,push:.09,flow:1.45},
 wave:{cycle:.49,orbit:[.16,.23],pan:[0,.05],bank:.085,push:.10,flow:1.55},
 tunnel:{cycle:.42,orbit:[0,0],pan:[0,0],bank:0,push:0,flow:1.35},
 cascade:{cycle:.38,orbit:[.12,.09],pan:[.034,.055],bank:.055,push:.10,flow:1.65},
 strata:{cycle:.32,orbit:[.28,.20],pan:[.040,.037],bank:.105,push:.13,flow:1.55},
 vortex:{cycle:.55,orbit:[.10,.08],pan:[.028,.020],bank:.22,push:.12,flow:1.65},
 pulse:{cycle:.40,orbit:[.09,.12],pan:[.015,.015],bank:.07,push:.14,flow:1.50},
 ember:{cycle:.58,orbit:[.13,.09],pan:[.026,.042],bank:.078,push:.11,flow:1.62},
 flux:{cycle:.45,orbit:[.25,.13],pan:[.055,.033],bank:.11,push:.12,flow:1.58},
 relic:{cycle:.27,orbit:[.31,.19],pan:[.046,.041],bank:.085,push:.13,flow:1.60},
 swarm:{cycle:.57,orbit:[.46,.26],pan:[.035,.035],bank:.13,push:.12,flow:1.55},
 fractal:{cycle:.34,orbit:[.18,.13],pan:[.017,.017],bank:.17,push:.09,flow:1.42},
 horizon:{cycle:.26,orbit:[0,0],pan:[.025,.020],bank:.035,push:.06,flow:1.30}
};

function formCameraPose(mode,time,amount){
 const {cycle,orbit,pan,bank,push}=FORM_MOTION[mode];
 const phase=time*cycle;
 const across=Math.sin(phase),rise=Math.sin(phase*.73),depth=Math.sin(phase*.57);
 return {
  yaw:across*orbit[0]*amount,pitch:rise*orbit[1]*amount,
  x:across*pan[0]*amount,y:Math.sin(phase*1.12)*pan[1]*amount,
  roll:Math.sin(phase*.82)*bank*amount,zoom:1+depth*push*amount
 };
}

function horizonCameraZoom(shot,aspect,fill){
 if(!fill)return shot.zoom;
 const sine=Math.abs(Math.sin(shot.roll)),cosine=Math.cos(shot.roll);
 const width=(1+2*Math.abs(shot.x))*cosine+(1+2*Math.abs(shot.y))*sine/aspect;
 const height=(1+2*Math.abs(shot.y))*cosine+(1+2*Math.abs(shot.x))*sine*aspect;
 return Math.max(shot.zoom,width,height);
}

// Each Form has its own kick recovery time. Age also drives traveling ripples.
const KICK_RECOVERY={orb:.19,wave:.25,tunnel:.15,cascade:.24,strata:.38,
 vortex:.17,pulse:.28,ember:.23,flux:.31,relic:.36,swarm:.32,fractal:.34,horizon:.40};

// Limits are in material space. Camera and geometry never read this setting.
const ELEMENT_LIMIT={orb:1.6,wave:1.65,tunnel:1.55,cascade:1.45,strata:1.5,
 vortex:1.55,pulse:1.4,ember:1.55,flux:1.5,relic:1.4,swarm:1.45,fractal:1.45,horizon:1.45};

const FRACTAL_BRANCH_COUNTS=[90,378,1530,6138];
function getFractalBranchCount(quality){return FRACTAL_BRANCH_COUNTS[quality];}

// Breadth-first order lets both renderers trim fine branches at lower quality.
function buildFractalBranches(){
 const branches=[];
 let stems=Array.from({length:6},(_,arm)=>({x:0,y:0,angle:arm*Math.PI/3+Math.PI/6,arm,length:2.06}));
 const joints=[{along:.34,ratio:.40},{along:.68,ratio:.28},{along:1,ratio:0}];
 for(let level=0;level<=4;level++){
  const next=[];
  for(const {x,y,angle,arm,length} of stems){
   const dx=Math.cos(angle)*length,dy=Math.sin(angle)*length;
   let startX=x,startY=y;
   for(const {along,ratio} of joints){
    const endX=x+dx*along,endY=y+dy*along;
    const phase=(branches.length*.61803398875)%1;
    branches.push({x:startX,y:startY,endX,endY,level,arm,phase});
    if(ratio&&level<4){
     for(const turn of [-Math.PI/3,Math.PI/3]){
      next.push({x:endX,y:endY,angle:angle+turn,arm,length:length*ratio});
     }
    }
    startX=endX;startY=endY;
   }
  }
  stems=next;
 }
 return branches;
}

function buildFractalContours(){
 const contours=[];
 function edge(start,end,depth,arm,layer){
  if(depth===0){
   contours.push({x:start.x,y:start.y,endX:end.x,endY:end.y,arm,level:layer,phase:(contours.length*.61803398875)%1});
   return;
  }
  const dx=(end.x-start.x)/3,dy=(end.y-start.y)/3;
  const first={x:start.x+dx,y:start.y+dy};
  const second={x:end.x-dx,y:end.y-dy};
  const peak={x:(start.x+end.x)/2-dy*.72,y:(start.y+end.y)/2+dx*.72};
  const points=[start,first,peak,second,end];
  for(let i=0;i<4;i++)edge(points[i],points[i+1],depth-1,arm,layer);
 }
 function hexagon(cx,cy,radius,rotation,depth,layer){
  const vertices=Array.from({length:6},(_,index)=>{
   const angle=rotation+index*Math.PI/3;
   return {x:cx+radius*Math.cos(angle),y:cy+radius*Math.sin(angle)};
  });
  // A single deformation phase per loop keeps all six corners joined.
  for(let i=0;i<6;i++)edge(vertices[i],vertices[(i+1)%6],depth,layer,layer);
 }
 hexagon(0,0,.29,Math.PI/6,1,0);
 hexagon(0,0,.56,0,2,1);
 hexagon(0,0,1.17,Math.PI/6,2,2);
 hexagon(0,0,2.02,Math.PI/6,2,3);
 for(let i=0;i<6;i++){
  const angle=i*Math.PI/3;
  hexagon(Math.cos(angle)*1.30,Math.sin(angle)*1.30,.26,angle,2,2);
  hexagon(Math.cos(angle)*1.30,Math.sin(angle)*1.30,.105,angle+Math.PI/6,1,1);
 }
 hexagon(0,0,1.83,Math.PI/6,3,4);
 return contours;
}

function getFractalContourCount(quality){return [312,1032,1416,1416][quality];}

function kickSweep(pulses,coordinate,speed,width){
 let accent=0;
 for(const pulse of pulses){
  const front=(coordinate-pulse.age*speed)*width;
  accent+=pulse.strength*Math.exp(-front*front);
 }
 return Math.min(1.5,accent);
}

const NO_SHOCKWAVES=Object.freeze([]);
function visualFrame(state){
 if(state.musicReactive!==false)return state;
 return {...state,bass:0,mid:0,high:0,beat:0,spark:0,build:0,release:0,
  shockwaves:NO_SHOCKWAVES,horizonSmoke:0,horizonTerrain:0,horizonTerrainDrive:0,transition:null};
}

// Visual-only emphasis. Audio analysis, onset thresholds and clocks remain raw.
function getVisualReactions(state){
 const input=v=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
 const strength=v=>Number.isFinite(v)?Math.max(0,Math.min(2,v)):1;
 const setting=strength(state.elementIntensity);
 const intensity=Math.min(1,setting)+Math.max(0,setting-1)*((ELEMENT_LIMIT[state.mode]??1.5)-1);
 const expression=state.expression==='restrained'?.42:1;
 const kickStrength=strength(state.kickImpact)*expression*intensity;
 const events=state.shockwaves?.slice(-3)??[];
 const pulses=events.length?events.map(({age,power})=>{
  const beat=input(power*Math.exp(-age/(KICK_RECOVERY[state.mode]??.22)));
  return {age,strength:Math.min(1.5,beat*(1+.95*(1-beat))*kickStrength)};
 }):[{age:0,strength:Math.min(1.5,input(state.beat)*(1+.95*(1-input(state.beat)))*kickStrength)}];
 const bass=input(state.bass),treble=input(state.high),spark=input(state.spark);
 const trebleStrength=strength(state.sparkAmount)*expression*intensity;
 return{
  bass:Math.min(1.4,bass*(1+.65*(1-bass))*strength(state.bassWeight)*intensity),
  mid:Math.min(1,input(state.mid)*intensity),
  kick:Math.min(1,Math.max(...events.map(({age,power})=>{
   const attack=1-.16*Math.max(0,1-age/.025);
   return Math.sqrt(input(power))*kickStrength*attack*Math.exp(-age/.085);
  }),0)),
  pulses,
  treble:Math.min(1,treble*trebleStrength),
  spark:spark<=.003?0:Math.min(2,Math.pow((spark-.003)/.997,.6)*trebleStrength)
 };
}

// Depth increases along the route. Its local Z origin follows the rider.
function tunnelSection(distance){
 const side=distance*.165,drop=distance*.102+.65;
 return {
  x:2.8*Math.sin(side)+.75*Math.sin(side*1.81),
  y:1.95*Math.sin(drop)+.65*Math.cos(side*1.27),
  radius:3.05+.20*Math.sin(distance*.19),
  twist:.32*Math.sin(distance*.13)+.16*Math.sin(distance*.28)
 };
}

function tunnelRide(distance,motion){
 const here=tunnelSection(distance),ahead=tunnelSection(distance+5);
 const x=ahead.x-here.x,y=ahead.y-here.y;
 return {
  here,x,y,z:-5,bank:motion*.59*Math.sin(distance*.165+.4),
  seatX:.34*motion*Math.sin(distance*.19),seatY:-.48+.29*motion*Math.sin(distance*.13)
 };
}
function getRenderScale(width,height,level,deviceRatio=1,maxSurface=8192){
 width=Math.max(1,width);height=Math.max(1,height);
 const tier=Math.max(0,Math.min(3,level)),desired=tier===3?2:Math.min(deviceRatio||1,[.85,1.15,1.5][tier]);
 return Math.min(desired,Math.sqrt(8294400/(width*height)),maxSurface/width,maxSurface/height);
}
const palettes = [
 {name:'ACID / 01',hue:86,accent:'#c5f58d',angle:0,shadow:'#263b20',body:'#75993d',highlight:'#defaa8',spark:'#fff3bf'},
 {name:'GLACIER / 02',hue:192,accent:'#8bd8ee',angle:.40,shadow:'#142f4a',body:'#368cb0',highlight:'#c4f5ff',spark:'#f4fbff'},
 {name:'ULTRAVIOLET / 03',hue:270,accent:'#c7a0fb',angle:-.50,shadow:'#322049',body:'#7848ba',highlight:'#eed4ff',spark:'#fda8dd'},
 {name:'SOLAR / 04',hue:28,accent:'#f4ae73',angle:.18,shadow:'#4b2619',body:'#ba5831',highlight:'#ffd4a4',spark:'#fff3bb'},
 {name:'JADE / 05',hue:158,accent:'#58e3ab',angle:2.05,shadow:'#123b36',body:'#228773',highlight:'#abf9d5',spark:'#e3ffe9'},
 {name:'COBALT / 06',hue:223,accent:'#7c9dff',angle:.95,shadow:'#182850',body:'#395dca',highlight:'#abcaff',spark:'#e4eaff'},
 {name:'ORCHID / 07',hue:315,accent:'#f18cdb',angle:-1.85,shadow:'#402044',body:'#ac4499',highlight:'#ffd0f1',spark:'#f6c4ff'},
 {name:'VERMILION / 08',hue:4,accent:'#ff8279',angle:3.10,shadow:'#4d201e',body:'#c24139',highlight:'#ffc1a4',spark:'#ffe7b8'}
];
const PALETTE_ROLES=['shadow','body','highlight','spark'];
const CUSTOM_PALETTE=palettes.length;
function normalizePaletteColors(value){
 if(!PALETTE_ROLES.every(role=>typeof value?.[role]==='string'&&/^#[0-9a-f]{6}$/i.test(value[role])))return null;
 return Object.fromEntries(PALETTE_ROLES.map(role=>[role,value[role].toLowerCase()]));
}
function normalizeCustomPalette(value){
 const colors=normalizePaletteColors(value);
 if(!colors)return null;
 const name=typeof value.name==='string'?value.name.trim().slice(0,40):'';
 return {...colors,name:name||'Custom palette'};
}
function resolvePalette(index,custom){
 if(index!==CUSTOM_PALETTE||!custom)return palettes[index]||palettes[0];
 const [r,g,b]=custom.body.match(/[0-9a-f]{2}/gi).map(channel=>parseInt(channel,16));
 const max=Math.max(r,g,b),delta=max-Math.min(r,g,b);
 const hue=delta===0?0:60*(max===r?(g-b)/delta:max===g?2+(b-r)/delta:4+(r-g)/delta);
 return {...custom,name:custom.name||'Custom palette',accent:custom.highlight,angle:0,hue:(hue+360)%360};
}
const DEFAULT_SETTINGS={mode:'orb',palette:0,customPalette:null,gain:1.4,adaptive:true,expression:'dynamic',camera:.35,bassWeight:1,kickImpact:1,sparkAmount:1,elementIntensity:1,releaseThreshold:.24,autoScenes:false,sceneLock:false,quality:'ultra',listeningMeters:true,graphics:'auto',distortion:1,glow:.8,pointerOrbit:false,visualSeed:71};
function normalizeSettings(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input))input={};
 const value={...DEFAULT_SETTINGS},number=(key,min,max)=>{if(typeof input[key]==='number'&&Number.isFinite(input[key]))value[key]=Math.max(min,Math.min(max,input[key]));};
 for(const [key,allowed] of Object.entries({mode:FORM_IDS,expression:['restrained','dynamic'],quality:['auto','ultra','high','medium','low'],graphics:['auto','canvas']}))if(allowed.includes(input[key]))value[key]=input[key];
 for(const key of ['adaptive','autoScenes','sceneLock','listeningMeters','pointerOrbit'])if(typeof input[key]==='boolean')value[key]=input[key];
 value.customPalette=normalizeCustomPalette(input.customPalette);number('palette',0,value.customPalette?CUSTOM_PALETTE:palettes.length-1);value.palette=Math.round(value.palette);number('gain',.4,3);number('camera',0,1);for(const key of ['bassWeight','kickImpact','sparkAmount','elementIntensity'])number(key,0,2);number('releaseThreshold',.1,.6);number('distortion',0,2);number('glow',0,1.5);number('visualSeed',1,9999);value.visualSeed=Math.round(value.visualSeed);return value;
}
const BUILTIN_PRESETS={ambient:{name:'Ambient',settings:normalizeSettings({quality:'auto',mode:'wave',palette:1,gain:1,expression:'restrained',camera:.15,bassWeight:.75,kickImpact:.4,sparkAmount:.35,releaseThreshold:.36})},balanced:{name:'Balanced',settings:normalizeSettings({quality:'auto'})},energy:{name:'High Energy',settings:normalizeSettings({quality:'auto',mode:'tunnel',palette:2,gain:1.8,camera:.5,bassWeight:1.3,kickImpact:1.5,sparkAmount:1.25,releaseThreshold:.18})}};
for(const preset of Object.values(BUILTIN_PRESETS)){Object.freeze(preset.settings);Object.freeze(preset);}Object.freeze(BUILTIN_PRESETS);
class ProfileLibrary {
 constructor(storage){this.storage=storage;this.profiles=[];this.error=false;try{const saved=JSON.parse(storage.getItem('resonance.profiles.v1')||'null');if(saved?.version===1&&Array.isArray(saved.profiles))for(const p of saved.profiles.slice(0,12)){if(p&&typeof p.id==='string'&&/^custom-[a-z0-9-]{1,60}$/.test(p.id)&&typeof p.name==='string'&&p.name.trim()&&!this.profiles.some(x=>x.id===p.id))this.profiles.push({id:p.id,name:p.name.trim().slice(0,32),settings:normalizeSettings(p.settings&&typeof p.settings==='object'?p.settings:{})});}}catch{this.error=true;}}
 persist(){try{this.storage.setItem('resonance.profiles.v1',JSON.stringify({version:1,profiles:this.profiles}));return true;}catch{this.error=true;return false;}}
 save(name,settings,id){name=String(name).trim().slice(0,32);if(!name)throw new Error('Enter a preset name.');if(Object.values(BUILTIN_PRESETS).some(p=>p.name.toLowerCase()===name.toLowerCase()))throw new Error('Choose a name other than a built-in preset.');const existing=this.profiles.find(p=>p.id===id);if(this.profiles.some(p=>p!==existing&&p.name.toLowerCase()===name.toLowerCase()))throw new Error('That preset name already exists. Select it to update it, or use another name.');if(!existing&&this.profiles.length>=12)throw new Error('You can save 12 presets. Remove one before adding another.');const item={id:existing?.id||'custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name,settings:normalizeSettings(settings)};const prior=this.profiles;this.profiles=existing?prior.map(p=>p.id===id?item:p):[...prior,item];if(!this.persist()){this.profiles=prior;throw new Error('Browser storage is unavailable. Your preset was not saved.');}return item;}
 remove(id){const prior=this.profiles;this.profiles=prior.filter(p=>p.id!==id);if(!this.persist()){this.profiles=prior;throw new Error('Browser storage is unavailable. Your preset was not removed.');}}
}
class QualityGovernor {
 constructor(){this.reset();}
 reset(){this.level=2;this.slow=0;this.fast=0;this.cooldown=0;}
 update(frameMs,drawMs,dt){if(!Number.isFinite(frameMs)||!Number.isFinite(drawMs)||dt<=0||frameMs>200)return false;dt=Math.min(.1,dt);this.cooldown=Math.max(0,this.cooldown-dt);const overloaded=drawMs>13||frameMs>25,comfortable=drawMs<7&&frameMs<20;this.slow=overloaded?this.slow+dt:Math.max(0,this.slow-dt);this.fast=comfortable?this.fast+dt:0;if(this.cooldown===0&&this.slow>=2&&this.level>0){this.level--;this.slow=this.fast=0;this.cooldown=4;return true;}if(this.cooldown===0&&this.fast>=12&&this.level<2){this.level++;this.slow=this.fast=0;this.cooldown=8;return true;}return false;}
}
class VisualMotion {
 constructor(){this.reset();}
 reset(){this.audible=false;this.quiet=0;this.rate=.015;}
 update(rms,dt,source='shared'){
  if(source==='demo'){this.reset();return 1;}
  if(rms>.0025){this.audible=true;this.quiet=0;}
  else if(rms<=.002){this.quiet+=dt;if(this.quiet>.20)this.audible=false;}
  else this.quiet=0;
  const target=this.audible?.65+Math.min(1,Math.max(0,rms)*18)*1.5:.015;
  this.rate+=(target-this.rate)*(1-Math.exp(-dt/(this.audible?.12:.24)));
  return this.rate;
 }
}
class SceneDirector {
 constructor(){this.reset();}
 reset(){this.dwell=0;this.calm=0;this.rising=0;this.releaseWasHigh=false;}
 update({mode,auto,locked,paused,reduced,audible,build,release,bass},dt){
  if(paused)return null;if(!auto||locked||reduced||!audible){this.dwell=this.calm=this.rising=0;this.releaseWasHigh=release>.3;return null;}
  this.dwell+=dt;this.calm=bass<.22&&build<.12?this.calm+dt:0;this.rising=build>.2?this.rising+dt:0;
  const releaseEdge=release>.3&&!this.releaseWasHigh;this.releaseWasHigh=release>.3;if(this.dwell<12)return null;
  let next=null;
  // Directed musical paths cover every form, never choosing the current one.
  const releases={orb:'vortex',wave:'tunnel',tunnel:'swarm',cascade:'ember',strata:'flux',vortex:'ember',pulse:'flux',ember:'swarm',flux:'swarm',relic:'flux',swarm:'pulse',fractal:'swarm'};
  const calm={orb:'wave',wave:'cascade',tunnel:'relic',cascade:'strata',strata:'relic',vortex:'strata',pulse:'wave',ember:'cascade',flux:'relic',relic:'wave',swarm:'cascade',fractal:'strata'};
  const rises={orb:'pulse',wave:'orb',tunnel:'vortex',cascade:'flux',strata:'pulse',vortex:'ember',pulse:'vortex',ember:'orb',flux:'vortex',relic:'fractal',swarm:'tunnel',fractal:'vortex'};
  if(releaseEdge)next=releases[mode]||'orb';else if(this.calm>6)next=calm[mode]||'wave';else if(this.rising>2)next=rises[mode]||'orb';
  if(next){this.dwell=this.calm=this.rising=0;return next;}return null;
 }
}
if(typeof module!=='undefined')module.exports={getVisualReactions,kickSweep,tunnelSection,tunnelRide,visualFrame,getRenderScale,FORM_CATALOG,FORM_IDS,BassResponse,MusicResponse,DEFAULT_SETTINGS,BUILTIN_PRESETS,normalizeSettings,ProfileLibrary,QualityGovernor,SceneDirector,VisualMotion};
