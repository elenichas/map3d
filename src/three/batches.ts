import { sceneColors } from './palette.ts';
import * as THREE from 'three';
import { buildingDimensions, type Feature, type VectorLayer } from '../data/layers.ts';
import { terrainHeight, type Terrain } from '../data/terrain.ts';
import { buildFeatureGeometries, featureColor, floorColor, floorSegments, outlineColor, outlineSegments } from './geometry.ts';
import { compareSurfaces, isSurface } from './surfaces.ts';
import { featureSublayer } from '../data/sublayers.ts';
import { poiStyle } from '../data/poiStyle.ts';
import { badgeHeight, poiMatrix } from './poiShapes.ts';
export type Origin = { lat: number; lng: number };
export type Range = { start: number; end: number; feature: number; name: string };
export type Batch = {
  key: string; layer: VectorLayer; sublayer: string; kind: 'mesh' | 'line' | 'instances' | 'badges';
  positions?: Float32Array; normals?: Float32Array; colors?: Uint8Array;
  matrices?: Float32Array; indices?: Uint32Array;
  /** Instances: 'trunk' | 'crown' for trees, otherwise a PoiForm. Badges: 'badge'. Lines: 'floors' for storey lines. */
  form?: string; color?: string; icon?: string;
  ranges: Range[]; bounds: number[];
};
export function projection(origin: Origin) {
  const longitudeScale = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return (p: { lat: number; lon: number }) => new THREE.Vector2((p.lon - origin.lng) * longitudeScale, (p.lat - origin.lat) * 111320);
}
export function featureAt(ranges: Range[], vertex: number) {
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, range = ranges[mid];
    if (vertex < range.start) hi = mid - 1;
    else if (vertex >= range.end) lo = mid + 1;
    else return range.feature;
  }
  return undefined;
}
type Part = { positions: Float32Array; normals?: Float32Array; color: THREE.Color; feature: number; name: string };
/** 500 m chunks retain frustum culling and bound the cost of click picking. */
export function buildBatches(features: Feature[], origin: Origin, terrain: Terrain | null): Batch[] {
  const project = projection(origin);
  const groups = new Map<string, { layer: VectorLayer; sublayer: string; kind: 'mesh' | 'line'; form?: string; parts: Part[]; vertices: number }>();
  const points = new Map<string, { layer: VectorLayer; sublayer: string; form: string; color?: string; icon?: string; badge?: boolean; matrices: number[]; colors: number[]; indices: number[] }>();
  const pointGroup = (key: string, init: () => Omit<NonNullable<ReturnType<typeof points.get>>, 'matrices' | 'colors' | 'indices'>) => {
    let group = points.get(key);
    if (!group) { group = { ...init(), matrices: [], colors: [], indices: [] }; points.set(key, group); }
    return group;
  };
  const ordered = features.map((feature, index) => ({ feature, index }));
  ordered.sort((a, b) => isSurface(a.feature) && isSurface(b.feature) ? compareSurfaces(a.feature, b.feature) : Number(isSurface(b.feature)) - Number(isSurface(a.feature)));
  ordered.forEach(({feature, index}) => {
    const center = feature.geometry.reduce((p, v) => ({ lat: p.lat + v.lat / feature.geometry.length, lon: p.lon + v.lon / feature.geometry.length }), { lat: 0, lon: 0 });
    const anchor = project(center), ground = terrainHeight(terrain, center);
    const sublayer = featureSublayer(feature).id;
    const tile = `${feature.layer}/${encodeURIComponent(sublayer)}/${Math.floor(anchor.x / 500)}/${Math.floor(anchor.y / 500)}`;
    if (feature.kind === 'point') {
      if (feature.tags.natural === 'tree') {
        for (const form of ['trunk', 'crown']) {
          const group = pointGroup(`${tile}/${form}`, () => ({ layer: feature.layer, sublayer, form, color: form === 'trunk' ? sceneColors.trunk : featureColor(feature) }));
          group.matrices.push(...new THREE.Matrix4().makeTranslation(anchor.x, ground + (form === 'trunk' ? 2 : 6), -anchor.y).elements);
          group.indices.push(index);
        }
        return;
      }
      const style = poiStyle(feature);
      const shape = pointGroup(`${tile}/poi:${style.form}`, () => ({ layer: feature.layer, sublayer, form: style.form }));
      shape.matrices.push(...poiMatrix(anchor.x, ground, -anchor.y, feature.tags, style.form).elements);
      // sRGB bytes straight from the hex colour; the viewer converts them to linear once.
      const hex = parseInt(style.category.color.slice(1), 16);
      shape.colors.push(hex >> 16, (hex >> 8) & 255, hex & 255);
      shape.indices.push(index);
      if (style.form === 'marker') {
        // One draw call per icon: all badges in a group share a texture.
        const badge = pointGroup(`${tile}/badge:${style.icon}:${style.category.id}`, () => ({ layer: feature.layer, sublayer, form: 'badge', badge: true, icon: style.icon, color: style.category.color }));
        badge.matrices.push(anchor.x, ground + badgeHeight(feature.tags), -anchor.y);
        badge.indices.push(index);
      }
      return;
    }
    const geometries = buildFeatureGeometries(feature, project, terrain);
    geometries.forEach((original, partIndex) => {
      const kind = feature.kind === 'line' ? 'line' : 'mesh';
      let positions: Float32Array, normals: Float32Array | undefined;
      if (kind === 'line') {
        const source = original.getAttribute('position');
        positions = new Float32Array(Math.max(0, source.count - 1) * 6);
        for (let i = 0; i < source.count - 1; i++) for (let j = 0; j < 2; j++) positions.set([source.getX(i+j), source.getY(i+j), source.getZ(i+j)], (i*2+j)*3);
        original.dispose();
      } else {
        const dimensions = buildingDimensions(feature.tags);
        if (partIndex) original.translate(0, 0, dimensions.bodyHeight);
        original.rotateX(-Math.PI / 2);
        if (feature.layer === 'Buildings') original.translate(0, ground + dimensions.base + .2, 0);
        const geometry = original.index ? original.toNonIndexed() : original;
        positions = geometry.getAttribute('position').array as Float32Array;
        normals = geometry.getAttribute('normal').array as Float32Array;
        geometry.dispose(); if (geometry !== original) original.dispose();
      }
      const baseKey = `${tile}/${kind}`;
      let suffix = 0, key = baseKey, group = groups.get(key);
      while (group && group.vertices + positions.length / 3 > 120000 && group.vertices > 0) { key = `${baseKey}/${++suffix}`; group = groups.get(key); }
      if (!group) { group = { layer: feature.layer, sublayer, kind, parts: [], vertices: 0 }; groups.set(key, group); }
      group.parts.push({ positions, normals, color: new THREE.Color(featureColor(feature, partIndex > 0)), feature: index, name: feature.key + (partIndex ? '/roof' : '') });
      group.vertices += positions.length / 3;
    });
    if (feature.layer === 'Buildings' && feature.kind === 'area') {
      // Storey lines get their own batch so they can be hidden without rebuilding the buildings.
      const positions = floorSegments(feature, project, terrain), key = `${tile}/floors`;
      if (positions.length) {
        let group = groups.get(key);
        if (!group) { group = { layer: feature.layer, sublayer, kind: 'line', form: 'floors', parts: [], vertices: 0 }; groups.set(key, group); }
        group.parts.push({ positions, color: new THREE.Color(floorColor(featureColor(feature))), feature: index, name: `${feature.key}/floors` });
        group.vertices += positions.length / 3;
      }
    }
    if (feature.layer === 'Land use' && feature.kind === 'area') {
      // Boundary lines share the line batch, so picking an outline selects its area.
      const positions = outlineSegments(feature, project, terrain), key = `${tile}/line`;
      let group = groups.get(key);
      if (!group) { group = { layer: feature.layer, sublayer, kind: 'line', parts: [], vertices: 0 }; groups.set(key, group); }
      group.parts.push({ positions, color: new THREE.Color(outlineColor(featureColor(feature))), feature: index, name: `${feature.key}/outline` });
      group.vertices += positions.length / 3;
    }
  });
  const result: Batch[] = [];
  for (const [key, group] of groups) {
    const positions = new Float32Array(group.vertices * 3);
    const normals = group.kind === 'mesh' ? new Float32Array(positions.length) : undefined;
    const colors = new Uint8Array(positions.length);
    const ranges: Range[] = [], bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    let offset = 0;
    for (const part of group.parts) {
      positions.set(part.positions, offset);
      if (normals && part.normals) normals.set(part.normals, offset);
      for (let i = 0; i < part.positions.length; i += 3) {
        colors[offset+i] = Math.round(part.color.r * 255); colors[offset+i+1] = Math.round(part.color.g * 255); colors[offset+i+2] = Math.round(part.color.b * 255);
        for (let axis = 0; axis < 3; axis++) { bounds[axis] = Math.min(bounds[axis], part.positions[i+axis]); bounds[axis+3] = Math.max(bounds[axis+3], part.positions[i+axis]); }
      }
      ranges.push({ start: offset / 3, end: (offset + part.positions.length) / 3, feature: part.feature, name: part.name });
      offset += part.positions.length;
    }
    result.push({ key, layer: group.layer, sublayer: group.sublayer, kind: group.kind, form: group.form, positions, normals, colors, ranges, bounds });
  }
  for (const [key, group] of points) {
    const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    const stride = group.badge ? 3 : 16, offset = group.badge ? 0 : 12, padding = group.badge ? 1 : 5;
    for (let i = 0; i < group.indices.length; i++) for (let axis = 0; axis < 3; axis++) {
      const value = group.matrices[i * stride + offset + axis];
      bounds[axis] = Math.min(bounds[axis], value - padding); bounds[axis+3] = Math.max(bounds[axis+3], value + padding);
    }
    const common = { key, layer: group.layer, sublayer: group.sublayer, form: group.form, color: group.color, icon: group.icon, indices: new Uint32Array(group.indices), ranges: [], bounds };
    if (group.badge) result.push({ ...common, kind: 'badges', positions: new Float32Array(group.matrices) });
    else result.push({ ...common, kind: 'instances', matrices: new Float32Array(group.matrices), colors: group.colors.length ? new Uint8Array(group.colors) : undefined });
  }
  return result;
}
export function transferBuffers(batches: Batch[]) {
  return batches.flatMap(batch => [batch.positions, batch.normals, batch.colors, batch.matrices, batch.indices].filter(Boolean).map(array => array!.buffer as ArrayBuffer));
}
