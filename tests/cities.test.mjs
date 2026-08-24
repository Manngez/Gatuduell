import test from 'node:test';
import assert from 'node:assert/strict';
import Cities from '../cities.js';

test('stadskatalogen innehåller Umeå gratis och premiumstäder',()=>{
  const all=Cities.all();
  assert.equal(Cities.get('umea').premium,false);
  assert.equal(Cities.get('stockholm').premium,true);
  assert.ok(all.some(city=>city.slug==='goteborg'));
  assert.ok(all.some(city=>city.slug==='malmo'));
});

test('Overpass-data konverteras till spelbara GeoJSON-linjer',()=>{
  const features=Cities.overpassToFeatures({elements:[{
    type:'way',tags:{name:'Testgatan',highway:'residential'},geometry:[{lon:18.0,lat:59.3},{lon:18.01,lat:59.31}]
  }]});
  assert.equal(features.length,1);
  assert.equal(features[0].properties.name,'Testgatan');
  assert.deepEqual(features[0].geometry.coordinates[0],[18,59.3]);
});
