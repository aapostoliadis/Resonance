import * as THREE from 'three';

// Original flowing pigment, carved relief, and a genuine volumetric point field.
// These fields are procedural; no source artwork or machine-learning assets load.
const sculptureField=`
vec3 sculpture(vec2 p){
 float t=uTime*(SCULPTURE==0?.32:.20);
 vec2 q=p+uArtView*.14;
 float warp=min(uDistortion,1.6);
 float fold;
 if(SCULPTURE==0){
  // Two offset eddies stretch the same material coordinates as the pigment.
  vec2 center=vec2(-1.25,.48);
  vec2 d=q-center;
  float turn=exp(-dot(d,d)*.16)*warp*(1.25+.55*sin(t));
  q=center+mat2(cos(turn),sin(turn),-sin(turn),cos(turn))*d;
  center=vec2(1.55,-.6);
  d=q-center;
  turn=-exp(-dot(d,d)*.2)*warp*(1.05+.48*cos(t*.73));
  q=center+mat2(cos(turn),sin(turn),-sin(turn),cos(turn))*d;
  fold=sin(q.y*1.32+q.x*.51-t)+.37*sin(q.x*1.15+q.y*1.24+t*.64);
 }else{
  q.x+=warp*(.62*sin(q.y*.88-t)+.23*sin(q.y*1.94+t*.7));
  fold=sin(q.x*1.25+q.y*.65)+.65*sin(q.y*1.5-t*.8);
 }
 float relief=(SCULPTURE==0?.30:.38)*sin(fold*2.3)+.09*fb(q*4.3);
 return vec3(fold,relief,fb(q*9.+t*.2));
}
`;
export function buildDataSculptures(owner,common){
 const vertex=common+sculptureField+`
 void main(){vP=position.xy*uArtExtent;vec3 p=vec3(vP,sculpture(vP).y);vSurface=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`;
 const fragment=common+sculptureField+`
 void main(){
  vec3 f=sculpture(vP);float eps=uArtDetail<.5?.012:uArtDetail>2.5?.0015:.004;
  vec3 normal=normalize(vec3((sculpture(vP-vec2(eps,0)).y-f.y)/eps,(sculpture(vP-vec2(0,eps)).y-f.y)/eps,1.));
  float ridge=.5+.5*sin(f.x*70.+f.z*8.);float resolve=1.-smoothstep(1.2,3.5,fwidth(f.x*70.));
  ridge=mix(.5,ridge,resolve);
  float frequency=uArtDetail>2.5?110.:48.;float footprint=max(length(dFdx(vP)),length(dFdy(vP)))*frequency;
  float grain=mix(.5,fb(vP*frequency+f.z*3.),1.-smoothstep(.25,.75,footprint));
  float light=max(dot(normal,normalize(vec3(-.5,.7,1.))),0.);
  float cavity=mix(.18,1.,smoothstep(-.28,.25,f.y));
  vec3 albedo;
  if(SCULPTURE==0){
   float pigment=.5+.5*sin(f.x*1.65+f.z*3.+uTime*.055);
   albedo=mix(lin(vec3(.73,.10,.22)),lin(vec3(.035,.48,.60)),smoothstep(.26,.62,pigment));
   albedo=mix(albedo,lin(vec3(.99,.66,.27)),smoothstep(.72,.9,pigment));
   vec2 beadUV=vP*(uArtDetail>2.5?220.:110.)+f.z*2.;vec2 cell=fract(beadUV)-.5;
   float beadFootprint=max(length(dFdx(beadUV)),length(dFdy(beadUV)));float beads=mix(.18,exp(-dot(cell,cell)*18.),1.-smoothstep(.35,.85,beadFootprint));
   albedo*=.72+beads*.47+grain*.15;
  }else{
   albedo=mix(lin(vec3(.35,.42,.44)),lin(vec3(.91,.88,.78)),smoothstep(-.32,.27,f.y))*(.55+.45*ridge+.08*grain);
  }
  vec3 color=paletteGrade(albedo*(.24+light*1.25)*cavity);
  float coordinate=SCULPTURE==0?vP.x+.38*f.x:vP.y+.24*f.x;
  float accent=kickSweep(coordinate+1.15,6.,3.5);
  float detail=smoothstep(.37,.88,ridge);
  vec3 tint=uHighlight;
  color+=tint*accent*detail*(.45+grain*.55)*(SCULPTURE==0?.95:.65);
  color*=1.-uBass*.16*(1.-cavity);
  color=mix(color,color*.65+uBody*.65,uMid*detail*(SCULPTURE==0?.65:.34));
  if(SCULPTURE==0)color+=uSparkColor*pow(grain,5.)*(uSpark+uHigh*.5)*.7;
  if(SCULPTURE==1)color+=uSparkColor*min(uSpark+uHigh*.5,1.5)*.24*ridge*pow(grain,4.);
  if(uDebug>.5)color=mix(vec3(.015,.02,.25),vec3(1.,.3,.02),.5+.5*sin(f.x*2.3));
  gl_FragColor=vec4(color,1.);
 }`;
 for(const [name,index] of [['flux',0],['relic',1]]){
  const group=new THREE.Group();owner.groups[name]=group;owner.root.add(group);
  const geometries=[96,176,272].map(n=>owner.keep(new THREE.PlaneGeometry(12,12,n,n)));
  const prefix='#define SCULPTURE '+index+'\n';const material=owner.material(prefix+vertex,prefix+fragment,{side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometries[2],material);mesh.frustumCulled=false;group.add(mesh);owner.referenceForms.push({name,kind:'relief',group,mesh,geometries,ultraSegments:480});
 }
 const makeParticles=count=>{
 const positions=new Float32Array(count*3),seeds=new Float32Array(count);
 let randomState=71;const random=()=>{randomState=randomState*16807%2147483647;return(randomState-1)/2147483646;};
 for(let i=0;i<count;i++){const y=1-2*random(),a=random()*Math.PI*2,r=Math.cbrt(random())*1.6,side=Math.sqrt(1-y*y);positions.set([Math.cos(a)*side*r*1.25,y*r*.8,Math.sin(a)*side*r],i*3);seeds[i]=random();}
 const geometry=owner.keep(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
 return geometry;
 };
 const count=150000,geometry=makeParticles(count);
 const particleVertex=common+`
 attribute float aSeed;uniform float uPixelRatio;varying float vDepth,vSeed,vCloud,vAccent,vInterior;
 void main(){
  vec3 p=position;float t=uTime*.34;
  vec3 field=vec3(fb(p.yz*1.5+vec2(t,0.)),fb(p.zx*1.5+vec2(-t*.7,7.)),fb(p.xy*1.5+vec2(3.,t*.5)))-.5;
  float curl=(1.25*p.x+.48*sin(p.x*2.-t))*min(uDistortion,1.7);
  // Fold three thin particle sheets into one rolling volume.
  float sheet=(floor(aSeed*3.)-1.)*.53;
  p.y=p.y*.29+sheet+.42*sin(p.x*1.7+t+sheet*2.);
  p.yz=mat2(cos(curl),sin(curl),-sin(curl),cos(curl))*p.yz;
  p+=field*.58*min(uDistortion,1.7);
  // Position and point footprint stay stable. Only interior light responds.
  vInterior=1.-smoothstep(.65,1.40,length(position));
  vAccent=kickSweep(p.x+1.2+field.y*.35+sheet*.34,5.4,4.5)*vInterior;
  p*=min(1.,2.55/max(length(p),.001));
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((1.7+aSeed*.9)*uPixelRatio*6./max(1.,-mv.z),.7,3.5);
  vDepth=clamp((p.z+2.)/4.,0.,1.);vSeed=aSeed;vCloud=field.y+.5;vP=p.xy;vSurface=p;
 }`;
 const particleFragment=common+`
 varying float vDepth,vSeed,vCloud,vAccent,vInterior;
 void main(){vec2 q=gl_PointCoord*2.-1.;float r2=dot(q,q);if(r2>1.)discard;
  float lighting=.4+.6*max(0.,dot(normalize(vec3(q,sqrt(max(0.,1.-r2)))),normalize(vec3(-.4,.6,1.))));
  vec3 color=mix(lin(vec3(.02,.50,.68)),lin(vec3(.95,.20,.28)),smoothstep(.25,.7,vCloud));
  color=mix(color,lin(vec3(.97,.78,.39)),smoothstep(.90,.99,vSeed));
  color=paletteGrade(color*lighting*(.45+vDepth*1.6));float cluster=smoothstep(.36,.60,vCloud);
  color+=uHighlight*vAccent*cluster*3.2+uSparkColor*pow(vSeed,18.)*(uSpark+uHigh*.35)*vInterior*.65;
  color+=uBody*uMid*vInterior*cluster*.42;
  color*=1.+uBass*vInterior*cluster*.22;
  if(uDebug>.5)color=mix(vec3(.01,.02,.3),vec3(1.,.2,.01),vDepth);
  gl_FragColor=vec4(color,(.20+vDepth*.32)*(1.-r2));
 }`;
 const material=owner.material(particleVertex,particleFragment,{transparent:true,depthWrite:false});const points=new THREE.Points(geometry,material);points.frustumCulled=false;
 const group=new THREE.Group();group.add(points);owner.groups.swarm=group;owner.root.add(group);const form={name:'swarm',kind:'volume',group,geometry,baseGeometry:geometry,mesh:points,count};form.makeUltra=()=>{form.ultraGeometry=makeParticles(450000);};owner.referenceForms.push(form);
}
