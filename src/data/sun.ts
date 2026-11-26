/**
 * Sun position and direct-sunlight hours for a site.
 *
 * Times are local apparent solar time (12:00 = solar noon), so results do not depend on the
 * site's time zone or daylight saving. Coordinates are local planar metres: x east, y north.
 */
import { buildingDimensions, type Feature } from './layers.ts';

const RAD = Math.PI / 180;

/** Solar declination in degrees at noon UTC on the given calendar date. */
export function solarDeclination(date: Date) {
  const noon = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12);
  const n = noon / 86400000 + 2440587.5 - 2451545;
  const g = (357.528 + .9856003 * n) * RAD, lambda = (280.46 + .9856474 * n + 1.915 * Math.sin(g) + .02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - .0000004 * n) * RAD;
  return Math.asin(Math.sin(epsilon) * Math.sin(lambda)) / RAD;
}

/** Sun azimuth (degrees clockwise from north) and altitude (degrees above the horizon). */
export function sunPosition(latitude: number, declination: number, solarHours: number) {
  const lat = latitude * RAD, dec = declination * RAD, hour = (solarHours - 12) * 15 * RAD;
  const altitude = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hour));
  const azimuth = Math.atan2(-Math.sin(hour) * Math.cos(dec), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hour));
  return { azimuth: (azimuth / RAD + 360) % 360, altitude: altitude / RAD };
}

