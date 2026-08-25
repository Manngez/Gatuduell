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

test('mobilkartan är centrumstabil och utan inertia eller animation',()=>{
  assert.match(stability,/touchZoom:'center'/);
  assert.match(stability,/inertia:false/);
  assert.match(stability,/zoomAnimation:false/);
  assert.match(stability,/fadeAnimation:false/);
});

test('automatisk flyToBounds blockeras och endast recenter tillåts',()=>{
  assert.match(stability,/manualFocusUntil/);
  assert.match(stability,/Date\.now\(\) > manualFocusUntil/);
  assert.match(stability,/#recenterBtn/);
  assert.match(stability,/animate:false/);
});

test('startgata väljs inom centrala Umeå',()=>{
  assert.match(stability,/minLat:63\.78/);
  assert.match(stability,/maxLat:63\.87/);
  assert.match(stability,/minLon:20\.13/);
  assert.match(stability,/maxLon:20\.37/);
  assert.match(stability,/E\.chooseStart/);
});
