import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { poiHeading, type PoiForm } from '../data/poiStyle.ts';
import { buildingDimensions, isBuilding } from '../data/layers.ts';

/** Small street furniture is drawn 1.5× real size so it stays legible from the default camera distance. */
const LEGIBLE = 1.5;
/** Height (m) of a venue's icon badge above the ground. */
export const BADGE_HEIGHT = 9;
/** Badge diameter in CSS pixels; constant on screen so icons stay readable at any zoom. */
export const BADGE_PIXELS = 26;

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
const cylinder = (r: number, h: number, y = 0, top = r, segments = 10) => new THREE.CylinderGeometry(top, r, h, segments).translate(0, y + h / 2, 0);
function merge(parts: THREE.BufferGeometry[], scale = 1) {
  // Box and cylinder attributes differ only by index; normalise before merging.
  const flat = parts.map(part => { const next = part.index ? part.toNonIndexed() : part; if (next !== part) part.dispose(); return next; });
  const merged = mergeGeometries(flat)!;
  flat.forEach(part => part.dispose());
  return merged.scale(scale, scale, scale);
}
const builders: Record<PoiForm, () => THREE.BufferGeometry> = {
  // Seat faces +Z; poiMatrix rotates it to the mapped direction.
  bench: () => merge([box(1.8, .08, .5, 0, .45), box(1.8, .45, .07, 0, .55, -.24), box(.08, .45, .45, -.8), box(.08, .45, .45, .8)], LEGIBLE),
  bin: () => merge([cylinder(.28, .9, 0, .32), cylinder(.34, .06, .9)], LEGIBLE),
  recycling: () => merge([box(1.4, 1.4, .9), box(1.5, .08, 1, 0, 1.4)], LEGIBLE),
  tap: () => merge([cylinder(.12, 1), box(.12, .12, .3, 0, .88, .12), cylinder(.3, .05)], LEGIBLE),
  postbox: () => merge([cylinder(.28, 1.25, 0, .28, 12), new THREE.SphereGeometry(.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.25, 0)], LEGIBLE),
  vending: () => merge([box(.9, 1.9, .75)], LEGIBLE),
  toilets: () => merge([box(2.4, 2.5, 2.4), box(2.8, .15, 2.8, 0, 2.5)]),
  shelter: () => merge([box(3.2, .12, 1.6, 0, 2.5), box(.12, 2.5, .12, -1.5, 0, -.7), box(.12, 2.5, .12, 1.5, 0, -.7), box(3.2, 2.2, .05, 0, .3, -.78), box(2.4, .08, .4, 0, .45, -.5)]),
  bbq: () => merge([box(.9, .25, .6, 0, .75), box(.08, .75, .08, -.38, 0, -.22), box(.08, .75, .08, .38, 0, -.22), box(.08, .75, .08, -.38, 0, .22), box(.08, .75, .08, .38, 0, .22)], LEGIBLE),
  fountain: () => merge([cylinder(2.4, .5, 0, 2.4, 20), cylinder(.35, 1.6, 0, .25, 10), cylinder(.9, .15, 1.6, .9, 14)]),
  bikeRack: () => merge([-1, 0, 1].flatMap(x => [box(.06, .8, .06, x, 0, -.3), box(.06, .8, .06, x, 0, .3), box(.06, .06, .66, x, .8)]), LEGIBLE),
  marker: () => merge([cylinder(.18, BADGE_HEIGHT - 1.2, 0, .12, 6), cylinder(.9, .15, 0, .9, 12)]),
};
const cache = new Map<PoiForm, THREE.BufferGeometry>();
/** Shared geometry: callers must not dispose it. Use createPoiGeometry for an owned copy. */
export function poiGeometry(form: PoiForm) {
  let geometry = cache.get(form);
  if (!geometry) { geometry = builders[form](); geometry.computeBoundingSphere(); cache.set(form, geometry); }
  return geometry;
}
export const createPoiGeometry = (form: PoiForm) => builders[form]();
/** Ground position plus the mapped heading; OSM bearings are clockwise from north (scene -Z). */
export function poiMatrix(x: number, y: number, z: number, tags: Record<string, string>, form: PoiForm) {
  const matrix = new THREE.Matrix4().makeRotationY(form === 'marker' ? 0 : Math.PI - poiHeading(tags));
  return matrix.setPosition(x, y, z);
}
/** Places derived from a building outline float their badge just above that building's roof. */
export function badgeHeight(tags: Record<string, string>) {
  return isBuilding(tags) ? Math.max(BADGE_HEIGHT, buildingDimensions(tags).height + 3) : BADGE_HEIGHT;
}
