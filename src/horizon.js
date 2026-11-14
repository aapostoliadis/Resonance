import * as THREE from 'three';
import horizonTexture from './horizon.webp';
import {kickSweepGLSL} from './reference-art.js';

let image;
export function getHorizonImage(){
 if(!image){
  image=new Image();
  image.src=horizonTexture;
 }
 return image;
}

const vertex=`
 varying vec2 vScreen;
 void main(){
  vScreen=vec2(uv.x,1.-uv.y);
  gl_Position=vec4(position.xy,0.,1.);
 }
`;
const fragment=kickSweepGLSL+`
 uniform sampler2D uImage;
 uniform vec2 uFrame,uCenter;
 uniform float uCameraRoll,uAspect;
 uniform vec2 uFlowPhase;
 uniform float uTime,uTerrainDrive,uHigh,uSpark,uDistortion;
 varying vec2 vScreen;
 float rimAt(float y){
  float latitude=y-.77;
  return .418+.39*latitude*latitude;
 }
 float smokeGust(float distance){
  vec3 front=vec3(distance)-uPulseAges*.66;
  // A narrow front arrives first, then a broader tail carries the wisps.
  vec3 width=mix(vec3(8.),vec3(30.),step(vec3(0.),front));
  vec3 envelope=front*width;
  return min(1.25,dot(exp(-envelope*envelope),uPulseStrengths));
 }
 vec3 readHorizon(vec2 p,vec2 shift,vec2 margin,float edge){
  vec2 uv=p+clamp(shift,-margin*.85,margin*.85);
  if(edge<-.018){
   // Follow the curved rim and ease inward travel before it can sample rock.
   float clearance=-edge-.012;
   float inward=max(0.,uv.x-p.x);
   uv.x=rimAt(uv.y)+edge+inward*clearance/(clearance+inward);
  }
  return texture2D(uImage,vec2(uv.x,1.-uv.y)).rgb;
 }
 void main(){
  vec2 screen=(vScreen-.5-uCenter)*vec2(uAspect,1.);
  float c=cos(uCameraRoll),s=sin(uCameraRoll);
  vec2 p=mat2(c,-s,s,c)*screen/vec2(uAspect,1.)*uFrame+.5;
  if(any(lessThan(p,vec2(0.)))||any(greaterThan(p,vec2(1.)))){
   gl_FragColor=vec4(.006,.008,.009,1.);
   #include <colorspace_fragment>
   return;
  }
  float rim=rimAt(p.y);
  float edge=p.x-rim;
  float smoke=smoothstep(.018,.09,-edge);
  float terrain=smoothstep(.035,.13,edge);
  vec2 margin=min(p,1.-p);
  vec2 border=smoothstep(vec2(0.),vec2(.10),margin);
  float windowMask=border.x*border.y*min(uDistortion,1.5);
  float t=uTime;
  float plumeDistance=max(0.,-edge-.04)+.045*sin(p.y*9.);
  float gust=smokeGust(plumeDistance)*smoke;
  // Sample back toward the limb to carry smoke out and up. Local eddies
  // curl the flow without pulling the whole plume back and forth.
  float curl=p.y*27.+p.x*19.-t*.65;
  float eddy=sin(curl);
  vec2 wind=vec2(.092+.023*eddy,.048+.021*cos(p.x*29.-p.y*13.-t*.45));
  // Mids accelerate the flow and shear adjacent marbled bands inside the limb.
  float midDrive=uTerrainDrive;
  float fold=p.x*21.+p.y*13.+1.5*sin(p.y*10.-p.x*7.);
  float band=.68+.32*sin(fold);
  // Keep neighboring currents out of phase without accumulating spatial shear.
  float landClock=t*.055+uFlowPhase.y;
  landClock+=.10*midDrive*sin(fold*.45-landClock*6.2831853);
  float current=sin(fold-landClock*6.2831853);
  float interior=smoothstep(.06,.22,edge);
  vec2 tangent=vec2(.78*(p.y-.77)+interior*(.14*sin(p.y*19.)+midDrive*.24*current),1.);
  vec2 stone=tangent*(.077+midDrive*.14)*band;
  float smokePhase=fract(t*.085+uFlowPhase.x+p.y*.23);
  float landPhase=fract(landClock+p.x*.31);
  float phase=mix(smokePhase,landPhase,step(0.,edge));
  vec2 landFlow=stone*terrain*windowMask;
  // Bound the sample in limb-relative space, including vertical travel.
  float sampleRim=rimAt(p.y+landFlow.y);
  landFlow.x=max(landFlow.x,min(0.,max(rim,sampleRim)+.018-p.x));
  vec2 flow=wind*smoke*windowMask+landFlow;
  vec2 push=vec2(.055+.023*eddy,.018+.032*cos(curl))*gust*windowMask;
  // Two offset flow windows crossfade so neither layer snaps on wrap.
  vec3 first=readHorizon(p,flow*phase+push,margin,edge);
  vec3 second=readHorizon(p,flow*fract(phase+.5)+push,margin,edge);
  vec3 color=mix(second,first,1.-abs(phase*2.-1.));
  float luma=dot(color,vec3(.2126,.7152,.0722));
  float filament=smoothstep(.15,.65,luma);
  float warmDetail=smoothstep(.05,.32,color.r-color.b)*smoothstep(.08,.46,luma);
  float travelingLight=smoothstep(.22,.93,current)*warmDetail;
  float glints=pow(.5+.5*sin(fold*6.+sin(p.y*133.)*2.-landClock*6.2831853),14.);
  color+=vec3(.62,.20,.043)*gust*filament*.18;
  color+=vec3(.31,.13,.034)*terrain*windowMask*midDrive*travelingLight;
  color+=vec3(.85,.45,.16)*terrain*windowMask*glints*filament*min(uHigh+uSpark*.4,1.3)*.18;
  gl_FragColor=vec4(color,1.);
  #include <colorspace_fragment>
 }
`;

