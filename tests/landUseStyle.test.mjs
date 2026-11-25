import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { assignBuildingLandUse, landUseCategories, landUseCategory, landUseCategoryForSublayer } from '../src/data/landUseStyle.ts';
import { buildBatches } from '../src/three/batches.ts';
import { recolorBuildings } from '../src/three/buildingColors.ts';

const point = (x, y) => ({ lon: x / 111320, lat: y / 111320 });
const square = (x, y, size) => [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]].map(([a,b]) => point(a,b));
const land = (key, landuse, ring, holes) => ({ key, layer: 'Land use', kind: 'area', tags: { landuse }, geometry: ring, holes });
const building = (key, x, y, tags = { building: 'yes' }) => ({ key, layer: 'Buildings', kind: 'area', tags, geometry: square(x, y, 10) });

test('land-use values map to distinct zoning categories and legend swatches', () => {
  assert.equal(landUseCategory('residential').id, 'residential');
  assert.equal(landUseCategory('brownfield').id, 'construction');
  assert.equal(landUseCategory('something_new').id, 'other');
  assert.equal(landUseCategoryForSublayer('Land use|landuse:retail'), landUseCategories.retail);
  assert.equal(landUseCategoryForSublayer('Buildings|building:retail'), null);
  const colors = Object.values(landUseCategories).map(category => category.color);
  assert.equal(new Set(colors).size, colors.length);
});

test('buildings take their own type first, then the smallest containing land-use area', () => {
  const features = [
    land('district', 'residential', square(0, 0, 400), [square(300, 300, 50)]),
    land('plot', 'religious', square(100, 100, 50)),
    building('typed', 10, 10, { building: 'retail' }),
    building('in-district', 200, 20),
    building('in-plot', 110, 110),
    building('in-hole', 310, 310),
    building('outside', 600, 600),
  ];
  const uses = assignBuildingLandUse(features);
  assert.equal(uses.get('typed').id, 'retail');
  assert.equal(uses.get('in-district').id, 'residential');
  assert.equal(uses.get('in-plot').id, 'religious');
  assert.equal(uses.has('in-hole'), false);
  assert.equal(uses.has('outside'), false);
});

test('land-use areas get a darker outline and buildings can be recoloured and restored', () => {
  const features = [land('area', 'retail', square(0, 0, 50)), building('b1', 0, 0, { building: 'yes', height: '9' }), building('b2', 20, 0, { building: 'yes', height: '9' })];
  const outline = buildBatches([features[0]], { lat: 0, lng: 0 }, null).find(batch => batch.kind === 'line');
  assert.deepEqual(outline.ranges.map(range => range.name), ['area/outline']);
  assert.equal(outline.positions.length, 4 * 6);
  assert.ok(outline.positions.every((value, i) => i % 3 !== 1 || Math.abs(value - .16) < 1e-6));

  const batch = buildBatches(features.slice(1), { lat: 0, lng: 0 }, null)[0];
  const attribute = new THREE.BufferAttribute(batch.colors.slice(), 3, true);
  recolorBuildings(batch, features.slice(1), attribute, new Map([['b2', '#ff0000']]));
  const red = Math.round(new THREE.Color('#ff0000').r * 255);
  const b2 = batch.ranges.find(range => range.name === 'b2');
  assert.equal(attribute.array[b2.start * 3], red);
  assert.deepEqual([...attribute.array.slice(0, 3)], [...batch.colors.slice(0, 3)]);
  recolorBuildings(batch, features.slice(1), attribute, null);
  assert.deepEqual([...attribute.array], [...batch.colors]);
});
