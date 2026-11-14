chrome.runtime.onMessage.addListener((request,sender,reply) => {
 if (sender.id !== chrome.runtime.id || !['status','seek'].includes(request?.action)) return;
 const id = crypto.randomUUID();
 function receive(event) {
  if (event.source !== window || event.origin !== location.origin ||
   event.data?.type !== 'resonance-apple-result' || event.data.id !== id) return;
  clearTimeout(timeout);
  window.removeEventListener('message',receive);
  reply(event.data.result);
 }
 const timeout = setTimeout(() => {
  window.removeEventListener('message',receive);
  reply({error:'Apple Music did not respond. Refresh its tab.'});
 },1800);
 window.addEventListener('message',receive);
 window.postMessage({type:'resonance-apple-request',id,request},location.origin);
 return true;
});
