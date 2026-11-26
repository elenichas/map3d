export type SceneLighting = 'day' | 'night';
export const lightingPresets = {
  // Day: soft studio light, so white massing reads through gentle grey side faces.
  day: { background:'#eef0f2', ambient:1.25, key:2.6, keyColor:'#ffffff', sky:'#ffffff', ground:'#c9ced6', hemisphere:.7, fill:.35, fillColor:'#dcecf9', grid:'#e1e3e7', sections:'#d4d7dd', surfaceTint:'#ffffff' },
  night: { background:'#0d0f13', ambient:.4, key:1.35, keyColor:'#d3e6ff', sky:'#a3b7cc', ground:'#16181d', hemisphere:.75, fill:.35, fillColor:'#4cb4f5', grid:'#1f2329', sections:'#2c3139', surfaceTint:'#5f6570' },
} as const;
