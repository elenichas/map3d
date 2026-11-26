import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Box, FileJson, FileText, LoaderCircle, MapPin, Info, Building2, Trees, Waves, Route, ArrowUpRight } from 'lucide-react';
import type { useSiteAnalysis } from '../hooks/useSiteAnalysis';
import type { useSceneLayers } from '../hooks/useSceneLayers';
import { layerGroups, type GroupId } from '../data/layers';
import { downloadFile } from '../data/download';
import type { AreaMetric, SiteReport } from '../data/siteAnalysis';
import { assignBuildingLandUse, landUseCategory } from '../data/landUseStyle';
import { CategoryBadge } from './CategoryBadge';
import { BoundaryGlyph, buildingsInside, FarGauge, HeightGlyph, NetworkBars, PlaceBars, planLegend, SitePlan, Skyline, TransitBadge, TreeRow, UseMix, type UseRow } from './dashboardVisuals';
import { downloadPdfReport } from './pdfReport';
import { SunlightCard } from './SunlightCard';
import './dashboard.css';

type Props = {
  points: { lat: number; lng: number }[];
  location: string;
  data: ReturnType<typeof useSceneLayers>;
  analysis: ReturnType<typeof useSiteAnalysis>;
  onMap: () => void;
  onViewer: () => void;
};
const number = (value: number | null | undefined, decimals = 0) => value == null ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: decimals });
const percentage = (area: number, total: number) => `${number(area / total * 100, 1)}%`;
/** Unclassified area reads as empty space in either theme rather than as a data colour. */
const swatch = (row: AreaMetric) => row.id === 'unclassified' ? 'var(--border)' : row.color;
const methods = [
  'Local planar projection; polygon coordinates rounded to 1 mm for robust clipping. Areas clipped to the selected polygon, holes removed, overlaps merged.',
  'Coverage priority: buildings, water, green-designated areas, recreation & parking, other mapped areas. Land-use designations can overlap.',
  'Green designation is a proxy, not measured vegetation or tree canopy. Unclassified means no loaded area designation, not vacant land.',
  'Building count includes mapped parts. Heights use explicit height or 3 m per mapped level; missing heights excluded. No 10 m display fallback.',
  'Indicative floor area uses mapped levels or height / 3, excludes below-ground floors, respects minimum levels/heights, merges overlapping parts at each vertical band. Buildings without usable levels/heights excluded.',
  'All loaded features included regardless of viewer visibility. Missing, incorrect or incomplete OSM data can affect results. Use at your own risk.',
];
const statusLabels = { idle: 'Not loaded', queued: 'Queued', loading: 'Loading', waiting: 'Retrying automatically', ready: 'Loaded', error: 'Unavailable', cancelled: 'Stopped' };
/** Small progress ring, as in the reference KPI tiles. `share` is 0–1. */
function Ring({ share, color }: { share: number; color: string }) {
  const value = Math.max(0, Math.min(1, share)) * 100;
  return <svg className="site-ring" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="var(--border)" strokeWidth="3"/>
    {value > 0 && <circle cx="12" cy="12" r="9" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${value} 100`} transform="rotate(-90 12 12)"/>}
  </svg>;
}
function Stat({ label, value, unit, detail, icon: Icon, share, color, visual }: { label: string; value: string; unit?: string; detail: string; icon: typeof Box; share?: number | null; color?: string; visual?: ReactNode }) {
  return <div className="site-stat"><div className="site-stat-label"><span>{label}</span>{visual || (share != null ? <Ring share={share} color={color || 'var(--accent)'}/> : <span className="site-stat-icon"><Icon size={15}/></span>)}</div><div className="site-stat-value">{value}<span>{unit}</span></div><p>{detail}</p></div>;
}
function AreaBars({ rows, total, formatArea, landUse = false }: { rows: AreaMetric[]; total: number; formatArea: (area: number) => string; landUse?: boolean }) {
  return <div className="site-area-bars">{rows.map(row => <div className="site-area-row" key={row.id}>
    <div><span>{landUse ? <CategoryBadge category={landUseCategory(row.id)}/> : <i aria-hidden="true" style={{ background: swatch(row) }}/>}
      {row.label}</span><strong>{percentage(row.area, total)}</strong></div>
    <div className="site-bar-track"><span style={{ width: `${Math.max(row.area > 0 ? 1.5 : 0, Math.min(100, row.area / total * 100))}%`, background: swatch(row) }}/></div>
    <small>{formatArea(row.area)}</small>
  </div>)}</div>;
}
/** Split 100 dots across rows by area, using largest remainders so the dots always sum to 100. */
function waffleDots(rows: AreaMetric[], total: number) {
  const shares = rows.map(row => total > 0 ? row.area / total * 100 : 0), counts = shares.map(Math.floor);
  let left = 100 - counts.reduce((sum, count) => sum + count, 0);
  [...shares.keys()].sort((a, b) => (shares[b] - counts[b]) - (shares[a] - counts[a])).forEach(index => { if (left > 0 && shares[index] > 0) { counts[index]++; left--; } });
  return rows.flatMap((row, index) => Array<string>(counts[index]).fill(swatch(row)));
}
/** Dot-matrix (waffle) chart: one dot per 1% of the site, filled from the bottom row up. */
function CoverChart({ report }: { report: SiteReport }) {
  const dots = waffleDots(report.covers, report.area);
  return <div className="site-cover-chart">
    <div className="site-chart-heading"><span className="site-chart-number">{percentage(report.area - report.covers[report.covers.length - 1].area, report.area)}</span><span className="site-chart-caption">mapped area</span></div>
    <svg viewBox="0 0 120 120" role="img" aria-label="Site coverage dot chart, one dot per 1% of the site. Exact values are listed alongside.">
      {dots.map((color, index) => <circle key={index} cx={6 + (index % 10) * 12} cy={114 - Math.floor(index / 10) * 12} r="4.3" fill={color}/>)}
    </svg>
  </div>;
}
export default function SiteDashboard({ points, location, data, analysis, onMap, onViewer }: Props) {
  const { report, calculating, error, retry, phase } = analysis;
  const [unit, setUnit] = useState<'ha' | 'm²'>('ha');
  const [downloadError, setDownloadError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const formatArea = (value: number) => `${number(unit === 'ha' ? value / 10000 : value, unit === 'ha' ? 2 : 0)} ${unit}`;
  const loaded = layerGroups.filter(group => data.states[group.id].status === 'ready').length;
  const partial = loaded !== layerGroups.length;
  const available = (group: GroupId) => data.states[group].status === 'ready' && !calculating;
  const b = report?.buildings;
  const buildingsAvailable = available('buildings') || !!b?.count;
  const landscapeAvailable = available('landscape');
  const transportAvailable = available('transport');
  const green = report?.covers.find(row => row.id === 'green')?.area || 0;
  const water = report?.covers.find(row => row.id === 'water')?.area || 0;
  // Buildings coloured by use, exactly as the viewer's "By use" mode, counted inside the boundary.
  const uses = useMemo(() => assignBuildingLandUse(data.features), [data.features]);
  const insideBuildings = useMemo(() => buildingsInside(points, data.features), [points, data.features]);
  const useRows = useMemo(() => {
    const rows = new Map<string, UseRow>();
    for (const feature of insideBuildings) {
      const category = uses.get(feature.key); if (!category) continue;
      const row = rows.get(category.id) || { id: category.id, label: category.label, color: category.color, count: 0 };
      row.count++; rows.set(category.id, row);
    }
    return [...rows.values()].sort((a, b) => b.count - a.count);
  }, [insideBuildings, uses]);
  const download = () => {
    if (!report) return;
    try {
      downloadFile('site-analysis.json', JSON.stringify({
        generator: 'map3d site dashboard', version: 1, exportedAt: new Date().toISOString(), location,
        boundary: { type: 'Polygon', coordinates: [[...points.map(p => [p.lng, p.lat]), [points[0].lng, points[0].lat]]] },
        attribution: '© OpenStreetMap contributors · ODbL', partial, sourceBatches: data.states,
        units: { areas: 'square metres', lengths: 'metres', heights: 'metres', density: 'mapped building / part features per hectare', floorAreaRatio: 'estimated floor area / site area' },
        methods,
        metrics: report,
      }, null, 2), 'application/json');
      setDownloadError('');
    } catch { setDownloadError('Could not download the data. Please retry.'); }
  };
  const downloadPdf = async () => {
    if (!report || !rootRef.current) return;
    setPdfBusy(true);
    try {
      await downloadPdfReport(rootRef.current, {
        location, methods, filename: 'site-report.pdf',
        status: partial ? `Partial mapped data · ${loaded} of ${layerGroups.length} source batches loaded` : 'All source batches loaded',
        summary: `${formatArea(report.area)} boundary · ${number(report.perimeter)} m perimeter · ${number(report.includedFeatures)} OpenStreetMap features intersect the boundary.`,
      });
      setDownloadError('');
    } catch { setDownloadError('Could not create the PDF report. Please retry.'); }
    finally { setPdfBusy(false); }
  };
  return <div ref={rootRef} className="site-dashboard" role="region" aria-label="Site dashboard" aria-busy={calculating} tabIndex={-1}>
    <div className="site-page-heading">
      <div><div className="site-kicker"><MapPin size={14}/>{location}</div><h1>Site dashboard</h1><p>Understand the selected boundary through its mapped buildings, landscape and uses.</p></div>
      <div className="site-page-actions"><button onClick={onMap}><ArrowLeft size={15}/>Back to map</button><button onClick={onViewer}><Box size={15}/>View in 3D<ArrowUpRight size={14}/></button><button className="site-pdf-button" onClick={downloadPdf} disabled={!report || calculating || pdfBusy}>{pdfBusy ? <LoaderCircle className="spin" size={15}/> : <FileText size={15}/>}{pdfBusy ? 'Preparing PDF…' : 'Download PDF report'}</button><button onClick={download} disabled={!report || calculating} title="All calculated metrics, boundary and source status as JSON"><FileJson size={15}/>Download data (JSON)</button></div>
    </div>
    <div className="site-data-status" role="status"><span className={`site-status-dot${partial ? ' partial' : ''}`}/><strong>{partial ? 'Partial mapped data' : 'All source batches loaded'}</strong><span>{loaded} of {layerGroups.length} batches loaded{calculating ? ' · Calculating statistics…' : data.loading ? ' · More data loading in the background' : ''}</span><div className="site-unit-control" role="group" aria-label="Area units">{(['ha', 'm²'] as const).map(value => <button key={value} aria-pressed={unit === value} onClick={() => setUnit(value)}>{value}</button>)}</div></div>
    {downloadError && <p role="alert" className="error-text">{downloadError}</p>}
    {!report && data.loading && <button onClick={data.cancel}>Stop loading layers</button>}
    {error && <div className="site-analysis-error" role="alert">{error}<button onClick={retry}>Retry calculation</button></div>}
    {!report && !error && <div className="site-calculating" role="status"><LoaderCircle className="spin" size={24}/><p>{phase}</p></div>}
    {report && <>
      <div className="site-stats">
        <Stat label="Site area" visual={<BoundaryGlyph points={points}/>} value={number(unit === 'ha' ? report.area / 10000 : report.area, unit === 'ha' ? 2 : 0)} unit={unit} detail={`${number(report.perimeter)} m boundary perimeter · actual polygon`} icon={MapPin}/>
        <Stat label="Building coverage" share={buildingsAvailable ? b!.footprint / report.area : null} color="var(--accent)" value={buildingsAvailable ? number(b!.footprint / report.area * 100, 1) : '—'} unit={buildingsAvailable ? '%' : ''} detail={buildingsAvailable ? `${formatArea(b!.footprint)} of merged footprints` : 'Waiting for building data'} icon={Building2}/>
        <Stat label="Mapped green space" share={landscapeAvailable ? green / report.area : null} color="var(--success)" value={landscapeAvailable ? number(green / report.area * 100, 1) : '—'} unit={landscapeAvailable ? '%' : ''} detail={landscapeAvailable ? `${formatArea(green)} · green-designation proxy` : 'Waiting for landscape data'} icon={Trees}/>
        <Stat label="Mean building height" visual={buildingsAvailable && b!.knownHeights > 0 ? <HeightGlyph bins={b!.bins}/> : undefined} value={buildingsAvailable ? number(b!.meanHeight, 1) : '—'} unit={buildingsAvailable && b!.meanHeight !== null ? 'm' : ''} detail={buildingsAvailable ? `${number(b!.knownHeights)} with usable heights · ${number(b!.unknownHeights)} unknown` : 'Waiting for building data'} icon={Building2}/>
      </div>
      <div className="site-grid">
        <section className="site-card site-plan" aria-label="Site plan"><div className="site-card-heading"><div><h2>Site plan</h2><p>Top-down view of the boundary, in the 3D viewer's colours</p></div><button className="site-plan-open" onClick={onViewer}><Box size={14}/>Open in 3D</button></div>
          <div className="site-plan-body">
            <SitePlan points={points} features={data.features} uses={uses}/>
            <div className="site-plan-side">
              <ul className="site-plan-legend">{planLegend.map(row => <li key={row.label}>{row.swatch === 'uses'
                ? <span className="site-plan-uses">{(useRows.length ? useRows.slice(0, 4) : [{ id: 'none', color: 'var(--plan-building)' }]).map(use => <i key={use.id} style={{ background: use.color }}/>)}</span>
                : <i className={'line' in row ? 'line' : undefined} style={{ ['--swatch' as string]: row.swatch }}/>}{row.label}</li>)}
                <li><i className="boundary"/>Site boundary</li></ul>
              <dl className="site-plan-facts">
                <div><dt>Buildings</dt><dd>{buildingsAvailable ? number(b!.count) : '—'}</dd></div>
                <div><dt>Tallest</dt><dd>{buildingsAvailable && b!.maxHeight != null ? `${number(b!.maxHeight, 0)} m` : '—'}</dd></div>
                <div><dt>Places</dt><dd>{number(report.amenities.reduce((sum, row) => sum + row.count, 0))}</dd></div>
                <div><dt>Trees</dt><dd>{landscapeAvailable ? number(report.treeCount) : '—'}</dd></div>
              </dl>
            </div>
          </div>
        </section>
        <section className="site-card site-coverage"><div className="site-card-heading"><div><h2>Site coverage</h2><p>Non-overlapping areas within the boundary</p></div><span className="site-tag">{partial ? 'Partial' : 'Mapped data'}</span></div>
          <div className="site-cover-content"><CoverChart report={report}/><AreaBars rows={report.covers} total={report.area} formatArea={formatArea}/></div>
          <p className="site-note">Buildings take priority over water, green space and other areas. Unclassified areas have no loaded area designation; they are not necessarily vacant or paved.</p>
        </section>
        <section className="site-card"><div className="site-card-heading"><div><h2>Building intensity</h2><p>Mapped buildings and building parts</p></div><Building2 size={18}/></div>
          {buildingsAvailable ? <><div className="site-intensity-visual"><FarGauge value={b!.floorAreaRatio}/><UseMix rows={useRows} total={insideBuildings.length}/></div><dl className="site-metric-list">
            <div><dt>Building / part features</dt><dd>{number(b!.count)}<small>{number(b!.parts)} are building parts</small></dd></div>
            <div><dt>Feature density</dt><dd>{number(b!.density, 1)}<small>building / part features per ha</small></dd></div>
            <div><dt>Indicative floor area</dt><dd>{b!.floorArea !== null ? formatArea(b!.floorArea) : '—'}</dd></div>
          </dl><p className="site-note">Floor area uses mapped levels or height ÷ 3 m, with overlapping parts merged at each level. It covers {b!.footprint ? percentage(b!.floorSampleFootprint, b!.footprint) : '0%'} of mapped footprints. This is an estimate, not a planning or occupancy calculation.</p></> : <p className="site-empty">Building data has not loaded yet.</p>}
        </section>
        <section className="site-card"><div className="site-card-heading"><div><h2>Building heights</h2><p>Distribution of usable heights</p></div></div>
          {buildingsAvailable && b!.knownHeights > 0 ? <><div className="site-height-chart" role="img" aria-label={b!.bins.map(bin => `${bin.label}: ${bin.count} features`).join(', ')}>{b!.bins.map(bin => <div key={bin.label}><strong>{number(bin.count)}</strong><div className="site-height-track"><span className={bin.count > 0 && bin.count === Math.max(...b!.bins.map(row => row.count)) ? 'peak' : undefined} style={{ height: `${bin.count ? Math.max(8, bin.count / Math.max(1, ...b!.bins.map(row => row.count)) * 100) : 0}%` }}/></div><small>{bin.label}</small></div>)}</div>
            <div className="site-height-summary"><span>Median <strong>{number(b!.medianHeight, 1)} m</strong></span><span>Maximum <strong>{number(b!.maxHeight, 1)} m</strong></span></div>
            {b!.tallest.length > 1 && <div className="site-skyline-block"><h3>Tallest buildings, to scale</h3><Skyline rows={b!.tallest} median={b!.medianHeight}/></div>}
            <p className="site-note">{number(b!.mappedHeights)} mapped heights · {number(b!.estimatedHeights)} estimated at 3 m per level · {number(b!.unknownHeights)} unknown, excluded. Viewer display defaults are excluded.</p>
            <details className="site-details"><summary>Tallest mapped buildings / parts</summary><ol>{b!.tallest.map(row => <li key={row.id}><span>{row.name}<small>{row.id} · {row.source}</small></span><strong>{number(row.value, 1)} m</strong></li>)}</ol></details>
          </> : <p className="site-empty">{buildingsAvailable ? b!.count ? 'No usable height or level tags were found. Unknown heights are excluded.' : 'No building footprints were found in the loaded data.' : 'Waiting for building data.'}</p>}
        </section>
        <section className="site-card"><div className="site-card-heading"><div><h2>Land-use allocation</h2><p>Area tagged with a land-use designation</p></div></div>
          {report.landUses.length ? <div className="site-scroll-list" role="region" aria-label="Land-use designations" tabIndex={0}><AreaBars rows={report.landUses} total={report.area} formatArea={formatArea} landUse/></div> : <p className="site-empty">{landscapeAvailable ? 'No land-use polygons were found in the loaded data.' : 'Waiting for land-use data.'}</p>}
          <p className="site-note">Designations can overlap, so percentages may not add to 100%. These are mapped land-use tags, not zoning or inferred building uses.</p>
        </section>
        <section className="site-card"><div className="site-card-heading"><div><h2>Landscape & movement</h2><p>Mapped features inside the boundary</p></div><Route size={18}/></div>
          <TreeRow count={landscapeAvailable ? report.treeCount : null}/>
          <NetworkBars rows={[
            { label: 'Roads', metres: transportAvailable ? report.lengths.roads : null, color: 'var(--plan-road)' },
            { label: 'Walking & cycling', metres: transportAvailable ? report.lengths.paths : null, color: 'var(--plan-path-strong)', dash: true },
            { label: 'Rail & tram', metres: transportAvailable ? report.lengths.rail : null, color: 'var(--accent)' },
            { label: 'Waterways', metres: landscapeAvailable ? report.lengths.waterways : null, color: 'var(--plan-waterway)' },
          ]}/>
          <div className="site-network-foot"><TransitBadge count={transportAvailable ? report.transitPoints : null}/><span className="site-water"><Ring share={landscapeAvailable ? water / report.area : 0} color="var(--plan-waterway)"/><strong>{landscapeAvailable ? percentage(water, report.area) : '—'}</strong>water coverage</span></div><p className="site-note">Lengths are clipped to the boundary. Tree points are not a canopy estimate. Green-designated space can include paths, lawns and other surfaces.</p>
        </section>
        <section className="site-card"><div className="site-card-heading"><div><h2>Places & amenities</h2><p>Mapped points of interest by type</p></div><MapPin size={18}/></div>
          {report.amenities.length ? <PlaceBars rows={report.amenities}/> : <p className="site-empty">{available('places') ? 'No points of interest were found in the loaded data.' : 'Waiting for places data.'}</p>}
          <p className="site-note">Counts include POI markers derived from tagged buildings and grounds. A missing place in OpenStreetMap does not mean it does not exist.</p>
        </section>
        <SunlightCard points={points} features={data.features} ready={buildingsAvailable && !calculating}/>
      </div>
      <section className="site-card site-quality">
        <div className="site-quality-row">
          <div className="site-quality-title"><h2>Data coverage & methodology</h2><p>{number(report.includedFeatures)} source features intersect the boundary{report.skipped ? ` · ${number(report.skipped)} invalid geometries excluded` : ''}</p></div>
          <ul className="site-source-grid" aria-label="Source batches">{layerGroups.map(group => { const state = data.states[group.id]; return <li key={group.id} className={`site-source ${state.status}`} title={state.message || undefined}><strong>{group.label}</strong><span>{statusLabels[state.status]}</span>{state.message && state.status !== 'ready' && <small>{state.message}</small>}</li>; })}</ul>
        </div>
        {(data.loading || layerGroups.some(group => ['error', 'cancelled'].includes(data.states[group.id].status))) && <div className="site-loading-actions">{data.loading && <button onClick={data.cancel}>Stop loading layers</button>}{!data.loading && <button onClick={data.retryFailed}>Retry unavailable layers</button>}</div>}
        <div className="site-quality-foot">
          <p className="site-risk"><Info size={14}/><span>Source: <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Data may be missing, incomplete or incorrect. Verify findings independently and use at your own risk.</span></p>
          <details className="site-method"><summary>How it’s calculated</summary><p className="site-note">Calculations include all loaded layers, including those hidden in the 3D viewer. Areas use a local planar projection, with coordinates rounded to 1 mm for robust clipping, clipped to the actual boundary, with holes removed and overlaps merged. Values are indicative and become less accurate over very large regions or near the poles. This is not a survey, zoning assessment or population-density estimate.</p></details>
        </div>
      </section>
    </>}
  </div>;
}
