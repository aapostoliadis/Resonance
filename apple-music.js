'use strict';

const applePlayback = (() => {
 const dialog = document.getElementById('apple-playback');
 const status = document.getElementById('apple-playback-status');
 const signIn = document.getElementById('apple-authorize');
 const trackForm = document.getElementById('apple-track-form');
 const trackLink = document.getElementById('apple-track-link');
 const shareNote = document.getElementById('apple-share-note');
 const shareButton = document.getElementById('apple-share');
 let preparation;
 let player;
 let active = false;
 let busy = false;

 async function prepare() {
  const response = await fetch('/api/apple-music', {headers:{'X-Resonance-Player':'1'}});
  const config = response.ok ? await response.json() : {};
  if (!config.developerToken) {
   status.textContent = 'MusicKit needs a developer token. Set APPLE_MUSIC_DEVELOPER_TOKEN on the local server and restart Resonance.';
   return;
  }
  if (!window.MusicKit) {
   await new Promise((resolve,reject) => {
    const script = document.createElement('script');
    function finish(error) {
     clearTimeout(timeout);
     document.removeEventListener('musickitloaded',loaded);
     if (error) {script.remove();reject(error);}
     else resolve();
    }
    function loaded() {if (window.MusicKit?.configure) finish();}
    const timeout = setTimeout(() => finish(new Error('MusicKit timed out')),15000);
    document.addEventListener('musickitloaded',loaded);
    script.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    script.onload = loaded;
    script.onerror = () => finish(new Error('MusicKit could not load'));
    document.head.append(script);
   });
  }
  await window.MusicKit.configure({developerToken:config.developerToken,app:{name:'Resonance',build:'1.0.0'}});
  player = window.MusicKit.getInstance();
  showPlayer();
 }

 function showPlayer() {
  const authorized = Boolean(player?.isAuthorized);
  signIn.hidden = authorized;
  signIn.disabled = busy || !player;
  trackForm.hidden = !authorized;
  trackForm.querySelector('button').disabled = busy;
  shareNote.hidden = shareButton.hidden = !active;
  status.textContent = authorized ? 'Paste a song link from Apple Music.' : 'Sign in to play Apple Music in Resonance.';
 }

 async function open() {
  if (!dialog.open) dialog.showModal();
  if (player) {if (!busy) showPlayer();return;}
  status.textContent = 'Checking MusicKit setup…';
  preparation ??= prepare().catch(() => {
   status.textContent = 'MusicKit could not start. Check the connection and developer token, then reopen this dialog.';
  }).finally(() => {preparation = null;});
  await preparation;
 }

 signIn.addEventListener('click',async () => {
  if (!player || busy) return;
  busy = signIn.disabled = true;
  try {await player.authorize();busy = false;showPlayer();}
  catch {busy = signIn.disabled = false;status.textContent = 'Apple Music sign-in did not finish. Try again.';}
 });

 trackForm.addEventListener('submit',async event => {
  event.preventDefault();
  if (busy || !player?.isAuthorized) return;
  let song;
  try {
   const url = new URL(trackLink.value);
   if (url.origin === 'https://music.apple.com') {
    const [,store,kind,...parts] = url.pathname.split('/');
    if (/^[a-z]{2}$/i.test(store)) song = kind === 'album' ? url.searchParams.get('i') :
     kind === 'song' ? parts.at(-1) : null;
   }
  } catch {}
  if (!song || !/^\d+$/.test(song)) {
   status.textContent = 'Use a link to an individual Apple Music song.';
   return;
  }
  busy = trackForm.querySelector('button').disabled = true;
  status.textContent = 'Opening the song in Apple Music…';
  try {
   await player.setQueue({song});
   await player.play();
   active = true;
   showPlayer();
   status.textContent = 'Playing in Resonance. Close this window to use the deck.';
  } catch {
   status.textContent = 'Apple Music could not play this song. Check the link and your subscription.';
  } finally {
   busy = trackForm.querySelector('button').disabled = false;
  }
 });

 shareButton.addEventListener('click',async () => {
  selectMusicProvider('apple');
  dialog.close();
  const setup = document.getElementById('setup');
  setup.showModal();
  await connectAudio('shared',{ownTab:true});
 });
 document.getElementById('apple-external').addEventListener('click',async () => {
  if (busy) return;
  if (active) {
   try {await player.pause();}
   catch {status.textContent = 'Pause the current song in the deck, then try again.';return;}
  }
  active = false;
  dialog.close();
  selectMusicProvider('apple');
  document.getElementById('setup').showModal();
 });

 function snapshot() {
  if (!active) return null;
  const item = player.nowPlayingItem;
  const title = item?.title || item?.attributes?.name;
  const artist = item?.artistName || item?.attributes?.artistName;
  const duration = Number(player.currentPlaybackDuration);
  const position = Number(player.currentPlaybackTime);
  return {
   trackKey:item?.id || item?.attributes?.playParams?.id || JSON.stringify([artist,title,duration || 0]),
   title:[artist,title].filter(Boolean).join(' · ') || 'Apple Music',
   playing:Boolean(player.isPlaying),
   durationMs:Number.isFinite(duration)&&duration>0 ? duration*1000 : 0,
   positionMs:Number.isFinite(position)&&position>=0 ? position*1000 : undefined
  };
 }

 async function command(action,ms,expectedTrackKey) {
  if (!active || busy) return;
  if (action === 'seek') {
   const {durationMs,trackKey} = snapshot();
   if (expectedTrackKey !== undefined && expectedTrackKey !== trackKey) return false;
   if (durationMs > 0) await player.seekToTime(Math.max(0,Math.min(durationMs,ms))/1000);
  } else if (action === 'play') await player.play();
  else if (action === 'pause') await player.pause();
 }
 return {open,snapshot,command};
})();