export function renderHorizon(owner,frame){
 const source=getHorizonImage();
 if(!source.naturalWidth)return false;
 if(!owner.horizon){
  const texture=owner.keep(new THREE.Texture(source));
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.needsUpdate=true;
  const material=owner.material(vertex,fragment,{toneMapped:false,depthTest:false,depthWrite:false});
  material.uniforms.uImage={value:texture};
  material.uniforms.uFrame={value:new THREE.Vector2()};
  material.uniforms.uCenter={value:new THREE.Vector2()};
  material.uniforms.uCameraRoll={value:0};
  material.uniforms.uAspect={value:1};
  material.uniforms.uFlowPhase={value:new THREE.Vector2()};
  material.uniforms.uTerrainDrive={value:0};
  const scene=new THREE.Scene();
  const mesh=new THREE.Mesh(owner.keep(new THREE.PlaneGeometry(2,2)),material);
  mesh.frustumCulled=false;
  scene.add(mesh);
  owner.horizon={scene,material};
 }
 const {width,height,zoom,fill,center,shot}=frame;
 const ratio=(width/height)/(source.naturalWidth/source.naturalHeight);
 const fit=fill?Math.min:Math.max;
 const {scene,material}=owner.horizon;
 const cameraZoom=globalThis.horizonCameraZoom(shot,width/height,fill);
 material.uniforms.uFrame.value.set(fit(1,ratio)/(zoom*cameraZoom),fit(1,1/ratio)/(zoom*cameraZoom));
 material.uniforms.uCenter.value.set(center.x+shot.x,center.y+shot.y);
 material.uniforms.uCameraRoll.value=shot.roll;
 material.uniforms.uAspect.value=width/height;
 const state=owner.current;
 material.uniforms.uFlowPhase.value.set(state.horizonSmoke??0,state.horizonTerrain??0);
 material.uniforms.uTerrainDrive.value=state.horizonTerrainDrive??0;
 owner.renderer.setRenderTarget(null);
 owner.renderer.info.reset();
 owner.renderer.render(scene,owner.camera);
 owner.drawCount++;
 return owner.ready;
}
