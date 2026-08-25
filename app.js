'use strict';
(() => {
  const E=window.UmeaStreetEngine;
  if(!E) throw new Error('Gatduellmotorn saknas.');

  const DATA_URLS=[
    'https://opendataumea.opendatasoft.com/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326',
    'https://opendata.umea.se/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326'
  ];
  const CENTER=[63.8258,20.2630];
  const TARGET=3;
  const LEVELS={hard:{label:'Hard',steps:1,icon:'🔴'},medium:{label:'Medium',steps:2,icon:'🟡'},easy:{label:'Easy',steps:3,icon:'🟢'}};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let graph=null,map=null,historyLayer=null,currentLayer=null,timer=null,state=null,resultMode='next';

  async function loadGraph(){
    let lastError;
    for(const url of DATA_URLS){
      try{
        const res=await fetch(url,{headers:{Accept:'application/geo+json,application/json'},cache:'no-store'});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        const data=await res.json();
        const features=Array.isArray(data?.features)?data.features:Array.isArray(data?.results)?data.results:[];
        if(features.length<100) throw new Error('För få vägsegment');
        graph=E.buildGraph(features,{bbox:E.DEFAULT_BBOX,toleranceMeters:7,junctionRadiusMeters:32});
        if(graph.size<100) throw new Error('För få spelbara gator');
        $('loadStatus').textContent=`Klart · ${graph.size.toLocaleString('sv-SE')} spelbara gatunamn`;
        $('startBtn').disabled=false;
        $('startBtn').textContent='Starta Gatduell';
        return;
      }catch(err){lastError=err;}
    }
    console.error(lastError);
    $('loadStatus').textContent='Gatunätet kunde inte hämtas. Ladda om sidan och försök igen.';
    $('startBtn').textContent='Gatunät saknas';
  }

  function createMap(){
    if(map){map.remove();map=null;}
    map=L.map('map',{
      center:CENTER,
      zoom:13,
      minZoom:10,
      maxZoom:19,
      zoomControl:false,
      attributionControl:true,
      dragging:true,
      touchZoom:true,
      doubleClickZoom:true,
      scrollWheelZoom:false,
      boxZoom:false,
      keyboard:false,
      preferCanvas:true,
      zoomAnimation:false,
      fadeAnimation:false,
      markerZoomAnimation:false,
      inertia:true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',{
      subdomains:'abcd',maxZoom:20,detectRetina:true,updateWhenIdle:true,keepBuffer:3,
      attribution:'&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    requestAnimationFrame(()=>map.invalidateSize(false));
  }

  function saveSettings(){
    try{
      localStorage.setItem('gatuduell:name1',$('name1').value);
      localStorage.setItem('gatuduell:name2',$('name2').value);
      localStorage.setItem('gatuduell:difficulty',$('difficulty').value);
      localStorage.setItem('gatuduell:seconds',$('turnSeconds').value);
    }catch{}
  }
  function restoreSettings(){
    try{
      $('name1').value=localStorage.getItem('gatuduell:name1')||'Spelare 1';
      $('name2').value=localStorage.getItem('gatuduell:name2')||'Spelare 2';
      const d=localStorage.getItem('gatuduell:difficulty');if(LEVELS[d])$('difficulty').value=d;
      const s=localStorage.getItem('gatuduell:seconds');if([...$('turnSeconds').options].some(o=>o.value===s))$('turnSeconds').value=s;
    }catch{}
  }

  function startMatch(){
    if(!graph)return;
    saveSettings();
    state={
      players:[{name:$('name1').value.trim()||'Spelare 1',score:0},{name:$('name2').value.trim()||'Spelare 2',score:0}],
      difficulty:$('difficulty').value,
      seconds:Math.max(0,Number($('turnSeconds').value)||0),
      round:1,turn:0,current:null,used:[],running:true
    };
    $('setupScreen').hidden=true;
    $('gameScreen').hidden=false;
    document.body.style.overflow='hidden';
    createMap();
    beginRound();
  }

  function beginRound(){
    stopTimer();
    state.current=E.chooseStart(graph);
    state.used=[state.current];
    state.turn=(state.round-1)%2;
    state.running=true;
    $('streetInput').disabled=false;$('submitBtn').disabled=false;
    $('pathHint').hidden=true;
    setMessage('Skriv en gata som ligger rätt från den aktuella gatan.');
    render(true);
    beginTurn();
  }

  function beginTurn(){
    if(!state?.running)return;
    const level=LEVELS[state.difficulty];
    const legal=E.reachableUnused(graph,state.current,state.used,level.steps);
    if(!legal.length){
      const winner=state.players[state.turn?0:1];winner.score++;
      finishRound(`${state.players[state.turn].name} har ingen möjlig gata kvar. ${winner.name} vinner rundan.`);
      return;
    }
    $('streetInput').value='';$('suggestions').innerHTML='';
    $('streetInput').disabled=false;$('submitBtn').disabled=false;
    setMessage(`${state.players[state.turn].name}: skriv nästa gata.`);
    updatePlayers();
    startTimer();
  }

  function submitMove(){
    if(!state?.running)return;
    const raw=$('streetInput').value.trim();if(!raw)return;
    stopTimer();
    const level=LEVELS[state.difficulty];
    const result=E.validateMove(graph,state.current,raw,state.used,level.steps);
    if(!result.ok){
      const winner=state.players[state.turn?0:1];winner.score++;
      let why='Svaret är inte giltigt.';
      if(result.reason==='unknown')why=`${raw} finns inte i gatunätet.`;
      if(result.reason==='used')why=`${result.name} har redan använts.`;
      if(result.reason==='not-crossing')why=level.steps===1?`${result.name||raw} ansluter inte till ${state.current}.`:`${result.name||raw} ligger inte inom ${level.steps} steg från ${state.current}.`;
      finishRound(`${why} ${winner.name} vinner rundan.`,true);
      return;
    }
    state.current=result.name;state.used.push(result.name);state.turn=state.turn?0:1;
    if(result.steps>1){$('pathHint').textContent=`✓ ${result.steps} steg: ${result.path.join(' → ')}`;$('pathHint').hidden=false}else $('pathHint').hidden=true;
    setMessage(`Rätt! ${result.name}.`,'good');
    render(true);
    setTimeout(beginTurn,500);
  }

  function finishRound(text,bad=false){
    stopTimer();state.running=false;$('streetInput').disabled=true;$('submitBtn').disabled=true;$('suggestions').innerHTML='';setMessage(text,bad?'bad':'good');render(false);
    const champ=state.players.find(p=>p.score>=TARGET);
    if(champ){resultMode='restart';$('resultTitle').textContent=`${champ.name} vinner matchen!`;$('resultText').textContent=`${state.players[0].name} ${state.players[0].score}–${state.players[1].score} ${state.players[1].name}`;$('resultBtn').textContent='Ny match';}
    else{resultMode='next';$('resultTitle').textContent='Rundan är avgjord';$('resultText').textContent=text;$('resultBtn').textContent='Nästa runda';}
    setTimeout(()=>$('resultModal').hidden=false,450);
  }

  function nextResult(){
    $('resultModal').hidden=true;
    if(resultMode==='restart'){return backToSetup();}
    state.round++;beginRound();
  }

  function backToSetup(){
    stopTimer();state=null;
    if(historyLayer){historyLayer.remove();historyLayer=null}if(currentLayer){currentLayer.remove();currentLayer=null}if(map){map.remove();map=null}
    $('gameScreen').hidden=true;$('setupScreen').hidden=false;document.body.style.overflow='';
  }

  function startTimer(){
    stopTimer();const seconds=state.seconds;
    if(!seconds){$('timerTrack').hidden=true;$('timerText').textContent='Ingen tidsgräns';return;}
    $('timerTrack').hidden=false;const end=performance.now()+seconds*1000;
    const tick=()=>{const left=Math.max(0,end-performance.now());$('timerText').textContent=`${Math.ceil(left/1000)} sek`;$('timerBar').style.width=`${left/(seconds*1000)*100}%`;if(left<=0){stopTimer();const winner=state.players[state.turn?0:1];winner.score++;finishRound(`Tiden tog slut. ${winner.name} vinner rundan.`,true);}};
    tick();timer=setInterval(tick,100);
  }
  function stopTimer(){if(timer){clearInterval(timer);timer=null}}

  function render(focus=false){
    $('p1Name').textContent=state.players[0].name;$('p2Name').textContent=state.players[1].name;$('p1Score').textContent=state.players[0].score;$('p2Score').textContent=state.players[1].score;$('roundNo').textContent=state.round;$('currentStreet').textContent=state.current||'—';
    const level=LEVELS[state.difficulty];$('difficultyBadge').textContent=`${level.icon} ${level.label}${level.steps>1?` · ${level.steps} steg`:''}`;updatePlayers();drawStreets(focus);
  }
  function updatePlayers(){$('p1').classList.toggle('active',state.running&&state.turn===0);$('p2').classList.toggle('active',state.running&&state.turn===1)}

  function lineLayers(name,style){
    const street=graph.get(name);if(!street?.lines?.length)return[];
    const renderer=L.canvas();
    return street.lines.map(coords=>L.polyline(coords.map(([lon,lat])=>[lat,lon]),{renderer,interactive:false,lineCap:'round',lineJoin:'round',...style}));
  }
  function drawStreets(focus=false){
    if(!map||!state)return;
    if(historyLayer){historyLayer.remove();historyLayer=null}if(currentLayer){currentLayer.remove();currentLayer=null}
    const previous=state.used.slice(0,-1).flatMap(name=>lineLayers(name,{color:'#14a99c',weight:5,opacity:.62}));
    if(previous.length)historyLayer=L.featureGroup(previous).addTo(map);
    const current=state.current;
    const layers=[...lineLayers(current,{color:'#ffffff',weight:11,opacity:.92}),...lineLayers(current,{color:'#ff8d2f',weight:7,opacity:.98})];
    if(layers.length){currentLayer=L.featureGroup(layers).addTo(map);if(focus)focusCurrent();}
  }
  function focusCurrent(){
    if(!map||!currentLayer)return;
    try{map.fitBounds(currentLayer.getBounds().pad(.55),{maxZoom:16,animate:false,paddingTopLeft:[20,130],paddingBottomRight:[20,150]});}catch{}
  }

  function renderSuggestions(){
    if(!graph||!state?.running)return $('suggestions').innerHTML='';
    const q=$('streetInput').value;if(q.trim().length<2)return $('suggestions').innerHTML='';
    $('suggestions').innerHTML=E.suggestions(graph,q,6).map(name=>`<button type="button" data-name="${esc(name)}">${esc(name)}</button>`).join('');
  }
  function setMessage(text,type=''){const el=$('message');el.textContent=text;el.className=`message${type?` ${type}`:''}`}

  $('startBtn').addEventListener('click',startMatch);
  $('answerForm').addEventListener('submit',e=>{e.preventDefault();submitMove();});
  $('streetInput').addEventListener('input',renderSuggestions);
  $('suggestions').addEventListener('click',e=>{const b=e.target.closest('button[data-name]');if(!b)return;$('streetInput').value=b.dataset.name;$('suggestions').innerHTML='';$('streetInput').focus({preventScroll:true});});
  $('recenterBtn').addEventListener('click',focusCurrent);
  $('newMatchBtn').addEventListener('click',backToSetup);
  $('resultBtn').addEventListener('click',nextResult);
  restoreSettings();
  void loadGraph();
})();
