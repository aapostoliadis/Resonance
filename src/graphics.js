import {kickSweepGLSL,paletteGLSL} from './reference-art.js';
import {buildReferenceForms,resizeReferenceForms} from './forms.js';
import {renderHorizon} from './horizon.js';
export {getHorizonImage} from './horizon.js';
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {gsap} from 'gsap';
import {Draggable} from 'gsap/Draggable';
import {InertiaPlugin} from 'gsap/InertiaPlugin';
gsap.registerPlugin(Draggable,InertiaPlugin);
export const versions={three:THREE.REVISION,gsap:gsap.version,seed:71};

const fieldGLSL=kickSweepGLSL+`
uniform float uTime,uBass,uMid,uHigh,uDistortion,uSeed;
float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7))+uSeed)*43758.5453);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z)*2.0-1.0;}
vec3 deform(vec3 p){vec3 n=normalize(p);float slow=noise3(n*2.2+vec3(uTime*.12,0.,uTime*.08));return p*(1.0+clamp(slow*.10*uDistortion,-.32,.50));}
`;
const orbVertex=fieldGLSL+`
varying vec3 vNormal,vView,vPosition;varying float vField;
void main(){vec3 p=deform(position);vField=length(p)/max(length(position),.01)-1.;vPosition=p;vec4 view=modelViewMatrix*vec4(p,1.);vView=-view.xyz;vNormal=normalize(normalMatrix*normal);gl_Position=projectionMatrix*view;}
`;
const surfaceFragment=kickSweepGLSL+paletteGLSL+`uniform vec3 uColor;uniform float uBass,uMid,uHigh,uLayer,uDebug;varying vec3 vNormal,vView,vPosition;varying float vField;
void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.4);float contour=.5+.5*sin(vPosition.y*29.+vField*30.);vec3 white=vec3(.8,.94,1.);float accent=kickSweep(vPosition.y+.90+.16*sin(vPosition.x*9.),5.5,5.);vec3 col=mix(mix(uShadow,uBody,rim),mix(white,uHighlight,.78),clamp(rim*.35+accent*.35,0.,.8));float intensity=uLayer<.5?(.035+rim*.35+contour*(.015+uBass*.12)):(.35+contour*(uBass*.23+uHigh*.15)+accent*1.25*contour);col=mix(col,uBody,uMid*contour*.22);col=col*intensity+uSparkColor*uHigh*pow(contour,12.)*.18;if(uDebug>.5)col=mix(vec3(.06,.12,.4),vec3(1.,.25,.03),clamp(.5+vField*2.,0.,1.));gl_FragColor=vec4(col,uLayer<.5?1.:.42);}
`;
const auraFragment=`uniform vec3 uColor;uniform float uBass,uHigh,uLayer,uDebug;varying vec3 vNormal,vView,vPosition;varying float vField;
void main(){float edge=1.-abs(dot(normalize(vNormal),normalize(vView)));float rim=pow(edge,3.2);gl_FragColor=vec4(uColor*.4,rim*.04);}
`;
const pointVertex=fieldGLSL+`attribute float aSize;varying float vAlpha;uniform float uPixelRatio;void main(){vec3 p=deform(position);vec4 mv=modelViewMatrix*vec4(p,1.);float accent=kickSweep(p.y+.90+.16*sin(p.x*9.),5.5,5.);vAlpha=clamp(.4+normalize(p).z*.3+accent*.45,0.,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(9.,aSize*uPixelRatio*(115./max(1.,-mv.z)));}`;
const pointFragment=`uniform vec3 uColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5);if(r>.5)discard;float a=pow(1.-r*2.,1.4);gl_FragColor=vec4(uColor*1.3,a*vAlpha*.7);}`;
const formExtents={
 orb:[2.18,2.18],
 cascade:[1.5,2.8],swarm:[2.4,2.4],fractal:[1.95,2.1]
};
const fillExtents={
 orb:[1.24,1.24],wave:[2.75,.76],
 cascade:[.77,1.85],swarm:[1.36,1.04],fractal:[1.65,1.75]
};
const ribbonVertex=kickSweepGLSL+`uniform float uTime,uBass,uMid,uHigh,uDistortion,uViewZoom,uViewOffsetX;varying vec3 vNormal,vView;varying float vUv,vAccent;void main(){float u=uv.x,side=uv.y-.5,phase=u*6.28318;vec3 p=position;p.y+=sin(phase*1.25+uTime*.6+position.z)*.26;p.z+=cos(phase*.9+uTime*.32)*.35;vAccent=kickSweep(u-.24+position.z*.08,1.45,7.);p.y+=side*.3*sin(phase*1.7+uTime*.4)*uDistortion;vec4 mv=modelViewMatrix*vec4(p,1.);vNormal=normalMatrix*normal;vView=-mv.xyz;vUv=uv.y;gl_Position=projectionMatrix*mv;
 // Keep every ribbon across the viewport while retaining its projected depth and height.
 gl_Position.x=((u*2.-1.)*1.02*uViewZoom+uViewOffsetX)*gl_Position.w;}`;
