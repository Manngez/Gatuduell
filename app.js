'use strict';
(() => {
  const E=window.UmeaStreetEngine;
  if(!E) throw new Error('Gatduellmotorn saknas.');

  const DATA_URLS=[
    'https://opendataumea.opendatasoft.com/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326',
    'https://opendata.umea.se/api/explore/v2.1/catalog/datasets/roads_umea/exports/geojson?timezone=Europe%2FStockholm&use_labels=false&epsg=4326'
  ];
  const PEERJS_URL='https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js';
  const CENTER=[63.8258,20.2630];
  const TARGET=3;
  const FREE_NAV_MS=8000;
  const LEVELS={hard:{label:'Hard',steps:1,icon:'🔴'},medium:{label:'Medium',steps:2,icon:'🟡'},easy:{label:'Easy',steps:3,icon:'🟢'}};
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone=v=>JSON.parse(JSON.stringify(v));

  let graph=null,map=null,routeLayer=null,timer=null,displayTimer=null,state=null,resultMode='next';
  let userNavigatingUntil=0,mapProgrammatic=false;
  const net={role:'offline',peer:null,conn:null,guestConn:null,room:'',name:'',guestName:'',status:'offline',peerPromise:null,pendingMove:false};

  function safeRoom(value=''){return String(value).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}
  function makeRoom(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from({length:5},()=>chars[Math.floor(Math.random()*chars.length)]).join('')}
  function roomPeerId(code){return `gatuduell-umea-${safeRoom(code).toLowerCase()}`}
  function peerOptions(){
    const iceServers=[{urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']}];
    const turn=globalThis.ORTEN_TURN;
    if(turn?.urls) iceServers.push({urls:turn.urls,username:turn.username||undefined,credential:turn.credential||undefined});
    return {debug:1,config:{iceServers,iceCandidatePoolSize:4}};
  }

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
        $('startBtn').disabled=false;$('startBtn').textContent='Spela lokalt';$('onlineBtn').disabled=false;
        return;
      }catch(err){lastError=err;}
    }
    console.error(lastError);
    $('loadStatus').textContent='Gatunätet kunde inte hämtas. Ladda om sidan och försök igen.';
    $('startBtn').textContent='Gatunät saknas';$('onlineBtn').disabled=true;
  }

  function initMap(){
    if(map){setTimeout(()=>map.invalidateSize(false),80);return;}
    map=L.map('map',{
      zoomControl:false,minZoom:10,maxZoom:18,zoomSnap:.25,zoomDelta:.5,wheelPxPerZoomLevel:80,
      inertia:true,preferCanvas:true,dragging:true,touchZoom:true,doubleClickZoom:true,scrollWheelZoom:false,
      boxZoom:false,keyboard:false,worldCopyJump:false
    }).setView(CENTER,13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',{
      subdomains:'abcd',maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);
    routeLayer=L.layerGroup().addTo(map);
    map.on('dragstart zoomstart',markUserNavigation);
    const container=map.getContainer();
    container.addEventListener('touchstart',markUserNavigation,{passive:true});
    container.addEventListener('wheel',markUserNavigation,{passive:true});
    map.on('moveend zoomend',()=>{if(mapProgrammatic)mapProgrammatic=false});
    setTimeout(()=>map.invalidateSize(false),80);
  }
  function markUserNavigation(){if(mapProgrammatic)return;userNavigatingUntil=Date.now()+FREE_NAV_MS;$('mapHint').textContent='Fri navigering · automatisk följning pausad';}
  function withProgrammaticMap(action){mapProgrammatic=true;action();setTimeout(()=>{mapProgrammatic=false},700)}
  function focusCurrent(force=false){
    if(!map||!state?.current)return;
    if(!force&&Date.now()<userNavigatingUntil)return;
    const street=graph.get(state.current);if(!street?.lines?.length)return;
    const points=street.lines.flat().map(([lon,lat])=>[lat,lon]);
    if(!points.length)return;
    withProgrammaticMap(()=>map.flyToBounds(L.latLngBounds(points),{paddingTopLeft:[20,130],paddingBottomRight:[20,150],maxZoom:16,duration:.55}));
    $('mapHint').textContent='Dra eller nyp fritt · automatisk följning pausar när du navigerar';
  }
  function lineLayers(name,style){
    const street=graph.get(name);if(!street?.lines?.length)return[];
    return street.lines.map(coords=>L.polyline(coords.map(([lon,lat])=>[lat,lon]),{interactive:false,lineCap:'round',lineJoin:'round',...style}));
  }
  function drawStreets(focus=false){
    if(!map||!routeLayer||!state)return;
    routeLayer.clearLayers();
    state.used.slice(0,-1).forEach(name=>lineLayers(name,{color:'#7b8791',weight:4,opacity:.5}).forEach(layer=>layer.addTo(routeLayer)));
    lineLayers(state.current,{color:'#ffffff',weight:12,opacity:.92}).forEach(layer=>layer.addTo(routeLayer));
    lineLayers(state.current,{color:'#e53935',weight:7,opacity:1}).forEach(layer=>layer.addTo(routeLayer));
    if(focus)focusCurrent(false);
  }

  function saveSettings(){try{localStorage.setItem('gatuduell:name1',$('name1').value);localStorage.setItem('gatuduell:name2',$('name2').value);localStorage.setItem('gatuduell:difficulty',$('difficulty').value);localStorage.setItem('gatuduell:seconds',$('turnSeconds').value)}catch{}}
  function restoreSettings(){try{$('name1').value=localStorage.getItem('gatuduell:name1')||'Spelare 1';$('name2').value=localStorage.getItem('gatuduell:name2')||'Spelare 2';const d=localStorage.getItem('gatuduell:difficulty');if(LEVELS[d])$('difficulty').value=d;const s=localStorage.getItem('gatuduell:seconds');if([...$('turnSeconds').options].some(o=>o.value===s))$('turnSeconds').value=s}catch{}}

  function makeState(players){return {players,difficulty:$('difficulty').value,seconds:Math.max(0,Number($('turnSeconds').value)||0),round:1,turn:0,current:null,used:[],running:true,deadline:0,result:null}}
  function enterGame(){$('setupScreen').hidden=true;$('gameScreen').hidden=false;document.body.style.overflow='hidden';initMap();setTimeout(()=>map?.invalidateSize(false),100);}
  function startLocal(){if(!graph)return;leaveNetwork(false);saveSettings();state=makeState([{name:$('name1').value.trim()||'Spelare 1',score:0},{name:$('name2').value.trim()||'Spelare 2',score:0}]);enterGame();beginRound();}
  function startHostOnline(){if(net.role!=='host'||!net.guestConn?.open)return;state=makeState([{name:net.name,score:0},{name:net.guestName||'Spelare 2',score:0}]);enterGame();beginRound();sendGuest({type:'start',state:clone(state)});closeOnlineModal();}
  function enterGuestGame(remote){state=clone(remote);enterGame();render(true);syncGuestUi();closeOnlineModal();startGuestDisplayTimer();}

  function beginRound(){
    stopTimer();state.current=E.chooseStart(graph);state.used=[state.current];state.turn=(state.round-1)%2;state.running=true;state.result=null;state.deadline=0;
    $('pathHint').hidden=true;setMessage('Skriv en gata som ligger rätt från den röda gatan.');render(true);beginTurn();broadcastState();
  }
  function beginTurn(){
    if(!state?.running)return;
    const level=LEVELS[state.difficulty];const legal=E.reachableUnused(graph,state.current,state.used,level.steps);
    if(!legal.length){const loser=state.turn,winner=loser?0:1;state.players[winner].score++;return finishRound(`${state.players[loser].name} har ingen möjlig gata kvar.`,winner,false)}
    $('streetInput').value='';$('suggestions').innerHTML='';
    setMessage(`${state.players[state.turn].name}: skriv nästa gata.`);updatePlayers();setTurnInput();startTurnTimer();broadcastState();
  }
  function setTurnInput(){
    const canPlay=state?.running&&(net.role==='offline'||(net.role==='host'&&state.turn===0)||(net.role==='guest'&&state.turn===1));
    $('streetInput').disabled=!canPlay||net.pendingMove;$('submitBtn').disabled=!canPlay||net.pendingMove;
    if(!canPlay&&state?.running)setMessage(`${state.players[state.turn].name} spelar…`);
  }
  function submitMove(){
    if(!state?.running)return;const raw=$('streetInput').value.trim();if(!raw)return;
    if(net.role==='guest'){if(state.turn!==1||net.pendingMove)return;net.pendingMove=true;setTurnInput();setMessage('Skickar svaret till spelledaren…');sendHost({type:'move',raw});return;}
    if(net.role==='host'&&state.turn!==0)return;
    processMove(raw);
  }
  function processMove(raw){
    if(!state?.running)return;stopTimer();
    const level=LEVELS[state.difficulty];const result=E.validateMove(graph,state.current,raw,state.used,level.steps);
    if(!result.ok){
      const loser=state.turn,winner=loser?0:1;state.players[winner].score++;
      let why='Svaret är inte giltigt.';
      if(result.reason==='unknown')why=`${raw} finns inte i gatunätet.`;
      if(result.reason==='used')why=`${result.name} har redan använts.`;
      if(result.reason==='not-crossing')why=level.steps===1?`${result.name||raw} ansluter inte till ${state.current}.`:`${result.name||raw} ligger inte inom ${level.steps} steg från ${state.current}.`;
      return finishRound(why,winner,true);
    }
    state.current=result.name;state.used.push(result.name);state.turn=state.turn?0:1;state.deadline=0;
    if(result.steps>1){$('pathHint').textContent=`✓ ${result.steps} steg: ${result.path.join(' → ')}`;$('pathHint').hidden=false}else $('pathHint').hidden=true;
    setMessage(`Rätt! ${result.name}.`,'good');render(true);broadcastState();setTimeout(beginTurn,450);
  }
  function finishRound(reason,winnerIndex,bad=false){
    stopTimer();state.running=false;state.deadline=0;state.result={winnerIndex,reason,bad};
    $('streetInput').disabled=true;$('submitBtn').disabled=true;$('suggestions').innerHTML='';setMessage(`${reason} ${state.players[winnerIndex].name} vinner rundan.`,bad?'bad':'good');render(false);
    showResult();broadcastState();
  }
  function showResult(){
    const champ=state.players.find(p=>p.score>=TARGET);const result=state.result;
    $('resultScore').innerHTML=`<span>${esc(state.players[0].name)}</span><strong>${state.players[0].score}–${state.players[1].score}</strong><span>${esc(state.players[1].name)}</span>`;
    if(champ){resultMode='restart';$('resultEyebrow').textContent='MATCH AVGJORD';$('resultTitle').textContent=`${champ.name} vinner matchen!`;$('resultText').textContent=result?.reason||'';$('resultBtn').textContent=net.role==='guest'?'Väntar på spelledaren…':'Ny match';}
    else{resultMode='next';const winner=state.players[result?.winnerIndex??0];$('resultEyebrow').textContent='RUNDA AVGJORD';$('resultTitle').textContent=`${winner.name} vinner rundan`;$('resultText').textContent=result?.reason||'';$('resultBtn').textContent=net.role==='guest'?'Väntar på spelledaren…':'Nästa runda';}
    $('resultBtn').disabled=net.role==='guest';setTimeout(()=>$('resultModal').hidden=false,250);
  }
  function nextResult(){if(net.role==='guest')return;$('resultModal').hidden=true;if(resultMode==='restart'){backToSetup();broadcastState();return;}state.round++;beginRound();}
  function backToSetup(){stopTimer();stopDisplayTimer();state=null;routeLayer?.clearLayers();$('gameScreen').hidden=true;$('setupScreen').hidden=false;$('resultModal').hidden=true;document.body.style.overflow='';if(net.role!=='offline')leaveNetwork(true);}

  function startTurnTimer(){
    stopTimer();const seconds=state.seconds;
    if(!seconds){state.deadline=0;$('timerTrack').hidden=true;$('timerText').textContent='Ingen tidsgräns';return}
    state.deadline=Date.now()+seconds*1000;$('timerTrack').hidden=false;
    const tick=()=>{const left=Math.max(0,state.deadline-Date.now());paintTimer(left,seconds);if(left<=0){stopTimer();if(net.role==='guest')return;const loser=state.turn,winner=loser?0:1;state.players[winner].score++;finishRound('Tiden tog slut.',winner,true)}};
    tick();timer=setInterval(tick,100);
  }
  function startGuestDisplayTimer(){stopDisplayTimer();displayTimer=setInterval(()=>{if(!state?.running)return;if(!state.seconds||!state.deadline){$('timerTrack').hidden=true;$('timerText').textContent=state.seconds?'—':'Ingen tidsgräns';return}$('timerTrack').hidden=false;paintTimer(Math.max(0,state.deadline-Date.now()),state.seconds)},100)}
  function paintTimer(left,seconds){$('timerText').textContent=`${Math.ceil(left/1000)} sek`;$('timerBar').style.width=`${Math.max(0,Math.min(100,left/(seconds*1000)*100))}%`}
  function stopTimer(){if(timer){clearInterval(timer);timer=null}}
  function stopDisplayTimer(){if(displayTimer){clearInterval(displayTimer);displayTimer=null}}

  function render(focus=false){if(!state)return;$('p1Name').textContent=state.players[0].name;$('p2Name').textContent=state.players[1].name;$('p1Score').textContent=state.players[0].score;$('p2Score').textContent=state.players[1].score;$('roundNo').textContent=state.round;$('currentStreet').textContent=state.current||'—';const level=LEVELS[state.difficulty];$('difficultyBadge').textContent=`${level.icon} ${level.label}${level.steps>1?` · ${level.steps} steg`:''}`;updatePlayers();drawStreets(focus);setTurnInput();}
  function updatePlayers(){$('p1').classList.toggle('active',state.running&&state.turn===0);$('p2').classList.toggle('active',state.running&&state.turn===1)}
  function renderSuggestions(){if(!graph||!state?.running||$('streetInput').disabled)return $('suggestions').innerHTML='';const q=$('streetInput').value;if(q.trim().length<2)return $('suggestions').innerHTML='';$('suggestions').innerHTML=E.suggestions(graph,q,6).map(name=>`<button type="button" data-name="${esc(name)}">${esc(name)}</button>`).join('')}
  function setMessage(text,type=''){const el=$('message');el.textContent=text;el.className=`message${type?` ${type}`:''}`}

  async function ensurePeer(){if(globalThis.Peer)return globalThis.Peer;if(net.peerPromise)return net.peerPromise;net.peerPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=PEERJS_URL;s.async=true;s.onload=()=>globalThis.Peer?resolve(globalThis.Peer):reject(new Error('PeerJS kunde inte starta'));s.onerror=()=>reject(new Error('PeerJS kunde inte laddas'));document.head.appendChild(s)}).catch(e=>{net.peerPromise=null;throw e});return net.peerPromise;}
  function closePeer(){try{net.conn?.close()}catch{}try{net.guestConn?.close()}catch{}try{net.peer?.destroy()}catch{}net.conn=null;net.guestConn=null;net.peer=null;net.pendingMove=false}
  function leaveNetwork(closeModal=true){closePeer();net.role='offline';net.room='';net.name='';net.guestName='';net.status='offline';if(closeModal)closeOnlineModal();renderOnlineStatus()}
  function sendGuest(msg){if(net.guestConn?.open)net.guestConn.send(msg)}
  function sendHost(msg){if(net.conn?.open)net.conn.send(msg)}
  function broadcastState(){if(net.role==='host'&&state)sendGuest({type:'state',state:clone(state)})}
  function applyRemoteState(remote){state=clone(remote);net.pendingMove=false;if($('gameScreen').hidden)enterGuestGame(state);else{render(false);setTurnInput()}if(!state.running&&state.result)showResult();else $('resultModal').hidden=true;if(net.role==='guest')startGuestDisplayTimer();}
  async function createRoom(){
    if(!graph)return;const name=$('onlineName').value.trim()||'Spelledare';const code=safeRoom($('roomCodeCreate').value||makeRoom());
    closePeer();net.role='host';net.name=name;net.room=code;net.status='connecting';renderOnlineStatus();
    try{const PeerCtor=await ensurePeer();const peer=new PeerCtor(roomPeerId(code),peerOptions());net.peer=peer;peer.on('open',()=>{net.status='waiting';renderOnlineStatus()});peer.on('connection',conn=>{if(net.guestConn?.open){conn.close();return}net.guestConn=conn;attachHostConnection(conn)});peer.on('error',err=>{net.status='error';$('onlineError').textContent=networkError(err?.type);renderOnlineStatus()});}catch(err){net.status='error';$('onlineError').textContent=err.message;renderOnlineStatus()}
  }
  function attachHostConnection(conn){
    conn.on('open',()=>{net.status='waiting';renderOnlineStatus()});
    conn.on('data',msg=>{if(msg?.type==='hello'){net.guestName=String(msg.name||'Spelare 2').slice(0,24);net.status='ready';sendGuest({type:'lobby',hostName:net.name,guestName:net.guestName,settings:{difficulty:$('difficulty').value,seconds:Number($('turnSeconds').value)}});renderOnlineStatus();}if(msg?.type==='move'&&state?.running&&state.turn===1)processMove(String(msg.raw||''));});
    conn.on('close',()=>{net.status='waiting';net.guestName='';renderOnlineStatus();if(state?.running)setMessage('Motspelaren kopplades från.','bad')});
  }
  async function joinRoom(){
    if(!graph)return;const name=$('onlineName').value.trim()||'Spelare';const code=safeRoom($('roomCodeJoin').value);if(!code){$('onlineError').textContent='Skriv rumskoden.';return}
    closePeer();net.role='guest';net.name=name;net.room=code;net.status='connecting';renderOnlineStatus();
    try{const PeerCtor=await ensurePeer();const peer=new PeerCtor(undefined,peerOptions());net.peer=peer;peer.on('open',()=>{const conn=peer.connect(roomPeerId(code),{reliable:true});net.conn=conn;attachGuestConnection(conn)});peer.on('error',err=>{net.status='error';$('onlineError').textContent=networkError(err?.type);renderOnlineStatus()});}catch(err){net.status='error';$('onlineError').textContent=err.message;renderOnlineStatus()}
  }
  function attachGuestConnection(conn){
    conn.on('open',()=>{net.status='connected';conn.send({type:'hello',name:net.name});renderOnlineStatus()});
    conn.on('data',msg=>{if(msg?.type==='lobby'){net.status='ready';net.guestName=msg.hostName||'Spelledare';renderOnlineStatus()}if(msg?.type==='start'){applyRemoteState(msg.state);closeOnlineModal()}if(msg?.type==='state')applyRemoteState(msg.state);});
    conn.on('close',()=>{net.status='error';$('onlineError').textContent='Anslutningen till spelledaren bröts.';renderOnlineStatus();if(state?.running)setMessage('Anslutningen bröts.','bad')});
  }
  function networkError(type){if(!navigator.onLine)return'Ingen internetanslutning.';if(type==='peer-unavailable')return'Rummet hittades inte. Kontrollera rumskoden.';if(type==='unavailable-id')return'Rumskoden används redan.';return'Anslutningen misslyckades. Försök igen.'}
  function openOnlineModal(){$('onlineModal').hidden=false;if(!$('roomCodeCreate').value)$('roomCodeCreate').value=makeRoom();renderOnlineStatus()}
  function closeOnlineModal(){$('onlineModal').hidden=true}
  function renderOnlineStatus(){const status=$('onlineStatus');if(!status)return;const labels={offline:'Inte ansluten',connecting:'Ansluter…',waiting:'Väntar på spelare',connected:'Ansluten',ready:'Två spelare anslutna',error:'Anslutningsfel'};status.textContent=labels[net.status]||net.status;$('onlineRoomLive').textContent=net.room?`Rum ${net.room}`:'';$('onlineGuestLive').textContent=net.role==='host'&&net.guestName?`Motspelare: ${net.guestName}`:net.role==='guest'&&net.status==='ready'?'Väntar på att spelledaren startar…':'';$('onlineStartGame').hidden=net.role!=='host';$('onlineStartGame').disabled=net.status!=='ready';$('leaveOnlineBtn').hidden=net.role==='offline';}
  function syncGuestUi(){setTurnInput();}

  $('startBtn').addEventListener('click',startLocal);$('onlineBtn').addEventListener('click',openOnlineModal);
  $('answerForm').addEventListener('submit',e=>{e.preventDefault();submitMove()});
  $('streetInput').addEventListener('input',renderSuggestions);
  $('suggestions').addEventListener('click',e=>{const b=e.target.closest('button[data-name]');if(!b)return;$('streetInput').value=b.dataset.name;$('suggestions').innerHTML='';$('streetInput').focus({preventScroll:true})});
  $('recenterBtn').addEventListener('click',()=>focusCurrent(true));$('newMatchBtn').addEventListener('click',backToSetup);$('resultBtn').addEventListener('click',nextResult);
  $('onlineClose').addEventListener('click',closeOnlineModal);$('createRoomBtn').addEventListener('click',createRoom);$('joinRoomBtn').addEventListener('click',joinRoom);$('onlineStartGame').addEventListener('click',startHostOnline);$('leaveOnlineBtn').addEventListener('click',()=>leaveNetwork(false));
  restoreSettings();$('roomCodeCreate').value=makeRoom();void loadGraph();
})();