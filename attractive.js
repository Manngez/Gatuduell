'use strict';
/**
 * Attractiveness layer for Gatduell.
 * Self-contained: listens to the existing DOM and adds sounds (Web Audio),
 * streaks, toasts, confetti, button ripples, timer urgency and a turn indicator.
 *
 * Hooks into the existing app without modifying engine.js. It watches the
 * message element and scoreboard to infer game events.
 */
(() => {
  const $ = id => document.getElementById(id);
  const soundToggle = localStorage.getItem('gatuduell:sound') !== '0';

  /* ---------- Sound (Web Audio API, no assets) ---------- */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  }
  function tone({freq=440, dur=.12, type='sine', vol=.15, slide=0, delay=0} = {}) {
    const ctx = ensureAudio();
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + .02);
  }
  const sfx = {
    click() { tone({freq:660,dur:.06,type:'triangle',vol:.08}); },
    correct() {
      tone({freq:520,dur:.09,type:'triangle',vol:.12});
      tone({freq:780,dur:.12,type:'triangle',vol:.12,delay:.08});
      tone({freq:1040,dur:.16,type:'triangle',vol:.10,delay:.18});
    },
    wrong() {
      tone({freq:260,dur:.18,type:'sawtooth',vol:.14,slide:-120});
      tone({freq:180,dur:.22,type:'sawtooth',vol:.12,slide:-80,delay:.1});
    },
    tick() { tone({freq:980,dur:.04,type:'square',vol:.05}); },
    roundWin() {
      [523,659,784,1047].forEach((f,i)=>tone({freq:f,dur:.18,type:'triangle',vol:.14,delay:i*.09}));
    },
    matchWin() {
      [523,659,784,1047,1319,1568].forEach((f,i)=>tone({freq:f,dur:.22,type:'triangle',vol:.16,delay:i*.08}));
    },
    turn() { tone({freq:440,dur:.08,type:'sine',vol:.08}); tone({freq:660,dur:.08,type:'sine',vol:.08,delay:.06}); },
    countdown(){ tone({freq:880,dur:.08,type:'square',vol:.1}); }
  };
  let muted = !soundToggle;

  /* ---------- Mute toggle button ---------- */
  function addMuteButton(){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mute-btn';
    btn.setAttribute('aria-label', muted ? 'Slå på ljud' : 'Tysta ljud');
    btn.textContent = muted ? '🔇' : '🔊';
    Object.assign(btn.style, {
      position:'fixed', zIndex:'530', left:'12px', top:'max(12px, env(safe-area-inset-top))',
      width:'40px', height:'40px', borderRadius:'12px', border:'1px solid rgba(255,255,255,.18)',
      background:'rgba(16,38,43,.85)', color:'#e4efeb', backdropFilter:'blur(12px)',
      boxShadow:'0 8px 24px rgba(0,0,0,.18)', fontSize:'18px', display:'none', cursor:'pointer'
    });
    btn.addEventListener('click', () => {
      muted = !muted;
      btn.textContent = muted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', muted ? 'Slå på ljud' : 'Tysta ljud');
      localStorage.setItem('gatuduell:sound', muted ? '0' : '1');
      ensureAudio();
      if(!muted) sfx.click();
    });
    document.body.appendChild(btn);
    window.__updateMuteVis = vis => { btn.style.display = vis ? '' : 'none'; };
  }

  /* ---------- Button ripple ---------- */
  function addRipple(el){
    if(!el || el.dataset.ripple) return;
    el.dataset.ripple='1';
    el.classList.add('btn-ripple');
    el.addEventListener('pointerdown', e=>{
      ensureAudio();
      const rect = el.getBoundingClientRect();
      const r = document.createElement('span');
      r.className='ripple';
      const size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + 'px';
      r.style.left = (e.clientX - rect.left - size/2) + 'px';
      r.style.top = (e.clientY - rect.top - size/2) + 'px';
      el.appendChild(r);
      setTimeout(()=>r.remove(), 600);
    });
  }
  document.querySelectorAll('button').forEach(addRipple);
  new MutationObserver(muts=>{
    for(const m of muts) for(const n of m.addedNodes){
      if(n.nodeType!==1) continue;
      if(n.matches?.('button')) addRipple(n);
      n.querySelectorAll?.('button').forEach(addRipple);
    }
  }).observe(document.body,{childList:true,subtree:true});

  /* ---------- Toasts ---------- */
  let toastTimer = null;
  function toast(text, kind='info', ms=1800){
    const old = document.querySelector('.toast'); old?.remove();
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>{ el.style.transition='opacity .3s,transform .3s'; el.style.opacity='0'; el.style.transform='translate(-50%,-14px)'; setTimeout(()=>el.remove(),320); }, ms);
  }

  /* ---------- Confetti ---------- */
  function confetti(count=120){
    if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.createElement('div');
    layer.className='confetti-layer';
    const palette = ['#d6fa79','#ffd27b','#ff9f43','#7dcad2','#62e8df','#ff968a','#fff','#9df0bd'];
    for(let i=0;i<count;i++){
      const p = document.createElement('span');
      p.className='confetti-piece';
      const cx = Math.random()*100;
      const cdx = (Math.random()-.5)*30;
      const dur = 2 + Math.random()*2.2;
      const delay = Math.random()*.8;
      const color = palette[Math.floor(Math.random()*palette.length)];
      p.style.setProperty('--cx', cx+'vw');
      p.style.setProperty('--cdx', cdx+'vw');
      p.style.setProperty('--dur', dur+'s');
      p.style.setProperty('--delay', delay+'s');
      p.style.background = color;
      p.style.transform = `rotate(${Math.random()*360}deg)`;
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(()=>{ layer.style.transition='opacity .6s'; layer.style.opacity='0'; setTimeout(()=>layer.remove(),650); }, 4500);
  }

  /* ---------- Turn dot indicator ---------- */
  const turnDot = document.createElement('div');
  turnDot.className='turn-dot';
  turnDot.style.display='none';
  document.body.appendChild(turnDot);

  /* ---------- Streaks ---------- */
  const streaks = new Map();
  function updateStreaks(){
    const strip = $('playerStrip'); if(!strip) return;
    strip.querySelectorAll('.player').forEach((el,idx)=>{
      let badge = el.querySelector('.streak');
      const name = stripName(el.querySelector('span')?.textContent) || `p${idx}`;
      const count = streaks.get(name) || 0;
      if(count>=2){
        if(!badge){ badge = document.createElement('i'); badge.className='streak'; el.appendChild(badge); }
        badge.textContent = `×${count}`;
        badge.classList.toggle('hot', count>=4);
        badge.classList.add('visible');
      } else if(badge){ badge.classList.remove('visible'); }
    });
  }

  /* ---------- Score pop animation ---------- */
  function popScore(winnerName){
    const strip = $('playerStrip'); if(!strip) return;
    for(const el of strip.querySelectorAll('.player')){
      const name = stripName(el.querySelector('span')?.textContent);
      if(name === stripName(winnerName)){
        const b = el.querySelector('b'); if(!b) continue;
        b.classList.remove('score-pop');
        void b.offsetWidth;
        b.classList.add('score-pop');
      }
    }
  }

  /* ---------- Timer urgency ---------- */
  let lastUrgentTick = 0;
  function watchTimer(){
    const track = $('timerTrack'); const bar = $('timerBar'); const hud = document.querySelector('.street-hud');
    if(!track || !bar || !hud) return;
    if(track.hidden){ track.classList.remove('urgent'); hud.classList.remove('urgent'); return; }
    const w = parseFloat(bar.style.width || '100');
    if(!Number.isFinite(w)) return;
    if(w <= 25){
      track.classList.add('urgent'); hud.classList.add('urgent');
      if(w <= 25 && w > 0){
        const now = Date.now();
        // tick in last 5 seconds
        if(w <= 25){
          const sec = Math.ceil((parseFloat($('timerText')?.textContent||'0'))||0);
          if(sec && sec <= 5 && now - lastUrgentTick > 900){
            lastUrgentTick = now; sfx.countdown();
          }
        }
      }
    } else { track.classList.remove('urgent'); hud.classList.remove('urgent'); }
  }
  setInterval(watchTimer, 120);

  /* ---------- Event detection via DOM observer ---------- */
  const messageEl = () => $('message');
  const stripName = s => String(s||'').replace(/[👑🔇🔊]/g,'').trim();
  const currentPlayerName = () => {
    const active = document.querySelector('.player-strip .player.active');
    return stripName(active?.querySelector('span')?.textContent);
  };
  let lastRound = null;
  let lastMessage = '';
  let lastResultText = '';
  let lastStreet = '';

  function vibrate(pattern){ try { navigator.vibrate?.(pattern); } catch {} }

  function detectEvents(){
    const msg = messageEl()?.textContent || '';
    const round = $('roundNo')?.textContent || '';
    const street = $('currentStreet')?.textContent || '';
    const gameScreen = $('gameScreen');
    const resultModal = $('resultModal');
    const resultTitle = $('resultTitle')?.textContent || '';
    const resultText = $('resultText')?.textContent || '';
    const composer = document.querySelector('.composer');

    // show mute + turn dot when in game
    if(window.__updateMuteVis) window.__updateMuteVis(!gameScreen.hidden);
    turnDot.style.display = !gameScreen.hidden ? '' : 'none';
    // color turn dot by player index
    const players = document.querySelectorAll('.player-strip .player');
    players.forEach((p,i)=>{
      if(p.classList.contains('active')) turnDot.classList.toggle('p2', i===1);
    });

    // message changes
    if(msg !== lastMessage){
      const prev = lastMessage; lastMessage = msg;
      composer?.classList.remove('correct','wrong');

      const skrivMatch = msg.match(/^(.+?):\s*skriv nästa gata\.$/);
      const prevSkriv = prev.match(/^(.+?):\s*skriv nästa gata\.$/);
      const isPathShown = /steg:/.test(msg);
      const isRoundWin = /vinner rundan/.test(msg);
      const badMove = /inte giltigt|finns inte|redan använts|ansluter inte|inte inom|tiden tog slut|ingen möjlig/.test(msg);

      // A correct move changes the current player (different ": skriv nästa gata" name) OR
      // a path hint is shown for a multi-step move on harder detection.
      const playerJustChanged = skrivMatch && prevSkriv && skrivMatch[1] !== prevSkriv[1];
      const goodMove = (isPathShown || playerJustChanged) && !badMove && !isRoundWin;

      if(goodMove){
        sfx.correct(); vibrate(30);
        composer?.classList.add('correct');
        const hud = document.querySelector('.street-hud');
        hud?.classList.remove('turn-flash'); void hud?.offsetWidth; hud?.classList.add('turn-flash');
        // The player who just answered is the previous player (now inactive).
        const answeredBy = prevSkriv ? prevSkriv[1].trim() : currentPlayerName();
        const s = (streaks.get(answeredBy)||0) + 1; streaks.set(answeredBy,s);
        streaks.forEach((v,k)=>{ if(k!==answeredBy && v) streaks.set(k,0); });
        updateStreaks();
        if(s>=3) toast(`${answeredBy} · ${s} i rad! 🔥`, 'info', 1400);
        sfx.turn();
      }
      else if(badMove){
        sfx.wrong(); vibrate([40,60,40]);
        composer?.classList.add('wrong');
        streaks.forEach((_,k)=>streaks.set(k,0)); updateStreaks();
        toast('Fel svar!', 'bad', 1100);
      }
      else if(/spelar…|skriv nästa gata/.test(msg) && /^Spelare \d+: skriv nästa gata\.$/.test(msg) === false){
        sfx.turn();
      }
    }

    // new round
    if(round && round !== lastRound){
      if(lastRound !== null){ /* round changed — clear streaks? Keep them across rounds for momentum. */ }
      lastRound = round;
    }

    // result modal
    if(resultModal && !resultModal.hidden){
      const key = resultTitle + '|' + resultText;
      if(key !== lastResultText){
        lastResultText = key;
        const isMatch = /vinner matchen/.test(resultTitle);
        const winnerName = resultTitle.replace(/ vinner (matchen|rundan)[.!]?$/,'').trim();
        if(winnerName){ popScore(winnerName); }
        if(isMatch){
          sfx.matchWin(); confetti(160);
          document.querySelector('.result-card')?.classList.add('celebrate');
          // highlight winner row
          document.querySelectorAll('.result-score span').forEach(sp=>{
            const name = stripName(sp.firstChild?.textContent);
            if(name === stripName(winnerName)) sp.classList.add('winner'); else sp.classList.remove('winner');
          });
          streaks.clear(); updateStreaks();
        } else {
          sfx.roundWin(); confetti(70);
          document.querySelector('.result-card')?.classList.remove('celebrate');
          document.querySelectorAll('.result-score span').forEach(sp=>sp.classList.remove('winner'));
        }
      }
    } else {
      lastResultText = '';
    }
  }

  new MutationObserver(detectEvents).observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true});

  /* ---------- Keyboard hint for submit ---------- */
  const form = $('answerForm');
  if(form){
    const wrap = document.createElement('span');
    wrap.className='key-hint';
    wrap.innerHTML = '<kbd>⏎</kbd>';
    // position relative to composer input area
    const composer = document.querySelector('.composer');
    if(composer) composer.appendChild(wrap);
  }

  /* ---------- Auto-focus input when it becomes enabled ---------- */
  let lastDisabled = null;
  setInterval(()=>{
    const inp = $('streetInput');
    if(!inp) return;
    const d = inp.disabled;
    if(lastDisabled && !d && !$('gameScreen').hidden){
      setTimeout(()=>{ try{ inp.focus({preventScroll:true}); }catch{} }, 60);
    }
    lastDisabled = d;
  }, 150);

  /* ---------- Subtle parallax on setup map preview ---------- */
  const preview = document.querySelector('.map-preview');
  if(preview){
    preview.addEventListener('mousemove', e=>{
      const r = preview.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      preview.style.backgroundPosition = `calc(50% + ${x*10}px) calc(55% + ${y*10}px)`;
    });
    preview.addEventListener('mouseleave', ()=>{ preview.style.backgroundPosition = ''; });
  }

  /* ---------- Initial click to unlock audio ---------- */
  document.addEventListener('pointerdown', ()=>ensureAudio(), {once:true, passive:true});
  document.addEventListener('keydown', ()=>ensureAudio(), {once:true, passive:true});

  addMuteButton();
  detectEvents();
})();