const ribbonFragment=paletteGLSL+`uniform vec3 uColor;uniform float uBass,uHigh;varying vec3 vNormal,vView;varying float vUv,vAccent;void main(){float edge=pow(abs(vUv-.5)*2.,9.);float threads=pow(.5+.5*cos(vUv*210.),12.);vec3 col=mix(mix(uShadow,uBody,.65+threads*.35),uHighlight,edge*.45)*(edge*1.4+threads*(.7+uBass*.28)+.06);col+=uSparkColor*threads*uHigh*.75*pow(.5+.5*sin(vUv*81.),6.);col+=uHighlight*vAccent*(.35+threads*.65)*(1.-edge)*3.8;gl_FragColor=vec4(col,.35+edge*.6);}`;

function seeded(seed){let n=Math.floor(seed)||71;return()=>{n=n*16807%2147483647;return(n-1)/2147483646;};}
export class Resonance3D {
 constructor({canvas,onFailure}){
  this.canvas=canvas;this.onFailure=onFailure;this.resources=new Set();this.disposed=false;this.lost=false;this.width=1;this.height=1;this.level=2;this.seed=71;this.lastMode=null;this.drawCount=0;this.lastTime=0;
  try{
   this.renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});this.maxSurfaceSize=Math.min(8192,this.renderer.capabilities.maxTextureSize,this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE));this.renderer.info.autoReset=false;
   this.renderer.setClearColor(0x080b0d,1);this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{const error=[gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n');this.fail('Shader compilation failed: '+error.slice(0,350));};
   this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera(43,1,.1,100);this.root=new THREE.Group();this.scene.add(this.root);this.groups={orb:new THREE.Group(),wave:new THREE.Group(),tunnel:new THREE.Group()};Object.values(this.groups).forEach(g=>this.root.add(g));
   this.artBank=new THREE.Quaternion();
   this.artNormal=new THREE.Vector3(0,0,1);
   this.uniforms={uViewZoom:{value:1},uViewOffsetX:{value:0},uTime:{value:0},uBass:{value:0},uPulseAges:{value:new THREE.Vector3()},uPulseStrengths:{value:new THREE.Vector3()},uMid:{value:0},uHigh:{value:0},uDistortion:{value:1},uSeed:{value:71},uColor:{value:new THREE.Color('#c5f58d')},uShadow:{value:new THREE.Color()},uBody:{value:new THREE.Color()},uHighlight:{value:new THREE.Color()},uSparkColor:{value:new THREE.Color()},uLayer:{value:0},uDebug:{value:0},uPixelRatio:{value:1},uSpark:{value:0},uArtGlow:{value:.8},uArtPalette:{value:0},uArtDetail:{value:2},uArtView:{value:new THREE.Vector2()},uArtExtent:{value:new THREE.Vector2(1,1)}};
   this.buildOrb();this.buildRibbons();this.buildTunnel();buildReferenceForms(this,fieldGLSL);this.buildStars();
   const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});this.composer=new EffectComposer(this.renderer,target);this.renderPass=new RenderPass(this.scene,this.camera);this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.6,.45,.9);this.bloomView=new ShaderPass({uniforms:{tBloom:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tBloom;varying vec2 vUv;void main(){gl_FragColor=texture2D(tBloom,vUv);}'});this.bloomView.uniforms.tBloom.value=this.bloom.renderTargetsHorizontal[0].texture;this.bloomView.enabled=false;this.output=new OutputPass();this.composer.addPass(this.renderPass);this.composer.addPass(this.bloom);this.composer.addPass(this.bloomView);this.composer.addPass(this.output);
   this.loss=e=>{e.preventDefault();this.lost=true;this.fail('WebGL context was lost. Canvas rendering is active; audio is still connected.');};canvas.addEventListener('webglcontextlost',this.loss);this.ready=true;this.orbit={yaw:0,pitch:0,vx:0,vy:0,dragging:false,x:0,y:0};
   this.pointerDown=e=>{const s=this.current;if(!s||!s.pointerOrbit||s.camera===0||s.paused||matchMedia('(prefers-reduced-motion: reduce)').matches||e.target.closest('button,input,select,summary,dialog,.inspector,.listening-feedback,.listening-toolbar,header,.audio-panel'))return;this.orbit.dragging=true;this.orbit.x=e.clientX;this.orbit.y=e.clientY;this.orbit.vx=this.orbit.vy=0;};
   this.pointerMove=e=>{const s=this.current;if(!this.orbit.dragging||!s||s.paused||s.camera===0)return;const dx=(e.clientX-this.orbit.x)*.004,dy=(e.clientY-this.orbit.y)*.004;this.orbit.yaw=THREE.MathUtils.clamp(this.orbit.yaw+dx,-.8,.8);this.orbit.pitch=THREE.MathUtils.clamp(this.orbit.pitch+dy,-.45,.45);this.orbit.vx=dx*15;this.orbit.vy=dy*15;this.orbit.x=e.clientX;this.orbit.y=e.clientY;};this.pointerUp=()=>{this.orbit.dragging=false;};document.addEventListener('pointerdown',this.pointerDown);document.addEventListener('pointermove',this.pointerMove);document.addEventListener('pointerup',this.pointerUp);document.addEventListener('pointercancel',this.pointerUp);
  }catch(error){this.dispose();throw error;}
 }
 keep(resource){this.resources.add(resource);return resource;}
 material(vertexShader,fragmentShader,options={}){return this.keep(new THREE.ShaderMaterial({uniforms:{...this.uniforms},vertexShader,fragmentShader,...options}));}
 buildOrb(){
  this.orbGeometries=[8,14,20].map(detail=>this.keep(new THREE.IcosahedronGeometry(1.35,detail)));
  this.skinMat=this.material(orbVertex,surfaceFragment,{side:THREE.FrontSide});this.skinMat.uniforms.uLayer={value:0};this.wireMat=this.material(orbVertex,surfaceFragment,{wireframe:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});this.wireMat.uniforms.uLayer={value:1};this.auraMat=this.material(orbVertex,auraFragment,{side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  this.skin=new THREE.Mesh(this.orbGeometries[2],this.skinMat);this.wire=new THREE.Mesh(this.orbGeometries[2],this.wireMat);this.wire.scale.setScalar(1.003);this.aura=new THREE.Mesh(this.orbGeometries[1],this.auraMat);this.aura.scale.setScalar(1.07);this.groups.orb.add(this.skin,this.wire,this.aura);
  const points=new Float32Array(4600*3),sizes=new Float32Array(4600);for(let i=0;i<4600;i++){const y=1-2*(i+.5)/4600,a=i*2.39996323,r=Math.sqrt(1-y*y);points.set([Math.cos(a)*r*1.37,y*1.37,Math.sin(a)*r*1.37],i*3);sizes[i]=.025+(i%11)*.003;}
  this.orbPointsGeometry=this.keep(new THREE.BufferGeometry());this.orbPointsGeometry.setAttribute('position',new THREE.BufferAttribute(points,3));this.orbPointsGeometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));this.orbPoints=new THREE.Points(this.orbPointsGeometry,this.material(pointVertex,pointFragment,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.groups.orb.add(this.orbPoints);
  this.orbits=[];for(let i=0;i<3;i++){const material=this.keep(new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false}));const ring=new THREE.Mesh(this.keep(new THREE.TorusGeometry(1.8+i*.19,.0045,4,160)),material);ring.rotation.set(1.14+i*.16,.2+i*.45,-.3+i*.4);this.groups.orb.add(ring);this.orbits.push(ring);}
 }
 buildRibbons(){this.ribbonMeshes=[];for(let i=0;i<4;i++){const geometry=this.keep(new THREE.PlaneGeometry(5.5,.22,180,8));const positions=geometry.attributes.position;const uv=geometry.attributes.uv;for(let j=0;j<positions.count;j++){positions.setY(j,(uv.getY(j)-.5)*.2+(i-1.5)*.48);positions.setZ(j,(i-1.5)*.4);}positions.needsUpdate=true;const mat=this.material(ribbonVertex,ribbonFragment,{side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});const mesh=new THREE.Mesh(geometry,mat);mesh.rotation.y=.12*(i-1.5);this.groups.wave.add(mesh);mesh.baseGeometry=geometry;this.ribbonMeshes.push(mesh);}}
 buildTunnel(){
  const sides=48,rows=43,wall=[],rails=[];
  const positions=new THREE.BufferAttribute(new Float32Array(rows*sides*3),3).setUsage(THREE.DynamicDrawUsage);
  const colors=new THREE.BufferAttribute(new Float32Array(rows*sides*3),3).setUsage(THREE.DynamicDrawUsage);
  for(let row=0;row<rows;row++){
   for(let side=0;side<sides;side++){
    const a=row*sides+side,b=row*sides+(side+1)%sides;
    if(row<rows-1)wall.push(a,b,a+sides,b,b+sides,a+sides);
    if(row%3===0)rails.push(a,b);
    if(row<rows-1&&side%6===0)rails.push(a,a+sides);
   }
  }
  const makeGeometry=indices=>this.keep(new THREE.BufferGeometry()).setAttribute('position',positions)
   .setAttribute('color',colors).setIndex(indices);
  const surface=new THREE.Mesh(makeGeometry(wall),this.keep(new THREE.MeshBasicMaterial({
   vertexColors:true,color:0x929292,side:THREE.DoubleSide,
   polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1
  })));
  const lines=new THREE.LineSegments(makeGeometry(rails),this.keep(new THREE.LineBasicMaterial({
   vertexColors:true,transparent:true,opacity:.68,blending:THREE.AdditiveBlending,depthWrite:false
  })));
  surface.frustumCulled=lines.frustumCulled=false;
  lines.renderOrder=1;
  this.groups.tunnel.add(surface,lines);
  this.tunnel={sides,rows,positions,colors,color:new THREE.Color(),look:new THREE.Vector3()};
 }
 updateTunnel(state,reaction){
  const distance=state.musicReactive===false?state.baseTravel:state.travel;
  const ride=globalThis.tunnelRide(distance,state.camera);
  const {sides,rows,positions,colors,color,look}=this.tunnel;
  const step=.69,span=step*3,start=Math.floor(distance/span)*span;
  for(let row=0;row<rows;row++){
   const along=start+(row-2)*step,depth=along-distance;
   const section=globalThis.tunnelSection(along);
   const kick=globalThis.kickSweep(reaction.pulses,(depth-1)*.08,2.6,8);
   const falloff=Math.max(0,1-Math.max(0,depth)/28);
   for(let side=0;side<sides;side++){
    const angle=side/sides*Math.PI*2+section.twist;
    const seam=.5+.5*Math.cos(angle*3+along*.24-state.time*1.15);
    const shimmer=Math.pow(.5+.5*Math.cos(angle*6-along*.56-state.time*2.1),4);
    const radius=section.radius*(1+.035*Math.sin(angle*4+along*.24));
    const i=row*sides+side;
    positions.setXYZ(i,section.x-ride.here.x+Math.cos(angle)*radius,
     section.y-ride.here.y+Math.sin(angle)*radius,-depth);
    color.copy(this.uniforms.uShadow.value).lerp(this.uniforms.uBody.value,.45+seam*.5)
     .lerp(this.uniforms.uHighlight.value,Math.min(.82,kick*.65+seam*.09))
     .multiplyScalar(falloff*(.60+seam*.64+shimmer*(.13+reaction.treble*.30)+kick*1.12));
    colors.setXYZ(i,color.r,color.g,color.b);
   }
  }
  positions.needsUpdate=colors.needsUpdate=true;
  this.camera.position.set(ride.seatX,ride.seatY,0);
  this.camera.up.set(Math.sin(ride.bank),Math.cos(ride.bank),0);
  look.set(ride.x+ride.seatX,ride.y+ride.seatY,ride.z);
  this.camera.lookAt(look);
 }
 buildStars(){
  const positions=new Float32Array(1800*3),sizes=new Float32Array(1800);const rand=seeded(this.seed);for(let i=0;i<1800;i++){positions.set([(rand()-.5)*24,(rand()-.5)*18,-rand()*26-1],i*3);sizes[i]=.015+rand()*.06;}
  this.starGeometry=this.keep(new THREE.BufferGeometry());this.starGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));this.starGeometry.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));this.starMat=this.material(`attribute float aSize;uniform float uPixelRatio;varying float vAlpha;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uPixelRatio*70./max(1.,-mv.z),.6,3.);vAlpha=.2;}`,`uniform vec3 uColor;varying float vAlpha;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(mix(uColor,vec3(.6,.7,.8),.7),vAlpha*(1.-d*2.));}`,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});this.stars=new THREE.Points(this.starGeometry,this.starMat);this.scene.add(this.stars);
 }
 ensureUltraScene(mode){
  if(mode==='orb'&&!this.orbGeometries[3]){
   this.orbGeometries[3]=this.keep(new THREE.IcosahedronGeometry(1.35,32));
   const n=14000,positions=new Float32Array(n*3),sizes=new Float32Array(n);
   for(let i=0;i<n;i++){const y=1-2*(i+.5)/n,a=i*2.39996323,r=Math.sqrt(1-y*y);positions.set([Math.cos(a)*r*1.37,y*1.37,Math.sin(a)*r*1.37],i*3);sizes[i]=.018+(i%11)*.002;}
   const g=this.keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('aSize',new THREE.BufferAttribute(sizes,1));this.ultraOrbPointsGeometry=g;
  }
  if(mode==='wave')this.ribbonMeshes.forEach((mesh,i)=>{if(mesh.ultraGeometry)return;const g=this.keep(new THREE.PlaneGeometry(5.5,.22,360,16)),p=g.attributes.position,uv=g.attributes.uv;for(let j=0;j<p.count;j++){p.setY(j,(uv.getY(j)-.5)*.2+(i-1.5)*.48);p.setZ(j,(i-1.5)*.4);}p.needsUpdate=true;mesh.ultraGeometry=g;});
 }
 setSeed(seed){if(this.seed===seed)return;this.seed=seed;this.uniforms.uSeed.value=seed;const rand=seeded(seed),p=this.starGeometry.attributes.position;for(let i=0;i<p.count;i++)p.setXYZ(i,(rand()-.5)*24,(rand()-.5)*18,-rand()*26-1);p.needsUpdate=true;}
 resize(width,height,level=2){if(!this.ready||this.lost)return;this.width=width;this.height=height;this.level=level;resizeReferenceForms(this,level);this.dpr=globalThis.getRenderScale(width,height,level,devicePixelRatio||1,this.maxSurfaceSize);this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(width,height,false);this.composer.setPixelRatio(this.dpr);this.composer.setSize(width,height);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.uniforms.uPixelRatio.value=this.dpr;this.skin.geometry=this.orbGeometries[Math.min(level,2)];this.wire.geometry=this.orbGeometries[Math.min(level,2)];this.orbPointsGeometry.setDrawRange(0,[1500,2800,4600][Math.min(level,2)]);this.starGeometry.setDrawRange(0,[450,900,1800,1800][level]);this.bloom.setSize(width*this.dpr*[.38,.55,.7,.9][level],height*this.dpr*[.38,.55,.7,.9][level]);}
 render(s,frame){
  if(!this.ready||this.lost||this.disposed)return false;
  const {width,height,level,palette,zoom=1,fill=false,center={x:0,y:0}}=frame;if(width!==this.width||height!==this.height||level!==this.level)this.resize(width,height,level);
  this.current=s;resizeReferenceForms(this,level);if(level===3)this.ensureUltraScene(s.mode);if(s.mode==='orb'){this.skin.geometry=this.orbGeometries[level]||this.orbGeometries[Math.min(level,2)];this.wire.geometry=this.skin.geometry;this.orbPoints.geometry=level===3?this.ultraOrbPointsGeometry:this.orbPointsGeometry;}if(s.mode==='wave')this.ribbonMeshes.forEach(m=>m.geometry=level===3?m.ultraGeometry:m.baseGeometry);this.setSeed(s.visualSeed);const reaction=globalThis.getVisualReactions(s),bass=reaction.bass;
  const trebleDetail=Math.min(1,reaction.treble+reaction.spark*.35);
  const time=s.time,dt=Math.max(0,Math.min(.05,s.visualTime-this.lastTime));this.lastTime=s.visualTime;
  const shot=globalThis.formCameraPose(s.mode,s.cameraTime,s.camera);
  Object.entries(this.groups).forEach(([name,g])=>g.visible=name===s.mode);
  this.uniforms.uArtGlow.value=s.glow;this.uniforms.uArtPalette.value=palette.angle;this.uniforms.uArtDetail.value=level;this.uniforms.uTime.value=time;this.uniforms.uBass.value=bass;const [a,b,c]=reaction.pulses;this.uniforms.uPulseAges.value.set(a.age,b?.age??0,c?.age??0);this.uniforms.uPulseStrengths.value.set(a.strength,b?.strength??0,c?.strength??0);this.uniforms.uMid.value=reaction.mid;this.uniforms.uHigh.value=trebleDetail;this.uniforms.uSpark.value=reaction.spark;this.uniforms.uDistortion.value=s.distortion;this.uniforms.uColor.value.set(palette.accent);
  this.uniforms.uShadow.value.set(palette.shadow);this.uniforms.uBody.value.set(palette.body);this.uniforms.uHighlight.value.set(palette.highlight);this.uniforms.uSparkColor.value.set(palette.spark);this.uniforms.uDebug.value=s.graphicsDebug==='field'?1:0;
  if(s.mode==='horizon')return renderHorizon(this,{width,height,zoom,fill,center,shot});
  const distance=6.4;
  if(s.mode==='tunnel'){
   this.updateTunnel(s,reaction);
  }else{
   if(!this.orbit.dragging&&s.pointerOrbit&&s.camera>0&&!s.paused){
    this.orbit.yaw=THREE.MathUtils.clamp(this.orbit.yaw+this.orbit.vx*dt,-.8,.8);
    this.orbit.pitch=THREE.MathUtils.clamp(this.orbit.pitch+this.orbit.vy*dt,-.45,.45);
    this.orbit.vx*=Math.exp(-dt*6);this.orbit.vy*=Math.exp(-dt*6);
   }
   const yaw=shot.yaw+(s.pointerOrbit?this.orbit.yaw*s.camera:0);
   const pitch=shot.pitch+(s.pointerOrbit?this.orbit.pitch*s.camera:0);
   this.camera.up.set(-Math.sin(shot.roll),Math.cos(shot.roll),0);
   this.camera.position.set(distance*Math.sin(yaw)*Math.cos(pitch),distance*Math.sin(pitch),distance*Math.cos(yaw)*Math.cos(pitch));
   this.camera.lookAt(0,0,0);
  }
  const cameraZoom=zoom*shot.zoom*(s.mode==='tunnel'&&fill?1.22:1);
  if(this.camera.zoom!==cameraZoom){
   this.camera.zoom=cameraZoom;
   this.camera.updateProjectionMatrix();
  }
  const offsetX=-(center.x+shot.x)*width,offsetY=-(center.y+shot.y)*height;
  const view=this.camera.view;
  if(view?.offsetX!==offsetX||view?.offsetY!==offsetY||view?.fullWidth!==width||view?.fullHeight!==height){
   this.camera.setViewOffset(width,height,offsetX,offsetY,width,height);
  }
  this.uniforms.uViewZoom.value=zoom;
  this.uniforms.uViewOffsetX.value=center.x*2;
  const art=this.referenceForms.find(form=>form.name===s.mode);
  this.stars.visible=!art;
  this.renderer.setClearColor(art?0x010405:0x080b0d,1);
  this.uniforms.uArtView.value.set(this.camera.position.x/distance,this.camera.position.y/distance);
  if(art&&art.kind!=='volume')art.group.quaternion.copy(this.camera.quaternion).multiply(
   this.artBank.setFromAxisAngle(this.artNormal,-shot.roll)
  );
  const halfHeight=distance*Math.tan(43*Math.PI/360),halfWidth=halfHeight*width/height;
  const bounds=formExtents[s.mode];
  const fit=bounds
   ? .9*Math.min(halfWidth/bounds[0],halfHeight/bounds[1])
   : s.mode==='wave' ? .9 : Math.min(1,halfWidth/2.15);
  const fillBounds=fillExtents[s.mode];
  let scaleX=fit,scaleY=fit;
  if(fill){
   if(fillBounds){
    scaleX=halfWidth/fillBounds[0];scaleY=halfHeight/fillBounds[1];
    if(s.mode!=='wave')scaleX=scaleY=Math.max(scaleX,scaleY);
   }else scaleX=scaleY=1;
  }
  if(s.mode!=='tunnel')this.groups[s.mode]?.scale.set(scaleX,scaleY,1);
  // Keep the procedural background plane behind the entire view at any zoom.
  const viewWidth=halfWidth*(1+2*Math.abs(center.x+shot.x));
  const viewHeight=halfHeight*(1+2*Math.abs(center.y+shot.y));
  const rollSine=Math.abs(Math.sin(shot.roll)),rollCosine=Math.cos(shot.roll);
  this.uniforms.uArtExtent.value.set(
   Math.max(1,(viewWidth*rollCosine+viewHeight*rollSine)/(scaleX*cameraZoom*4.8)),
   Math.max(1,(viewHeight*rollCosine+viewWidth*rollSine)/(scaleY*cameraZoom*4.8))
  );
  this.groups.orb.rotation.set(Math.sin(time*.26)*.16,time*.24,0);
  this.groups.wave.rotation.set(-.12,Math.sin(time*.24)*.14,0);
  const orbScale=1+reaction.kick*.20;
  this.skin.scale.setScalar(orbScale);
  this.wire.scale.setScalar(orbScale*1.003);
  this.aura.scale.setScalar(orbScale*1.07);
  this.orbPoints.scale.setScalar(orbScale);
  this.orbits.forEach((ring,i)=>{ring.material.color.copy(this.uniforms.uColor.value).multiplyScalar(1.4);ring.rotation.z=-.3+i*.4+time*(.10+i*.035);ring.material.opacity=.16+globalThis.kickSweep(reaction.pulses,i,8,1.4)*.12;});
  if(s.mode==='tunnel')this.stars.visible=false;
  // Cascade uses its own glow. Bloom over the dense line pass can blank the frame.
  this.bloom.enabled=s.mode!=='cascade';
  this.bloom.threshold=.9;this.bloom.strength=s.graphicsDebug==='no-post'||s.graphicsDebug==='field'?0:s.glow*.32;this.aura.visible=s.graphicsDebug!=='field';
  this.bloomView.enabled=this.bloom.enabled&&s.graphicsDebug==='bloom';this.renderer.toneMappingExposure=s.graphicsDebug==='field'?1:1.05;
  this.renderer.info.reset();this.renderer.info.reset();this.composer.render(dt);this.drawCount++;return this.ready;
 }
 diagnostics(){return{backend:'Three.js WebGL2',revision:THREE.REVISION,seed:this.seed,quality:this.level,dpr:this.dpr,draws:this.drawCount,geometries:this.renderer?.info.memory.geometries,textures:this.renderer?.info.memory.textures,calls:this.renderer?.info.render.calls,triangles:this.renderer?.info.render.triangles,points:this.renderer?.info.render.points,lost:this.lost,renderTargetTypes:'half-float HDR + bloom mip chain',timing:'CPU submit and frame intervals only; GPU completion not measured'};}
 fail(reason){if(this.disposed)return;this.ready=false;this.onFailure?.(reason);}
 dispose(){if(this.disposed)return;this.disposed=true;this.ready=false;this.canvas?.removeEventListener('webglcontextlost',this.loss);document.removeEventListener('pointerdown',this.pointerDown);document.removeEventListener('pointermove',this.pointerMove);document.removeEventListener('pointerup',this.pointerUp);document.removeEventListener('pointercancel',this.pointerUp);this.resources?.forEach(r=>r.dispose?.());this.resources?.clear();this.bloom?.dispose();this.bloomView?.dispose();this.output?.dispose();this.composer?.dispose();this.renderer?.dispose();}
}

