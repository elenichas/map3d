import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchLayer, onlySublayers, resetSublayers, normalize } from '../src/data/layerFilter.ts';
import { categorizeSublayers, groupSublayers } from '../src/data/sublayerGroups.ts';

const type = (layer, value, label, count = 1) => ({ id: `${layer}|${value}`, label, count });
const poi = 'Points of interest';
const poiTypes = [type(poi, 'amenity:cafe', 'Cafés'), type(poi, 'amenity:restaurant', 'Restaurants'), type(poi, 'amenity:atm', 'ATMs'), type(poi, 'amenity:bank', 'Banks')];

test('an empty filter or a matching layer name keeps the whole layer', () => {
  assert.deepEqual(matchLayer(poi, poiTypes, groupSublayers(poi, poiTypes), '').all, true);
  assert.equal(matchLayer(poi, poiTypes, groupSublayers(poi, poiTypes), 'points').all, true);
  assert.equal(matchLayer('Terrain', [], null, 'elevation', 'elevation height').all, true);
  assert.equal(matchLayer('Terrain', [], null, 'cafe').visible, false);
});

test('type matches ignore accents and keep their category; category matches keep all their types', () => {
  const groups = groupSublayers(poi, poiTypes);
  const restaurant = matchLayer(poi, poiTypes, groups, 'RESTAURANT');
  assert.equal(restaurant.visible, true); assert.equal(restaurant.all, false);
  assert.deepEqual([...restaurant.types], [`${poi}|amenity:restaurant`]);
  assert.deepEqual([...restaurant.groups], [`${poi}|food`]);
  // "cafe" also matches the category "Food & cafés", so that whole category is kept.
  assert.equal(matchLayer(poi, poiTypes, groups, 'cafe').types.size, 2);
  const money = matchLayer(poi, poiTypes, groups, 'money');
  assert.deepEqual([...money.types].sort(), [`${poi}|amenity:atm`, `${poi}|amenity:bank`]);
  const roads = [type('Roads', 'highway:service', 'Service roads'), type('Roads', 'highway:primary', 'Primary roads')];
  assert.deepEqual([...matchLayer('Roads', roads, null, 'service').types], ['Roads|highway:service']);
  assert.equal(normalize(' Écoles '), 'ecoles');
});

test('"only" isolates types within one layer and reset restores a layer without touching others', () => {
  const previous = { 'Roads|highway:service': false };
  const only = onlySublayers(previous, poiTypes, [`${poi}|amenity:cafe`]);
  assert.equal(only[`${poi}|amenity:cafe`], true);
  assert.equal(only[`${poi}|amenity:bank`], false);
  assert.equal(only['Roads|highway:service'], false);
  assert.deepEqual(resetSublayers(only, [poi]), previous);
});

test('the legend gets categories even when a layer has only one', () => {
  const single = [type(poi, 'amenity:atm', 'ATMs'), type(poi, 'amenity:bank', 'Banks')];
  assert.equal(groupSublayers(poi, single), null);
  assert.deepEqual(categorizeSublayers(poi, single).map(group => [group.category.id, group.count]), [['money', 2]]);
  assert.equal(categorizeSublayers('Roads', []), null);
});
