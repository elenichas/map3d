import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { roofGeometry } from '../src/three/geometry.ts';
import { roofShapes } from '../src/data/layers.ts';

const rectangle = (w, d) => new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(w, 0), new THREE.Vector2(w, d), new THREE.Vector2(0, d)]);
const heights = geometry => { const p = geometry.getAttribute('position'); return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]); };

test('every supported roof shape builds a closed, finite volume no taller than its roof height', () => {
  for (const shape of Object.keys(roofShapes)) {
    const geometry = roofGeometry(rectangle(20, 10), 4, { 'roof:shape': shape });
    const points = heights(geometry);
    assert.ok(points.length > 0 && points.length % 3 === 0, shape);
    assert.ok(points.every(([x, y, z]) => [x, y, z].every(Number.isFinite) && z >= -1e-6 && z <= 4 + 1e-6), shape);
    assert.ok(Math.max(...points.map(p => p[2])) > 3.5, `${shape} reaches its peak`);
    geometry.dispose();
  }
});

test('gabled ridges follow the longest edge and hipped roofs slope down at the ends', () => {
  const gabled = heights(roofGeometry(rectangle(20, 10), 4, { 'roof:shape': 'gabled' }));
  // Ridge along x at y = 5: points on the short ends reach full height, long eaves stay at 0.
  assert.ok(gabled.some(([x, y, z]) => x === 0 && Math.abs(y - 5) < 1e-6 && Math.abs(z - 4) < 1e-6));
  assert.ok(gabled.filter(([, y]) => y === 0 || y === 10).every(([, , z]) => z < 1e-6), 'long eaves stay at the wall top');
  const hipped = heights(roofGeometry(rectangle(20, 10), 4, { 'roof:shape': 'hipped' }));
  assert.ok(hipped.filter(([x]) => x === 0 || x === 20).every(([, , z]) => z < 1e-6), 'hip ends meet the eaves');
  assert.ok(hipped.some(([x, y, z]) => Math.abs(x - 5) < 1e-6 && Math.abs(y - 5) < 1e-6 && Math.abs(z - 4) < 1e-6), 'ridge starts half a width in');
});

test('skillion roofs rise away from the mapped downhill direction', () => {
  const points = heights(roofGeometry(rectangle(20, 10), 2, { 'roof:shape': 'skillion', 'roof:direction': 'S' }));
  const north = points.filter(([, y, z]) => y === 10 && z > 0), south = points.filter(([, y, z]) => y === 0 && z > 1e-6);
  assert.ok(north.length && north.every(([, , z]) => Math.abs(z - 2) < 1e-6));
  assert.equal(south.length, 0);
});
