import { useMemo, useState } from 'react';
import { LoaderCircle, Sun } from 'lucide-react';
import type { Feature } from '../data/layers';
import { formatSolarTime, studyDates, sunBuildings, sunlightColor, sunlightScale, sunlightStops, sunProjector, type SunlightResult } from '../data/sun';
import { useSunlight } from '../hooks/useSunlight';
import { sunlightCanvas } from '../three/SunStudy';

type Point = { lat: number; lng: number };
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r}, ${g}, ${b})`;

function SunlightMap({ result, points, features, origin }: { result: SunlightResult; points: Point[]; features: Feature[]; origin: Point }) {
  const image = useMemo(() => sunlightCanvas(result).toDataURL('image/png'), [result]);
  const { boundary, buildings } = useMemo(() => {
    const project = sunProjector(origin), width = result.cols * result.cell, height = result.rows * result.cell;
    const inView = (box: [number, number, number, number]) => box[2] >= result.minX && box[0] <= result.minX + width && box[3] >= result.maxY - height && box[1] <= result.maxY;
    const path = (ring: number[]) => 'M' + ring.reduce<string[]>((parts, value, i) => (i % 2 ? parts.push(`${ring[i - 1].toFixed(1)} ${(-value).toFixed(1)}`) : null, parts), []).join('L') + 'Z';
    return {
      boundary: path(points.flatMap(p => project(p.lat, p.lng))),
      buildings: sunBuildings(features, project).filter(b => inView(b.box)).map(b => path(b.ring)).join(''),
    };
  }, [result, points, features, origin]);
  const width = result.cols * result.cell, height = result.rows * result.cell, pad = Math.max(width, height) * .03;
  return <svg className="site-sun-map" viewBox={`${result.minX - pad} ${-result.maxY - pad} ${width + pad * 2} ${height + pad * 2}`} role="img" aria-label="Map of direct sunlight hours on open ground">
    <defs><clipPath id="site-sun-clip"><path d={boundary}/></clipPath></defs>
    <image href={image} x={result.minX} y={-result.maxY} width={width} height={height} preserveAspectRatio="none" style={{ imageRendering: 'pixelated' }}/>
    <path d={buildings} fill="var(--plan-building)" clipPath="url(#site-sun-clip)"/>
    <path d={boundary} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeDasharray="6 4" vectorEffect="non-scaling-stroke"/>
  </svg>;
}

/** Direct sun on open ground for a planning study date, from mapped building heights. */
export function SunlightCard({ points, features, ready }: { points: Point[]; features: Feature[]; ready: boolean }) {
  const presets = studyDates();
  const [preset, setPreset] = useState<string>('equinox');
  const date = presets.find(row => row.id === preset)!.date;
  const { result, busy, error, origin } = useSunlight(points, features, date, ready);
  const scale = result ? sunlightScale(result) : 12;
  return <section className="site-card site-sunlight" aria-label="Sunlight">
    <div className="site-card-heading"><div><h2>Sunlight on open ground</h2><p>Hours of direct sun, with shadows from mapped building heights</p></div>
      <div className="segmented-control compact" role="group" aria-label="Sunlight study date">{presets.map(row => <button key={row.id} aria-pressed={preset === row.id} title={row.detail} onClick={() => setPreset(row.id)}>{row.label}</button>)}</div>
    </div>
    {!ready ? <p className="site-empty">Waiting for building data.</p> : error ? <p className="site-empty">{error}</p> : !result ? <div className="site-sun-busy" role="status"><LoaderCircle className="spin" size={18}/>Calculating sunlight{busy ? '…' : ''}</div> : <div className="site-sun-body">
      <SunlightMap result={result} points={points} features={features} origin={origin}/>
      <div className="site-sun-side">
        <div className="site-sun-headline"><Sun size={18}/><div><strong>{Math.round(result.stats.atLeast[4] * 100)}%</strong><span>of open ground gets 4 h or more of direct sun on the {presets.find(row => row.id === preset)!.label.toLowerCase()} date ({presets.find(row => row.id === preset)!.detail})</span></div></div>
        <dl className="site-plan-facts">
          <div><dt>Average</dt><dd>{result.stats.mean.toFixed(1)} h</dd></div>
          <div><dt>Day length</dt><dd>{result.day ? `${result.day.length.toFixed(1)} h` : '—'}</dd></div>
          <div><dt>2 h or more</dt><dd>{Math.round(result.stats.atLeast[2] * 100)}%</dd></div>
          <div><dt>6 h or more</dt><dd>{Math.round(result.stats.atLeast[6] * 100)}%</dd></div>
        </dl>
        <div>
          <div className="site-use-bar" role="img" aria-label={result.stats.buckets.map(b => `${b.label}: ${Math.round(b.share * 100)}%`).join(', ')}>
            {result.stats.buckets.filter(b => b.share > 0).map(b => <span key={b.label} title={`${b.label}: ${Math.round(b.share * 100)}%`} style={{ flexGrow: b.share, background: rgb(sunlightColor(Math.min(b.max, scale) / scale - .01)) }}/>)}
          </div>
          <ul className="site-use-legend">{result.stats.buckets.filter(b => b.min < scale).map(b => <li key={b.label}><i style={{ background: rgb(sunlightColor(Math.min(b.max, scale) / scale - .01)) }}/>{b.label}<small>{Math.round(b.share * 100)}%</small></li>)}</ul>
        </div>
        <div className="sun-legend"><span className="sun-ramp" style={{ background: `linear-gradient(90deg, ${sunlightStops.join(', ')})` }}/><span className="sun-ramp-labels"><span>0 h · shade</span><span>{scale.toFixed(1)} h · all day</span></span></div>
      </div>
    </div>}
    <p className="site-note">{result?.day ? `Sunrise ${formatSolarTime(result.day.sunrise)} and sunset ${formatSolarTime(result.day.sunset)}, solar time. ` : ''}Ground level, sampled every 15 minutes on a {result ? `${result.cell.toFixed(1)} m` : ''} grid. Ignores terrain, trees and buildings outside the loaded data; buildings without a mapped height use the viewer's 10 m default.</p>
  </section>;
}
