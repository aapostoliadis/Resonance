const deckUrls = ['http://127.0.0.1:4387/','http://127.0.0.1:4390/'];
chrome.runtime.onMessage.addListener((request,sender,reply) => {
 if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !deckUrls.includes(sender.url) ||
  request?.type !== 'apple-bridge' || !['status','seek'].includes(request.action)) return;
 route(request).then(reply,() => reply({error:'The Apple Music tab could not be reached.'}));
 return true;
});

async function route(request) {
 const tabs = await chrome.tabs.query({url:'https://music.apple.com/*'});
 if (tabs.length !== 1) return {error:tabs.length ? 'Keep one Apple Music tab open in Edge.' : 'Open Apple Music in Edge and play a track.'};
 const tab = tabs[0];
 if (request.action === 'seek' && (request.target?.tabId !== tab.id || typeof request.target.key !== 'string' ||
  !Number.isFinite(request.seconds) || request.seconds < 0)) return {error:'The Apple Music track changed. Try seeking again.'};
 const data = await chrome.tabs.sendMessage(tab.id,{
  action:request.action,key:request.target?.key,seconds:request.seconds
 },{frameId:0});
 return data?.track ? {track:data.track,target:{tabId:tab.id,key:data.track.key}} : data;
}
