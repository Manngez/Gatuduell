import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const stability=fs.readFileSync(new URL('../map-stability.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('kartstabilitet laddas efter motorn men före appen',()=>{
  const engine=html.indexOf('engine.js');
  const stable=html.indexOf('map-stability.js');
  const app=html.indexOf('app.js');
  assert.ok(engine>=0 && stable>engine && app>stable);
});

test('mobilkartan är centrumstabil utan inertia eller fractional zoom',()=>{
  assert.match(stability,/touchZoom:'center'/);
  assert.match(stability,/inertia:false/);
  assert.match(stability,/zoomSnap:1/);
  assert.match(stability,/zoomDelta:1/);
  assert.match(stability,/zoomAnimation:false/);
  assert.match(stability,/fadeAnimation:false/);
});

test('tilelagret använder en enda fast 256px CARTO-host utan retina',()=>{
  assert.match(stability,/https:\/\/a\.basemaps\.cartocdn\.com\/light_nolabels\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(stability,/detectRetina:false/);
  assert.match(stability,/tileSize:256/);
  assert.doesNotMatch(stability,/\{s\}\.basemaps/);
  assert.doesNotMatch(stability,/\{r\}\.png/);
});

test('automatisk flyToBounds blockeras och endast recenter tillåts',()=>{
  assert.match(stability,/manualFocusUntil/);
  assert.match(stability,/Date\.now\(\) > manualFocusUntil/);
  assert.match(stability,/#recenterBtn/);
  assert.match(stability,/animate:false/);
});

test('startgata använder Gatduells riktiga graf-API och väljs i centrala Umeå',()=>{
  assert.match(stability,/graph\?\.names/);
  assert.match(stability,/graph\.get\?\.\(name\)/);
  assert.match(stability,/graph\.neighbors\?\.\(name\)/);
  assert.doesNotMatch(stability,/graph\.entries\(\)/);
  assert.match(stability,/minLat:63\.78/);
  assert.match(stability,/maxLat:63\.87/);
  assert.match(stability,/minLon:20\.13/);
  assert.match(stability,/maxLon:20\.37/);
});