export function createSignalPanel(panel,handle,reset){
 const bounds=()=>{const rect=panel.getBoundingClientRect(),x=Number(gsap.getProperty(panel,'x'))||0,y=Number(gsap.getProperty(panel,'y'))||0;return{minX:12-(rect.left-x),maxX:innerWidth-12-(rect.right-x),minY:12-(rect.top-y),maxY:innerHeight-110-(rect.bottom-y)};};
 let disabled=false;const drag=Draggable.create(panel,{type:'x,y',trigger:handle,inertia:{maxDuration:1.1,resistance:1600},bounds:bounds(),edgeResistance:1,allowEventDefault:true,onPress(){this.applyBounds(bounds());}})[0];
 const update=()=>{if(!panel.hidden&&panel.offsetWidth&&panel.offsetHeight){drag.update(true);drag.applyBounds(bounds());}};
 const resetPosition=()=>{drag.tween?.kill();gsap.set(panel,{x:0,y:0});drag.update(true);update();};reset.addEventListener('click',resetPosition);window.addEventListener('resize',update);document.addEventListener('fullscreenchange',update);
 return{sync(paused,reduced,hidden){const next=paused||reduced||hidden;if(next!==disabled){disabled=next;if(next){drag.tween?.kill();drag.disable();}else{drag.enable();update();}}},moveBy(x,y){if(disabled)return;drag.tween?.kill();gsap.set(panel,{x:drag.x+x,y:drag.y+y});drag.update(true);update();},reset:resetPosition,clamp:update,dispose(){drag.tween?.kill();drag.kill();reset.removeEventListener('click',resetPosition);window.removeEventListener('resize',update);document.removeEventListener('fullscreenchange',update);}};
}