/** Sunrise and sunset in solar hours (upper limb, with refraction); null for polar night, full day for midnight sun. */
export function daylight(latitude: number, declination: number) {
  const lat = latitude * RAD, dec = declination * RAD;
  const cos = (Math.sin(-.833 * RAD) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  if (cos >= 1) return null;
  const half = cos <= -1 ? 12 : Math.acos(cos) / RAD / 15;
  return { sunrise: 12 - half, sunset: 12 + half, length: half * 2 };
}

const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassPoint = (azimuth: number) => compass[Math.round(azimuth / 45) % 8];
export function formatSolarTime(hours: number) {
  const minutes = Math.round(hours * 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Study dates used in planning shadow reviews, for the current year. */
export function studyDates(year = new Date().getFullYear()) {
  return [
    { id: 'winter', label: 'Winter', detail: '21 Dec', date: new Date(Date.UTC(year, 11, 21)) },
    { id: 'equinox', label: 'Equinox', detail: '20 Mar', date: new Date(Date.UTC(year, 2, 20)) },
    { id: 'summer', label: 'Summer', detail: '21 Jun', date: new Date(Date.UTC(year, 5, 21)) },
  ] as const;
}

/* ------------------------------------------------------------ Sunlight hours */

/** A building as a prism: footprint ring as flat [x, y, x, y, …] in metres, and its vertical extent. */
export type SunBuilding = { ring: number[]; base: number; top: number; box: [number, number, number, number] };
export type SunlightInput = { buildings: SunBuilding[]; boundary: number[]; latitude: number; declination: number; step?: number; cells?: number };
export type SunlightResult = {
  cols: number; rows: number; cell: number; minX: number; maxY: number;
  /** Hours of direct sun per cell, north row first; NaN outside the boundary or under a building. */
  hours: Float32Array;
  day: { sunrise: number; sunset: number; length: number } | null;
  stats: { cells: number; mean: number; atLeast: Record<2 | 4 | 6, number>; buckets: { label: string; min: number; max: number; share: number }[] };
};

function insideRing(x: number, y: number, ring: number[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const xi = ring[i], yi = ring[i + 1], xj = ring[j], yj = ring[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
/** Whether a ray from (x, y) toward the sun, rising at `slope` metres per metre, passes through the prism. */
function blocks(b: SunBuilding, x: number, y: number, dx: number, dy: number, slope: number, crossings: number[]) {
  crossings.length = 0;
  const ring = b.ring;
  for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
    const ax = ring[j], ay = ring[j + 1], ex = ring[i] - ax, ey = ring[i + 1] - ay;
    const denominator = dx * ey - dy * ex;
    if (Math.abs(denominator) < 1e-12) continue;
    const t = ((ax - x) * ey - (ay - y) * ex) / denominator, u = ((ax - x) * dy - (ay - y) * dx) / denominator;
    if (t > 0 && u >= 0 && u < 1) crossings.push(t);
  }
  if (!crossings.length) return false;
  crossings.sort((a, c) => a - c);
  // Pairs of crossings bound the stretches of the ray over the footprint; an odd count means it starts inside.
  if (crossings.length % 2) crossings.unshift(0);
  for (let k = 0; k + 1 < crossings.length; k += 2) {
    if (crossings[k] * slope <= b.top && crossings[k + 1] * slope >= b.base) return true;
  }
  return false;
}

/** Direct-sun hours on open ground across the boundary, sampled every `step` hours between sunrise and sunset. */
export function computeSunlight({ buildings, boundary, latitude, declination, step = .25, cells = 120 }: SunlightInput): SunlightResult {
  const xs = boundary.filter((_, i) => i % 2 === 0), ys = boundary.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const cell = Math.max(1, Math.max(maxX - minX, maxY - minY) / cells);
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell)), rows = Math.max(1, Math.ceil((maxY - minY) / cell));
  // Spatial hash of building boxes, so each ray only tests buildings near its path.
  const size = 25, hash = new Map<string, number[]>();
  buildings.forEach((b, index) => {
    for (let gx = Math.floor(b.box[0] / size); gx <= Math.floor(b.box[2] / size); gx++)
      for (let gy = Math.floor(b.box[1] / size); gy <= Math.floor(b.box[3] / size); gy++) {
        const key = `${gx},${gy}`, list = hash.get(key); if (list) list.push(index); else hash.set(key, [index]);
      }
  });
  const near = (x: number, y: number) => hash.get(`${Math.floor(x / size)},${Math.floor(y / size)}`);
  const hours = new Float32Array(cols * rows), open: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = minX + (c + .5) * cell, y = maxY - (r + .5) * cell, index = r * cols + c;
    const covered = !insideRing(x, y, boundary) || (near(x, y) || []).some(i => { const b = buildings[i]; return b.base < 1 && x >= b.box[0] && x <= b.box[2] && y >= b.box[1] && y <= b.box[3] && insideRing(x, y, b.ring); });
    hours[index] = covered ? NaN : 0;
    if (!covered) open.push(index);
  }
  const day = daylight(latitude, declination), maxTop = Math.max(1, ...buildings.map(b => b.top));
  const stamp = new Int32Array(buildings.length).fill(-1), crossings: number[] = [];
  let ray = 0;
  if (day) for (let time = day.sunrise + step / 2; time < day.sunset; time += step) {
    const sun = sunPosition(latitude, declination, time);
    if (sun.altitude <= .5) continue;
    const azimuth = sun.azimuth * RAD, dx = Math.sin(azimuth), dy = Math.cos(azimuth), slope = Math.tan(sun.altitude * RAD);
    const reach = Math.min(maxTop / slope, 1500);
    for (const index of open) {
      const x = minX + (index % cols + .5) * cell, y = maxY - (Math.floor(index / cols) + .5) * cell;
      ray++;
      let shaded = false;
      for (let d = 0; d <= reach + size && !shaded; d += size / 2) {
        for (const i of near(x + dx * d, y + dy * d) || []) {
          if (stamp[i] === ray) continue;
          stamp[i] = ray;
          if (blocks(buildings[i], x, y, dx, dy, slope, crossings)) { shaded = true; break; }
        }
      }
      if (!shaded) hours[index] += Math.min(step, day.sunset - (time - step / 2));
    }
  }
  const values = open.map(index => hours[index]), total = Math.max(1, values.length);
  const share = (test: (h: number) => boolean) => values.filter(test).length / total;
  const edges = [0, 1, 2, 4, 6, 8, Infinity];
  return {
    cols, rows, cell, minX, maxY, hours, day,
    stats: {
      cells: values.length, mean: values.reduce((sum, h) => sum + h, 0) / total,
      atLeast: { 2: share(h => h >= 2), 4: share(h => h >= 4), 6: share(h => h >= 6) },
      buckets: edges.slice(0, -1).map((min, i) => ({ min, max: edges[i + 1], label: edges[i + 1] === Infinity ? `${min}+ h` : `${min}–${edges[i + 1]} h`, share: share(h => h >= min && h < edges[i + 1]) })),
    },
  };
}

/** Shade to sun ramp shared by the 3D overlay and the dashboard. `fraction` is 0–1 of the scale. */
export const sunlightStops = ['#3d3a7a', '#5562b6', '#62a9d8', '#9fd9c2', '#f4d66d', '#f7a93b'];
export function sunlightColor(fraction: number): [number, number, number] {
  const f = Math.max(0, Math.min(1, fraction)) * (sunlightStops.length - 1), i = Math.min(sunlightStops.length - 2, Math.floor(f)), t = f - i;
  const parse = (hex: string) => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16));
  const a = parse(sunlightStops[i]), b = parse(sunlightStops[i + 1]);
  return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
}
/** Scale top in hours for colouring: the day length, so a cell in sun all day is the warmest colour. */
export const sunlightScale = (result: SunlightResult) => Math.max(1, result.day?.length ?? 1);

/** Planar metres around a centre, matching the 3D viewer's projection (x east, y north). */
export function sunProjector(origin: { lat: number; lng: number }) {
  const kx = 111320 * Math.cos(origin.lat * RAD);
  return (lat: number, lon: number): [number, number] => [(lon - origin.lng) * kx, (lat - origin.lat) * 111320];
}
/** Buildings as prisms, with the same heights the 3D viewer draws (including its 10 m default). */
export function sunBuildings(features: Feature[], project: (lat: number, lon: number) => [number, number]): SunBuilding[] {
  const result: SunBuilding[] = [];
  for (const feature of features) {
    if (feature.layer !== 'Buildings' || feature.kind !== 'area' || feature.geometry.length < 4) continue;
    const ring: number[] = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const point of feature.geometry.slice(0, -1)) {
      const [x, y] = project(point.lat, point.lon);
      ring.push(x, y); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const size = buildingDimensions(feature.tags);
    result.push({ ring, base: size.base, top: size.height, box: [x0, y0, x1, y1] });
  }
  return result;
}
