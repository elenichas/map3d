import { computeSunlight, type SunlightInput } from './sun';

self.onmessage = ({ data }: MessageEvent<SunlightInput>) => {
  try { const result = computeSunlight(data); self.postMessage({ result }, { transfer: [result.hours.buffer] }); }
  catch { self.postMessage({ error: 'Could not calculate sunlight for this boundary.' }); }
};
