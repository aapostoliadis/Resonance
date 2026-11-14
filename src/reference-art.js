import {buildDataSculptures} from './data-sculptures.js';
import * as THREE from 'three';

// Authored material coordinates. Macro folds, meso ridges and microfibres share
// one terrain coordinate, so relief, pigment, cavities and highlights agree.
export const kickSweepGLSL=`
uniform vec3 uPulseAges,uPulseStrengths;
float kickSweep(float coordinate,float speed,float width){
 vec3 front=(vec3(coordinate)-uPulseAges*speed)*width;
 return min(1.5,dot(exp(-front*front),uPulseStrengths));
}
`;
export const paletteGLSL=`
uniform vec3 uShadow,uBody,uHighlight,uSparkColor;
vec3 paletteGrade(vec3 color){
 float level=dot(max(color,vec3(0.)),vec3(.2126,.7152,.0722));
 vec3 pigment=mix(uShadow,uBody,smoothstep(.015,.36,level));
 return mix(color,pigment*min(1.7,.24+level*2.8),.52*(1.-smoothstep(.55,1.4,level)));
}
`;
const common=kickSweepGLSL+paletteGLSL+`
uniform float uTime,uBass,uMid,uHigh,uDistortion,uSeed,uSpark,uDebug,uArtPalette,uArtDetail;
uniform vec2 uArtView,uArtExtent;
varying vec2 vP;varying vec3 vSurface;
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+uSeed*.019)*43758.5453);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1)),f.x),f.y);}
float fb(vec2 p){return .57*n2(p)+.28*n2(p*2.03+7.3)+.15*n2(p*4.13-3.7);}
vec3 lin(vec3 c){return pow(max(c,vec3(0.)),vec3(2.2));}
vec3 hueVariant(vec3 c){
 float angle=uArtPalette;
 vec3 axis=normalize(vec3(1.));return max(vec3(0.),c*cos(angle)+cross(axis,c)*sin(angle)+axis*dot(axis,c)*(1.-cos(angle)));
}

`;
const terrain=`
vec3 terrainField(vec2 p){
 vec2 q=p+vec2(.90,-.6)+uArtView*.12;
 q=mat2(.91,-.42,.42,.91)*q; q.y*=1.10;
 float clock=uTime*.26;
 vec2 warp=vec2(fb(q*.72+clock),fb(q*.72+5.3-clock))-.5;
 q+=warp* .45*min(uDistortion,1.6);
 float radius=length(q*vec2(.78,1.));
 float fold=radius+fb(q*1.15+warp)*.55;
 float layer=fold*4.4;
 float corrugation=fb(q*7.+warp*2.5);
 float cliff=sin(layer*6.28318+corrugation*.85);
 float relief=.20*cliff+.12*fb(q*3.3)+.010*sin(layer*32.+corrugation*4.);
 return vec3(layer,relief,corrugation);
}
`;
const terrainVertex=common+terrain+`
void main(){vP=position.xy*uArtExtent;vec3 field=terrainField(vP);vec3 p=vec3(vP,position.z);p.z=field.y;vSurface=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}
`;
const terrainFragment=common+terrain+`
vec3 mineral(float x){
 float q=mod(x,5.);vec3 c;
 if(q<1.)c=mix(vec3(.67,.43,.10),vec3(.38,.43,.14),smoothstep(.75,1.,q));
 else if(q<2.)c=mix(vec3(.25,.40,.19),vec3(.035,.44,.42),smoothstep(1.7,2.,q));
 else if(q<3.)c=mix(vec3(.025,.39,.40),vec3(.73,.18,.13),smoothstep(2.75,3.,q));
 else if(q<4.)c=mix(vec3(.74,.14,.13),vec3(.87,.38,.07),smoothstep(3.75,4.,q));
 else c=mix(vec3(.87,.40,.08),vec3(.72,.51,.12),smoothstep(4.7,5.,q));
 return lin(hueVariant(c));
}
void main(){
 vec3 f=terrainField(vP);float layer=f.x;
 float fibrePhase=atan(vP.y-.6,vP.x+.9)*590.+f.z*24.+layer*12.+fb(vP*14.)*8.;
 float pixel=max(fwidth(fibrePhase),.01),resolved=1.-smoothstep(2.,5.,pixel);
 float fibres=(.5+.5*sin(fibrePhase))*resolved;
 float frequency=uArtDetail>2.5?105.:55.;
 float footprint=max(length(dFdx(vP)),length(dFdy(vP)))*frequency;
 float grain=mix(.5,fb(vP*frequency+f.z*6.),1.-smoothstep(.25,.75,footprint));
 float eps=uArtDetail<.5?.012:uArtDetail>2.5?.0015:.004;
 vec3 normal=normalize(vec3((terrainField(vP-vec2(eps,0)).y-f.y)/eps,(terrainField(vP-vec2(0,eps)).y-f.y)/eps,1.));
 normal=normalize(normal+vec3(-dFdx(fibres)*.32,-dFdy(fibres)*.32,0.));
 vec3 light=normalize(vec3(-.55,.75,1.));
 float diffuse=max(dot(normal,light),0.);
 float crest=.5+.5*sin(layer*6.28318+f.z*.85);
 float cavity=mix(.20,1.,smoothstep(.04,.62,crest));
 vec3 albedo=mineral(layer*.52+.9);
 float tex=mix(.72,1.16,grain)*mix(.82,1.13,fibres);
 vec3 color=paletteGrade(albedo*tex*(.24+diffuse*1.5)*cavity);
 float rough=.52+grain*.25;
 float highlight=pow(max(dot(normal,normalize(light+vec3(0,0,1))),0.),mix(18.,6.,rough));
 color+=albedo*highlight*.22*crest;
 // Carry a narrow band of contrast through the mineral ridges.
 float accent=kickSweep(layer-1.4,21.,.75);
 float ridgeMask=smoothstep(.30,.86,crest)*mix(.45,1.,fibres);
 color+=mix(albedo,uHighlight,.72)*ridgeMask*accent*1.65;
 color*=1.-min(.28,uBass*.22)*(1.-crest);
 color=mix(color,color*.68+uBody*.42,uMid*fibres*.75);
 color+=uSparkColor*min(uSpark+uHigh*.5,1.5)*.27*pow(.5+.5*sin(layer*12.+uTime*2.),9.)*ridgeMask;
 if(uDebug>.5)color=mix(vec3(.01,.04,.3),vec3(1.,.2,.02),crest);
 gl_FragColor=vec4(color,1.);
}
`;
export function buildSculptedStrata(owner){
 const group=new THREE.Group();owner.groups.strata=group;owner.root.add(group);
 const geometries=[128,224,384].map(n=>owner.keep(new THREE.PlaneGeometry(12,12,n,n)));
 const material=owner.material(terrainVertex,terrainFragment,{side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometries[2],material);mesh.frustumCulled=false;group.add(mesh);
 owner.referenceForms.push({name:'strata',kind:'relief',group,mesh,geometries,ultraSegments:640});
}
export function resizeArt(form,level,owner){
 if(level===3&&!form.ultraReady){
  if(form.kind==='relief')form.geometries[3]=owner.keep(new THREE.PlaneGeometry(12,12,form.ultraSegments,form.ultraSegments));
  if(form.makeUltra)form.makeUltra();form.ultraReady=true;
 }
 if(form.kind==='relief')form.mesh.geometry=form.geometries[Math.min(level,form.geometries.length-1)];
 if(form.kind==='volume')form.mesh.geometry=level===3?form.ultraGeometry:form.baseGeometry;
 if(form.kind==='volume')form.mesh.geometry.setDrawRange(0,[30000,75000,150000,450000][level]);
 if(form.kind==='branches'){
  const count=globalThis.getFractalBranchCount(level);
  form.mesh.geometry.setDrawRange(0,count*2);
  form.contours.geometry.setDrawRange(0,globalThis.getFractalContourCount(level)*2);
  form.glints.geometry.setDrawRange(0,count);
 }
 if(form.baseFlowGeometry){form.flowGeometry=level===3?form.ultraFlowGeometry:form.baseFlowGeometry;form.flowMesh.geometry=form.flowGeometry;}
 if(form.flowGeometry)form.flowGeometry.setDrawRange(0,Math.floor(form.strands*[.32,.60,1,3][level])*form.steps*2);
}

const artVertex=common+`
void main(){vP=position.xy*uArtExtent;vSurface=vec3(vP,position.z);gl_Position=projectionMatrix*modelViewMatrix*vec4(vSurface,1.);}
`;
const artFragment=common+`
uniform float uArtGlow;
const float TAU=6.283185307;
float filteredStroke(float phase,float width,float footprint){float d=abs(fract(phase)-.5);float aa=max(footprint,.0005);float line=1.-smoothstep(width,width+aa,d);return mix(line,width*2.,smoothstep(.25,.70,aa));}
float stroke(float phase,float width){return filteredStroke(phase,width,fwidth(phase));}
vec3 glitter(vec2 p){
 vec2 grid=p*8.,cell=floor(grid);float pick=h2(cell+19.);
 vec2 center=cell+vec2(h2(cell+2.),h2(cell+4.));float d=length(grid-center)/8.;
 float core=exp(-d*d/.000055),halo=exp(-d*d/.0009)*.25*uArtGlow;
 return (lin(vec3(1.,.64,.18))*.55+uSparkColor*(uSpark*.45+uHigh*.20))*(core*4.+halo)*step(.94,pick);
}
vec3 beadRings(vec2 p,float spacing,float phase){
 float r=length(p),angle=atan(p.y,p.x)/TAU;
 float ring=floor(r/spacing),radius=(ring+.5)*spacing;
 float count=floor((26.+ring*(3.+mod(ring,3.)*1.5))*(uArtDetail>2.5?1.5:1.));float spin=phase*(.4+mod(ring,3.)*.15);
 float cell=floor((angle+spin)*count);
 float tang=(fract((angle+spin)*count)-.5)*TAU*max(radius,.05)/count;
 float radial=r-radius;
 float jitter=(h2(vec2(ring,cell))-.5)*.005;
 float d2=tang*tang+pow(radial+jitter,2.);
 float size=.00013+uSpark*.000025;
 float core=exp(-d2/size),halo=exp(-d2/.0014)*.19*uArtGlow;
 float fade=.58+.42*h2(vec2(ring,cell+9.));
 #if ART == 2
 fade*=step(.36,h2(vec2(ring,18.)));
 fade*=mix(.35,1.,step(.30,h2(vec2(ring,cell+4.))));
 #endif
 return (lin(vec3(1.,.65,.14))*(core*3.6+halo)+lin(vec3(1.,.92,.65))*pow(core,4.)*.9)*fade*.85+uSparkColor*core*fade*min(uSpark+uHigh*.5,1.)*1.35;
}
vec3 cascade(vec2 p){
 float clock=uTime*.12,fall=clamp((2.1-p.y)/4.8,0.,1.25);
 float spread=.24+fall*.48+fall*fall*1.3;
 float drift=sin(p.y*.7+clock)*.12;
 vec3 color=lin(vec3(.005,.055,.065));
 float crest=1.45+.65*exp(-p.x*p.x/.49);
 float surge=kickSweep(fall-.18,1.8,7.);
 float mask=exp(-pow(abs((p.x-drift)/spread),3.)*1.8)*(1.-smoothstep(crest-.05,crest+.12,p.y));
 for(int i=0;i<3;i++){
  if(i==2&&uArtDetail<.5)continue;
  float layer=float(i),depth=1.+layer*.22;
  vec2 q=vec2((p.x-drift)/spread*depth,p.y);
  float flowing=fb(q*vec2(1.7,.8)+vec2(layer*3.,clock));
  float curl=sin(p.y*(1.3+layer*.15)+flowing*3.+clock)*(.55+fall*.4);
  float phase=q.x*(mix(18.,65.,smoothstep(0.,.8,fall))+layer*9.)+flowing*17.+curl*6.;
  float threads=stroke(phase,.045);
  float broken=.35+.65*fb(vec2(q.x*6.+layer*7.,p.y*2.4-clock*2.));
  float glints=pow(.5+.5*sin(p.y*15.-clock*13.+q.x*11.),14.);
  color+=mix(lin(vec3(.025,.62,.70)),mix(lin(vec3(.12,.38,.87)),uBody,.55),uMid*flowing*.55)*threads*mask*broken*.27/(1.+layer*.4);
  color+=glints*threads*mask*(lin(vec3(.09,.58,.69))*.06+uSparkColor*(uSpark*.26+uHigh*.15));
  color+=uHighlight*surge*threads*mask*broken*1.3/(1.+layer*.45);
 }
 // Dense hanging crest and a turbulent foam footing share the flow envelope.

 float glowMask=exp(-pow(abs((p.x-drift)/(spread+.33)),2.)*2.);
 float glowHeight=smoothstep(0.,.34,fall)*(1.-smoothstep(.86,1.18,fall));
 color+=hueVariant(lin(vec3(.02,.40,.48)))*glowMask*glowHeight*uArtGlow*.22;
 float crestD=p.y-crest;
 color+=lin(vec3(.015,.42,.50))*exp(-crestD*crestD/.018)*exp(-p.x*p.x/1.3)*(.12+uBass*.04);
 float foamY=-2.05+fb(vec2(p.x*2.5-clock,clock))*.34;
 float foam=1.-smoothstep(foamY-.12,foamY+.15,p.y);
 float froth=fb(p*vec2(12.,23.)+vec2(0.,clock));
 color=mix(color,lin(vec3(.30,.64,.65))*(.5+froth),foam*.7);
 color+=lin(vec3(.6,.88,.86))*foam*pow(froth,3.)*.8;
 color+=glitter(p+vec2(clock*.04,0.))*mask*.35;
 return color;
}
vec3 vortex(vec2 p){
 float clock=uTime*.25;
 float r=max(length(p),.001),angle=atan(p.y,p.x);
 float eye=.55;
 float warp=sin(angle*4.+clock)*.020*.5+sin(angle*9.-clock)*.008*uDistortion;
 float radius=max(.02,r+warp);
 float density=uArtDetail<.5?95.:uArtDetail<1.5?135.:uArtDetail>2.5?255.:175.;
 // atan wraps at the left edge. Derive the local angular gradient from
 // position so the filter sees the continuous spiral across that wrap.
 vec2 angularGradient=vec2(-p.y,p.x)/(TAU*max(dot(p,p),.000001));
 vec2 angularStep=vec2(dot(angularGradient,dFdx(p)),dot(angularGradient,dFdy(p)));
 float logRadius=log(radius);
 vec2 radialStep=vec2(dFdx(logRadius),dFdy(logRadius));
 float phase=angle/TAU*density+logRadius*31.-clock;
 vec2 threadStep=abs(angularStep*density+radialStep*31.);
 float thread=filteredStroke(phase,.085,threadStep.x+threadStep.y);
 float field=.5+.5*sin(logRadius*5.-angle+clock);
 vec3 pigment=mix(lin(vec3(.83,.008,.19)),lin(vec3(1.,.37,.08)),pow(field,3.));
 vec3 color=lin(vec3(.10,.002,.035))*(.4+.6*field);
 color+=pigment*thread*(.75+.25*sin(radius*6.-clock));
 float accent=kickSweep(radius-.82,3.8,6.);
 float sector=.28+.72*pow(.5+.5*cos(angle*3.-log(radius)*4.),4.);
 color+=uHighlight*thread*accent*sector*2.1;
 float inner=1.-smoothstep(eye-.025,eye+.025,r);
 float innerPhase=angle/TAU*47.+logRadius*19.+clock*.3;
 vec2 innerStep=abs(angularStep*47.+radialStep*19.);
 vec3 voidColor=lin(vec3(.12,.002,.05))+lin(vec3(.45,.008,.14))*filteredStroke(innerPhase,.03,innerStep.x+innerStep.y)*.40;
 color=mix(color,voidColor,inner);
 float rim=exp(-pow((r-eye-.025)/.035,2.));
 color+=lin(vec3(.18,.55,.66))*rim*(.34+uBass*.2);
 color+=lin(vec3(.09,.28,.35))*exp(-pow((r-eye-.025)/.11,2.))*.20*uArtGlow;
 color+=glitter(p+vec2(clock*.02,0.));
 return color;
}
vec3 pulse(vec2 p){
 float clock=uTime*.22,r=length(p),angle=atan(p.y,p.x);
 float accent=kickSweep(r-.76,4.6,7.);
 float iris=.57;
 float rings=r*(uArtDetail<.5?6.:9.)+.65*sin(r*4.-clock);
 float band=.5+.5*cos(rings*TAU);
 vec3 color=mix(lin(vec3(.35,.012,.14)),lin(vec3(1.,.59,.09)),smoothstep(.20,.85,band));
 color*=.65+.35*exp(-r*.25);
 color+=stroke(rings,.013)*(lin(vec3(1.,.76,.29))*1.1+uHighlight*accent*3.);
 float mask=1.-smoothstep(iris-.015,iris+.015,length(p));
 float irisStep=floor(length(p)*36.)/36.;
 vec3 irisColor=mix(lin(vec3(.005,.14,.18)),lin(vec3(.02,.65,.68)),1.-smoothstep(0.,iris,irisStep));
 irisColor+=lin(vec3(.08,.7,.75))*exp(-r*r/.012)*.55;
 color=mix(color,irisColor,mask);
 color+=lin(vec3(1.,.65,.13))*exp(-pow((r-iris-.07)/.04,2.))*.8;
 color+=beadRings(p,.13,clock*.018)*smoothstep(iris+.11,iris+.22,r)*(1.+accent*1.8);
 return color;
}
vec3 ember(vec2 p){
 float clock=uTime*.22,r=length(p),angle=atan(p.y,p.x);
 vec3 color=lin(vec3(.16,.006,.11));
 float circular=.5+.5*cos(r*38.-clock*.3);
 color+=lin(vec3(.28,.008,.17))*pow(circular,4.);
 color+=beadRings(p,.145,clock*.012)*smoothstep(.80,1.3,r);
 vec2 q=p-vec2(0.,-.30);
 q.x+=sin(q.y*2.+clock)*.016*uDistortion;
 float a=atan(q.y,q.x),top=.5+.5*sin(a);
 float edge=(.88+.91*pow(top,4.))*(1.-.34*pow(top,3.)*sqrt(abs(cos(a))));
 float d=length(q)/max(edge,.01);
 float layers=uArtDetail>2.5?23.:13.;
 float accent=kickSweep(d-.32,1.25,10.)*smoothstep(.23,.37,d)*(1.-smoothstep(.71,.89,d));
 float nested=d*layers;float bands=floor(nested)/layers;
 vec3 flame=mix(lin(vec3(1.,.22,.018)),lin(vec3(1.,.81,.24)),1.-smoothstep(.05,.96,bands));
 flame*=.68+.32*smoothstep(.1,.9,fract(nested));
 flame+=lin(vec3(1.,.94,.62))*exp(-d*d*20.)*2.5;
 flame+=lin(vec3(1.,.71,.19))*stroke(nested,.035)*(.32+uBass*.18);
 float bandAccent=accent*(.48+.52*stroke(nested,.075));
 vec3 rose=mix(lin(vec3(1.,.45,.19)),lin(vec3(1.,.20,.44)),smoothstep(.34,.76,d));
 flame=mix(flame,mix(rose,uHighlight,.72)*1.3,min(.86,bandAccent*1.3));
 color=mix(color,flame,1.-smoothstep(.995,1.005,d));
 float outerLine=stroke(d*11.,.018)*smoothstep(1.01,1.08,d)*(1.-smoothstep(1.40,1.53,d));
 color+=lin(vec3(.94,.27,.035))*outerLine*.9;
 color+=lin(vec3(.85,.24,.018))*exp(-pow((d-1.)/.09,2.))*.21*uArtGlow;
 color+=glitter(p+vec2(clock*.08,0.))*.35;
 return color;
}
void main(){
 vec2 p=vP+uArtView*.09;
 vec3 color;
 #if ART == 0
 color=hueVariant(cascade(p));
 #elif ART == 1
 color=vortex(p);
 #elif ART == 2
 color=pulse(p);
 #else
 color=ember(p);
 #endif
 #if ART != 0
 color=paletteGrade(color);
 #endif
 if(uDebug>.5){float field=ART==0?clamp((2.1-p.y)/4.8,0.,1.):clamp(length(p)/3.,0.,1.);color=mix(vec3(.005,.03,.3),vec3(1.,.18,.015),field);}
 gl_FragColor=vec4(color,1.);
}
`;
export function buildAnalyticArt(owner,name,index,geometry){
 const group=new THREE.Group();owner.groups[name]=group;owner.root.add(group);
 const material=owner.material(artVertex,'#define ART '+index+'\n'+artFragment,{side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;group.add(mesh);
 const form={name,kind:'art',group,mesh,geometry};owner.referenceForms.push(form);if(name==='cascade')addFlowStrands(owner,form);
}
export function buildDetailedForms(owner){
 owner.referenceForms=[];const geometry=owner.keep(new THREE.PlaneGeometry(18,18));
 buildAnalyticArt(owner,'cascade',0,geometry);buildSculptedStrata(owner);buildAnalyticArt(owner,'vortex',1,geometry);buildAnalyticArt(owner,'pulse',2,geometry);buildAnalyticArt(owner,'ember',3,geometry);buildDataSculptures(owner,common);
 buildFractal(owner);
}

const fractalMotionGLSL=kickSweepGLSL+`
uniform float uTime,uBass,uMid,uHigh,uDistortion,uSpark;
float crystalPulse(float radius,float arm){
 return kickSweep(radius+.06-arm*.017,3.65,8.);
}
vec3 crystalNode(vec2 point,float arm){
 float radius=length(point);
 float phase=radius*10.-uTime*2.65+arm*.88;
 float room=smoothstep(.12,.68,radius)*(1.-smoothstep(1.94,2.22,radius));
 float pulse=crystalPulse(radius,arm);
 vec2 tangent=vec2(-point.y,point.x)/max(radius,.001);
 float drift=(.016+uMid*.047)*sin(phase)+.009*sin(phase*1.67+point.x*5.);
 float ripple=pulse*(.012+.028*uBass);
 return vec3(point+(tangent*(drift+ripple)+point*sin(phase*.72)*uMid*.014)*room*uDistortion,
             room*uDistortion*(.085*sin(phase*.74)+.15*pulse+.10*uMid*cos(phase+point.y*3.)));
}
`;

function buildFractal(owner){
 const branches=globalThis.buildFractalBranches();
 const linePositions=[],lineData=[],particleStarts=[],particleEnds=[],particleData=[];
 for(const {x,y,endX,endY,level,arm,phase} of branches){
  const detail=[arm,level,phase];
  linePositions.push(x,y,0,endX,endY,0);
  lineData.push(...detail,...detail);
  particleStarts.push(x,y,0);
  particleEnds.push(endX,endY);
  particleData.push(...detail);
 }

 const makeGeometry=(positions,data)=>{
  const geometry=owner.keep(new THREE.BufferGeometry());
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('aBranch',new THREE.Float32BufferAttribute(data,3));
  return geometry;
 };
 const lineGeometry=makeGeometry(linePositions,lineData);
 const contourPositions=[],contourData=[];
 for(const {x,y,endX,endY,arm,level,phase} of globalThis.buildFractalContours()){
  contourPositions.push(x,y,0,endX,endY,0);
  contourData.push(arm,level,phase,arm,level,phase);
 }
 const contourGeometry=makeGeometry(contourPositions,contourData);
 const particleGeometry=makeGeometry(particleStarts,particleData);
 particleGeometry.setAttribute('aEnd',new THREE.Float32BufferAttribute(particleEnds,2));

 const vertex=fractalMotionGLSL+`
 attribute vec3 aBranch;
 varying vec3 vBranch;
 varying float vRadius;
 void main(){
  vBranch=aBranch;
  vRadius=length(position.xy);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(crystalNode(position.xy,aBranch.x),1.);
 }`;
 const fragment=fractalMotionGLSL+paletteGLSL+`
 varying vec3 vBranch;
 varying float vRadius;
 void main(){
  float arm=vBranch.x,level=vBranch.y,seed=vBranch.z;
  float pulse=crystalPulse(vRadius,arm);
  float wave=.5+.5*sin(vRadius*22.-uTime*4.4+level*1.4+arm*.7);
  float harmonic=uMid*step(.5,level)*wave;
  float detail=pow(.5+.5*sin(vRadius*86.-uTime*5.+seed*6.28),8.);
  vec3 trace=mix(uShadow,uBody,.80+.20*wave);
  vec3 light=mix(uHighlight,uSparkColor,.17+.48*seed);
  vec3 color=mix(trace,light,.32+.27*wave)+light*(pulse*1.7+harmonic*.65);
  color+=uSparkColor*detail*(uHigh*.20+uSpark*.18);
  float alpha=.46+(1.-level/5.)*.30+wave*.12+pulse*.22;
  gl_FragColor=vec4(color,min(.98,alpha));
 }`;
 const surface={transparent:true,depthWrite:false,blending:THREE.AdditiveBlending};
 const mesh=new THREE.LineSegments(lineGeometry,owner.material(vertex,fragment,surface));
 const contourFragment=fractalMotionGLSL+paletteGLSL+`
 varying vec3 vBranch;
 varying float vRadius;
 void main(){
  float layer=vBranch.y;
  float pulse=crystalPulse(vRadius,vBranch.x);
  float wave=.5+.5*sin(vRadius*28.+layer*1.6-uTime*3.4);
  float glint=pow(.5+.5*sin(vBranch.z*6.283+uTime*4.),10.);
  vec3 color=mix(uShadow,uBody,.56+wave*.34);
  color=mix(color,uHighlight,.18+uMid*wave*.24);
  color+=uHighlight*pulse*(.46+.34*wave)+uSparkColor*glint*(uHigh*.28+uSpark*.18);
  gl_FragColor=vec4(color,min(.83,.30+wave*.24+pulse*.26));
 }`;
 const contours=new THREE.LineSegments(contourGeometry,owner.material(vertex,contourFragment,surface));

 const glintVertex=fractalMotionGLSL+`
 uniform float uPixelRatio;
 attribute vec3 aBranch;
 attribute vec2 aEnd;
 varying vec2 vLight;
 void main(){
  float seed=aBranch.z,level=aBranch.y;
  float progress=fract(uTime*(.20+seed*.35)+seed+level*.17);
  vec2 anchor=mix(position.xy,aEnd,progress);
  float pulse=crystalPulse(length(anchor),aBranch.x);
  float envelope=smoothstep(.05,.28,progress)*(1.-smoothstep(.72,.98,progress));
  float flash=pow(.5+.5*sin(uTime*(3.+seed*6.)+seed*40.),5.);
  vLight=vec2(envelope*(.12+flash*(uHigh*.58+uSpark*.48)+pulse*.66),seed);
  vec3 p=mix(crystalNode(position.xy,aBranch.x),crystalNode(aEnd,aBranch.x),progress);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp((1.2+1.8*flash+2.1*pulse)*uPixelRatio*6./max(1.,-mv.z),1.,9.);
 }`;
 const glintFragment=paletteGLSL+`
 varying vec2 vLight;
 void main(){
  float distanceToCenter=length(gl_PointCoord-.5)*2.;
  float mask=1.-smoothstep(.06,1.,distanceToCenter);
  vec3 color=mix(uHighlight,uSparkColor,vLight.y)*(1.+mask*.6);
  gl_FragColor=vec4(color,mask*mask*min(1.,vLight.x));
 }`;
 const glints=new THREE.Points(particleGeometry,owner.material(glintVertex,glintFragment,surface));
 const group=new THREE.Group();
 group.add(contours,mesh,glints);
 owner.root.add(group);
 owner.groups.fractal=group;
 owner.referenceForms.push({name:'fractal',kind:'branches',group,mesh,glints,contours});
}

const flowVertex=common+`
attribute vec2 aParam;varying float vFlow,vDepth,vStrandU;
void main(){
 float u=aParam.x,v=aParam.y,phi=v*6.2831853,clock=uTime*.26;
 float random=h2(vec2(v*891.,3.));
 float originX=(v-.5)*1.55+.10*sin(v*29.+uSeed*.01);
 float originY=1.45+.65*exp(-originX*originX/.49)+(random-.5)*.22;
 float lengthScale=.78+random*.30;
 vec3 p=vec3(originX*(1.+u*.65),originY-u*4.5*lengthScale,(random-.5)*.7);
 float bend=sin(u*6.+phi*3.+clock)*sin(u*3.14159);
 p.x+=bend*.30*uDistortion;
 p.x+=sin(u*32.+phi*11.-clock)*(.012+random*.045)*uDistortion;
 p.x+=sin(u*29.+phi*13.)*exp(-u*9.)*.10*uDistortion;
 p.z+=sin(u*8.+phi*3.-clock)*.15*uDistortion;
 vStrandU=u;
 vFlow=.5+.5*sin(u*19.-clock*8.+phi*7.);vDepth=random;
 vP=p.xy;vSurface=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}
`;
const flowFragment=common+`
varying float vFlow,vDepth,vStrandU;
void main(){vec3 color=hueVariant(lin(vec3(.035,.62,.69)))*(.65+vDepth*.45);color+=uSparkColor*pow(vFlow,16.)*uSpark*4.;float accent=kickSweep(vStrandU-.12+vDepth*.08,1.8,8.);color+=uHighlight*accent*(.35+vFlow*.65)*1.5;if(uDebug>.5)color=mix(vec3(.01,.03,.3),vec3(1.,.15,.01),vDepth);float fade=smoothstep(0.,.035,vStrandU)*(1.-smoothstep(.82,1.,vStrandU));gl_FragColor=vec4(color,(.15+vDepth*.14)*fade);}
`;
function addFlowStrands(owner,form){
 const steps=200;
 const makeGeometry=strands=>{
  const params=new Float32Array(strands*steps*4);
  for(let i=0;i<strands;i++)for(let j=0;j<steps;j++){const offset=(i*steps+j)*4,v=(i*.61803398875)%1;params.set([j/steps,v,(j+1)/steps,v],offset);}
  const g=owner.keep(new THREE.BufferGeometry());g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(params.length/2*3),3));g.setAttribute('aParam',new THREE.BufferAttribute(params,2));return g;
 };
 const geometry=makeGeometry(1100),material=owner.material(flowVertex,flowFragment,{transparent:true,depthWrite:false,depthTest:false});
 const mesh=new THREE.LineSegments(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=2;form.group.add(mesh);form.flowGeometry=geometry;form.baseFlowGeometry=geometry;form.strands=1100;form.steps=steps;
 form.makeUltra=()=>{form.ultraFlowGeometry=makeGeometry(3300);};
 form.flowMesh=mesh;
}
