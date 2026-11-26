import { useEffect, useMemo, useState } from 'react';
import type { Feature } from '../data/layers';
import { solarDeclination, sunBuildings, sunProjector, type SunlightResult } from '../data/sun';

type Point = { lat: number; lng: number };
const cache = new Map<string, SunlightResult>();
const keys = new WeakMap<Feature[], number>();
let serial = 0;
const featureKey = (features: Feature[]) => { let key = keys.get(features); if (key === undefined) { key = ++serial; keys.set(features, key); } return key; };

/** Direct-sun hours on open ground for one day, computed off the main thread and cached per data, boundary and date. */
export function useSunlight(points: Point[], features: Feature[], date: Date, enabled = true) {
  const origin = useMemo(() => ({ lat: points.reduce((n, p) => n + p.lat, 0) / Math.max(1, points.length), lng: points.reduce((n, p) => n + p.lng, 0) / Math.max(1, points.length) }), [points]);
  const day = date.toISOString().slice(0, 10);
  const key = `${featureKey(features)}|${points.map(p => `${p.lat},${p.lng}`).join(';')}|${day}`;
  const [state, setState] = useState<{ key: string; result?: SunlightResult; error?: string }>();
  useEffect(() => {
    if (!enabled || points.length < 3) return;
    const saved = cache.get(key);
    if (saved) { setState({ key, result: saved }); return; }
    let worker: Worker | undefined, active = true;
    const timer = setTimeout(() => {
      try {
        const project = sunProjector(origin);
        worker = new Worker(new URL('../data/sunlight.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = ({ data }) => {
          if (!active) return;
          if (data.result) cache.set(key, data.result);
          setState({ key, ...data }); worker?.terminate();
        };
        worker.onerror = () => { if (active) setState({ key, error: 'Sunlight could not be calculated.' }); worker?.terminate(); };
        worker.postMessage({ buildings: sunBuildings(features, project), boundary: points.flatMap(p => project(p.lat, p.lng)), latitude: origin.lat, declination: solarDeclination(new Date(`${day}T12:00:00Z`)) });
      } catch { if (active) setState({ key, error: 'Your browser could not start the sunlight calculation.' }); }
    }, 150);
    return () => { active = false; clearTimeout(timer); worker?.terminate(); };
  }, [key, enabled, features, points, origin, day]);
  const current = state?.key === key ? state : undefined;
  return { result: current?.result, error: current?.error, busy: enabled && !current, origin };
}
