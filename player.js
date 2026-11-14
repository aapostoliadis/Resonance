'use strict';

(() => {
 const player = document.querySelector('.retro-player');
 const get = id => document.getElementById(id);
 const buttons = [...player.querySelectorAll('[data-player-command]')];
 const seek = get('player-seek');
 const volume = get('player-volume');
 const time = get('player-time');
 const spectrum = get('player-spectrum');
 const context = spectrum.getContext('2d');
 const feedback = get('player-feedback');
 const headers = {'X-Resonance-Player':'1'};
 let session = null;
 let token = '';
 let sampledAt = 0;
 let busy = false;
 let dragging = false;
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

 function edgeAppleRequest(action,seconds) {
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
   window.postMessage({type:'resonance-deck-request',id,action,seconds,target:edgeAppleTarget},location.origin);
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
    state.source === 'shared' && musicProvider === 'apple') acceptEdgeApple(result);
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
  const above = Math.max(0,bounds.top - 12);
  const below = Math.max(0,innerHeight - bounds.bottom - 12);
  const downward = above < Math.min(290,innerHeight * .45) && below > above;
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

 function refreshControls() {
  const localVolume = Number.isFinite(session?.volume);
  for (const button of buttons) {
   const action = button.dataset.playerCommand;
   if (appleCapture) {
    const supported = appleTrack && !appleTrack.edge && (action === 'play' ? !appleTrack.playing : action === 'pause' && appleTrack.playing);
    button.disabled = appleCommandPending || !supported;
   } else {
    button.disabled = busy || !(action === 'mute' ? localVolume : session?.supported?.[action]);
   }
   if (action === 'repeat') {
    const repeat = appleCapture ? undefined : session?.repeat;
    const label = 'Repeat: ' + (['off','all','one'][repeat] ?? 'unavailable');
    button.title = label + (button.disabled ? '' : ' (click to cycle)');
    button.setAttribute('aria-label',label);
    button.setAttribute('aria-pressed',String(repeat > 0));
    button.textContent = button.classList.contains('retro-mini') ? (repeat === 2 ? '↻¹' : '↻') : label;
   }
   if (action === 'shuffle' || action === 'mute') {
    button.setAttribute('aria-pressed',String(!appleCapture && Boolean(session?.[action === 'mute' ? 'muted' : 'shuffle'])));
   }
  }
  seek.disabled = appleCapture
   ? appleCommandPending || !(appleTrack?.durationMs > 0) || !Number.isFinite(appleTrack.positionMs) ||
    (appleTrack.edge && !appleTrack.seekable)
   : busy || !session?.supported?.seek;
  volume.disabled = appleCapture || busy || !localVolume;
  if (!adjustingVolume) {
   volume.value = appleCapture ? 0 : session?.volume ?? 0;
   get('player-volume-value').textContent = localVolume && !appleCapture ? session.volume + '%' : '–';
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
  renderTransport();
 }

 function renderTransport() {
  if (appleCapture) {
   const text = appleTrack?.title || 'Control playback in Apple Music';
   get('player-track').textContent = text;
   get('player-track').title = text;
   get('player-link-state').textContent = 'APPLE MUSIC';
   get('player-duration').textContent = formatTime(appleTrack?.durationMs || undefined);
   get('player-indicator').textContent = appleTrack ? (appleTrack.playing ? '▶' : 'Ⅱ') : '♫';
   seek.max = Math.max(1,appleTrack?.durationMs || 0);
   refreshControls();
   return;
  }
  if (!session) return;
  const title = session.available ? [session.artist,session.title].filter(Boolean).join(' · ') || 'Spotify desktop connected' : session.reason;
  get('player-track').textContent = title;
  get('player-track').title = title;
  get('player-link-state').textContent = session.available ? 'SPOTIFY CONNECTED' : 'SPOTIFY DESKTOP';
  get('player-duration').textContent = formatTime(session.durationMs || undefined);
  get('player-indicator').textContent = session.playing ? '▶' : session.available ? 'Ⅱ' : '■';
  seek.max = Math.max(1,session.durationMs || 0);
  refreshControls();
 }

 async function command(action, ms = 0) {
  if (appleCapture) {
   if (!appleTrack || appleCommandPending || !['seek','play','pause'].includes(action)) return;
   appleCommandPending = true;
   refreshControls();
   showFeedback('');
   try {
    if (appleTrack.edge) {
     edgeAppleVersion++;
     const result = await edgeAppleRequest('seek',ms/1000);
     if (result?.track) acceptEdgeApple(result);
     else showFeedback(result?.error || 'Edge did not confirm the seek.');
    } else await applePlayback.command(action,ms);
   }
   catch { showFeedback('Apple Music could not apply that control.'); }
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
   const response = await fetch('/api/spotify?' + params,{method:'POST',headers:{...headers,'X-Resonance-Token':token}});
   accepted = response.ok;
   if (!accepted) showFeedback('Spotify could not apply that control.');
  } catch {
   showFeedback('Spotify controls are temporarily unavailable.');
  } finally {
   await poll();
   if (accepted && ['repeat','shuffle','volume','mute'].includes(action)) {
    const actual = session?.[action === 'mute' ? 'muted' : action];
    if (actual == null || Number(actual) !== ms) showFeedback('Spotify did not confirm that change.');
   }
   busy = false;
   refreshControls();
  }
 }

 function update() {
  player.inert = document.body.classList.contains('listening') ||
   (mobileSettings.matches && document.body.classList.contains('settings-open'));
  const source = get('source-state').textContent;
  const nextTrack = applePlayback.snapshot() ||
   (state.source === 'shared' && musicProvider === 'apple' ? edgeAppleTrack : null);
  const transportChanged = nextTrack?.title !== appleTrack?.title || nextTrack?.playing !== appleTrack?.playing ||
   nextTrack?.durationMs !== appleTrack?.durationMs ||
   nextTrack?.seekable !== appleTrack?.seekable ||
   Number.isFinite(nextTrack?.positionMs) !== Number.isFinite(appleTrack?.positionMs);
  appleTrack = nextTrack;
  const nextAppleCapture = Boolean(appleTrack) || (state.source === 'shared' && musicProvider === 'apple');
  if (nextAppleCapture !== appleCapture) {
   appleCapture = nextAppleCapture;
   if (!appleCapture) {
    edgeAppleVersion++;
    acceptEdgeApple(null);
   }
   get('player-queue').hidden = get('player-library').hidden = appleCapture;
   get('player-queue').setAttribute('aria-expanded','false');
   get('player-library').setAttribute('aria-expanded','false');
   get('player-accessory').hidden = true;
   showFeedback('');
   seek.setAttribute('aria-label','Seek in '+(appleCapture?'Apple Music':'Spotify')+' track');
   for (const button of buttons.filter(button => ['play','pause'].includes(button.dataset.playerCommand) && button.hasAttribute('aria-label'))) {
    const action = button.dataset.playerCommand === 'play' ? 'Play' : 'Pause';
    button.title = action+' '+(appleCapture?'Apple Music':'Spotify');
    button.setAttribute('aria-label',button.title);
   }
   renderTransport();
  } else if (appleCapture && transportChanged) renderTransport();
  get('player-signal-state').textContent = source;
  get('player-audio').textContent = state.source === 'demo' ? 'Connect audio' : 'Disconnect audio';
  if (get('player-face').hidden || player.inert || document.hidden) return;
  const position = appleCapture ? (appleTrack?.edge && appleTrack.playing
   ? Math.min(appleTrack.durationMs,appleTrack.positionMs+performance.now()-edgeAppleSampledAt)
   : appleTrack?.positionMs) : !session?.available || !session.durationMs ? undefined :
   Math.max(0,Math.min(session.durationMs,session.positionMs + (session.playing ? performance.now() - sampledAt : 0)));
  if (!dragging) seek.value = position ?? 0;
  const shownPosition = dragging ? Number(seek.value) : position;
  time.textContent = remaining && Number.isFinite(shownPosition) ?
   '−' + formatTime(Math.max(0,(appleCapture ? appleTrack?.durationMs : session?.durationMs) - shownPosition)) : formatTime(shownPosition);
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
  if (!document.hidden && !busy && !appleCapture) await poll();
  nextPoll = window.setTimeout(pollWhenVisible,2200);
 }

 for (const button of buttons) button.addEventListener('click',() => {
  const action = button.dataset.playerCommand;
  const value = action === 'repeat' ? ((session?.repeat ?? 0) + 1) % 3 :
   action === 'shuffle' ? Number(!session?.shuffle) : action === 'mute' ? Number(!session?.muted) : 0;
  command(action,value);
 });
 seek.addEventListener('input',() => {dragging = true;});
 seek.addEventListener('change',() => {dragging = false; command('seek',Number(seek.value));});
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
 function setSize(width,meter,save = false) {
  size = {width:Math.round(Math.min(740,Math.max(300,width))),
   meter:Math.round(Math.min(210,Math.max(37,meter)))};
  player.style.setProperty('--player-width',size.width + 'px');
  player.style.setProperty('--player-meter',size.meter + 'px');
  fitWindow();
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
  event.currentTarget.textContent = face.hidden ? '+' : '−';
 });
 function fitWindow() {
  if (!window.resonanceDeck) return;
  const height = Math.ceil(player.getBoundingClientRect().height);
  if (!height) return;
  const expanded = document.body.classList.contains('settings-open') || Boolean(document.querySelector('dialog[open]'));
  window.resonanceDeck.resize(size.width,height,expanded);
 }
 if (window.resonanceDeck) {
  for (const [action,label,symbol] of [['minimize','Minimize Resonance','–'],['close','Close Resonance','×']]) {
   const button = document.createElement('button');
   button.type = 'button';
   button.className = 'native-window-control';
   button.setAttribute('aria-label',label);
   button.title = label;
   button.textContent = symbol;
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
 window.addEventListener('pagehide',event => {if (!event.persisted) clearTimeout(nextPoll);});
 pollWhenVisible();
 window.setInterval(pollEdgeApple,900);
 window.setInterval(update,90);
})();
