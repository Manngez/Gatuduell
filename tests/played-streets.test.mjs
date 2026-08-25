import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const game=fs.readFileSync(new URL('../app-game.js',import.meta.url),'utf8');

test('alla spelade gator ligger kvar markerade',()=>{
  assert.match(game,/function drawStreetHistory\(\)/);
  assert.match(game,/const previous=used\.slice\(0,-1\)/);
  assert.match(game,/S\.usedLayer=L\.featureGroup/);
});

test('aktuell gata har starkare separat markering',()=>{
  assert.match(game,/color:'#ff9f1c'/);
  assert.match(game,/color:'#ffffff'/);
  assert.match(game,/S\.highlight=L\.featureGroup/);
});
