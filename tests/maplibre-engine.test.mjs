import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const loader=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const compat=fs.readFileSync(new URL('../maplibre-leaflet-compat.js',import.meta.url),'utf8');

test('MapLibre laddas före spelmodulerna',()=>{
  assert.match(loader,/maplibre-gl@6\.0\.0\/dist\/maplibre-gl\.js/);
  assert.match(loader,/maplibre-leaflet-compat\.js/);
  assert.ok(loader.indexOf('maplibre-leaflet-compat.js') < loader.indexOf("app-state.js"));
});

test('MapLibre använder ljus OpenFreeMap-stil och döljer labels',()=>{
  assert.match(compat,/tiles\.openfreemap\.org\/styles\/positron/);
  assert.match(compat,/layer\.type==='symbol'/);
  assert.match(compat,/visibility','none'/);
});

test('gata overlays använder GeoJSON line layers',()=>{
  assert.match(compat,/type:'geojson'/);
  assert.match(compat,/type:'LineString'/);
  assert.match(compat,/type:'line'/);
  assert.match(compat,/'line-cap':'round'/);
});
