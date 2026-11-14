(() => {
 let media, signature, generation = 0;
 const documentId = crypto.randomUUID();
 function read() {
  const elements = [...document.querySelectorAll('audio,video')].filter(element =>
   Number.isFinite(element.duration) && element.duration > 0 && element.readyState > 0);
  const metadata = navigator.mediaSession?.metadata;
  const playing = elements.filter(element => !element.paused && !element.ended);
  if (playing.length > 1) return null;
  const next = playing[0] || (elements.includes(media) ? media : elements.findLast(element => element.tagName === 'AUDIO'));
  if (!next || !metadata?.title) return null;
  const nextSignature = JSON.stringify([next.currentSrc,metadata.title,metadata.artist,next.duration]);
  if (media !== next || signature !== nextSignature) {media = next;signature = nextSignature;generation++;}
  return {
   key:documentId+':'+generation,
   title:metadata.title,artist:metadata.artist,playing:!media.paused&&!media.ended,
   durationMs:media.duration*1000,positionMs:media.currentTime*1000,seekable:media.seekable.length>0
  };
 }
 window.addEventListener('message',async event => {
  const data = event.data;
  if (event.source !== window || event.origin !== location.origin || data?.type !== 'resonance-apple-request') return;
  const {action,key,seconds} = data.request || {};
  if (!['status','seek'].includes(action)) return;
  const track = read();
  let result = track ? {track} : {error:'Start a track in the Apple Music tab.'};
  if (action === 'seek' && track) {
   if (track.key !== key || !track.seekable || !Number.isFinite(seconds)) result = {error:'The current track cannot be seeked. Try again.'};
   else {
    const target = Math.max(0,Math.min(media.duration,seconds));
    const allowed = Array.from({length:media.seekable.length},(_,index)=>index)
     .some(index=>target>=media.seekable.start(index)&&target<=media.seekable.end(index));
    if (!allowed) result = {error:'That part of the track is not available to seek.'};
    else {
     try {
      const element = media;
      element.currentTime = target;
      const until = performance.now()+1050;
      while (element.seeking && performance.now()<until) await new Promise(resolve=>setTimeout(resolve,40));
      const current = read();
      result = current?.key===key && !element.seeking && Math.abs(current.positionMs/1000-target)<1.5
       ? {track:current} : {error:'Apple Music did not confirm the seek.'};
     } catch {result = {error:'Apple Music could not seek in this track.'};}
    }
   }
  }
  window.postMessage({type:'resonance-apple-result',id:data.id,result},location.origin);
 });
})();
