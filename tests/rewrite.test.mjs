import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('nya spelet är endast Gatduell Umeå utan kommersiella sidomoduler',()=>{
  assert.match(app,/roads_umea/);
  assert.doesNotMatch(app,/Supabase|premium|ranking|MapLibre/i);
  assert.doesNotMatch(html,/Supabase|premium|ranking|MapLibre/i);
});

test('Leaflet-kartan skapas först när matchen startar',()=>{
  assert.match(app,/function startMatch\(\)/);
  assert.match(app,/createMap\(\);\s*beginRound\(\)/);
  assert.doesNotMatch(app,/ResizeObserver/);
});

test('spelade gator och aktuell gata markeras separat',()=>{
  assert.match(app,/state\.used\.slice\(0,-1\)/);
  assert.match(app,/color:'#14a99c'/);
  assert.match(app,/color:'#ff8d2f'/);
});
