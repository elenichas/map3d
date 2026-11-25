import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSublayers } from '../src/data/sublayerGroups.ts';
import { poiCategories, poiStyleForTags } from '../src/data/poiStyle.ts';
import { landUseCategories } from '../src/data/landUseStyle.ts';

const type = (layer, value, count = 1) => ({ id: `${layer}|${value}`, label: value, count });

test('places group into colour-coded categories in a fixed order, with Other last', () => {
  const layer = 'Points of interest';
  const groups = groupSublayers(layer, [type(layer, 'shop:car', 2), type(layer, 'amenity:atm', 3), type(layer, 'amenity:bank'), type(layer, 'tourism:artwork'), type(layer, 'other', 4), type(layer, 'amenity:fuel')]);
  assert.deepEqual(groups.map(group => group.category.id), ['money', 'culture', 'transport', 'other']);
  assert.deepEqual(groups[0].types.map(t => t.id), ['Points of interest|amenity:atm', 'Points of interest|amenity:bank']);
  assert.equal(groups[0].count, 4);
  assert.equal(groups[2].count, 3);
  assert.equal(groups[0].key, 'Points of interest|money');
});

test('buildings group by the same use categories that colour them, and single-category or ungrouped layers stay flat', () => {
  const groups = groupSublayers('Buildings', [type('Buildings', 'building:house'), type('Buildings', 'building:apartments'), type('Buildings', 'building:church'), type('Buildings', 'building:yes'), type('Buildings', 'building:part:yes')]);
  assert.deepEqual(groups.map(group => [group.category.id, group.types.length]), [['residential', 2], ['religious', 1], ['unspecified', 2]]);
  assert.equal(groups[0].category.color, landUseCategories.residential.color);
  assert.equal(groupSublayers('Points of interest', [type('Points of interest', 'amenity:atm'), type('Points of interest', 'amenity:bank')]), null);
  assert.equal(groupSublayers('Roads', [type('Roads', 'highway:primary'), type('Roads', 'highway:service')]), null);
});

test('every category has a distinct colour and an icon; art, money and cars each have their own group', () => {
  for (const categories of [poiCategories, landUseCategories]) {
    const colors = Object.values(categories).map(category => category.color);
    assert.equal(new Set(colors).size, colors.length);
    assert.ok(Object.values(categories).every(category => category.icon));
  }
  assert.deepEqual(['tourism:gallery', 'amenity:bank', 'shop:car', 'tourism:hotel', 'leisure:playground'].map(tag => { const [k, v] = tag.split(':'); return poiStyleForTags({ [k]: v }).category.id; }), ['culture', 'money', 'transport', 'tourism', 'leisure']);
});
