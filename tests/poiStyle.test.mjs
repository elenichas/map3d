import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { poiCategories, poiHeading, poiStyleForSublayer, poiStyleForTags } from '../src/data/poiStyle.ts';
import { buildBatches } from '../src/three/batches.ts';
import { collectExportScene } from '../src/three/exportScene.ts';
import { featureForHit } from '../src/three/picking.ts';
import { poiGeometry, poiMatrix } from '../src/three/poiShapes.ts';

const point = (x, y) => ({ lon: x / 111320, lat: y / 111320 });

test('places map to colour-coded categories, icons and 3D forms', () => {
  assert.deepEqual(poiStyleForTags({ amenity: 'bench' }), { category: poiCategories.furniture, icon: 'Armchair', form: 'bench' });
  assert.equal(poiStyleForTags({ amenity: 'bar' }).category.id, 'drink');
  assert.equal(poiStyleForTags({ amenity: 'bank' }).category.id, 'money');
  assert.equal(poiStyleForTags({ amenity: 'bbq' }).form, 'bbq');
  assert.equal(poiStyleForTags({ shop: 'bakery' }).category.id, 'food');
  // Unlisted values still get their tag's category; unknown tags get a neutral marker.
  assert.deepEqual([poiStyleForTags({ shop: 'kites' }).icon, poiStyleForTags({ shop: 'kites' }).form], ['ShoppingBag', 'marker']);
  assert.equal(poiStyleForTags({ craft: 'brewery' }).category.id, 'other');
  assert.equal(poiStyleForSublayer('Points of interest|amenity:atm').icon, 'Banknote');
  assert.equal(poiStyleForSublayer('Points of interest|other'), null);
  const colors = Object.values(poiCategories).map(category => category.color);
  assert.equal(new Set(colors).size, colors.length);
});

test('mapped directions turn furniture to face their compass bearing', () => {
  assert.equal(poiHeading({}), 0);
  assert.ok(Math.abs(poiHeading({ direction: 'E' }) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(poiHeading({ direction: '180' }) - Math.PI) < 1e-9);
  assert.equal(poiHeading({ direction: 'forward' }), 0);
  // A bench facing east sits with its seat front pointing to scene +X.
  const front = new THREE.Vector3(0, 0, 1).transformDirection(poiMatrix(0, 0, 0, { direction: '90' }, 'bench'));
  assert.ok(front.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-9);
  for (const form of ['bench', 'bin', 'recycling', 'tap', 'postbox', 'vending', 'toilets', 'shelter', 'bbq', 'fountain', 'bikeRack', 'marker']) {
    const geometry = poiGeometry(form);
    geometry.computeBoundingBox();
    assert.ok(geometry.boundingBox.min.y >= -1e-6 && geometry.boundingBox.max.y > .5, form);
  }
});

test('batched places become coloured shape instances plus clickable icon badges', () => {
  const features = [
    { key: 'node/1', layer: 'Points of interest', kind: 'point', tags: { amenity: 'bench' }, geometry: [point(10, 20)] },
    { key: 'node/2', layer: 'Points of interest', kind: 'point', tags: { amenity: 'bank' }, geometry: [point(30, 40)] },
    { key: 'node/3', layer: 'Points of interest', kind: 'point', tags: { amenity: 'bank' }, geometry: [point(50, 40)] },
  ];
  const batches = buildBatches(features, { lat: 0, lng: 0 }, null);
  const bench = batches.find(batch => batch.form === 'bench'), markers = batches.find(batch => batch.form === 'marker');
  assert.deepEqual([...bench.indices], [0]);
  assert.deepEqual([...markers.indices], [1, 2]);
  assert.deepEqual([...markers.colors.slice(0, 3)], [0x1d, 0x9a, 0x68]);
  const badges = batches.filter(batch => batch.kind === 'badges');
  assert.equal(badges.length, 1);
  assert.equal(badges[0].icon, 'Landmark');
  assert.deepEqual([...badges[0].positions.slice(3, 6)], [50, 9, -40]);
  assert.equal(featureForHit({ object: { userData: { mapBatch: { batch: badges[0], features } } }, index: 1 }), features[2]);

  const mesh = new THREE.InstancedMesh(poiGeometry('marker'), new THREE.MeshStandardMaterial(), 2);
  mesh.instanceMatrix = new THREE.InstancedBufferAttribute(markers.matrices, 16);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 1, 0, 0]), 3);
  mesh.userData.mapBatch = { batch: markers, features };
  const badgePoints = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  badgePoints.userData.mapBatch = { batch: badges[0], features };
  const scene = new THREE.Scene(); scene.add(mesh, badgePoints);
  const exported = collectExportScene(scene);
  // Badges are screen overlays and stay out of downloads; shapes keep their category colour.
  assert.deepEqual(exported.root.children.map(child => child.name), ['node/2/marker', 'node/3/marker']);
  assert.equal(exported.root.children[0].material.color.getHex(), 0xff0000);
  exported.dispose(); mesh.material.dispose(); badgePoints.geometry.dispose(); badgePoints.material.dispose();
});
