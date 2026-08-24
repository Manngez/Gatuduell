import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const E=require('../engine.js');

const feature=(name,coords)=>({type:'Feature',properties:{namn:name,geometry:`LINESTRING (${coords.map(([x,y])=>`${x} ${y}`).join(', ')})`},geometry:{type:'LineString',coordinates:coords}});
const bbox={west:20.1,south:63.7,east:20.5,north:63.9};

test('direkta gatukorsningar byggs',()=>{
  const graph=E.buildGraph([
    feature('Storgatan',[[20.20,63.82],[20.21,63.82]]),
    feature('Skolgatan',[[20.21,63.82],[20.21,63.83]]),
    feature('Kungsgatan',[[20.22,63.83],[20.22,63.84]])
  ],{bbox,toleranceMeters:3});
  assert.equal(graph.crosses('Storgatan','Skolgatan'),true);
  assert.equal(graph.crosses('Storgatan','Kungsgatan'),false);
});

test('rondellkoppling Hissjövägen och Östra Kyrkogatan',()=>{
  const cx=20.27699,cy=63.83207;
  const graph=E.buildGraph([
    feature('Östra Kyrkogatan',[[cx,cy+.0020],[cx,cy+.00008]]),
    feature('Östra Kyrkogatan',[[cx,cy-.0020],[cx,cy-.00008]]),
    feature('Hissjövägen',[[cx-.0020,cy],[cx-.00016,cy]]),
    feature('Parkvägen',[[cx+.0020,cy],[cx+.00016,cy]])
  ],{bbox,toleranceMeters:3,junctionRadiusMeters:25});
  assert.equal(graph.crosses('Östra Kyrkogatan','Hissjövägen'),true);
  assert.equal(graph.crosses('Hissjövägen','Parkvägen'),true);
});

test('svårighetsgrader använder 1, 2 eller 3 steg',()=>{
  const graph=E.buildGraph([
    feature('A-gatan',[[20.20,63.82],[20.21,63.82]]),
    feature('B-gatan',[[20.21,63.82],[20.21,63.83]]),
    feature('C-gatan',[[20.21,63.83],[20.22,63.83]]),
    feature('D-gatan',[[20.22,63.83],[20.22,63.84]])
  ],{bbox,toleranceMeters:3});
  assert.equal(E.validateMove(graph,'A-gatan','B-gatan',['A-gatan'],1).ok,true);
  assert.equal(E.validateMove(graph,'A-gatan','C-gatan',['A-gatan'],1).ok,false);
  assert.equal(E.validateMove(graph,'A-gatan','C-gatan',['A-gatan'],2).ok,true);
  assert.equal(E.validateMove(graph,'A-gatan','D-gatan',['A-gatan'],3).ok,true);
});
