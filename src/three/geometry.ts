import * as THREE from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildingDimensions, type Feature, type GeoPoint } from '../data/layers.ts';
import { terrainHeight, type Terrain } from '../data/terrain.ts';
export type Projection = (p: GeoPoint) => THREE.Vector2;
import { palette, sceneColors } from './palette.ts';
import { landUseCategory } from '../data/landUseStyle.ts';
export { palette } from './palette.ts';
export const safeColor = (value: string | undefined, fallback: string) => value && (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value) || Object.prototype.hasOwnProperty.call(THREE.Color.NAMES, value.toLowerCase())) ? value : fallback;
function makeShape(feature: Feature, project: Projection) {
  const shape = new THREE.Shape(feature.geometry.map(project));
  for (const hole of feature.holes || []) shape.holes.push(new THREE.Path(hole.map(project)));
  return shape;
}
type Line = [number, number, number];
type RoofProfile = { metric: (u: number, v: number) => number; profile: (t: number) => number; lines: Line[] };
const slope = (t: number) => 1 - t;
const evenly = (count: number, half: number, axis: 0 | 1) => Array.from({ length: count * 2 - 1 }, (_, i): Line => {
  const offset = (i - count + 1) * half / count;
  return axis ? [0, 1, -offset] : [1, 0, -offset];
});
/**
 * Height across a footprint in a local frame: u runs along the ridge (half length a), v down the slope (half width b).
 * `metric` is 0 at the top and 1 at the eaves, `profile` turns it into a share of the roof height, and `lines`
 * are where the surface folds, so triangles are split there and every face stays planar.
 */
