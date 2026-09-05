import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), E=require('../engine.js');
function harness(){
  const elements=new Map(), intervals=new Map(), timeouts=new Map();let clock=100000, seq=0;
  const el=id=>{if(!elements.has(id))elements.set(id,{value:'',hidden:false,style:{},textContent:'',innerHTML:'',disabled:false,options:[],addEventListener(){},focus(){}});return elements.get(id)};
  el('gameScreen').hidden=false;
  const peers=[];
  class Peer{constructor(){this.events={};peers.push(this)}on(k,f){this.events[k]=f}destroy(){this.destroyed=true}connect(){return connection()}reconnect(){}}
  const context={window:{UmeaStreetEngine:E},document:{getElementById:el,body:{style:{}},querySelector:()=>({value:'master'})},Date:{now:()=>clock},console,crypto:{randomUUID:()=>`id-${++seq}`},Peer,navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},setTimeout:(f,ms)=>{timeouts.set(++seq,{f,at:clock+ms});return seq},clearTimeout:id=>timeouts.delete(id),setInterval:f=>{intervals.set(++seq,f);return seq},clearInterval:id=>intervals.delete(id)};
  const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace("restoreSettings();$('roomCodeCreate').value=makeRoom();void loadGraph();",`window.testApi={net,armConnectionTimeout,makePlayer,makeState,processMove,hostAction,beginRound,beginTurn,startTurnTimer,attachHostConnection,attachGuestConnection,applyRemoteState,reconcilePlayers,disconnectPlayer,scheduleHostMigration,closePeer,submitMove,setState:s=>state=s,getState:()=>state,setGraph:g=>graph=g};`);
  vm.runInNewContext(source,context);
  const api=context.window.testApi;
  const graph={names:['X','Y','Z','W'],get:n=>['X','Y','Z','W'].includes(n)?{name:n,lines:[]}:null,neighbors:n=>({X:['Y'],Y:['X','Z'],Z:['Y','W'],W:['Z']}[n]||[])};
  api.setGraph(graph);Object.assign(api.net,{role:'host',room:'TEST',playerId:'A'});
  const state=api.makeState(['A','B','C'].map(id=>api.makePlayer(id,id)),{difficulty:'hard',timeLimit:20});
  Object.assign(state,{gameStatus:'PLAYING',status:'PLAYING',currentPlayer:'B',currentStreet:'X',usedStreets:['X'],turnId:1,revision:10,deadline:clock+20000,hostId:'A'});api.setState(state);
  return {api,state,el,intervals,timeouts,peers,advance(ms){clock+=ms;for(const [id,t] of [...timeouts])if(t.at<=clock){timeouts.delete(id);t.f()}for(const f of [...intervals.values()])f();}};
}
function connection(){return {events:{},sent:[],open:true,on(k,f){this.events[k]=f},send(x){this.sent.push(x)},close(){this.open=false;this.events.close?.()}}}
function join(h,id){const c=connection();h.api.attachHostConnection(c);c.events.data({type:'hello',playerId:id,name:id});return c}
test('pause retains only the unspent part of the turn',()=>{const h=harness();h.advance(7000);h.api.hostAction('pause');h.advance(40000);h.api.hostAction('resume');assert.equal(h.state.deadline-147000,13000);h.advance(13000);assert.equal(h.state.gameStatus,'ROUND_END');});
test('same-turn answer survives an unrelated revision change, duplicate is idempotent',()=>{const h=harness(),c=join(h,'B');const m={type:'move',moveId:'one',turnId:1,revision:0,raw:'Y'};c.events.data(m);assert.equal(h.state.currentStreet,'Y');assert.equal(h.state.currentPlayer,'C');assert.equal(h.state.turnId,2);assert.ok(h.state.deadline>100000);c.events.data(m);assert.equal(h.state.usedStreets.length,2);assert.equal(c.sent.at(-1).ok,true);});
test('old turn is explicitly rejected with a current state',()=>{const h=harness(),c=join(h,'B');c.events.data({type:'move',moveId:'old',turnId:0,raw:'Y'});assert.equal(c.sent.at(-1).ok,false);assert.equal(c.sent.at(-1).state.currentStreet,'X');});
test('disconnect skips absent player and pauses below two even without a timer',()=>{const h=harness();h.state.timeLimit=0;const b=join(h,'B'),c=join(h,'C');b.close();assert.equal(h.state.currentPlayer,'C');assert.equal(h.state.gameStatus,'PLAYING');c.close();assert.equal(h.state.gameStatus,'PAUSED');assert.equal(h.state.pauseReason,'connection');join(h,'B');assert.equal(h.state.gameStatus,'PLAYING');assert.equal(h.state.currentPlayer,'A');});
test('closing replaced connection does not disconnect rejoined player',()=>{const h=harness();const old=join(h,'B'),current=join(h,'B');assert.equal(old.open,false);assert.equal(h.api.net.connections.get('B'),current);assert.equal(h.state.players[1].connected,true);});
test('host migration resumes saved timer after another player reconnects',async()=>{const h=harness();Object.assign(h.api.net,{role:'guest',playerId:'B',peer:{destroy(){}},conn:{open:false}});const promise=h.api.scheduleHostMigration();h.advance(1400);await promise;assert.equal(h.peers.length,1);h.peers[0].events.open();const s=h.api.getState();assert.equal(s.gameStatus,'PAUSED');assert.equal(s.hostId,'B');assert.equal(s.players.find(p=>p.id==='A').connected,false);const c=join(h,'C');assert.equal(s.gameStatus,'PLAYING');assert.equal(s.deadline,120000);h.advance(10000);c.events.data({type:'pong'});h.advance(8600);assert.equal(s.gameStatus,'ROUND_END');});
test('leaving while migration is pending cannot create another host',async()=>{const h=harness();Object.assign(h.api.net,{role:'guest',playerId:'B',peer:{destroy(){}},conn:{open:false}});const promise=h.api.scheduleHostMigration();h.api.closePeer();h.advance(1400);await promise;assert.equal(h.peers.length,0);});
test('guest receives rejection feedback and can answer again',()=>{const h=harness(),c=connection();Object.assign(h.api.net,{role:'guest',playerId:'B',conn:c,pendingMove:true,pendingPacket:{moveId:'one',turnId:1}});h.api.attachGuestConnection(c);c.events.data({type:'move-result',moveId:'one',ok:false,reason:'Försök igen',state:structuredClone(h.state)});assert.equal(h.api.net.pendingMove,false);assert.equal(h.el('streetInput').disabled,false);assert.equal(h.el('message').textContent,'Försök igen');});
test('guest next turn clears previous input and suggestions',()=>{const h=harness(),c=connection();Object.assign(h.api.net,{role:'guest',playerId:'C',conn:c});h.el('streetInput').value='old';const s=structuredClone(h.state);s.revision++;s.turnId++;s.currentPlayer='C';h.api.applyRemoteState(s);assert.equal(h.el('streetInput').value,'');assert.equal(h.el('streetInput').disabled,false);});
test('packaged data preserves the live graph',()=>{const z=require('node:zlib');const data=JSON.parse(z.gunzipSync(fs.readFileSync(new URL('../roads-fallback.json.gz',import.meta.url))));assert.ok(E.buildGraph(data.features).size>800);});

test('stalled initial connection ends with actionable error',()=>{const h=harness();h.state.gameStatus='LOBBY';h.api.net.status='connecting';h.api.armConnectionTimeout();h.advance(15000);assert.equal(h.api.net.status,'error');assert.equal(h.api.net.role,'offline');assert.match(h.el('onlineError').textContent,/för lång tid/);});
