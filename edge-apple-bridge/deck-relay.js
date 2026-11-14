if (['http://127.0.0.1:4387','http://127.0.0.1:4390'].includes(location.origin) && location.pathname === '/') {
 window.addEventListener('message', async event => {
  const request = event.data;
  if (event.source !== window || event.origin !== location.origin || request?.type !== 'resonance-deck-request') return;
  let result;
  try {
   result = await chrome.runtime.sendMessage({type:'apple-bridge',action:request.action,target:request.target,seconds:request.seconds});
  } catch {result = {error:'The Edge bridge is unavailable. Reload this tab.'};}
  window.postMessage({type:'resonance-deck-response',id:request.id,result},location.origin);
 });
}
