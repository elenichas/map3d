import { useId, useMemo } from 'react';
import { TreeDeciduous, TramFront } from 'lucide-react';
import type { Feature } from '../data/layers';
import { landUseCategory, type LandUseCategory } from '../data/landUseStyle';
import { poiCategories, poiStyleForSublayer } from '../data/poiStyle';
import { CategoryBadge } from './CategoryBadge';
import { PoiIcon } from '../three/poiIcons';

type LatLng = { lat: number; lng: number };
const number = (value: number | null | undefined, decimals = 0) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });

/** Local planar metres around the boundary centre (x east, y south, so it draws north-up in SVG). */
function projector(points: LatLng[]) {
  const lat0 = points.reduce((sum, p) => sum + p.lat, 0) / points.length, lon0 = points.reduce((sum, p) => sum + p.lng, 0) / points.length;
  const kx = Math.cos(lat0 * Math.PI / 180) * 111320, ky = 110540;
  return (lat: number, lon: number): [number, number] => [(lon - lon0) * kx, -(lat - lat0) * ky];
}
function inside([x, y]: [number, number], ring: [number, number][]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const centroid = (ring: [number, number][]): [number, number] => [ring.reduce((sum, p) => sum + p[0], 0) / ring.length, ring.reduce((sum, p) => sum + p[1], 0) / ring.length];

/** Buildings and parts whose centre falls inside the boundary. */
export function buildingsInside(points: LatLng[], features: Feature[]) {
  if (points.length < 3) return [];
  const project = projector(points), ring = points.map(p => project(p.lat, p.lng));
  return features.filter(f => f.layer === 'Buildings' && f.kind === 'area' && f.geometry.length > 2
    && inside(centroid(f.geometry.slice(0, -1).map(p => project(p.lat, p.lon))), ring));
}

/* ---------------------------------------------------------------- Site plan */

type PlanStyle = { kind: 'fill' | 'line' | 'dot'; color: string; width?: number; opacity?: number; dash?: string; order: number };
const roadWidth = (tags: Record<string, string>) => /^(motorway|trunk|primary)/.test(tags.highway || '') ? 3.2 : /^(secondary|tertiary)/.test(tags.highway || '') ? 2.4 : 1.4;
function planStyle(f: Feature, uses: Map<string, LandUseCategory> | null): PlanStyle | null {
  switch (f.layer) {
    case 'Land use': return f.kind === 'area' && f.tags.landuse ? { kind: 'fill', color: landUseCategory(f.tags.landuse).color, opacity: .22, order: 0 } : null;
    case 'Recreation & parking': return f.kind === 'area' ? { kind: 'fill', color: 'var(--plan-recreation)', order: 1 } : null;
    case 'Green spaces': return f.kind === 'area' ? { kind: 'fill', color: 'var(--plan-green)', order: 2 } : null;
    case 'Trees & woodland': return f.kind === 'area' ? { kind: 'fill', color: 'var(--plan-green)', order: 2 } : f.kind === 'point' ? { kind: 'dot', color: 'var(--plan-tree)', width: 4, order: 8 } : null;
    case 'Water': return f.kind === 'area' ? { kind: 'fill', color: 'var(--plan-water)', order: 3 } : null;
    case 'Waterways': return f.kind === 'line' ? { kind: 'line', color: 'var(--plan-waterway)', width: 1.6, order: 4 } : null;
    case 'Roads': return f.kind === 'line' ? { kind: 'line', color: 'var(--plan-road)', width: roadWidth(f.tags), order: 5 } : null;
    case 'Walking & cycling': return f.kind === 'line' ? { kind: 'line', color: 'var(--plan-path)', width: .9, dash: '3 2', order: 5 } : null;
    case 'Transit': return f.kind === 'line' ? { kind: 'line', color: 'var(--accent)', width: 1.6, order: 6 } : null;
    case 'Buildings': return f.kind === 'area' ? { kind: 'fill', color: uses?.get(f.key)?.color || 'var(--plan-building)', order: 7 } : null;
    default: return null;
  }
}
const scaleSteps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

export const planLegend = [
  { label: 'Buildings by use', swatch: 'uses' },
  { label: 'Green & trees', swatch: 'var(--plan-green)' },
  { label: 'Water', swatch: 'var(--plan-water)' },
  { label: 'Roads', swatch: 'var(--plan-road)', line: true },
  { label: 'Paths', swatch: 'var(--plan-path)', line: true },
  { label: 'Rail & tram', swatch: 'var(--accent)', line: true },
] as const;

/** Top-down figure-ground plan of the boundary, drawn in the same colours as the 3D viewer. */
export function SitePlan({ points, features, uses }: { points: LatLng[]; features: Feature[]; uses: Map<string, LandUseCategory> | null }) {
  const clip = useId().replace(/:/g, '');
  const plan = useMemo(() => {
    const project = projector(points), ring = points.map(p => project(p.lat, p.lng));
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const size = Math.max(maxX - minX, maxY - minY, 1), pad = size * .05, margin = size * .1;
    // Extra room below and to the right holds the scale bar and north arrow, clear of the boundary.
    const box = { x: minX - pad, y: minY - pad, w: maxX - minX + pad + margin, h: maxY - minY + pad + margin };
    const near = (f: Feature) => f.geometry.some(p => { const [x, y] = project(p.lat, p.lon); return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h; });
    const toPath = (pts: { lat: number; lon: number }[], close: boolean) => 'M' + pts.map(p => project(p.lat, p.lon).map(v => v.toFixed(1)).join(' ')).join('L') + (close ? 'Z' : '');
    // One path per style, so thousands of features stay a handful of DOM nodes.
    const groups = new Map<string, PlanStyle & { d: string[]; evenOdd?: boolean }>();
    for (const f of features) {
      const style = planStyle(f, uses);
      if (!style || !f.geometry.length || !near(f)) continue;
      const holes = style.kind === 'fill' && f.holes?.length;
      const key = holes ? `${f.key}` : `${style.kind}|${style.color}|${style.width}|${style.opacity}|${style.dash}`;
      const group = groups.get(key) || { ...style, d: [], evenOdd: !!holes };
      if (style.kind === 'dot') { const [x, y] = project(f.geometry[0].lat, f.geometry[0].lon); group.d.push(`M${x.toFixed(1)} ${y.toFixed(1)}h0`); }
      else group.d.push(toPath(f.geometry, style.kind === 'fill'), ...(holes ? f.holes!.map(hole => toPath(hole, true)) : []));
      groups.set(key, group);
    }
    const scale = scaleSteps.reduce((best, step) => step <= size * .3 ? step : best, scaleSteps[0]);
    return { box, margin, boundary: 'M' + ring.map(p => p.map(v => v.toFixed(1)).join(' ')).join('L') + 'Z', layers: [...groups.values()].sort((a, b) => a.order - b.order), scale };
  }, [points, features, uses]);
  const { box, margin } = plan, unit = Math.max(box.w, box.h) / 100;
  return <svg className="site-plan-svg" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} role="img" aria-label="Site plan: buildings, green space, water and movement inside the selected boundary">
    <defs><clipPath id={clip}><path d={plan.boundary}/></clipPath></defs>
    <path d={plan.boundary} fill="var(--plan-ground)"/>
    <g clipPath={`url(#${clip})`}>
      {plan.layers.map((layer, index) => layer.kind === 'fill'
        ? <path key={index} d={layer.d.join('')} fill={layer.color} fillOpacity={layer.opacity} fillRule={layer.evenOdd ? 'evenodd' : 'nonzero'}/>
        : <path key={index} d={layer.d.join('')} fill="none" stroke={layer.color} strokeWidth={layer.width} strokeDasharray={layer.dash} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>)}
    </g>
    <path d={plan.boundary} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>
    <g className="site-plan-scale" transform={`translate(${box.x + unit * 5} ${box.y + box.h - margin * .3})`}>
      <path d={`M0 0H${plan.scale}`} stroke="var(--text)" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      <path d={`M0 ${-unit}V${unit}M${plan.scale} ${-unit}V${unit}`} stroke="var(--text)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>
      <text x={plan.scale + unit * 2} y={unit} fontSize={unit * 2.8} textAnchor="start" fill="var(--text)">{plan.scale >= 1000 ? `${plan.scale / 1000} km` : `${plan.scale} m`}</text>
    </g>
    <g transform={`translate(${box.x + box.w - margin * .5} ${box.y + unit * 6})`} aria-hidden="true">
      <path d={`M0 ${-unit * 3}L${unit * 1.6} ${unit * 1.8}L0 ${unit * .9}L${-unit * 1.6} ${unit * 1.8}Z`} fill="var(--text)"/>
      <text y={unit * 5.6} fontSize={unit * 2.6} textAnchor="middle" fill="var(--text)" fontWeight="600">N</text>
    </g>
  </svg>;
}

