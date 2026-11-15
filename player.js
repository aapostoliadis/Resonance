'use strict';

(() => {
 const player = document.querySelector('.retro-player');
 const get = id => document.getElementById(id);
 const buttons = [...player.querySelectorAll('[data-player-command]')];
 const seek = get('player-seek');
 const volume = get('player-volume');
 const time = get('player-time');
 const playbackIndicator = get('player-indicator').querySelector('use');
 const spectrum = get('player-spectrum');
 const context = spectrum.getContext('2d');
 const feedback = get('player-feedback');
 const trackTitle = get('player-track');
 const headers = {'X-Resonance-Player':'1'};
 let session = null;
 let token = '';
 let sampledAt = 0;
 let renderedFile=null;
 let busy = false;
 let dragging = false;
 let pendingSeek = null;
 let seekDraining = false;
 let seekTarget = null;
 let adjustingVolume = false;
 let remaining = false;
 let scope = false;
 let pollVersion = 0;
 let nextPoll = 0;
 let appleCapture = false;
 let appleTrack = null;
 let appleCommandPending = false;
 let edgeAppleTrack = null;
 let edgeAppleTarget = null;
 let edgeAppleSampledAt = 0;
 let edgeAppleRequestPending = false;
 let edgeAppleVersion = 0;

 function edgeAppleRequest(action,seconds,target = edgeAppleTarget) {
  return new Promise(resolve => {
   const id = crypto.randomUUID();
   const listener = event => {
    if (event.source !== window || event.origin !== location.origin ||
     event.data?.type !== 'resonance-deck-response' || event.data.id !== id) return;
    finish(event.data.result);
   };
   function finish(result) {
    clearTimeout(timer);
    window.removeEventListener('message',listener);
    resolve(result);
   }
   const timer = setTimeout(() => finish(null),2500);
   window.addEventListener('message',listener);
   window.postMessage({type:'resonance-deck-request',id,action,seconds,target},location.origin);
  });
 }

 function acceptEdgeApple(result) {
  const track = result?.track;
  edgeAppleTrack = track ? {...track,title:[track.artist,track.title].filter(Boolean).join(' · '),edge:true} : null;
  edgeAppleTarget = result?.target ?? null;
  edgeAppleSampledAt = performance.now();
 }

 async function pollEdgeApple() {
  if (edgeAppleRequestPending || appleCommandPending || document.hidden ||
   state.source !== 'shared' || musicProvider !== 'apple' || applePlayback.snapshot()) return;
  edgeAppleRequestPending = true;
  const version = edgeAppleVersion;
  try {
   const result = await edgeAppleRequest('status');
   if (version === edgeAppleVersion && !appleCommandPending &&
    state.source === 'shared' && musicProvider === 'apple') {
    acceptEdgeApple(result);
    syncSeekTarget();
   }
  } finally {edgeAppleRequestPending = false;}
 }
 const skinStorageKey = 'resonance.playerSkin.v1';
 const skins = [
  {id:'silver',name:'Modern Silver'},
  {id:'classic',name:'Classic Green'},
  {id:'amber',name:'Amber Hi-Fi'},
  {id:'ice',name:'Ice Blue'},
  {id:'glass-frost',name:'Glass · Frost'},
  {id:'glass-midnight',name:'Glass · Midnight'},
  {id:'glass-prism',name:'Glass · Prism'}
 ];
 const menus = [...player.querySelectorAll('.retro-dropdown')];
 const skinList = player.querySelector('.retro-skin-list');
 const formList = player.querySelector('.retro-form-list');
 let spectrumLit = '#e0f3ff';
 let spectrumGrid = '#8da9cc26';

 function addMenuChoice(list, name, select) {
  const option = document.createElement('button');
  option.type = 'button';
  option.textContent = name;
  option.setAttribute('aria-label',name);
  option.setAttribute('aria-pressed','false');
  option.addEventListener('click',() => {
   closeMenu(list.closest('details'),true);
   select();
  });
  list.append(option);
  return option;
 }

 function closeMenu(menu, restoreFocus = false) {
  menu.open = false;
  if (restoreFocus) menu.querySelector('summary').focus();
 }
 function placeMenu(menu) {
  const anchor = matchMedia('(max-width: 460px)').matches ? menu.parentElement : menu;
  const bounds = anchor.getBoundingClientRect();
  const popup = menu.querySelector('.retro-popup');
  const gap = parseFloat(getComputedStyle(popup).getPropertyValue('--retro-popup-gap'));
  const above = Math.max(0,bounds.top - gap);
  const below = Math.max(0,innerHeight - bounds.bottom - gap);
  const contentHeight = popup.scrollHeight + popup.offsetHeight - popup.clientHeight;
  const downward = contentHeight > above && below > above;
  menu.toggleAttribute('data-opens-down',downward);
  menu.style.setProperty('--retro-popup-space',(downward ? below : above) + 'px');
 }

 function applySkin(id, save = false) {
  player.dataset.skin = id;
  player.toggleAttribute('data-glass',id.startsWith('glass-'));
  for (const button of skinList.children) {
   button.setAttribute('aria-pressed',String(button.dataset.skinChoice === id));
  }
  const colors = getComputedStyle(player);
  spectrumLit = colors.getPropertyValue('--retro-spectrum-lit').trim();
  spectrumGrid = colors.getPropertyValue('--retro-spectrum-grid').trim();
  if (save) {
   try { localStorage.setItem(skinStorageKey,id); } catch {}
  }
 }

 for (const skin of skins) {
  const button = addMenuChoice(skinList,skin.name,() => applySkin(skin.id,true));
  button.dataset.skinChoice = skin.id;
 }
 for (const form of FORM_CATALOG) {
  const button = addMenuChoice(formList,form.name,() => chooseScene(form.id,true));
  button.dataset.mode = form.id;
  button.setAttribute('aria-pressed',String(state.mode === form.id));
 }
 let savedSkin;
 try { savedSkin = localStorage.getItem(skinStorageKey); } catch {}
 applySkin(skins.some(skin => skin.id === savedSkin) ? savedSkin : 'silver');

 for (const menu of menus) {
  menu.addEventListener('toggle',() => {if (menu.open) placeMenu(menu);});
  menu.querySelector('summary').addEventListener('click',() => {
   for (const other of menus) if (other !== menu) closeMenu(other);
  });
  menu.addEventListener('click',event => {
   const item = event.target.closest('.retro-popup button, .retro-popup a');
   if (item && !item.disabled && !item.dataset.skinChoice && !item.dataset.mode) {
    closeMenu(menu, !['player-stage','player-config-menu','player-audio-help','player-apple-audio','player-apple-playback'].includes(item.id) &&
      (item.id !== 'player-audio' || state.source !== 'demo'));
   }
  },true);
 }
 window.addEventListener('resize',() => {
  for (const menu of menus) if (menu.open) placeMenu(menu);
 });
 document.addEventListener('pointerdown',event => {
  for (const menu of menus) if (menu.open && !menu.contains(event.target)) closeMenu(menu);
 });
 player.addEventListener('keydown',event => {
  if (event.key !== 'Escape') return;
  const openMenu = menus.find(menu => menu.open);
  if (openMenu) {
   event.preventDefault();
   event.stopPropagation();
   closeMenu(openMenu,true);
  }
 });

 function formatTime(ms) {
  if (!Number.isFinite(ms)) return '–:––';
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
 }

 function showFeedback(text) {
  feedback.textContent = text;
  feedback.hidden = !text;
 }

 function showTrackTitle(title) {
  if (trackTitle.textContent === title) return;
  trackTitle.closest('details').open = false;
  trackTitle.textContent = title;
 }

 function refreshControls() {
  const audio=localTrack?.audio;
  const localVolume = Number.isFinite(session?.volume);
  for (const button of buttons) {
   const action = button.dataset.playerCommand;
   if(audio){
    button.disabled=action==='play'?!audio.paused:action==='pause'?audio.paused:!['stop','repeat','mute'].includes(action);
   }else if (appleCapture) {
    const supported = appleTrack && !appleTrack.edge && (action === 'play' ? !appleTrack.playing : action === 'pause' && appleTrack.playing);
    button.disabled = appleCommandPending || !supported;
   } else {
    button.disabled = busy || !(action === 'mute' ? localVolume : session?.supported?.[action]);
   }
   if (action === 'repeat') {
    const repeat = audio ? (audio.loop?2:0) : appleCapture ? undefined : session?.repeat;
    const label = 'Repeat: ' + (['off','all','one'][repeat] ?? 'unavailable');
    button.title = label + (button.disabled ? '' : ' (click to cycle)');
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(repeat > 0));
    if (button.classList.contains('retro-mini')) button.toggleAttribute('data-repeat-one',repeat === 2);
    else button.textContent = label;
   }
   if (action === 'shuffle' || action === 'mute') {
    const pressed=audio ? action==='mute'&&audio.muted : !appleCapture&&Boolean(session?.[action==='mute'?'muted':'shuffle']);
    button.setAttribute('aria-pressed',String(pressed));
   }
  }
  seek.disabled = audio ? !Number.isFinite(audio.duration) : appleCapture
   ? (appleCommandPending && !seekDraining) || !(appleTrack?.durationMs > 0) || !Number.isFinite(appleTrack.positionMs) ||
    (appleTrack.edge && !appleTrack.seekable)
   : (busy && !seekDraining) || !session?.supported?.seek;
  volume.disabled = !audio&&(appleCapture || busy || !localVolume);
  if (!adjustingVolume) {
   const level=audio?Math.round(audio.volume*100):appleCapture?null:session?.volume;
   volume.value=level??0;
   get('player-volume-value').textContent=Number.isFinite(level)?level+'%':'–';
  }
 }

 async function poll() {
  const version = ++pollVersion;
  try {
   const response = await fetch('/api/spotify', {headers});
   if (!response.ok) throw new Error('Spotify status unavailable');
   const status = await response.json();
   if (version !== pollVersion) return;
   session = status;
   token = session.token;
   sampledAt = performance.now();
  } catch {
   if (version !== pollVersion) return;
   session = {available:false,reason:'Start the updated Resonance server'};
   token = '';
  }
  syncSeekTarget();
  renderTransport();
  renderSeek();
 }

 function renderTransport() {
  if(localTrack){
   const {audio,name}=localTrack;
   showTrackTitle(name);
   get('player-link-state').textContent='LOCAL FILE';
   get('player-duration').textContent=formatTime(audio.duration*1000);
   playbackIndicator.setAttribute('href',audio.paused ? '#deck-pause' : '#deck-play');
   seek.max=Number.isFinite(audio.duration)?Math.max(1,Math.floor(audio.duration*1000)):1;
   refreshControls();
   return;
  }
  if (appleCapture) {
   const text = appleTrack?.title || 'Control playback in Apple Music';
   showTrackTitle(text);
   get('player-link-state').textContent = 'APPLE MUSIC';
   get('player-duration').textContent = formatTime(appleTrack?.durationMs || undefined);
   playbackIndicator.setAttribute('href',appleTrack ? (appleTrack.playing ? '#deck-play' : '#deck-pause') : '#deck-note');
   seek.max = Math.max(1,appleTrack?.durationMs || 0);
   refreshControls();
   return;
  }
  if (!session) return;
  const title = session.available ? [session.artist,session.title].filter(Boolean).join(' · ') || 'Spotify desktop connected' : session.reason;
  showTrackTitle(title);
  get('player-link-state').textContent = session.available ? 'SPOTIFY CONNECTED' : 'SPOTIFY DESKTOP';
  get('player-duration').textContent = formatTime(session.durationMs || undefined);
  playbackIndicator.setAttribute('href',session.playing ? '#deck-play' : session.available ? '#deck-pause' : '#deck-stop');
  seek.max = Math.max(1,session.durationMs || 0);
  refreshControls();
 }

 async function command(action, ms = 0, request = null) {
  const ownsSelection = () => !request || syncSeekTarget() === request.target;
  if (!ownsSelection()) return;
  if(localTrack){
   const {audio,context}=localTrack;
   showFeedback('');
   try{
    switch(action){
     case 'play': await context.resume(); await audio.play(); break;
     case 'pause': audio.pause(); break;
     case 'stop': audio.pause(); audio.currentTime=0; break;
     case 'seek': audio.currentTime=ms/1000; break;
     case 'volume': audio.volume=ms/100; break;
     case 'mute': audio.muted=!audio.muted; break;
     case 'repeat': audio.loop=!audio.loop; break;
    }
   }catch{showFeedback('Couldn’t apply that control. Try again or reopen the audio file.');}
   renderTransport();
   renderSeek();
   return;
  }
  const forApple = request ? request.target.provider !== 'spotify' : appleCapture;
  const seekError = forApple
   ? 'Couldn’t seek. Try again or seek in Apple Music.'
   : 'Couldn’t seek. Try again or seek in Spotify.';
  if (forApple) {
   const playingTrack = request ? request.target : appleTrack;
   if (!playingTrack || appleCommandPending || !['seek','play','pause'].includes(action)) return;
   appleCommandPending = true;
   refreshControls();
   showFeedback('');
   try {
    if (playingTrack.edge || playingTrack.provider === 'edge-apple') {
     edgeAppleVersion++;
     const result = await edgeAppleRequest('seek',ms/1000,request?.target.edgeTarget);
     if (!ownsSelection()) return;
     if (result?.track) acceptEdgeApple(result);
     else showFeedback(seekError);
    } else {
     const applied = await applePlayback.command(action,ms,request?.target.key);
     if (applied === false && ownsSelection()) showFeedback(seekError);
    }
   }
   catch { if (ownsSelection()) showFeedback(action === 'seek' ? seekError : 'Apple Music could not apply that control.'); }
   finally { appleCommandPending = false;refreshControls(); }
   return;
  }
  if (!token || busy) return;
  busy = true;
  ++pollVersion;
  refreshControls();
  showFeedback('');
  let accepted = false;
  try {
   const params = new URLSearchParams({action,ms});
   if (request?.target.spotifyKey) params.set('trackKey',request.target.spotifyKey);
   const response = await fetch('/api/spotify?' + params,{method:'POST',headers:{...headers,'X-Resonance-Token':token}});
   accepted = response.ok;
   if (!accepted && ownsSelection()) showFeedback(action === 'seek' ? seekError : 'Spotify could not apply that control.');
  } catch {
   if (ownsSelection()) showFeedback(action === 'seek' ? seekError : 'Spotify controls are temporarily unavailable.');
  } finally {
   if (readSeekTarget().provider === 'spotify') await poll();
   if (accepted && ['repeat','shuffle','volume','mute'].includes(action)) {
    const actual = session?.[action === 'mute' ? 'muted' : action];
    if (actual == null || Number(actual) !== ms) showFeedback('Spotify did not confirm that change.');
   }
   busy = false;
   refreshControls();
  }
 }

 function readSeekTarget() {
  if (localTrack) return {provider:'file',key:localTrack,canSeek:true};
  const musicKit = applePlayback.snapshot();
  if (musicKit) return {provider:'musickit',key:musicKit.trackKey,canSeek:musicKit.durationMs > 0};
  if (state.source === 'shared' && musicProvider === 'apple') {
   const edgeTarget = edgeAppleTarget && {...edgeAppleTarget};
   return {provider:'edge-apple',key:JSON.stringify(edgeTarget),edgeTarget,canSeek:Boolean(edgeTarget && edgeAppleTrack?.seekable)};
  }
  const spotifyKey = session?.trackKey;
  return {
   provider:'spotify',key:session?.available && (spotifyKey ?? JSON.stringify([session.title,session.artist,session.durationMs])),
   spotifyKey,canSeek:Boolean(session?.supported?.seek)
  };
 }

 function syncSeekTarget() {
  const current = readSeekTarget();
  if (seekTarget?.provider !== current.provider || seekTarget.key !== current.key) {
   seekTarget = current;
   pendingSeek = null;
   dragging = false;
  } else seekTarget.canSeek = current.canSeek;
  return seekTarget;
 }

 async function seekTo(position) {
  const target = syncSeekTarget();
  if (!target.canSeek) return;
  if (target.provider === 'file') {await command('seek',position);return;}
  pendingSeek = {position,target};
  renderSeek();
  if (seekDraining) return;
  seekDraining = true;
  try {
   while (pendingSeek) {
    const current = syncSeekTarget();
    const request = pendingSeek;
    if (!request || !current.canSeek) {pendingSeek = null;break;}
    await command('seek',request.position,request);
    if (pendingSeek === request) pendingSeek = null;
   }
  } finally {
   seekDraining = false;
   refreshControls();
   renderSeek();
  }
 }

 function renderSeek() {
  const position = localTrack ? localTrack.audio.currentTime*1000 : appleCapture ? (appleTrack?.edge && appleTrack.playing
   ? Math.min(appleTrack.durationMs,appleTrack.positionMs+performance.now()-edgeAppleSampledAt)
   : appleTrack?.positionMs) : !session?.available || !session.durationMs ? undefined :
   Math.max(0,Math.min(session.durationMs,session.positionMs + (session.playing ? performance.now() - sampledAt : 0)));
  const requested = pendingSeek?.position;
  const shownPosition = dragging ? Number(seek.value) : requested ?? position;
  if (!dragging) seek.value = shownPosition ?? 0;
  time.textContent = remaining && Number.isFinite(shownPosition) ?
   '−' + formatTime(Math.max(0,(localTrack ? localTrack.audio.duration*1000 : appleCapture ? appleTrack?.durationMs : session?.durationMs) - shownPosition)) : formatTime(shownPosition);
 }

 function update() {
  player.inert = document.body.classList.contains('listening') ||
   (mobileSettings.matches && document.body.classList.contains('settings-open'));
  const source = get('source-state').textContent;
  const nextTrack = localTrack ? null : applePlayback.snapshot() ||
   (state.source === 'shared' && musicProvider === 'apple' ? edgeAppleTrack : null);
  const transportChanged = nextTrack?.title !== appleTrack?.title || nextTrack?.playing !== appleTrack?.playing ||
   nextTrack?.durationMs !== appleTrack?.durationMs ||
   nextTrack?.seekable !== appleTrack?.seekable ||
   Number.isFinite(nextTrack?.positionMs) !== Number.isFinite(appleTrack?.positionMs);
  appleTrack = nextTrack;
  syncSeekTarget();
  const nextAppleCapture = Boolean(appleTrack) || (state.source === 'shared' && musicProvider === 'apple');
  if (nextAppleCapture !== appleCapture || renderedFile !== localTrack) {
   renderedFile=localTrack;
   appleCapture = nextAppleCapture;
   if (!appleCapture) {
    edgeAppleVersion++;
    acceptEdgeApple(null);
   }
   get('player-queue').hidden = get('player-library').hidden = appleCapture||!!localTrack;
   get('player-queue').setAttribute('aria-expanded','false');
   get('player-library').setAttribute('aria-expanded','false');
   get('player-accessory').hidden = true;
   showFeedback('');
   seek.setAttribute('aria-label',localTrack?'Seek in audio file':'Seek in '+(appleCapture?'Apple Music':'Spotify')+' track');
   volume.setAttribute('aria-label',localTrack?'Audio file volume':'Spotify volume on this PC');
   for (const button of buttons.filter(button => ['play','pause'].includes(button.dataset.playerCommand) && button.hasAttribute('aria-label'))) {
    const action = button.dataset.playerCommand === 'play' ? 'Play' : 'Pause';
    button.title = action+' '+(localTrack?'audio file':appleCapture?'Apple Music':'Spotify');
    button.setAttribute('aria-label',button.title);
   }
   renderTransport();
  } else if (appleCapture && transportChanged) renderTransport();
  get('player-signal-state').textContent = source;
  get('player-audio').textContent = localTrack?'Close audio file':state.source === 'demo'?'Connect audio':'Disconnect audio';
  if (get('player-face').hidden || player.inert || document.hidden) return;
  renderSeek();
  const sampleRate = get('player-sample-rate');
  sampleRate.hidden = !audioContext;
  if (audioContext) sampleRate.textContent = 'INPUT ' + audioContext.sampleRate / 1000 + ' kHz';
  if (state.paused) return;
  context.clearRect(0,0,spectrum.width,spectrum.height);
  if (scope) {
   context.beginPath();
   context.strokeStyle = spectrumLit;
   context.lineWidth = 1.5;
   for (let x = 0; x < spectrum.width; x++) {
    const level = waveform ? waveform[Math.floor(x / spectrum.width * waveform.length)] :
     state.source === 'demo' ? Math.sin(x * .1 + performance.now() / 160) * state.bass * .5 : 0;
    const y = spectrum.height * (.5 - level * .46);
    if (x) context.lineTo(x,y);
    else context.moveTo(x,y);
   }
   context.stroke();
   return;
  }
  for (let column = 0; column < 24; column++) {
   const level = frequency ? frequency[Math.floor((column / 42) ** 2 * (frequency.length - 1))] / 255 :
    state.source === 'demo' ? (Math.sin(performance.now() / 260 + column * .67) * .5 + .5) * state.bass * 2 : 0;
   const lit = Math.round(level * 11);
   for (let row = 0; row < 12; row++) {
    context.fillStyle = row < lit ? spectrumLit : spectrumGrid;
    context.fillRect(column * 9 + 2,57 - row * 5,6,3);
   }
  }
 }

 async function pollWhenVisible() {
  if (!document.hidden && !busy && !appleCapture && !localTrack) await poll();
  nextPoll = window.setTimeout(pollWhenVisible,2200);
 }

 for (const button of buttons) button.addEventListener('click',() => {
  const action = button.dataset.playerCommand;
  const value = action === 'repeat' ? ((session?.repeat ?? 0) + 1) % 3 :
   action === 'shuffle' ? Number(!session?.shuffle) : action === 'mute' ? Number(!session?.muted) : 0;
  command(action,value);
 });
 seek.addEventListener('input',() => {dragging = true; renderSeek();});
 seek.addEventListener('change',() => {dragging = false; void seekTo(Number(seek.value));});
 seek.addEventListener('blur',() => {dragging = false;});
 volume.addEventListener('input',() => {
  adjustingVolume = true;
  get('player-volume-value').textContent = volume.value + '%';
 });
 volume.addEventListener('change',() => {
  const value = Number(volume.value);
  adjustingVolume = false;
  command('volume',value);
 });
 volume.addEventListener('blur',() => {adjustingVolume = false; refreshControls();});
 const fileInput=get('player-local-file');
 async function playFile(file){
  if(!file)return;
  if(file.error){showFeedback(file.error);return;}
  showFeedback('Opening '+file.name+'…');
  try{
   if(!await openLocalTrack(file))return;
   const track=localTrack;
   for(const event of ['play','pause','ended','durationchange','volumechange']){
    track.audio.addEventListener(event,()=>{if(localTrack===track)renderTransport();});
   }
   track.audio.addEventListener('error',()=>{
    if(localTrack===track)showFeedback('This audio file stopped playing. Reopen it or choose another file.');
   });
   update();
   showFeedback('');
   message('Playing '+file.name);
  }catch{
   showFeedback('Couldn’t play '+file.name+'. Try another file or convert it to MP3 or WAV.');
  }
 }
 function playPickedFile(file){
  if(file)void playFile({name:file.name,url:URL.createObjectURL(file)});
 }
 let filePickerOpen=false;
 async function chooseFile(){
  if(!window.resonanceFiles){fileInput.click();return;}
  if(filePickerOpen)return;
  filePickerOpen=true;
  try{void playFile(await window.resonanceFiles.choose());}
  catch{showFeedback('Couldn’t open the file picker. Try again or drop an audio file onto Resonance.');}
  finally{filePickerOpen=false;}
 }
 get('player-open-file').addEventListener('click',chooseFile);
 fileInput.addEventListener('change',()=>{
  playPickedFile(fileInput.files[0]);
  fileInput.value='';
 });
 window.resonanceFiles?.listen(playFile);
 document.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.key.toLowerCase()!=='o'||event.defaultPrevented)return;
  event.preventDefault();
  void chooseFile();
 });
 if(!window.resonanceFiles?.nativeDrop){
  document.addEventListener('dragover',event=>{
   if(event.dataTransfer?.types.includes('Files'))event.preventDefault();
  });
  document.addEventListener('drop',event=>{
   const file=event.dataTransfer?.files[0];
   if(!file)return;
   event.preventDefault();
   playPickedFile(file);
  });
 }
 get('player-audio').addEventListener('click',() => get('connect').click());
 get('player-apple-audio').addEventListener('click',() => {
  selectMusicProvider('apple');
  get('help').click();
 });
 get('player-apple-playback').addEventListener('click',applePlayback.open);
 for (const id of ['player-source','player-audio-help']) {
  get(id).addEventListener('click',() => get('help').click());
 }
 for (const id of ['player-config','player-config-menu']) {
  get(id).addEventListener('click',() => {
   selectInspectorTab(get('motion-tab'));
   if (packageMode === 'desktop' || mobileSettings.matches) setSettingsOpen(true);
   else get('motion-tab').focus({preventScroll:true});
  });
 }
 get('player-meter-mode').addEventListener('click',event => {
  scope = !scope;
  event.currentTarget.setAttribute('aria-pressed',String(scope));
 });
 get('player-time-mode').addEventListener('click',event => {
  remaining = !remaining;
  event.currentTarget.setAttribute('aria-pressed',String(remaining));
 });
 const accessories = [
  ['player-queue','Spotify Play Queue','Select the Queue icon in Spotify desktop to see and reorder upcoming tracks.'],
  ['player-library','Spotify library','Select Your Library in Spotify desktop to browse your saved music and playlists.']
 ];
 for (const [id,title,copy] of accessories) {
  get(id).addEventListener('click',event => {
   const opened = event.currentTarget.getAttribute('aria-expanded') !== 'true';
   for (const [other] of accessories) get(other).setAttribute('aria-expanded',String(opened && id === other));
   get('player-accessory-title').textContent = title;
   get('player-accessory-copy').textContent = copy;
   get('player-accessory').hidden = !opened;
  });
 }
 for (const id of ['player-stage','player-visualize']) {
  get(id).addEventListener('click',openStage);
 }
 const grip = get('player-resize');
 const sizeStorageKey = 'resonance.playerSize.v1';
 const defaults = {width:402, meter:37};
 let size = {...defaults};
 let resizeDrag = null;
 function setSize(width,meter,save = false,fit = true) {
  size = {width:Math.round(Math.min(740,Math.max(300,width))),
   meter:Math.round(Math.min(210,Math.max(37,meter)))};
  player.style.setProperty('--player-width',size.width + 'px');
  player.style.setProperty('--player-meter',size.meter + 'px');
  if (fit) fitWindow();
  if (save) {
   try {localStorage.setItem(sizeStorageKey,JSON.stringify(size));} catch {}
  }
 }
 try {
  const saved = JSON.parse(localStorage.getItem(sizeStorageKey));
  if (Number.isFinite(saved?.width) && Number.isFinite(saved?.meter)) setSize(saved.width,saved.meter);
 } catch {}
 const resetSize = () => setSize(defaults.width,defaults.meter,true);
 const visibleSize = () => ({width:player.getBoundingClientRect().width,meter:spectrum.getBoundingClientRect().height});
 grip.addEventListener('pointerdown',event => {
  if (!event.isPrimary || event.button !== 0) return;
  resizeDrag = {id:event.pointerId,x:event.clientX,y:event.clientY,...visibleSize(),
   initialWidth:size.width,initialMeter:size.meter,changed:false};
  grip.setPointerCapture(event.pointerId);
 });
 grip.addEventListener('pointermove',event => {
  if (resizeDrag?.id !== event.pointerId) return;
  const dx = event.clientX - resizeDrag.x;
  const dy = resizeDrag.y - event.clientY;
  if (!resizeDrag.changed && Math.hypot(dx,dy) < 4) return;
  resizeDrag.changed = true;
  setSize(dx ? resizeDrag.width+dx : resizeDrag.initialWidth,
   dy ? resizeDrag.meter+dy : resizeDrag.initialMeter);
 });
 grip.addEventListener('lostpointercapture',() => {
  if (resizeDrag?.changed) setSize(size.width,size.meter,true);
  resizeDrag = null;
 });
 grip.addEventListener('dblclick',resetSize);
 grip.addEventListener('click',event => {if (event.detail === 0) resetSize();});
 grip.addEventListener('keydown',event => {
  const steps = {ArrowLeft:[-16,0],ArrowRight:[16,0],ArrowUp:[0,12],ArrowDown:[0,-12]};
  if (!steps[event.key] && event.key !== 'Home') return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Home') return resetSize();
  const {width,meter} = visibleSize();
  const [dx,dy] = steps[event.key];
  setSize(dx ? width+dx : size.width,dy ? meter+dy : size.meter,true);
 });
 get('player-size-reset').addEventListener('click',resetSize);
 get('player-collapse').addEventListener('click',event => {
  const face = get('player-face');
  face.hidden = !face.hidden;
  grip.hidden = face.hidden;
  event.currentTarget.setAttribute('aria-expanded',String(!face.hidden));
  event.currentTarget.setAttribute('aria-label',face.hidden ? 'Expand player' : 'Collapse player');
 });
 function fitWindow() {
  if (!window.resonanceDeck) return;
  const height = Math.ceil(player.getBoundingClientRect().height);
  if (!height) return;
  const expanded = document.body.classList.contains('settings-open') || Boolean(document.querySelector('dialog[open]'));
  window.resonanceDeck.resize(size.width,height,expanded);
 }
 if (window.resonanceDeck) {
  window.resonanceDeck.onNativeResize((width,height,finished)=>{
   const deckHeight = player.getBoundingClientRect().height;
   const meterHeight = spectrum.getBoundingClientRect().height;
   if (!deckHeight) return;
   const meter = meterHeight ? height - (deckHeight - meterHeight) : size.meter;
   setSize(width,meter,finished,finished);
  });
  for (const [action,label] of [['minimize','Minimize Resonance'],['close','Close Resonance']]) {
   const button = document.createElement('button');
   button.type = 'button';
   button.className = 'native-window-control deck-title-control';
   button.setAttribute('aria-label',label);
   button.title = label;
   const icon = get('player-resize').querySelector('svg').cloneNode(true);
   icon.querySelector('use').setAttribute('href','#deck-' + action);
   button.append(icon);
   button.addEventListener('click',window.resonanceDeck[action]);
   grip.parentElement.append(button);
  }
  new ResizeObserver(fitWindow).observe(player);
  const viewChanges = new MutationObserver(fitWindow);
  viewChanges.observe(document.body,{attributes:true,attributeFilter:['class']});
  for (const dialog of document.querySelectorAll('dialog')) {
   viewChanges.observe(dialog,{attributes:true,attributeFilter:['open']});
  }
  fitWindow();
 }
 document.addEventListener('resonance-source-change',update);
 window.addEventListener('pagehide',event => {if (!event.persisted) clearTimeout(nextPoll);});
 pollWhenVisible();
 window.setInterval(pollEdgeApple,900);
 window.setInterval(update,90);
})();
