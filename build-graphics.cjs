// The portable app includes this bundle; rebuilding is optional.
const path=require('node:path');
const dependencies=process.env.RESONANCE_BUILD_DEPS;
const esbuild=dependencies?require(path.join(dependencies,'esbuild')):require('esbuild');
const root=dependencies||path.join(__dirname,'node_modules');
const alias={'three/addons':path.join(root,'three/examples/jsm'),'three':path.join(root,'three/build/three.module.js'),'gsap/Draggable':path.join(root,'gsap/Draggable.js'),'gsap/InertiaPlugin':path.join(root,'gsap/InertiaPlugin.js'),'gsap':path.join(root,'gsap/index.js')};
esbuild.build({entryPoints:[path.join(__dirname,'src/graphics.js')],bundle:true,minify:true,format:'iife',globalName:'ResonanceGraphics',target:['chrome110','edge110'],outfile:path.join(__dirname,'graphics.bundle.js'),legalComments:'linked',loader:{'.webp':'dataurl'},alias,nodePaths:[root]}).catch(error=>{console.error(error.message);process.exitCode=1;});
