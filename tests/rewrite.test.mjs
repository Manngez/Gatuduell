import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('spelet är Gatduell Umeå utan gamla kommersiella sidomoduler',()=>{
  assert.match(app,/roads_umea/);
  assert.doesNotMatch(app,/Supabase|premium|ranking|MapLibre/i);
  assert.doesNotMatch(html,/Supabase|premium|ranking|MapLibre/i);
});

test('Leaflet-kartan följer Orten 2.0-principen och återanvänds',()=>{
  assert.match(app,/function initMap\(\)/);
  assert.match(app,/zoomSnap:\.25/);
  assert.match(app,/zoomDelta:\.5/);
  assert.match(app,/inertia:true/);
  assert.match(app,/preferCanvas:true/);
  assert.match(app,/setView\(CENTER,13\)/);
  assert.match(app,/if\(map\)\{setTimeout\(\(\)=>map\.invalidateSize\(false\),80\);return;\}/);
  assert.doesNotMatch(app,/ResizeObserver/);
});

test('aktuell gata är röd och tidigare valda gator markeras separat',()=>{
  assert.match(app,/state\.usedStreets\.slice\(0,-1\)/);
  assert.match(app,/color:'#7b8791'/);
  assert.match(app,/color:'#e53935'/);
  assert.match(html,/AKTUELL GATA · RÖDMARKERAD/);
});
