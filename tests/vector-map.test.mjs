import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const map=fs.readFileSync(new URL('../umea-vector-map.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../vector-map.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('kartan använder Orten 2.0-principen och separata spelöverlägg',()=>{
  assert.doesNotMatch(html,/map-stability\.js/i);
  assert.match(html,/umea-vector-map\.js/);
  assert.match(app,/streetRoutePane/);
  assert.match(app,/touchZoom:true/);
  assert.match(app,/inertia:true/);
  assert.doesNotMatch(map,/L\.map=function/);
  assert.doesNotMatch(map,/L\.tileLayer=function/);
});

test('valda och aktuella gator ritas tydligt över baskartan',()=>{
  assert.match(map,/isPrevious/);
  assert.match(map,/isCurrent/);
  assert.match(map,/color:'#d91f1f'/);
});

test('Leaflets interna zoomgeometri skrivs inte över',()=>{
  assert.doesNotMatch(css,/leaflet-map-pane.*width:100%/);
  assert.doesNotMatch(css,/leaflet-pane>svg/);
  assert.doesNotMatch(css,/leaflet-pane>canvas/);
  assert.doesNotMatch(map,/touchZoom:'center'/);
  assert.doesNotMatch(map,/zoomSnap:0/);
  assert.doesNotMatch(map,/L\.Map\.prototype\.flyToBounds=/);
  assert.match(app,/focusCurrent\(true\)/);
});

test('startgata väljs med Gatduells riktiga graf-API',()=>{
  assert.match(map,/currentGraph\.names/);
  assert.match(map,/currentGraph\.get\(name\)/);
  assert.match(map,/currentGraph\.neighbors\(name\)/);
  assert.doesNotMatch(map,/graph\.entries\(/);
});