/* --------------------------------------------------------------- Stat tiles */

/** The boundary's own outline, scaled into the KPI tile. */
export function BoundaryGlyph({ points }: { points: LatLng[] }) {
  const d = useMemo(() => {
    const project = projector(points), ring = points.map(p => project(p.lat, p.lng));
    const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]), size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    const ox = (Math.min(...xs) + Math.max(...xs)) / 2, oy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return 'M' + ring.map(([x, y]) => `${(20 + (x - ox) / size * 32).toFixed(2)} ${(20 + (y - oy) / size * 32).toFixed(2)}`).join('L') + 'Z';
  }, [points]);
  return <svg className="site-stat-glyph" viewBox="0 0 40 40" aria-hidden="true"><path d={d} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}
/** Mini height histogram for the KPI tile; the tallest band is highlighted. */
export function HeightGlyph({ bins }: { bins: { count: number }[] }) {
  const max = Math.max(1, ...bins.map(bin => bin.count));
  return <svg className="site-stat-glyph" viewBox="0 0 40 40" aria-hidden="true">{bins.map((bin, index) => {
    const h = bin.count ? Math.max(3, bin.count / max * 30) : 1.5;
    return <rect key={index} x={3 + index * 7} y={35 - h} width="5" height={h} rx="1.5" fill={bin.count === max ? 'var(--accent)' : 'var(--border)'}/>;
  })}</svg>;
}

