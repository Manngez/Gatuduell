import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const state=fs.readFileSync(new URL('../app-state.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../map-interaction.css',import.meta.url),'utf8');

test('matchläge gör kartan permanent aktiv',()=>{
  assert.match(state,/const inGame=document\.body\.classList\.contains\('game-live'\)/);
  assert.match(state,/const active=inGame\|\|desktop\|\|S\.mapExplore/);
  assert.match(state,/setMapExplore\(active\)/);
});

test('mobilkartan tar touch i aktiv match',()=>{
  assert.match(css,/body\.game-live #map/);
  assert.match(css,/touch-action:none!important/);
  assert.match(css,/\.map-tools\{display:none!important\}/);
});

test('fullskärmsbyte ritar om ett enda tilelager efter resize',()=>{
  assert.match(state,/S\.baseLayer=.*L\.tileLayer/);
  assert.match(state,/rastertiles\/light_nolabels/);
  assert.match(state,/S\.baseLayer\.redraw\(\)/);
  assert.doesNotMatch(state,/new ResizeObserver/);
});

test('pinch är stabil på mobil',()=>{
  assert.match(state,/touchZoom:'center'/);
  assert.match(state,/inertia:false/);
  assert.match(state,/zoomAnimation:false/);
  assert.match(state,/if\(document\.body\.classList\.contains\('game-live'\)\) return/);
  assert.match(css,/height:100svh!important/);
});
