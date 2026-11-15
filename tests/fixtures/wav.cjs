function sineWav(seconds = 12, sampleRate = 16000) {
 const samples = Math.floor(seconds * sampleRate);
 const wav = Buffer.alloc(44 + samples * 2);
 wav.write('RIFF',0);
 wav.writeUInt32LE(wav.length - 8,4);
 wav.write('WAVEfmt ',8);
 wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);
 wav.writeUInt16LE(1,22);
 wav.writeUInt32LE(sampleRate,24);
 wav.writeUInt32LE(sampleRate * 2,28);
 wav.writeUInt16LE(2,32);
 wav.writeUInt16LE(16,34);
 wav.write('data',36);
 wav.writeUInt32LE(samples * 2,40);
 for (let i = 0; i < samples; i++) {
  wav.writeInt16LE(Math.round(18000 * Math.sin(2 * Math.PI * 160 * i / sampleRate)),44 + i * 2);
 }
 return wav;
}

module.exports = {sineWav};
