const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {Arch, Platform, build} = require('electron-builder');
const config = require('./build.json');
const root = path.resolve(__dirname,'../..');
const {version,description} = require('../../package.json');
const icon = 'packaging/windows/resonance.ico';
const files = [
 'desktop-main.cjs','desktop-preload.cjs','server.cjs','local-audio.cjs',
 'spotify-media.ps1','spotify-volume.cs','index.html','app.js','player.js',
 'apple-music.js','reactivity.js','style.css','player.css','graphics.bundle.js',
 'graphics.bundle.js.LEGAL.txt','CREDITS.md','licenses/GSAP-LICENSE.txt','licenses/THREE-LICENSE.txt',icon
];
const artifact = config.win.artifactName;

async function packageWindows() {
 if (process.platform !== 'win32') throw new Error('Build the Windows EXE on Windows.');
 const dist = path.join(root,'dist','windows');
 await fs.mkdir(dist,{recursive:true});
 const scratch = await fs.mkdtemp(path.join(dist,'.build-'));
 try {
  const app = path.join(scratch,'app');
  const output = path.join(scratch,'output');
  await fs.mkdir(app);
  for (const file of files) {
   const destination = path.join(app,file);
   await fs.mkdir(path.dirname(destination),{recursive:true});
   await fs.copyFile(path.join(root,file),destination);
  }
  await fs.writeFile(path.join(app,'package.json'),JSON.stringify({
   name:'resonance',productName:'Resonance',version,description,author:'Resonance',main:'desktop-main.cjs'
  },null,2));
  await build({
   projectDir:__dirname,publish:'never',
   targets:Platform.WINDOWS.createTarget(['portable'],Arch.x64),
   config:{...config,win:{...config.win,icon:path.join(root,icon)},
    directories:{app,output},files:[...files,'package.json']}
  });
  const payload = path.join(output,'win-unpacked','resources','app');
  for (const file of files) {
   assert.deepEqual(await fs.readFile(path.join(payload,file)),await fs.readFile(path.join(app,file)),file);
  }
  const packed = JSON.parse(await fs.readFile(path.join(payload,'package.json'),'utf8'));
  assert.equal(packed.main,'desktop-main.cjs');
  assert.equal(packed.version,version);
  const built = path.join(output,artifact);
  assert.ok((await fs.stat(built)).size > 0,'portable EXE is nonempty');
  const destination = path.join(dist,artifact);
  await fs.rename(built,destination);
  console.log('Verified '+files.length+' runtime files, including spotify-media.ps1, spotify-volume.cs and local-audio.cjs.');
  console.log(destination);
 } finally {
  await fs.rm(scratch,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 }
}

packageWindows().catch(error => {console.error(error);process.exitCode = 1;});
