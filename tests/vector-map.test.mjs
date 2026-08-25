import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const map=fs.readFileSync(new URL('../umea-vector-map.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('kartan använder en snabb rasterbaskarta och separata spelöverlägg',()=>{
  assert.doesNotMatch(html,/map-stability\.js/i);
  assert.match(html,/umea-vector-map\.js/);
  assert.match(map,/L\.tileLayer=function createFastBaseMap/);
  assert.match(map,/streetRoutePane/);
  assert.match(map,/updateWhenZooming:false/);
});

test('valda och aktuella gator ritas tydligt över baskartan',()=>{
  assert.match(map,/isPrevious/);
  assert.match(map,/isCurrent/);
  assert.match(map,/color:'#d91f1f'/);
  assert.match(map,/background='#f5f7f8'/);
});

test('mobilkartan är användarstyrd och pinch-stabil',()=>{
  assert.match(map,/touchZoom:'center'/);
  assert.match(map,/zoomSnap:0/);
  assert.match(map,/inertia:false/);
  assert.match(map,/zoomAnimation:true/);
  assert.match(map,/manualFocusUntil/);
  assert.match(map,/#recenterBtn/);
});

test('startgata väljs med Gatduells riktiga graf-API',()=>{
  assert.match(map,/currentGraph\.names/);
  assert.match(map,/currentGraph\.get\(name\)/);
  assert.match(map,/currentGraph\.neighbors\(name\)/);
  assert.doesNotMatch(map,/graph\.entries\(/);
});