function roofProfile(shape: string, a: number, b: number): RoofProfile {
  const hip = Math.max(0, a - b), hipLines: Line[] = [[0, 1, 0], [1, 0, 0], [1, -1, -hip], [1, 1, -hip], [-1, -1, -hip], [-1, 1, -hip]];
  const hipped = (u: number, v: number) => Math.max(Math.abs(v) / b, (Math.abs(u) - hip) / b);
  const contour = (t: number): Line[] => [[0, 1, -t * b], [0, 1, t * b], [1, 0, -(hip + t * b)], [1, 0, hip + t * b]];
  const ellipse = (u: number, v: number) => Math.hypot(u / a, v / b), grid = [...evenly(8, a, 0), ...evenly(8, b, 1)];
  switch (shape) {
    case 'skillion': case 'lean_to': return { metric: (_, v) => (v + b) / (2 * b), profile: slope, lines: [] };
    case 'hipped': case 'side_hipped': return { metric: hipped, profile: slope, lines: hipLines };
    // Gable ends whose top half is hipped back.
    case 'half-hipped': case 'half_hipped': return { metric: (u, v) => Math.max(Math.abs(v) / b, Math.min((Math.abs(u) - hip) / b, .5)), profile: slope, lines: [...hipLines, ...contour(.5)] };
    case 'pyramidal': return { metric: (u, v) => Math.max(Math.abs(u) / a, Math.abs(v) / b), profile: slope, lines: [[1, 0, 0], [0, 1, 0], [b, -a, 0], [b, a, 0]] };
    // Steep lower slope rising to three quarters of the height, shallow upper slope.
    case 'gambrel': return { metric: (_, v) => Math.abs(v) / b, profile: t => t <= .55 ? 1 - .25 * t / .55 : .75 * (1 - t) / .45, lines: [[0, 1, 0], [0, 1, -.55 * b], [0, 1, .55 * b]] };
    case 'mansard': return { metric: hipped, profile: t => t <= .7 ? 1 - .3 * t / .7 : .7 * (1 - t) / .3, lines: [...hipLines, ...contour(.7)] };
    case 'round': return { metric: (_, v) => Math.abs(v) / b, profile: t => Math.sqrt(Math.max(0, 1 - t * t)), lines: evenly(8, b, 1) };
    case 'dome': return { metric: ellipse, profile: t => Math.sqrt(Math.max(0, 1 - t * t)), lines: grid };
    // A bulb that swells above the eaves and narrows to a point.
    case 'onion': return { metric: ellipse, profile: t => t >= 1 ? 0 : .72 * Math.sqrt(1 - t * t) + .28 * (1 - t) ** 3, lines: grid };
    case 'cone': case 'conical': return { metric: ellipse, profile: slope, lines: grid };
    default: return { metric: (_, v) => Math.abs(v) / b, profile: slope, lines: [[0, 1, 0]] };
  }
}
/** Split a polygon by a line into its two sides; either side may come back empty. */
function splitPolygon(polygon: THREE.Vector2[], side: (p: THREE.Vector2) => number) {
  const front: THREE.Vector2[] = [], back: THREE.Vector2[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], dp = side(p), dq = side(q);
    if (dp >= 0) front.push(p);
    if (dp <= 0) back.push(p);
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) { const cut = p.clone().lerp(q, dp / (dp - dq)); front.push(cut); back.push(cut); }
  }
  return [front, back].filter(part => part.length >= 3);
}
/** Compass bearing in degrees or as letters (N, NNE, …). */
function bearing(value: string | undefined) {
  const raw = value?.trim().toUpperCase();
  if (!raw) return NaN;
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'].indexOf(raw);
  return compass >= 0 ? compass * 22.5 : parseFloat(raw);
}
/** Roof volume above the walls, aligned to the footprint's longest edge unless the map gives a roof direction. */
export function roofGeometry(shape: THREE.Shape, height: number, tags: Record<string, string>) {
  const { shape: outline, holes } = shape.extractPoints(12);
  const triangles = THREE.ShapeUtils.triangulateShape(outline, holes);
  const vertices = [...outline, ...holes.flat()];
  // `down` points down the slope; the ridge runs across it.
  const direction = bearing(tags['roof:direction']);
  let down: THREE.Vector2;
  if (Number.isFinite(direction)) down = new THREE.Vector2(Math.sin(direction * Math.PI / 180), Math.cos(direction * Math.PI / 180));
  else {
    let longest = new THREE.Vector2(1, 0), length = 0;
    for (let i = 0; i < outline.length; i++) { const edge = outline[(i + 1) % outline.length].clone().sub(outline[i]); if (edge.length() > length) { length = edge.length(); longest = edge.normalize(); } }
    down = tags['roof:orientation'] === 'across' ? longest : new THREE.Vector2(-longest.y, longest.x);
  }
  const along = new THREE.Vector2(down.y, -down.x);
  const us = outline.map(p => p.dot(along)), vs = outline.map(p => p.dot(down));
  const [u0, u1, v0, v1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const a = Math.max(.1, (u1 - u0) / 2), b = Math.max(.1, (v1 - v0) / 2), uc = (u0 + u1) / 2, vc = (v0 + v1) / 2;
  const local = (p: THREE.Vector2) => [p.dot(along) - uc, p.dot(down) - vc] as const;
  const { metric, profile, lines } = roofProfile(tags['roof:shape'], a, b);
  const sides = lines.map(([x, y, c]) => (p: THREE.Vector2) => { const [u, v] = local(p); return x * u + y * v + c; });
  const raised = (p: THREE.Vector2) => { const [u, v] = local(p); return height * Math.max(0, Math.min(1, profile(Math.min(1, Math.max(0, metric(u, v)))))); };
  const positions: number[] = [];
  const append = (p: THREE.Vector2) => positions.push(p.x, p.y, raised(p));
  for (const triangle of triangles) {
    let pieces = [triangle.map(i => vertices[i])];
    for (const side of sides) pieces = pieces.flatMap(piece => splitPolygon(piece, side));
    for (const piece of pieces) for (let i = 1; i < piece.length - 1; i++) { append(piece[0]); append(piece[i]); append(piece[i + 1]); }
  }
  // Vertical end walls (gables, skillion sides) close the volume between the wall top and the roof surface.
  for (const ring of [outline, ...holes]) for (let i = 0; i < ring.length; i++) {
    const start = ring[i], end = ring[(i + 1) % ring.length], cuts = [0, 1];
    for (const side of sides) { const ds = side(start), de = side(end); if (ds * de < 0) cuts.push(ds / (ds - de)); }
    cuts.sort((x, y) => x - y);
    for (let j = 0; j < cuts.length - 1; j++) {
      const p = start.clone().lerp(end, cuts[j]), q = start.clone().lerp(end, cuts[j + 1]), hp = raised(p), hq = raised(q);
      if (hp < 1e-3 && hq < 1e-3) continue;
      positions.push(p.x,p.y,0, q.x,q.y,0, q.x,q.y,hq, p.x,p.y,0, q.x,q.y,hq, p.x,p.y,hp);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Curved roofs share normals across their facets so they shade smoothly; the eave and gable edges stay sharp.
  if (['round', 'dome', 'onion', 'cone', 'conical'].includes(tags['roof:shape'])) return toCreasedNormals(geometry, Math.PI / 5);
  geometry.computeVertexNormals(); return geometry;
}
/** World-space segments (pairs of x, y, z) at each floor slab, set just off the facade so they never z-fight with it. */
export function floorSegments(feature: Feature, project: Projection, terrain: Terrain | null) {
  const dimensions = buildingDimensions(feature.tags), spacing = dimensions.bodyHeight / dimensions.floors;
  if (dimensions.floors < 2 || spacing < 1.5) return new Float32Array();
  const center = feature.geometry.reduce((p, v) => ({ lat: p.lat + v.lat / feature.geometry.length, lon: p.lon + v.lon / feature.geometry.length }), { lat: 0, lon: 0 });
  const bottom = terrainHeight(terrain, center) + dimensions.base + .2, out: number[] = [];
  for (const [index, ring] of [feature.geometry, ...(feature.holes || [])].entries()) {
    const points = ring.map(project);
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
    // Push each edge away from the solid: outward on the outer ring, into the courtyard on holes.
    const outward = (area > 0 ? 1 : -1) * (index ? -1 : 1) * .08;
    for (let i = 0; i < points.length - 1; i++) {
      const p = points[i], q = points[i + 1], edge = q.clone().sub(p);
      if (edge.lengthSq() < 1e-6) continue;
      const normal = new THREE.Vector2(edge.y, -edge.x).normalize().multiplyScalar(outward);
      for (let floor = 1; floor < dimensions.floors; floor++) {
        const y = bottom + floor * spacing;
        out.push(p.x + normal.x, y, -(p.y + normal.y), q.x + normal.x, y, -(q.y + normal.y));
      }
    }
  }
  return new Float32Array(out);
}
export function featureColor(feature: Feature, roof = false) {
  if (feature.layer === 'Buildings') return safeColor(feature.tags[roof ? 'roof:colour' : 'building:colour'], roof ? sceneColors.roof : palette.Buildings);
  return feature.layer === 'Land use' ? landUseCategory(feature.tags.landuse).color : palette[feature.layer];
}
export function buildFeatureGeometries(feature: Feature, project: Projection, terrain: Terrain | null) {
  const building = feature.layer === 'Buildings';
  const center = feature.geometry.reduce((p,v) => ({ lat: p.lat + v.lat / feature.geometry.length, lon: p.lon + v.lon / feature.geometry.length }), { lat: 0, lon: 0 });
  const anchor = project(center);
  const dimensions = buildingDimensions(feature.tags);

    if (feature.kind === 'point') return [];
    if (feature.kind === 'line') {
      // Add intermediate samples so long road segments follow elevation.
      const linePoints: THREE.Vector3[] = [];
      for (let i = 0; i < feature.geometry.length - 1; i++) {
        const a = feature.geometry[i], b = feature.geometry[i + 1];
        const segments = terrain ? Math.min(100, Math.max(1, Math.ceil(project(a).distanceTo(project(b)) / 40))) : 1;
        for (let j = 0; j < segments; j++) {
          const p = { lat: a.lat + (b.lat - a.lat) * j / segments, lon: a.lon + (b.lon - a.lon) * j / segments }, v = project(p);
          linePoints.push(new THREE.Vector3(v.x, terrainHeight(terrain, p) + .8, -v.y));
        }
      }
      const p = feature.geometry[feature.geometry.length - 1], v = project(p); linePoints.push(new THREE.Vector3(v.x, terrainHeight(terrain,p) + .8, -v.y));
      return [new THREE.BufferGeometry().setFromPoints(linePoints)];
    }
    const shape = makeShape(feature, project);
    if (building) return [new THREE.ExtrudeGeometry(shape, { depth: dimensions.bodyHeight, bevelEnabled: false }), ...(dimensions.roofHeight ? [roofGeometry(shape, dimensions.roofHeight, feature.tags)] : [])];
    const geometry = new THREE.ShapeGeometry(shape);
    // Flat area triangles are subdivided to follow the sampled terrain mesh.
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const sourcePositions = source.getAttribute('position');
    const box = new THREE.Box2().setFromPoints(feature.geometry.map(project));
    const subdivisions = terrain ? Math.min(8, Math.max(1, Math.ceil(box.getSize(new THREE.Vector2()).length() / 60))) : 1, out: number[] = [];
    const inverse = (v: THREE.Vector2) => ({ lat: center.lat + (v.y - anchor.y) / 111320, lon: center.lon + (v.x - anchor.x) / (111320 * Math.cos(center.lat * Math.PI / 180)) });
    const emit = (p: THREE.Vector2) => { out.push(p.x, p.y, terrainHeight(terrain, inverse(p)) + (feature.layer === 'Land use' ? .12 : .35)); };
    for (let i = 0; i < sourcePositions.count; i += 3) {
      const a = new THREE.Vector2(sourcePositions.getX(i), sourcePositions.getY(i)), b = new THREE.Vector2(sourcePositions.getX(i+1), sourcePositions.getY(i+1)), c = new THREE.Vector2(sourcePositions.getX(i+2), sourcePositions.getY(i+2));
      const at = (x: number, y: number) => a.clone().add(b.clone().sub(a).multiplyScalar(x / subdivisions)).add(c.clone().sub(a).multiplyScalar(y / subdivisions));
      for (let x = 0; x < subdivisions; x++) for (let y = 0; y < subdivisions - x; y++) {
        emit(at(x,y)); emit(at(x+1,y)); emit(at(x,y+1));
        if (x + y < subdivisions - 1) { emit(at(x+1,y)); emit(at(x+1,y+1)); emit(at(x,y+1)); }
      }
    }
    if (source !== geometry) source.dispose(); geometry.dispose();
    const draped = new THREE.BufferGeometry(); draped.setAttribute('position', new THREE.Float32BufferAttribute(out,3)); draped.computeVertexNormals(); return [draped];

}

/** Storey lines: a darker shade of the facade, so they read on any building colour. */
export const floorColor = (color: string) => `#${new THREE.Color(color).offsetHSL(0, 0, -.22).getHexString()}`;
/** Land-use boundary darker than its fill, so an area still reads where buildings cover most of it. */
export const outlineColor = (color: string) => `#${new THREE.Color(color).offsetHSL(0, .05, -.2).getHexString()}`;
/** World-space line segments (pairs of x, y, z) tracing an area's outer ring and holes just above its fill. */
export function outlineSegments(feature: Feature, project: Projection, terrain: Terrain | null, lift = .16) {
  const out: number[] = [];
  for (const ring of [feature.geometry, ...(feature.holes || [])]) for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], pa = project(a), pb = project(b);
    out.push(pa.x, terrainHeight(terrain, a) + lift, -pa.y, pb.x, terrainHeight(terrain, b) + lift, -pb.y);
  }
  return new Float32Array(out);
}
