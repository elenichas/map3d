import * as THREE from 'three';
import type { Feature } from '../data/layers.ts';
import type { Batch } from './batches.ts';

export type BuildingColors = Map<string, string> | null;
/** Write per-building colours into a batch's vertex colours, or restore the mapped originals. */
export function recolorBuildings(batch: Batch, features: Feature[], attribute: THREE.BufferAttribute, colors: BuildingColors) {
  const target = attribute.array as Uint8Array, original = batch.colors!, color = new THREE.Color();
  for (const range of batch.ranges) {
    const hex = colors?.get(features[range.feature].key);
    if (!hex) { target.set(original.subarray(range.start * 3, range.end * 3), range.start * 3); continue; }
    // Roofs a shade lighter than walls (lit tops) and storey lines darker, matching the default look.
    color.set(hex); if (range.name.endsWith('/roof')) color.offsetHSL(0, 0, .06); else if (range.name.endsWith('/floors')) color.offsetHSL(0, 0, -.14);
    const r = Math.round(color.r * 255), g = Math.round(color.g * 255), b = Math.round(color.b * 255);
    for (let i = range.start * 3; i < range.end * 3; i += 3) { target[i] = r; target[i+1] = g; target[i+2] = b; }
  }
  attribute.needsUpdate = true;
}
