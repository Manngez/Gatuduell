import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('kartan använder Orten 2.0-principer och Umeå-vy',()=>{
  assert.match(app,/zoomSnap:\.25/);
  assert.match(app,/zoomDelta:\.5/);
  assert.match(app,/wheelPxPerZoomLevel:80/);
  assert.match(app,/inertia:true/);
  assert.match(app,/preferCanvas:true/);
  assert.match(app,/setView\(CENTER,13\)/);
  assert.match(app,/userNavigatingUntil=Date\.now\(\)\+FREE_NAV_MS/);
});

test('aktuell gata rödmarkeras',()=>{
  assert.match(app,/color:'#e53935'/);
  assert.match(html,/AKTUELL GATA · RÖDMARKERAD/);
});

test('mobilkartan använder en enda stabil tilevärd',()=>{
  assert.match(app,/https:\/\/basemaps\.cartocdn\.com\/light_nolabels/);
  assert.doesNotMatch(app,/\{s\}\.basemaps\.cartocdn\.com/);
  assert.match(app,/tileSize:256/);
  assert.match(app,/detectRetina:false/);
});

test('online använder värdcentrerad PeerJS och auktoritativ flyttvalidering',()=>{
  assert.match(app,/peerjs@1\.5\.5/);
  assert.match(app,/roomPeerId/);
  assert.match(app,/connections:new Map\(\)/);
  assert.match(app,/msg\?\.type==='move'&&id===state\.currentPlayer/);
  assert.match(app,/msg\.revision===state\.revision/);
  assert.match(app,/processMove\(String\(msg\.raw\|\|''\)\)/);
  assert.match(html,/Skapa rum/);
  assert.match(html,/Anslut/);
});

test('online stöder lobby, tio enheter och revisionsskydd',()=>{
  assert.match(app,/length>=10/);
  assert.match(app,/Rummet är fullt · max 10 deltagare/);
  assert.match(app,/revision:0/);
  assert.match(app,/remote\.revision<=state\.revision/);
  assert.match(app,/crypto\.randomUUID\(\)/);
  assert.match(app,/type:'ping'/);
  assert.match(html,/Jag är spelledare/);
  assert.match(html,/Jag deltar också/);
});
