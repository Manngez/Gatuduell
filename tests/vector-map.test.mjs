import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const map=fs.readFileSync(new URL('../umea-vector-map.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('kartan använder inga externa rastertiles',()=>{
  assert.doesNotMatch(html,/basemaps\.cartocdn\.com/i);
  assert.doesNotMatch(html,/map-stability\.js/i);
  assert.match(html,/umea-vector-map\.js/);
  assert.match(map,/L\.tileLayer=function createUmeaStreetLayer/);
  assert.match(map,/L\.polyline\(lines/);
  assert.doesNotMatch(map,/https?:\/\//);
});

test('hela Umeås gatunät ritas som en ljus vektorkarta',()=>{
  assert.match(map,/for\(const name of graph\.names\)/);
  assert.match(map,/graph\.get\(name\)/);
  assert.match(map,/color:'#b8c1c7'/);
  assert.match(map,/background='#f5f7f8'/);
});

test('mobilkartan är användarstyrd och pinch-stabil',()=>{
  assert.match(map,/touchZoom:'center'/);
  assert.match(map,/inertia:false/);
  assert.match(map,/zoomAnimation:false/);
  assert.match(map,/manualFocusUntil/);
  assert.match(map,/#recenterBtn/);
});

test('startgata väljs med Gatduells riktiga graf-API',()=>{
  assert.match(map,/currentGraph\.names/);
  assert.match(map,/currentGraph\.get\(name\)/);
  assert.match(map,/currentGraph\.neighbors\(name\)/);
  assert.doesNotMatch(map,/graph\.entries\(/);
});