/* ------------------------------------------------------- Building intensity */

/** Half-circle gauge for the floor area ratio. */
export function FarGauge({ value }: { value: number | null }) {
  const scale = Math.max(4, Math.ceil(value ?? 0)), share = value == null ? 0 : Math.min(1, value / scale);
  const arc = 'M10 50A40 40 0 0 1 90 50';
  return <div className="site-gauge">
    <svg viewBox="0 0 100 56" role="img" aria-label={`Indicative floor area ratio ${number(value, 2)} on a 0 to ${scale} scale`}>
      <path d={arc} fill="none" stroke="var(--border)" strokeWidth="9" strokeLinecap="round"/>
      {share > 0 && <path d={arc} fill="none" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray={`${share * 100} 100`}/>}
    </svg>
    <div className="site-gauge-value"><strong>{number(value, 2)}</strong><span>floor area ratio</span></div>
    <div className="site-gauge-scale"><span>0</span><span>{scale}</span></div>
  </div>;
}
export type UseRow = { id: string; label: string; color: string; count: number };
/** Stacked bar of buildings by use, coloured like the viewer's "By use" mode. */
export function UseMix({ rows, total }: { rows: UseRow[]; total: number }) {
  const shown = rows.slice(0, 6), rest = rows.slice(6).reduce((sum, row) => sum + row.count, 0);
  const segments = [...shown, ...(rest ? [{ id: 'more', label: 'Other uses', color: 'var(--text-secondary)', count: rest }] : [])];
  const assigned = rows.reduce((sum, row) => sum + row.count, 0), unknown = Math.max(0, total - assigned);
  if (unknown) segments.push({ id: 'none', label: 'No mapped use', color: 'var(--border)', count: unknown });
  if (!total) return null;
  return <div className="site-use-mix">
    <div className="site-use-heading"><span>Buildings by use</span><small>{number(total)} buildings / parts</small></div>
    <div className="site-use-bar" role="img" aria-label={segments.map(row => `${row.label} ${row.count}`).join(', ')}>
      {segments.map(row => <span key={row.id} title={`${row.label}: ${number(row.count)}`} style={{ flexGrow: row.count, background: row.color }}/>)}
    </div>
    <ul className="site-use-legend">{segments.map(row => <li key={row.id}><i style={{ background: row.color }}/>{row.label}<small>{Math.round(row.count / total * 100)}%</small></li>)}</ul>
  </div>;
}

/* ----------------------------------------------------------------- Places */

export function PlaceBars({ rows }: { rows: { id: string; label: string; count: number }[] }) {
  const styled = rows.map(row => ({ ...row, style: poiStyleForSublayer(row.id) }));
  const max = Math.max(1, ...rows.map(row => row.count)), total = rows.reduce((sum, row) => sum + row.count, 0);
  const categories = [...styled.reduce((map, row) => {
    const category = row.style?.category, key = category?.id || 'other', entry = map.get(key) || { label: category?.label || 'Other', color: category?.color || 'var(--muted)', count: 0 };
    entry.count += row.count; return map.set(key, entry);
  }, new Map<string, { label: string; color: string; count: number }>()).values()].sort((a, b) => b.count - a.count);
  return <>
    <div className="site-use-bar site-place-mix" role="img" aria-label={categories.map(row => `${row.label} ${row.count}`).join(', ')}>
      {categories.map(row => <span key={row.label} title={`${row.label}: ${number(row.count)}`} style={{ flexGrow: row.count, background: row.color }}/>)}
    </div>
    <ul className="site-use-legend site-place-legend">{categories.slice(0, 5).map(row => <li key={row.label}><i style={{ background: row.color }}/>{row.label}<small>{Math.round(row.count / total * 100)}%</small></li>)}</ul>
    <div className="site-scroll-list" role="region" aria-label="Amenity types" tabIndex={0}><dl className="site-place-list">{styled.map(row => {
      const category = row.style?.category ?? poiCategories.other, color = category.color;
      return <div key={row.id}>
        <dt><CategoryBadge category={category} icon={row.style?.icon ?? category.icon} round/><span className="site-place-label">{row.label}</span></dt>
        <dd><span className="site-place-track"><span style={{ width: `${row.count / max * 100}%`, background: color }}/></span><strong>{number(row.count)}</strong></dd>
      </div>;
    })}</dl></div>
    {rows.length > 20 && <p className="site-note site-export-only">Top 20 of {rows.length} place types shown. The full list is in the data download.</p>}
  </>;
}

