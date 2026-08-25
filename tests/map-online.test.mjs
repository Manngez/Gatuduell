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

test('online använder PeerJS och host-auktoritativ flyttvalidering',()=>{
  assert.match(app,/peerjs@1\.5\.5/);
  assert.match(app,/roomPeerId/);
  assert.match(app,/msg\?\.type==='move'&&state\?\.running&&state\.turn===1/);
  assert.match(app,/processMove\(String\(msg\.raw\|\|''\)\)/);
  assert.match(html,/Skapa rum/);
  assert.match(html,/Anslut/);
});
