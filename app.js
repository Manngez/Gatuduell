'use strict';

(() => {
  const E=window.UmeaStreetEngine;
  if(!E) throw new Error('Spelmotorn saknas.');

  const DATA_URLS=[
    'https://opendataumea.opendatasoft.com/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326',
    'https://opendata.umea.se/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326'
  ];
  const ROUND_TARGET=3;
  const LEVELS={
    hard:{key:'hard',label:'Hard',icon:'🔴',steps:1,help:'direkt anslutande gata'},
    medium:{key:'medium',label:'Medium',icon:'🟡',steps:2,help:'direkt eller via en gata'},
    easy:{key:'easy',label:'Easy',icon:'🟢',steps:3,help:'upp till två mellanliggande gator'}
  };

  const $=id=>document.getElementById(id);
  let graph=null;
  let features=[];
  let map=null;
  let highlightLayer=null;
  let timerId=null;
  let state=null;
  let modalMode='setup';
  let mapExplore=false;
  let mapResizeObserver=null;
  let lastSharePayload=null;

  const saved={
    get(key,fallback){try{return localStorage.getItem(`umea-gatduell:${key}`)??fallback;}catch{return fallback;}},
    set(key,value){try{localStorage.setItem(`umea-gatduell:${key}`,String(value));}catch{}}
  };

  function readMatchStats(){
    try{
      const raw=localStorage.getItem('umea-gatduell:matchStats');
      const parsed=raw?JSON.parse(raw):{};
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch{return {};}
  }

  function writeMatchStats(stats){
    try{localStorage.setItem('umea-gatduell:matchStats',JSON.stringify(stats));}catch{}
  }

  function playerKey(name){return String(name||'Spelare').trim().toLocaleLowerCase('sv-SE');}

  function recordMatch(winner){
    if(!state||state.matchRecorded) return;
    state.matchRecorded=true;
    const stats=readMatchStats();
    state.players.forEach(player=>{
      const key=playerKey(player.name);
      const current=stats[key]||{name:player.name,wins:0,matches:0,lastPlayed:0};
      current.name=player.name;
      current.matches=(Number(current.matches)||0)+1;
      current.lastPlayed=Date.now();
      if(player===winner) current.wins=(Number(current.wins)||0)+1;
      stats[key]=current;
    });
    writeMatchStats(stats);
    renderLeaderboard();
  }

  function renderLeaderboard(){
    const rows=$('leaderboardRows');
    const empty=$('leaderboardEmpty');
    if(!rows||!empty) return;
    const list=Object.values(readMatchStats())
      .filter(item=>item&&item.name)
      .map(item=>({...item,wins:Number(item.wins)||0,matches:Number(item.matches)||0}))
      .sort((a,b)=>b.wins-a.wins || (b.wins/Math.max(1,b.matches))-(a.wins/Math.max(1,a.matches)) || b.lastPlayed-a.lastPlayed)
      .slice(0,8);
    rows.innerHTML=list.map((item,index)=>{
      const rate=item.matches?Math.round((item.wins/item.matches)*100):0;
      return `<div class="leaderboard-row"><div class="leaderboard-name"><span class="leaderboard-rank">${index+1}</span><strong>${escapeHtml(item.name)}</strong></div><span class="leaderboard-value">${item.wins}</span><span class="leaderboard-value">${item.matches}</span><span class="leaderboard-value">${rate}%</span></div>`;
    }).join('');
    empty.classList.toggle('hidden',list.length>0);
  }

  function makeSharePayload(winner){
    const loser=state.players.find(player=>player!==winner);
    const level=currentLevel();
    const score=`${state.players[0].score}–${state.players[1].score}`;
    const text=`🏙️ ${winner.name} vann Gatduell Umeå ${score} mot ${loser?.name||'motståndaren'} · ${level.label}. Kan du slå det?`;
    return {
      title:'Gatduell Umeå',
      text,
      url:window.location.href.split('#')[0].split('?')[0],
      winner:winner.name,
      score,
      meta:`${level.label} · ${state.turnSeconds>0?`${state.turnSeconds} sek/tur`:'utan tidsgräns'}`
    };
  }

  async function shareResult(){
    if(!lastSharePayload) return;
    const button=$('shareResultBtn');
    const original=button?.textContent||'Dela resultat';
    try{
      if(navigator.share){
        await navigator.share({title:lastSharePayload.title,text:lastSharePayload.text,url:lastSharePayload.url});
        if(button) button.textContent='Delat ✓';
      }else{
        await navigator.clipboard.writeText(`${lastSharePayload.text} ${lastSharePayload.url}`);
        if(button) button.textContent='Kopierat ✓';
      }
    }catch(error){
      if(error?.name!=='AbortError'){
        try{
          await navigator.clipboard.writeText(`${lastSharePayload.text} ${lastSharePayload.url}`);
          if(button) button.textContent='Kopierat ✓';
        }catch{}
      }
    }finally{
      if(button) setTimeout(()=>{button.textContent=original;},1600);
    }
  }

  function invalidateMapSize(){
    if(!map) return;
    requestAnimationFrame(()=>{
      try{map.invalidateSize(false);}catch{}
    });
  }

  function setMapExplore(active){
    mapExplore=Boolean(active);
    if(!map) return;
    const desktop=window.innerWidth>720;
    const interactive=desktop||mapExplore;
    if(interactive){
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
    }else{
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
    }
    map.scrollWheelZoom.disable();
    const button=$('mapModeBtn');
    if(button){
      button.hidden=desktop;
      button.setAttribute('aria-pressed',String(!desktop&&mapExplore));
      button.textContent=!desktop&&mapExplore?'Lås kartan':'Utforska kartan';
    }
  }

  function initMap(){
    if(!window.L) return;
    map=L.map('map',{zoomControl:false,minZoom:10,maxZoom:19,scrollWheelZoom:false}).setView([63.8258,20.2630],13);
    L.control.zoom({position:'bottomright'}).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',{
      maxZoom:20,
      attribution:'&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    setMapExplore(false);
    invalidateMapSize();
    window.addEventListener('resize',()=>{setMapExplore(false);invalidateMapSize();});
    window.addEventListener('orientationchange',()=>{setMapExplore(false);invalidateMapSize();});
    if('ResizeObserver' in window){
      mapResizeObserver=new ResizeObserver(invalidateMapSize);
      mapResizeObserver.observe($('map'));
    }
  }

  async function loadData(){
    let lastError=null;
    for(const url of DATA_URLS){
      try{
        $('loadStatus').textContent='Hämtar Umeås gator…';
        const response=await fetch(url,{cache:'no-cache'});
        if(!response.ok) throw new Error(`HTTP ${response.status}`);
        const data=await response.json();
        const list=Array.isArray(data?.features)?data.features:Array.isArray(data)?data:[];
        if(!list.length) throw new Error('Tom datamängd');
        features=list;
        $('loadStatus').textContent=`Bygger gatunät från ${list.length.toLocaleString('sv-SE')} vägsegment…`;
        await new Promise(resolve=>requestAnimationFrame(resolve));
        graph=E.buildGraph(list,{toleranceMeters:7,junctionRadiusMeters:32});
        if(!graph.size) throw new Error('Kunde inte bygga gatunät');
        $('loadStatus').textContent=`Klart · ${graph.size.toLocaleString('sv-SE')} spelbara gatunamn`;
        $('modalPrimary').disabled=false;
        $('modalPrimary').textContent='Starta match';
        return;
      }catch(error){lastError=error;}
    }
    console.error(lastError);
    $('loadStatus').textContent='Kunde inte hämta gatunätet. Kontrollera internetanslutningen och försök igen.';
    $('modalPrimary').disabled=true;
    $('modalPrimary').textContent='Gatunät saknas';
  }

  function setLiveMode(active){
    document.body.classList.toggle('game-live',Boolean(active));
  }

  function openStartFlow(){
    setLiveMode(false);
    showSetup();
  }

  function currentLevel(){return LEVELS[state?.difficulty||$('difficultySelect').value]||LEVELS.hard;}
  function currentPlayer(){return state?.players?.[state.turn]||null;}
  function otherPlayer(){return state?.players?.[state.turn===0?1:0]||null;}

  function startMatch(){
    const name1=$('name1').value.trim()||'Spelare 1';
    const name2=$('name2').value.trim()||'Spelare 2';
    const difficulty=$('difficultySelect').value;
    const turnSeconds=Math.max(0,Number($('timerSelect').value)||0);
    saved.set('name1',name1);saved.set('name2',name2);saved.set('difficulty',difficulty);saved.set('timer',turnSeconds);
    state={
      players:[{name:name1,score:0},{name:name2,score:0}],
      difficulty,turnSeconds,round:1,turn:0,current:null,used:[],running:true,matchRecorded:false
    };
    setLiveMode(true);
    hideModal();
    beginRound();
  }

  function beginRound(){
    stopTimer();
    state.current=E.chooseStart(graph);
    state.used=[state.current];
    state.turn=(state.round-1)%2;
    state.running=true;
    setMessage('Skriv en gata som uppfyller reglerna.','');
    $('pathHint').classList.add('hidden');
    $('pathHint').textContent='';
    render();
    beginTurn();
  }

  function beginTurn(){
    if(!state?.running) return;
    const level=currentLevel();
    const legal=E.reachableUnused(graph,state.current,state.used,level.steps);
    if(!legal.length){
      const winner=otherPlayer();
      winner.score++;
      finishRound(`${currentPlayer().name} har ingen möjlig gata kvar. ${winner.name} vinner rundan.`);
      return;
    }
    $('streetInput').value='';
    $('suggestions').innerHTML='';
    $('streetInput').disabled=false;
    $('submitBtn').disabled=false;
    $('prompt').textContent=`${currentPlayer().name}: vilken gata ligger rätt från ${state.current}?`;
    setMessage('Skriv ett gatunamn. Förslagen visar bara namn – inte om svaret är rätt.','');
    renderPlayers();
    startTimer();
    setTimeout(()=>$('streetInput').focus({preventScroll:true}),40);
  }

  function submitAnswer(){
    if(!state?.running) return;
    const raw=$('streetInput').value.trim();
    if(!raw) return;
    stopTimer();
    const level=currentLevel();
    const result=E.validateMove(graph,state.current,raw,state.used,level.steps);
    if(!result.ok){
      const loser=currentPlayer(),winner=otherPlayer();
      winner.score++;
      let reason='Svaret är inte giltigt.';
      if(result.reason==='unknown') reason=`${raw} finns inte i det spelbara gatunätet.`;
      if(result.reason==='used') reason=`${result.name} har redan använts.`;
      if(result.reason==='not-crossing') reason=level.steps===1
        ? `${result.name||raw} ansluter inte direkt till ${state.current}.`
        : `${result.name||raw} ligger inte inom ${level.steps} steg från ${state.current}.`;
      finishRound(`${reason} ${winner.name} vinner rundan.`,true);
      return;
    }

    state.current=result.name;
    state.used.push(result.name);
    if(result.steps>1){
      $('pathHint').textContent=`✓ ${result.steps} steg: ${result.path.join(' → ')}`;
      $('pathHint').classList.remove('hidden');
    }else{
      $('pathHint').classList.add('hidden');
      $('pathHint').textContent='';
    }
    setMessage(`Rätt! ${result.name}${result.steps>1?` ligger ${result.steps} steg bort`:' ansluter direkt'}.`,'good');
    state.turn=state.turn===0?1:0;
    render();
    setTimeout(beginTurn,650);
  }

  function startTimer(){
    stopTimer();
    const seconds=state.turnSeconds;
    if(seconds<=0){
      $('timerTrack').style.display='none';
      $('timerText').textContent='Ingen tidsgräns';
      return;
    }
    $('timerTrack').style.display='block';
    const end=performance.now()+seconds*1000;
    const tick=()=>{
      const left=Math.max(0,end-performance.now());
      $('timerText').textContent=`${Math.ceil(left/1000)} sek`;
      $('timerBar').style.width=`${(left/(seconds*1000))*100}%`;
      if(left<=0){
        stopTimer();
        const loser=currentPlayer(),winner=otherPlayer();
        winner.score++;
        finishRound(`Tiden tog slut för ${loser.name}. ${winner.name} vinner rundan.`,true);
      }
    };
    tick();
    timerId=setInterval(tick,100);
  }

  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null;}}

  function finishRound(text,isBad=false){
    stopTimer();
    state.running=false;
    $('streetInput').disabled=true;
    $('submitBtn').disabled=true;
    $('suggestions').innerHTML='';
    setMessage(text,isBad?'bad':'good');
    render();
    const champion=state.players.find(player=>player.score>=ROUND_TARGET);
    if(champion){
      recordMatch(champion);
      lastSharePayload=makeSharePayload(champion);
      setTimeout(()=>showResult(`${champion.name} vinner matchen!`,`${state.players[0].name} ${state.players[0].score}–${state.players[1].score} ${state.players[1].name}`,'Spela igen',lastSharePayload),850);
    }else{
      setTimeout(()=>showResult('Rundan är avgjord',text,'Nästa runda'),850);
    }
  }

  function showResult(title,text,buttonText,resultData=null){
    modalMode=buttonText==='Spela igen'?'restart':'next';
    $('modalTitle').textContent=title;
    $('modalText').textContent=text;
    $('setupFields').classList.add('hidden');
    $('loadStatus').classList.add('hidden');
    $('modalPrimary').disabled=false;
    $('modalPrimary').textContent=buttonText;
    const resultCard=$('resultCard');
    const shareButton=$('shareResultBtn');
    if(resultData){
      $('resultWinner').textContent=`${resultData.winner} tar segern`;
      $('resultScore').textContent=resultData.score;
      $('resultMeta').textContent=resultData.meta;
      resultCard?.classList.remove('hidden');
      shareButton?.classList.remove('hidden');
    }else{
      resultCard?.classList.add('hidden');
      shareButton?.classList.add('hidden');
    }
    $('modal').classList.remove('hidden');
  }

  function showSetup(){
    stopTimer();
    modalMode='setup';
    setLiveMode(false);
    $('modalTitle').textContent='Starta match';
    $('modalText').textContent='Ni turas om att skriva gator i Umeå. Fel svar förlorar rundan. Först till tre rundvinster vinner.';
    $('setupFields').classList.remove('hidden');
    $('loadStatus').classList.remove('hidden');
    $('resultCard')?.classList.add('hidden');
    $('shareResultBtn')?.classList.add('hidden');
    lastSharePayload=null;
    $('modalPrimary').textContent=graph?'Starta match':'Laddar gatunät…';
    $('modalPrimary').disabled=!graph;
    $('modal').classList.remove('hidden');
  }

  function hideModal(){
    $('modal').classList.add('hidden');
    setTimeout(invalidateMapSize,80);
  }

  function modalPrimary(){
    if(modalMode==='setup'){startMatch();return;}
    if(modalMode==='next'){
      hideModal();state.round++;beginRound();return;
    }
    if(modalMode==='restart'){
      showSetup();
    }
  }

  function setMessage(text,kind=''){
    const el=$('message');
    el.textContent=text;
    el.className='message'+(kind?` ${kind}`:'');
  }

  function render(){
    if(!state) return;
    renderPlayers();
    $('roundNo').textContent=String(state.round);
    $('currentStreet').textContent=state.current||'—';
    $('chain').innerHTML=state.used.slice(-10).map(name=>`<span>${escapeHtml(name)}</span>`).join('');
    const level=currentLevel();
    $('difficultyBadge').textContent=`${level.icon} ${level.label} · ${level.help}`;
    $('rulesText').textContent=state.turnSeconds<=0
      ? 'Fel anslutning eller återanvänd gata förlorar rundan. Först till tre rundvinster vinner matchen.'
      : 'Fel anslutning, återanvänd gata eller slut på tiden förlorar rundan. Först till tre rundvinster vinner matchen.';
    highlightStreet(state.current);
  }

  function renderPlayers(){
    if(!state) return;
    $('player1Name').textContent=state.players[0].name;
    $('player2Name').textContent=state.players[1].name;
    $('player1Score').textContent=String(state.players[0].score);
    $('player2Score').textContent=String(state.players[1].score);
    $('player1Card').classList.toggle('active',state.running&&state.turn===0);
    $('player2Card').classList.toggle('active',state.running&&state.turn===1);
    if($('turnLabel')) $('turnLabel').textContent=state.running?`${currentPlayer().name} spelar`:'Rundan avgjord';
  }

  function highlightStreet(name){
    if(!map||!graph||!name) return;
    if(highlightLayer){highlightLayer.remove();highlightLayer=null;}
    const street=graph.get(name);
    if(!street?.lines?.length) return;
    const layers=street.lines.map(line=>L.polyline(line.map(([lon,lat])=>[lat,lon]),{color:'#1ecfe0',weight:6,opacity:.92}));
    highlightLayer=L.featureGroup(layers).addTo(map);
    if(!mapExplore){
      try{map.fitBounds(highlightLayer.getBounds().pad(window.innerWidth<=720?.75:.58),{maxZoom:16,animate:window.innerWidth>720});}catch{}
    }
  }

  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function syncSuggestions(){
    if(!graph||!state?.running){$('suggestions').innerHTML='';return;}
    const value=$('streetInput').value;
    if(value.trim().length<2){$('suggestions').innerHTML='';return;}
    const names=E.suggestions(graph,value,7);
    $('suggestions').innerHTML=names.map(name=>`<button type="button" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
  }

  function restoreSettings(){
    $('name1').value=saved.get('name1','Spelare 1');
    $('name2').value=saved.get('name2','Spelare 2');
    const diff=saved.get('difficulty','hard');
    if(LEVELS[diff]) $('difficultySelect').value=diff;
    const timer=saved.get('timer','20');
    if([...$('timerSelect').options].some(option=>option.value===String(timer))) $('timerSelect').value=String(timer);
  }

  function bind(){
    $('answerForm').addEventListener('submit',event=>{event.preventDefault();submitAnswer();});
    $('streetInput').addEventListener('input',syncSuggestions);
    $('suggestions').addEventListener('click',event=>{
      const button=event.target.closest('button[data-name]');
      if(!button) return;
      $('streetInput').value=button.dataset.name;
      $('suggestions').innerHTML='';
      $('streetInput').focus();
    });
    $('modalPrimary').addEventListener('click',modalPrimary);
    $('newGameBtn').addEventListener('click',openStartFlow);
    $('heroStartBtn')?.addEventListener('click',openStartFlow);
    $('heroHowBtn')?.addEventListener('click',()=>{$('howItWorks')?.scrollIntoView({behavior:'smooth',block:'start'});});
    $('mapModeBtn')?.addEventListener('click',()=>setMapExplore(!mapExplore));
    $('shareResultBtn')?.addEventListener('click',shareResult);
  }

  setLiveMode(false);
  renderLeaderboard();
  restoreSettings();
  initMap();
  bind();
  loadData();
})();