/* ---------------------------------------------------- Landscape & movement */

export type NetworkRow = { label: string; metres: number | null; color: string; dash?: boolean };
export function NetworkBars({ rows }: { rows: NetworkRow[] }) {
  const max = Math.max(1, ...rows.map(row => row.metres ?? 0));
  const length = (metres: number | null) => metres == null ? '—' : metres >= 1000 ? `${number(metres / 1000, 2)} km` : `${number(metres)} m`;
  return <ul className="site-network">{rows.map(row => <li key={row.label}>
    <span className="site-network-label"><i className={row.dash ? 'dash' : undefined} style={{ ['--line' as string]: row.color }}/>{row.label}</span>
    <span className="site-place-track"><span style={{ width: `${(row.metres ?? 0) / max * 100}%`, background: row.color }}/></span>
    <strong>{length(row.metres)}</strong>
  </li>)}</ul>;
}
/** Tree points as a row of tree icons; each icon stands for a fixed number of trees. */
export function TreeRow({ count }: { count: number | null }) {
  if (count == null) return <div className="site-tree-row"><span>—</span></div>;
  const per = count <= 20 ? 1 : [5, 10, 25, 50, 100, 250, 500, 1000].find(step => count / step <= 20) || Math.ceil(count / 20);
  const icons = Math.min(20, Math.ceil(count / per));
  return <div className="site-tree-row" role="img" aria-label={`${count} individual tree points`}>
    <div className="site-tree-icons">{Array.from({ length: icons }, (_, index) => <TreeDeciduous key={index} size={15}/>)}{!count && <small>None mapped</small>}</div>
    <span><strong>{number(count)}</strong><small>{per > 1 ? `trees · each icon ≈ ${per}` : count === 1 ? 'tree' : 'trees'}</small></span>
  </div>;
}
export function TransitBadge({ count }: { count: number | null }) {
  return <span className="site-transit"><TramFront size={14}/><strong>{number(count)}</strong>transit stops & stations</span>;
}

/* ---------------------------------------------------------------- Skyline */

/** The tallest buildings drawn side by side, to scale, with the median as a reference line. */
export function Skyline({ rows, median }: { rows: { id: string; name: string; value: number }[]; median: number | null }) {
  const max = Math.max(1, ...rows.map(row => row.value)), gap = 8, width = 300, height = 130, top = 18, label = 58;
  const w = (width - label - gap * (rows.length - 1)) / Math.max(1, rows.length), y = (value: number) => height - value / max * (height - top);
  return <svg className="site-skyline" viewBox={`0 0 ${width} ${height + 2}`} role="img" aria-label={`Tallest buildings: ${rows.map(row => `${row.name} ${number(row.value, 1)} m`).join(', ')}`}>
    {rows.map((row, index) => {
      const x = index * (w + gap), h = height - y(row.value);
      return <g key={row.id}><title>{`${row.name} · ${number(row.value, 1)} m`}</title>
        <rect x={x} y={y(row.value)} width={w} height={h} rx="3" fill={index === 0 ? 'var(--accent)' : 'var(--skyline)'}/>
        {h > 20 && <path d={Array.from({ length: Math.floor((h - 8) / 9) }, (_, n) => `M${x + 6} ${y(row.value) + 9 + n * 9}H${x + w - 6}`).join('')} stroke={index === 0 ? '#ffffff55' : 'var(--skyline-floor)'} strokeWidth="1"/>}
        <text x={x + w / 2} y={y(row.value) - 5} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text)">{number(row.value, 0)} m</text>
      </g>;
    })}
    {median != null && median < max && <g><path d={`M0 ${y(median)}H${width - label + 4}`} stroke="var(--text-secondary)" strokeWidth="1" strokeDasharray="4 3"/><text x={width} y={y(median) + 3} textAnchor="end" fontSize="9" fill="var(--text-secondary)">median {number(median, 0)} m</text></g>}
    <path d={`M0 ${height + 1}H${width}`} stroke="var(--border)" strokeWidth="2"/>
  </svg>;
}
