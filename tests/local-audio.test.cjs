const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {test} = require('node:test');
const {createLocalAudio} = require('../local-audio.cjs');
const {startServer} = require('../server.cjs');
const {sineWav} = require('./fixtures/wav.cjs');

async function fixture(t) {
 const dir = await fs.mkdtemp(path.join(os.tmpdir(),'resonance-range-'));
 const service = createLocalAudio();
 let server;
 t.after(async () => {
  if (server) await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
  service.close();
  await fs.rm(dir,{recursive:true,force:true});
 });
 const data = sineWav(0.25);
 const file = path.join(dir,'Signal test.wav');
 await fs.writeFile(file,data);
 server = await startServer(0,service);
 const track = service.add(file);
 const request = (url = track.url, options) => fetch('http://127.0.0.1:' + server.address().port + url,{
  signal:AbortSignal.timeout(3000),...options
 });
 return {data,dir,service,track,request};
}

test('local WAV returns full data and HEAD returns metadata only',async t => {
 const {data,request,track} = await fixture(t);
 assert.equal(track.name,'Signal test.wav');
 const response = await request();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'audio/wav');
 assert.equal(response.headers.get('accept-ranges'),'bytes');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),data);
 const head = await request(undefined,{method:'HEAD'});
 assert.equal(head.status,200);
 assert.equal(Number(head.headers.get('content-length')),data.length);
 assert.equal((await head.arrayBuffer()).byteLength,0);
});

test('local audio serves exact requested ranges and rejects unsatisfiable ranges',async t => {
 const {data,request} = await fixture(t);
 for (const [range,start,end] of [['bytes=12-29',12,29],['bytes=-16',data.length-16,data.length-1]]) {
  const response = await request(undefined,{headers:{range}});
  assert.equal(response.status,206);
  assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${data.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()),data.subarray(start,end+1));
 }
 const invalid = await request(undefined,{headers:{range:`bytes=${data.length}-`}});
 assert.equal(invalid.status,416);
 assert.equal(invalid.headers.get('content-range'),`bytes */${data.length}`);
});

test('local audio only serves registered, supported files',async t => {
 const {dir,track,service,request} = await fixture(t);
 const unsupported = path.join(dir,'test.txt');
 await fs.writeFile(unsupported,'not audio');
 assert.equal(service.add(unsupported),null);
 assert.equal((await request('/local-audio/unknown')).status,404);
 service.remove(track.id);
 assert.equal((await request()).status,404);
});
