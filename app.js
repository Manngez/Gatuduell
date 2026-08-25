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
  const net={role:'offline',peer:null,conn:null,connections:new Map(),room:'',name:'',status:'offline',peerPromise:null,pendingMove:false,playerId:'',hostPlayerId:'',hostMode:'master',heartbeat:null,reconnect:null,lastPong:0,seenMoves:new Set(),pending:new Map()};

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
    if(!map||!state?.currentStreet)return;
    if(!force&&Date.now()<userNavigatingUntil)return;
    const street=graph.get(state.currentStreet);if(!street?.lines?.length)return;
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
    state.usedStreets.slice(0,-1).forEach(name=>lineLayers(name,{color:'#7b8791',weight:4,opacity:.5}).forEach(layer=>layer.addTo(routeLayer)));
    lineLayers(state.currentStreet,{color:'#ffffff',weight:12,opacity:.92}).forEach(layer=>layer.addTo(routeLayer));
    lineLayers(state.currentStreet,{color:'#e53935',weight:7,opacity:1}).forEach(layer=>layer.addTo(routeLayer));
    if(focus)focusCurrent(false);
  }

  function saveSettings(){try{localStorage.setItem('gatuduell:name1',$('name1').value);localStorage.setItem('gatuduell:name2',$('name2').value);localStorage.setItem('gatuduell:difficulty',$('difficulty').value);localStorage.setItem('gatuduell:seconds',$('turnSeconds').value)}catch{}}
  function restoreSettings(){try{$('name1').value=localStorage.getItem('gatuduell:name1')||'Spelare 1';$('name2').value=localStorage.getItem('gatuduell:name2')||'Spelare 2';const d=localStorage.getItem('gatuduell:difficulty');if(LEVELS[d])$('difficulty').value=d;const s=localStorage.getItem('gatuduell:seconds');if([...$('turnSeconds').options].some(o=>o.value===s))$('turnSeconds').value=s}catch{}}

  function makePlayer(id,name,extra={}){return {id,name,score:0,active:true,connected:true,approved:true,joinedAt:Date.now(),isGameMaster:false,...extra}}
  function makeState(players,settings={}){return {roomId:net.room||'LOCAL',revision:0,status:'LOBBY',hostId:net.playerId||'local',gameMasterId:net.playerId||'local',players,playerOrder:players.filter(p=>p.active).map(p=>p.id),currentPlayer:null,currentStreet:null,usedStreets:[],scores:Object.fromEntries(players.map(p=>[p.id,0])),round:1,difficulty:settings.difficulty||$('difficulty').value,timeLimit:Number(settings.timeLimit??$('turnSeconds').value)||0,deadline:0,winner:null,gameStatus:'LOBBY',result:null,lastAnswer:null,updatedAt:Date.now()}}
  function bump(){if(state){state.revision=(state.revision||0)+1;state.updatedAt=Date.now()}}
  function activePlayers(){return state.players.filter(p=>p.active&&p.approved)}
  function currentIndex(){return Math.max(0,state.playerOrder.indexOf(state.currentPlayer))}
  function nextPlayer(from=state.currentPlayer){const order=state.playerOrder.filter(id=>state.players.some(p=>p.id===id&&p.active));if(!order.length)return null;const i=order.indexOf(from);return order[(i+1+order.length)%order.length]}
  function enterGame(){$('setupScreen').hidden=true;$('gameScreen').hidden=false;document.body.style.overflow='hidden';initMap();setTimeout(()=>map?.invalidateSize(false),100);}
  function startLocal(){if(!graph)return;leaveNetwork(false);saveSettings();state=makeState([makePlayer('local-1',$('name1').value.trim()||'Spelare 1'),makePlayer('local-2',$('name2').value.trim()||'Spelare 2')]);state.playerOrder=['local-1','local-2'];enterGame();beginRound();}
  function startHostOnline(){if(net.role!=='host'||activePlayers().length<2)return;state.difficulty=$('onlineDifficulty').value;state.timeLimit=Number($('onlineSeconds').value)||0;state.status=state.gameStatus='STARTING';bump();broadcastState();enterGame();beginRound();closeOnlineModal();}
  function enterGuestGame(remote){state=clone(remote);enterGame();render(true);syncGuestUi();closeOnlineModal();startGuestDisplayTimer();}

  function beginRound(){
    stopTimer();state.currentStreet=E.chooseStart(graph);state.usedStreets=[state.currentStreet];state.currentPlayer=state.playerOrder[(state.round-1)%state.playerOrder.length];state.status=state.gameStatus='PLAYING';state.result=null;state.deadline=0;bump();
    $('pathHint').hidden=true;setMessage('Skriv en gata som ligger rätt från den röda gatan.');render(true);beginTurn();broadcastState();
  }
  function beginTurn(){
    if(state?.gameStatus!=='PLAYING')return;
    const level=LEVELS[state.difficulty];const legal=E.reachableUnused(graph,state.currentStreet,state.usedStreets,level.steps);const player=state.players.find(p=>p.id===state.currentPlayer);
    if(!legal.length){return finishRound(`${player.name} har ingen möjlig gata kvar.`,nextPlayer(),false)}
    $('streetInput').value='';$('suggestions').innerHTML='';
    setMessage(`${player.name}: skriv nästa gata.`);updatePlayers();setTurnInput();startTurnTimer();bump();broadcastState();
  }
  function setTurnInput(){
    const canPlay=state?.gameStatus==='PLAYING'&&(net.role==='offline'||state.currentPlayer===net.playerId);
    $('streetInput').disabled=!canPlay||net.pendingMove;$('submitBtn').disabled=!canPlay||net.pendingMove;
    if(!canPlay&&state?.gameStatus==='PLAYING')setMessage(`${state.players.find(p=>p.id===state.currentPlayer)?.name||'Nästa spelare'} spelar…`);
  }
  function submitMove(){
    if(state?.gameStatus!=='PLAYING')return;const raw=$('streetInput').value.trim();if(!raw)return;
    if(net.role==='guest'){if(state.currentPlayer!==net.playerId||net.pendingMove)return;net.pendingMove=true;setTurnInput();setMessage('Skickar svaret till spelledaren…');sendHost({type:'move',raw,playerId:net.playerId,moveId:crypto.randomUUID(),revision:state.revision});return;}
    if(net.role==='host'&&state.currentPlayer!==net.playerId)return;
    processMove(raw);
  }
  function processMove(raw){
    if(state?.gameStatus!=='PLAYING')return;stopTimer();const player=state.players.find(p=>p.id===state.currentPlayer);
    const level=LEVELS[state.difficulty];const result=E.validateMove(graph,state.currentStreet,raw,state.usedStreets,level.steps);state.lastAnswer={playerId:player.id,raw,at:Date.now(),result};
    if(!result.ok){
      const winner=nextPlayer();
      let why='Svaret är inte giltigt.';
      if(result.reason==='unknown')why=`${raw} finns inte i gatunätet.`;
      if(result.reason==='used')why=`${result.name} har redan använts.`;
      if(result.reason==='not-crossing')why=level.steps===1?`${result.name||raw} ansluter inte till ${state.currentStreet}.`:`${result.name||raw} ligger inte inom ${level.steps} steg från ${state.currentStreet}.`;
      return finishRound(why,winner,true);
    }
    state.currentStreet=result.name;state.usedStreets.push(result.name);state.currentPlayer=nextPlayer();state.deadline=0;bump();
    if(result.steps>1){$('pathHint').textContent=`✓ ${result.steps} steg: ${result.path.join(' → ')}`;$('pathHint').hidden=false}else $('pathHint').hidden=true;
    setMessage(`Rätt! ${result.name}.`,'good');render(true);broadcastState();setTimeout(beginTurn,450);
  }
  function finishRound(reason,winnerId,bad=false){
    stopTimer();state.status=state.gameStatus='ROUND_END';state.deadline=0;state.winner=winnerId;state.result={winnerId,reason,bad};const winner=state.players.find(p=>p.id===winnerId);if(winner){winner.score++;state.scores[winner.id]=winner.score;if(winner.score>=TARGET)state.status=state.gameStatus='GAME_OVER'}bump();
    $('streetInput').disabled=true;$('submitBtn').disabled=true;$('suggestions').innerHTML='';setMessage(`${reason} ${winner?.name||''} vinner rundan.`,bad?'bad':'good');render(false);
    showResult();broadcastState();
  }
  function showResult(){
    const champ=state.players.find(p=>p.score>=TARGET);const result=state.result;
    $('resultScore').innerHTML=state.players.filter(p=>p.active).map(p=>`<span>${esc(p.name)} <strong>${p.score}</strong></span>`).join('');
    if(champ){resultMode='restart';$('resultEyebrow').textContent='MATCH AVGJORD';$('resultTitle').textContent=`${champ.name} vinner matchen!`;$('resultText').textContent=result?.reason||'';$('resultBtn').textContent=net.role==='guest'?'Väntar på spelledaren…':'Ny match';}
    else{resultMode='next';const winner=state.players.find(p=>p.id===result?.winnerId);$('resultEyebrow').textContent='RUNDA AVGJORD';$('resultTitle').textContent=`${winner?.name||'En spelare'} vinner rundan`;$('resultText').textContent=result?.reason||'';$('resultBtn').textContent=net.role==='guest'?'Väntar på spelledaren…':'Nästa runda';}
    $('resultBtn').disabled=net.role==='guest';setTimeout(()=>$('resultModal').hidden=false,250);
  }
  function nextResult(){if(net.role==='guest')return;$('resultModal').hidden=true;if(resultMode==='restart'){backToSetup();broadcastState();return;}state.round++;beginRound();}
  function backToSetup(){stopTimer();stopDisplayTimer();if(net.role==='host'&&state){state.status=state.gameStatus='CLOSED';bump();broadcastState()}state=null;routeLayer?.clearLayers();$('gameScreen').hidden=true;$('setupScreen').hidden=false;$('resultModal').hidden=true;document.body.style.overflow='';if(net.role!=='offline')leaveNetwork(true);}

  function startTurnTimer(){
    stopTimer();const seconds=state.timeLimit;
    if(!seconds){state.deadline=0;$('timerTrack').hidden=true;$('timerText').textContent='Ingen tidsgräns';return}
    state.deadline=Date.now()+seconds*1000;$('timerTrack').hidden=false;
    const tick=()=>{const left=Math.max(0,state.deadline-Date.now());paintTimer(left,seconds);if(left<=0){stopTimer();if(net.role==='guest')return;finishRound('Tiden tog slut.',nextPlayer(),true)}};
    tick();timer=setInterval(tick,100);
  }
  function startGuestDisplayTimer(){stopDisplayTimer();displayTimer=setInterval(()=>{if(state?.gameStatus!=='PLAYING')return;if(!state.timeLimit||!state.deadline){$('timerTrack').hidden=true;$('timerText').textContent=state.timeLimit?'—':'Ingen tidsgräns';return}$('timerTrack').hidden=false;paintTimer(Math.max(0,state.deadline-Date.now()),state.timeLimit)},100)}
  function paintTimer(left,seconds){$('timerText').textContent=`${Math.ceil(left/1000)} sek`;$('timerBar').style.width=`${Math.max(0,Math.min(100,left/(seconds*1000)*100))}%`}
  function stopTimer(){if(timer){clearInterval(timer);timer=null}}
  function stopDisplayTimer(){if(displayTimer){clearInterval(displayTimer);displayTimer=null}}

  function render(focus=false){if(!state)return;$('roundNo').textContent=state.round;$('currentStreet').textContent=state.currentStreet||'—';const level=LEVELS[state.difficulty];$('difficultyBadge').textContent=`${level.icon} ${level.label}${level.steps>1?` · ${level.steps} steg`:''}`;updatePlayers();drawStreets(focus);setTurnInput();$('hostPanel').hidden=net.role!=='host';}
  function updatePlayers(){$('playerStrip').innerHTML=state.players.filter(p=>p.approved&&p.active).map(p=>`<div class="player ${p.id===state.currentPlayer&&state.gameStatus==='PLAYING'?'active':''} ${p.connected?'':'offline'}"><span>${esc(p.name)}${p.id===state.hostId?' 👑':''}</span><b>${p.score}</b></div>`).join('')}
  function renderSuggestions(){if(!graph||state?.gameStatus!=='PLAYING'||$('streetInput').disabled)return $('suggestions').innerHTML='';const q=$('streetInput').value;if(q.trim().length<2)return $('suggestions').innerHTML='';$('suggestions').innerHTML=E.suggestions(graph,q,6).map(name=>`<button type="button" data-name="${esc(name)}">${esc(name)}</button>`).join('')}
  function setMessage(text,type=''){const el=$('message');el.textContent=text;el.className=`message${type?` ${type}`:''}`}

  async function ensurePeer(){if(globalThis.Peer)return globalThis.Peer;if(net.peerPromise)return net.peerPromise;net.peerPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=PEERJS_URL;s.async=true;s.onload=()=>globalThis.Peer?resolve(globalThis.Peer):reject(new Error('PeerJS kunde inte starta'));s.onerror=()=>reject(new Error('PeerJS kunde inte laddas'));document.head.appendChild(s)}).catch(e=>{net.peerPromise=null;throw e});return net.peerPromise;}
  function closePeer(){clearInterval(net.heartbeat);clearTimeout(net.reconnect);try{net.conn?.close()}catch{}for(const c of net.connections.values())try{c.close()}catch{}try{net.peer?.destroy()}catch{}net.connections.clear();net.conn=null;net.peer=null;net.pendingMove=false}
  function leaveNetwork(closeModal=true){closePeer();net.role='offline';net.room='';net.name='';net.status='offline';net.playerId='';state=null;if(closeModal)closeOnlineModal();renderOnlineStatus()}
  function sendHost(msg){if(net.conn?.open)net.conn.send(msg)}
  function broadcast(msg){for(const c of net.connections.values())if(c.open)c.send(msg)}
  function broadcastState(){if(net.role==='host'&&state){const packet={type:'state',state:clone(state)};broadcast(packet);renderOnlineStatus()}}
  function applyRemoteState(remote){if(!remote||remote.roomId!==net.room||(state&&remote.revision<=state.revision))return;state=clone(remote);net.hostPlayerId=state.hostId;net.pendingMove=false;if(state.gameStatus==='PLAYING'&&$('gameScreen').hidden)enterGuestGame(state);else if(!$('gameScreen').hidden){render(false);setTurnInput()}if((state.gameStatus==='ROUND_END'||state.gameStatus==='GAME_OVER')&&state.result)showResult();else $('resultModal').hidden=true;renderOnlineStatus();startGuestDisplayTimer();}
  function uniqueName(name){const base=String(name||'Spelare').trim().slice(0,24)||'Spelare';const taken=new Set(state.players.map(p=>p.name.toLocaleLowerCase('sv')));if(!taken.has(base.toLocaleLowerCase('sv')))return base;let i=2;while(taken.has(`${base} ${i}`.toLocaleLowerCase('sv')))i++;return `${base} ${i}`}
  async function createRoom(){
    if(!graph)return;const name=$('onlineName').value.trim()||'Spelledare';const code=safeRoom($('roomCodeCreate').value||makeRoom());
    closePeer();net.role='host';net.name=name;net.room=code;net.hostMode=document.querySelector('input[name="hostRole"]:checked').value;net.playerId=crypto.randomUUID();net.hostPlayerId=net.playerId;net.status='connecting';const host=makePlayer(net.playerId,name,{active:net.hostMode==='player',isGameMaster:true});state=makeState([host],{difficulty:$('onlineDifficulty').value,timeLimit:$('onlineSeconds').value});state.hostId=state.gameMasterId=net.playerId;renderOnlineStatus();
    try{const PeerCtor=await ensurePeer();const peer=new PeerCtor(roomPeerId(code),peerOptions());net.peer=peer;peer.on('open',()=>{net.status='waiting';startHeartbeat();renderOnlineStatus()});peer.on('connection',attachHostConnection);peer.on('error',err=>{net.status='error';$('onlineError').textContent=networkError(err?.type);renderOnlineStatus()});}catch(err){net.status='error';$('onlineError').textContent=err.message;renderOnlineStatus()}
  }
  function attachHostConnection(conn){
    let id='';conn.on('data',msg=>{if(msg?.type==='hello'){id=String(msg.playerId||'');const old=state.players.find(p=>p.id===id);if(old){old.connected=true;net.connections.set(id,conn);conn.send({type:'welcome',playerId:id,state:clone(state)});bump();broadcastState();return}if(state.players.filter(p=>p.connected).length>=10){conn.send({type:'reject',reason:'Rummet är fullt · max 10 deltagare'});return conn.close()}const player=makePlayer(id||crypto.randomUUID(),uniqueName(msg.name),{approved:false,peerId:conn.peer});id=player.id;state.players.push(player);net.connections.set(id,conn);net.pending.set(id,player);bump();broadcastState();renderOnlineStatus()}if(msg?.type==='pong'){const p=state.players.find(x=>x.id===id);if(p)p.connected=true}if(msg?.type==='move'&&id===state.currentPlayer&&!net.seenMoves.has(msg.moveId)&&msg.revision===state.revision){net.seenMoves.add(msg.moveId);processMove(String(msg.raw||''))}});
    conn.on('close',()=>{net.connections.delete(id);const p=state?.players.find(x=>x.id===id);if(p){p.connected=false;bump();broadcastState()}renderOnlineStatus()});
  }
  async function joinRoom(){
    if(!graph)return;const name=$('onlineName').value.trim()||'Spelare';const code=safeRoom($('roomCodeJoin').value);if(!code){$('onlineError').textContent='Skriv rumskoden.';return}
    closePeer();net.role='guest';net.name=name;net.room=code;net.playerId=localStorage.getItem(`gatuduell:player:${code}`)||crypto.randomUUID();localStorage.setItem(`gatuduell:player:${code}`,net.playerId);net.status='connecting';renderOnlineStatus();
    try{const PeerCtor=await ensurePeer();const peer=new PeerCtor(undefined,peerOptions());net.peer=peer;peer.on('open',connectToHost);peer.on('error',err=>{net.status='error';$('onlineError').textContent=networkError(err?.type);renderOnlineStatus()});}catch(err){net.status='error';$('onlineError').textContent=err.message;renderOnlineStatus()}
  }
  function connectToHost(){if(net.role!=='guest'||!net.peer)return;net.status=state?'reconnecting':'connecting';renderOnlineStatus();const conn=net.peer.connect(roomPeerId(net.room),{reliable:true});net.conn=conn;attachGuestConnection(conn)}
  function migrationCandidate(){if(!state)return null;const eligible=state.players.filter(p=>p.id!==state.hostId&&p.approved&&p.active&&p.connected);return eligible.find(p=>p.isGameMaster)||eligible.sort((a,b)=>a.joinedAt-b.joinedAt)[0]||null}
  async function scheduleHostMigration(){const candidate=migrationCandidate();if(!candidate){net.reconnect=setTimeout(connectToHost,2200);return}if(candidate.id!==net.playerId){net.reconnect=setTimeout(connectToHost,4200);return}net.status='reconnecting';renderOnlineStatus();await new Promise(resolve=>setTimeout(resolve,1400));if(net.conn?.open)return;try{net.peer?.destroy();const PeerCtor=await ensurePeer();const peer=new PeerCtor(roomPeerId(net.room),peerOptions());net.peer=peer;peer.on('open',()=>{net.role='host';net.hostPlayerId=net.playerId;state.hostId=net.playerId;const me=state.players.find(p=>p.id===net.playerId);if(me)me.isGameMaster=true;bump();net.status='ready';startHeartbeat();broadcastState();renderOnlineStatus();setMessage(`${me?.name||'En spelare'} är nu värd för rummet.`,'good')});peer.on('connection',attachHostConnection);peer.on('error',()=>{net.role='guest';net.reconnect=setTimeout(connectToHost,2500)})}catch{net.reconnect=setTimeout(connectToHost,2500)}}
  function attachGuestConnection(conn){
    conn.on('open',()=>{net.status='connected';conn.send({type:'hello',name:net.name,playerId:net.playerId,peerId:net.peer.id});renderOnlineStatus()});
    conn.on('data',msg=>{if(msg?.type==='welcome'){net.playerId=msg.playerId;net.status='ready';state=null;applyRemoteState(msg.state)}if(msg?.type==='state')applyRemoteState(msg.state);if(msg?.type==='ping')conn.send({type:'pong',at:Date.now()});if(msg?.type==='reject'){$('onlineError').textContent=msg.reason;net.status='error'}if(msg?.type==='kick'){$('onlineError').textContent='Du har tagits bort från rummet.';leaveNetwork(false)}renderOnlineStatus()});
    conn.on('close',()=>{if(net.role!=='guest')return;net.status='reconnecting';renderOnlineStatus();if(state?.gameStatus==='PLAYING')setMessage('Återansluter…','bad');clearTimeout(net.reconnect);void scheduleHostMigration()});
  }
  function startHeartbeat(){clearInterval(net.heartbeat);net.heartbeat=setInterval(()=>{if(net.role!=='host')return;broadcast({type:'ping',at:Date.now()})},5000)}
  function networkError(type){if(!navigator.onLine)return'Ingen internetanslutning.';if(type==='peer-unavailable')return'Rummet hittades inte. Kontrollera rumskoden.';if(type==='unavailable-id')return'Rumskoden används redan.';return'Anslutningen misslyckades. Försök igen.'}
  function openOnlineModal(){$('onlineModal').hidden=false;if(!$('roomCodeCreate').value)$('roomCodeCreate').value=makeRoom();renderOnlineStatus()}
  function closeOnlineModal(){$('onlineModal').hidden=true}
  function renderOnlineStatus(){const status=$('onlineStatus');if(!status)return;const labels={offline:'Inte ansluten',connecting:'Ansluter…',reconnecting:'Återansluter…',waiting:'Rummet är öppet',connected:'Ansluten · inväntar godkännande',ready:'Ansluten',error:'Anslutningsfel'};status.textContent=labels[net.status]||net.status;$('onlineRoomLive').textContent=net.room?`Rum ${net.room}`:'';const players=state?.players||[];$('onlineGuestLive').textContent=net.role==='guest'?'Väntar på att värden startar matchen…':net.hostMode==='player'?'VÄRD · SPELARE':'SPELLEDARE';$('lobbyPlayers').innerHTML=players.map(p=>`<li class="${p.approved?'':'pending'}"><span>${esc(p.name)}${p.id===state?.hostId?' 👑':''}${p.isGameMaster?' · spelledare':''}</span>${net.role==='host'&&p.id!==net.playerId?`<span>${p.approved?`<button data-up="${p.id}">↑</button><button data-down="${p.id}">↓</button>`:`<button data-approve="${p.id}">Godkänn</button>`}<button class="kick" data-kick="${p.id}">Ta bort</button></span>`:''}</li>`).join('');$('lobbyCount').textContent=`${players.filter(p=>p.connected).length} / 10 anslutna`;$('onlineStartGame').hidden=net.role!=='host';$('onlineStartGame').disabled=net.role!=='host'||activePlayers().length<2;$('lobbySettings').hidden=net.role!=='host'||state?.gameStatus!=='LOBBY';$('leaveOnlineBtn').hidden=net.role==='offline';}
  function syncGuestUi(){setTurnInput();}
  function approvePlayer(id){if(net.role!=='host'||state.gameStatus!=='LOBBY')return;const p=state.players.find(x=>x.id===id);if(!p)return;p.approved=true;p.active=true;if(!state.playerOrder.includes(id))state.playerOrder.push(id);net.pending.delete(id);bump();broadcastState();renderOnlineStatus()}
  function kickPlayer(id){if(net.role!=='host')return;net.connections.get(id)?.send({type:'kick'});net.connections.get(id)?.close();state.players=state.players.filter(p=>p.id!==id);state.playerOrder=state.playerOrder.filter(x=>x!==id);net.connections.delete(id);bump();broadcastState();renderOnlineStatus()}
  function movePlayer(id,delta){if(net.role!=='host'||state.gameStatus!=='LOBBY')return;const i=state.playerOrder.indexOf(id),j=i+delta;if(i<0||j<0||j>=state.playerOrder.length)return;[state.playerOrder[i],state.playerOrder[j]]=[state.playerOrder[j],state.playerOrder[i]];bump();broadcastState();renderOnlineStatus()}
  function hostAction(action){if(net.role!=='host'||!state)return;if(action==='pause'&&state.gameStatus==='PLAYING'){stopTimer();state.status=state.gameStatus='PAUSED'}if(action==='resume'&&state.gameStatus==='PAUSED'){state.status=state.gameStatus='PLAYING';startTurnTimer()}if(action==='skip'&&state.gameStatus==='PLAYING'){state.currentPlayer=nextPlayer();beginTurn();return}if(action==='end-round'&&state.gameStatus==='PLAYING')return finishRound('Spelledaren avslutade rundan.',nextPlayer(),false);if(action==='restart'){for(const p of state.players)p.score=0;state.scores=Object.fromEntries(state.players.map(p=>[p.id,0]));state.round=1;beginRound();return}bump();broadcastState();render(false)}

  $('startBtn').addEventListener('click',startLocal);$('onlineBtn').addEventListener('click',openOnlineModal);
  $('answerForm').addEventListener('submit',e=>{e.preventDefault();submitMove()});
  $('streetInput').addEventListener('input',renderSuggestions);
  $('suggestions').addEventListener('click',e=>{const b=e.target.closest('button[data-name]');if(!b)return;$('streetInput').value=b.dataset.name;$('suggestions').innerHTML='';$('streetInput').focus({preventScroll:true})});
  $('recenterBtn').addEventListener('click',()=>focusCurrent(true));$('newMatchBtn').addEventListener('click',backToSetup);$('resultBtn').addEventListener('click',nextResult);
  $('onlineClose').addEventListener('click',closeOnlineModal);$('createRoomBtn').addEventListener('click',createRoom);$('joinRoomBtn').addEventListener('click',joinRoom);$('onlineStartGame').addEventListener('click',startHostOnline);$('leaveOnlineBtn').addEventListener('click',()=>leaveNetwork(false));
  $('lobbyPlayers').addEventListener('click',e=>{const approve=e.target.closest('[data-approve]'),kick=e.target.closest('[data-kick]'),up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');if(approve)approvePlayer(approve.dataset.approve);if(kick)kickPlayer(kick.dataset.kick);if(up)movePlayer(up.dataset.up,-1);if(down)movePlayer(down.dataset.down,1)});
  $('onlineDifficulty').addEventListener('change',()=>{if(net.role==='host'&&state?.gameStatus==='LOBBY'){state.difficulty=$('onlineDifficulty').value;bump();broadcastState()}});$('onlineSeconds').addEventListener('change',()=>{if(net.role==='host'&&state?.gameStatus==='LOBBY'){state.timeLimit=Number($('onlineSeconds').value)||0;bump();broadcastState()}});
  $('hostPanelToggle').addEventListener('click',()=>{$('hostPanelBody').hidden=!$('hostPanelBody').hidden});$('hostPanelBody').addEventListener('click',e=>{const b=e.target.closest('[data-host-action]');if(b)hostAction(b.dataset.hostAction)});
  restoreSettings();$('roomCodeCreate').value=makeRoom();void loadGraph();
})();
