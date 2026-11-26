import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SunMoon, Box, ArrowLeft, Search, Pentagon, RectangleHorizontal, Hand, ArrowUpRight, Layers, X, Download, RotateCcw, MapPin, LoaderCircle, PanelLeftClose, PanelLeftOpen, ChevronUp, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, FileJson, Sun, Moon, Sunrise, MoonStar, ChartNoAxesCombined, SlidersHorizontal, Minimize2, Rows3 } from 'lucide-react';
import { MapComponent, type Point, type DrawMode } from '../components/map/SelectMap';
import { Space, type ExportRequest } from '../three/Space';
import { downloadFile } from '../data/download';
import { groupForLayer, layerGroups, vectorLayers, initialLayers, buildingDimensions, roofShapes, type Feature, type LayerName } from '../data/layers';
import { useSceneLayers } from '../hooks/useSceneLayers';
import { useWorkspaceRoute } from '../hooks/useWorkspaceRoute';
import { useBoundaryLocation } from '../hooks/useBoundaryLocation';
import { useSiteAnalysis } from '../hooks/useSiteAnalysis';
import { useSceneTerrain } from '../hooks/useSceneTerrain';
import { boundaryKey, boundaryLabel } from '../data/boundary';
import { readPreference, savePreference, type Theme } from './preferences';
import type { SceneLighting } from '../three/lighting';
import { collectSublayers, featureSublayer, isFeatureVisible, type Sublayer, type SublayerVisibility } from '../data/sublayers';
import { groupSublayers } from '../data/sublayerGroups';
import { matchLayer, onlySublayers, resetSublayers } from '../data/layerFilter';
import { LegendPanel } from './LegendPanel';
import { WeatherChip } from './WeatherChip';
import { useWeather } from '../hooks/useWeather';
import { poiCategories, poiStyle, poiStyleForSublayer } from '../data/poiStyle';
import { assignBuildingLandUse, landUseCategoryForSublayer, type BuildingColorMode, type LandUseCategory } from '../data/landUseStyle';
import { PoiIcon } from '../three/poiIcons';
import { CategoryBadge } from './CategoryBadge';
import { DataGuide } from './DataGuide';
import { useRhinoExport } from '../hooks/useRhinoExport';
const SiteDashboard = lazy(() => import('./SiteDashboard'));

type Place = { place_id: number; display_name: string; lat: string; lon: string };
const layerNames: LayerName[] = [...vectorLayers, 'Terrain'];
const layerMenuSections: {label: string; layers: LayerName[]}[] = [
  {label: 'Buildings & land', layers: ['Buildings', 'Land use']},
  {label: 'Movement', layers: ['Roads', 'Walking & cycling', 'Transit']},
  {label: 'Landscape', layers: ['Trees & woodland', 'Green spaces', 'Water', 'Waterways', 'Terrain']},
  {label: 'Places', layers: ['Points of interest', 'Recreation & parking']},
];
/** Fill colour for a land-use type, matching the ground and the buildings coloured by use. */
function LandUseSwatch({ id }: { id: string }) {
  const category = landUseCategoryForSublayer(id);
  return category ? <span className="land-swatch" style={{ background: category.color }} title={category.label}/> : null;
}
/** Category colour and icon for a point-of-interest type, matching its badge in the 3D view. */
function PoiSwatch({ id }: { id: string }) {
  const { category, icon } = poiStyleForSublayer(id) ?? { category: poiCategories.other, icon: poiCategories.other.icon };
  return <CategoryBadge category={category} icon={icon} round/>;
}
/** Extra words a filter can find a layer by, beyond its name. */
const layerKeywords: Partial<Record<LayerName, string>> = { Terrain: 'elevation height ground', 'Points of interest': 'places amenities shops', 'Trees & woodland': 'forest vegetation', 'Walking & cycling': 'footpaths paths bikes', Transit: 'rail tram bus train' };
/** Phones and short landscape screens, where the viewer drawers share the screen. */
const compactViewer = () => window.matchMedia('(max-width: 700px), (max-height: 500px) and (max-width: 1000px)').matches;
const featureCount = (count: number) => `${count.toLocaleString()} ${count === 1 ? 'feature' : 'features'}`;
const roofNames: Record<string, string> = { side_hipped: 'side-hipped', half_hipped: 'half-hipped', lean_to: 'lean-to', conical: 'cone' };
/** Floors and roof as the viewer draws them, and whether each came from the map or was estimated. */
function BuildingStructure({ tags }: { tags: Record<string, string> }) {
  const dimensions = buildingDimensions(tags), shape = tags['roof:shape'];
  const floors = !dimensions.floors ? 'Floors not mapped' : `${dimensions.floors} ${dimensions.floors === 1 ? 'floor' : 'floors'}${dimensions.floorsEstimated ? ' (estimated from height)' : ''}`;
  const roof = !shape ? null : roofShapes[shape] !== undefined ? `${roofNames[shape] || shape} roof, ${Math.round(dimensions.roofHeight * 10) / 10} m${dimensions.roofEstimated ? ' (typical height, not mapped)' : ''}` : shape === 'flat' ? 'flat roof' : `roof “${shape}” not modelled, shown flat`;
  return <p className="hint">{floors}{roof ? ` · ${roof}` : ''}.</p>;
}
function App() {
  const [theme,setTheme]=useState<Theme>(()=>readPreference('map3d.theme',['light','dark'],window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  // Auto follows day and night at the site, from live weather data.
  const [lightingMode,setLightingMode]=useState<SceneLighting|'auto'>(()=>readPreference('map3d.sceneLighting',['auto','day','night'],'auto'));
  const [liveWeather,setLiveWeather]=useState(()=>readPreference('map3d.liveWeather',['on','off'],'on')==='on');
  const [weatherEffects,setWeatherEffects]=useState(()=>readPreference('map3d.weatherEffects',['on','off'],'on')==='on');
  useEffect(()=>{ savePreference('map3d.liveWeather',liveWeather?'on':'off'); },[liveWeather]);
  useEffect(()=>{ savePreference('map3d.weatherEffects',weatherEffects?'on':'off'); },[weatherEffects]);
  useEffect(()=>{ document.documentElement.dataset.theme=theme; savePreference('map3d.theme',theme); },[theme]);
  useEffect(()=>{ savePreference('map3d.sceneLighting',lightingMode); },[lightingMode]);
  // Every session starts with buildings coloured by use and storey lines drawn.
  const [buildingColorMode,setBuildingColorMode]=useState<BuildingColorMode>('landUse');
  const [showFloors,setShowFloors]=useState(true);
  const [drawerMinimized, setDrawerMinimized] = useState(false);
  const [layersMinimized, setLayersMinimizedState] = useState(() => window.matchMedia('(max-width: 700px)').matches);
  const [legendMinimized, setLegendMinimizedState] = useState(compactViewer);
  // On small screens the layer list and the legend take turns, so one never hides behind the other.
  const setLayersMinimized = useCallback((value: boolean | ((previous: boolean) => boolean)) => setLayersMinimizedState(previous => {
    const next = typeof value === 'function' ? value(previous) : value;
    if (!next && compactViewer()) setLegendMinimizedState(true);
    return next;
  }), []);
  const setLegendMinimized = (value: boolean) => { setLegendMinimizedState(value); if (!value && compactViewer()) setLayersMinimizedState(true); };
  const [layerFilter, setLayerFilter] = useState('');
  // While the inspector is open the legend folds to a pill right under it, and comes back as it was once it closes.
  /** Publishes the inspector's bottom edge as --inspector-bottom on <main>, so the legend can sit under it. */
  const inspectorObserver = useRef<ResizeObserver | null>(null);
  const trackInspector = useCallback((element: HTMLDivElement | null) => {
    inspectorObserver.current?.disconnect(); inspectorObserver.current = null;
    const main = element?.parentElement;
    if (!element || !main) return;
    const update = () => main.style.setProperty('--inspector-bottom', `${element.offsetTop + element.offsetHeight}px`);
    update();
    inspectorObserver.current = new ResizeObserver(update);
    inspectorObserver.current.observe(element);
  }, []);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [focusView, setFocusView] = useState(false);
  useEffect(() => {
    if (!focusView) return;
    const exit = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocusView(false); };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [focusView]);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toolsOpen) return;
    const dismiss = (event: PointerEvent) => { if (!toolbarRef.current?.contains(event.target as Node)) setToolsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setToolsOpen(false); toolsButtonRef.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [toolsOpen]);
  const [preparing, setPreparing] = useState(0);
  const [mode, setMode] = useState<DrawMode>('pan');
  const [isDrawing, setIsDrawing] = useState(false);
  const { points, location: savedLocation, locationBoundary, view, navigate, update: updateRoute } = useWorkspaceRoute();
  const location = useBoundaryLocation(points, savedLocation, locationBoundary, updateRoute);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [target, setTarget] = useState<[number, number] | null>(null);
  const [searchedPlace, setSearchedPlace] = useState<{points: Point[]; label: string}>();
  const searchLocation = searchedPlace?.points === points ? searchedPlace.label : '';
  const sceneLayers = useSceneLayers(points);
  const { features, loading, started: sceneStarted, start: startLayers } = sceneLayers;
  // Keep the worker alive across menus and routes; each source arrival refreshes it.
  const analysis = useSiteAnalysis(points, features, sceneStarted && points.length >= 3);
  const {refreshIfStale} = sceneLayers;
  useEffect(() => { if (view !== 'map') refreshIfStale(); }, [view, refreshIfStale]);
  useEffect(() => { if (sceneStarted) void import('./SiteDashboard').catch(() => {}); }, [sceneStarted]);
  type Feedback = {points: Point[]; view: typeof view; value: string};
  const [statusData, setStatusData] = useState<Feedback>();
  const [errorData, setErrorData] = useState<Feedback>();
  const status = statusData?.points === points && statusData.view === view ? statusData.value : '';
  const error = errorData?.points === points && errorData.view === view ? errorData.value : '';
  const setStatus = useCallback((value: string) => setStatusData({points, view, value}), [points, view]);
  const setError = useCallback((value: string) => setErrorData({points, view, value}), [points, view]);
  const rhinoExport=useRhinoExport(setStatus,setError);
  const {cancel:cancelRhinoExport}=rhinoExport;
  useEffect(()=>{cancelRhinoExport();},[points,view,cancelRhinoExport]);
  const [selection, setSelection] = useState<{points: Point[]; feature: Feature | null}>();
  const setSelected = useCallback((feature: Feature | null) => { setSelection({points, feature}); if (feature && window.matchMedia('(max-width: 700px)').matches) setLayersMinimized(true); }, [points, setLayersMinimized]);
  const [layers, setLayers] = useState<Record<LayerName, boolean>>(initialLayers);
  const [sublayers,setSublayers]=useState<SublayerVisibility>({});
  const selected = useMemo(() => {
    if (selection?.points !== points || !selection.feature) return null;
    const current = features.find(feature => feature.key === selection.feature!.key);
    return current && isFeatureVisible(current, layers, sublayers) ? current : null;
  }, [selection, points, features, layers, sublayers]);
  // Places share their map badge with the details card; trees keep the plain layer heading.
  const selectedPoi = selected?.kind === 'point' && selected.tags.natural !== 'tree' ? poiStyle(selected) : null;
  const siteCentre = useMemo(() => points.length >= 3 ? { lat: points.reduce((n, p) => n + p.lat, 0) / points.length, lng: points.reduce((n, p) => n + p.lng, 0) / points.length } : null, [points]);
  const weatherState = useWeather(view === '3d' ? siteCentre : null, liveWeather);
  const sceneLighting: SceneLighting = lightingMode === 'auto' ? (liveWeather && weatherState.weather && !weatherState.weather.isDay ? 'night' : 'day') : lightingMode;
  const legendBeforeInspector = useRef<boolean | null>(null);
  const inspectorOpen = !!selected;
  useEffect(() => {
    if (inspectorOpen && legendBeforeInspector.current === null) { legendBeforeInspector.current = legendMinimized; setLegendMinimizedState(true); }
    if (!inspectorOpen && legendBeforeInspector.current !== null) { setLegendMinimizedState(legendBeforeInspector.current); legendBeforeInspector.current = null; }
  }, [inspectorOpen, legendMinimized]);
  // Building use by type or by the land-use area around it, recomputed as layers stream in.
  const buildingUses = useMemo(() => buildingColorMode === 'landUse' ? assignBuildingLandUse(features) : null, [buildingColorMode, features]);
  const buildingColors = useMemo(() => buildingUses && new Map([...buildingUses].map(([key, category]) => [key, category.color])), [buildingUses]);
  const buildingLegend = useMemo(() => {
    if (!buildingUses) return [];
    const counts = new Map<string, { category: LandUseCategory; count: number }>();
    for (const category of buildingUses.values()) { const row = counts.get(category.id); if (row) row.count++; else counts.set(category.id, { category, count: 1 }); }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }, [buildingUses]);
  const [expandedLayers,setExpandedLayers]=useState<Partial<Record<LayerName,boolean>>>({});
  const [expandedGroups,setExpandedGroups]=useState<Record<string,boolean>>({});
  const {value: terrain, status: terrainState, error: terrainError, retry: retryTerrain} = useSceneTerrain(points, layers.Terrain && sceneStarted);
  const [reset, setReset] = useState(0);
  const [exportRequest, setExportRequest] = useState<ExportRequest>({ id: 0, format: 'glb' });
  const searchRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setPlaces([]); setSearching(false); setSearchError(''); setSearchedPlace(undefined);
    return () => { searchRequest.current?.abort(); };
  }, [points, view]);
  const updateBoundary = (p: Point[]) => { setDrawerMinimized(false); updateRoute({ points: p, location: boundaryLabel(p), locationBoundary: undefined }); setIsDrawing(false); setStatusData({points:p, view, value:p.length ? '' : 'Boundary cleared.'}); setErrorData(undefined); setMode('pan'); };
  const previousBoundary = useRef(points);
  useEffect(() => {
    const changed = previousBoundary.current !== points;
    previousBoundary.current = points;
    if (changed) {
      setSelected(null); setPreparing(0);
    }
    if (view !== 'map' && (changed || !sceneStarted)) {
      const priority = [...layerGroups].sort((a,b) => Number(b.layers.some(name => layers[name])) - Number(a.layers.some(name => layers[name])));
      startLayers(priority.map(group => group.id));
    }
  }, [points, view, sceneStarted, startLayers, layers, setSelected]);
  useEffect(() => { setMode('pan'); setSelection(undefined); setFocusView(false); setToolsOpen(false); setDrawerMinimized(false); setLayersMinimized(window.matchMedia('(max-width: 700px)').matches); setLegendMinimizedState(compactViewer()); setStatusData(undefined); setErrorData(undefined); }, [view, setLayersMinimized]);
  const search = async (e: React.FormEvent) => {
    e.preventDefault(); if (!query.trim()) return;
    searchRequest.current?.abort(); const controller = new AbortController(); searchRequest.current = controller;
    setSearching(true); setSearchError(''); setPlaces([]);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`, { signal: controller.signal });
      if (!r.ok) throw new Error('Location search is unavailable. Try again shortly.');
      const data = await r.json(); if (controller.signal.aborted) return;
      setPlaces(data); if (!data.length) setSearchError('No locations found. Try a city, address, or postcode.');
    } catch (e) { if (!controller.signal.aborted) setSearchError(e instanceof Error ? e.message : 'Search failed. Please retry.'); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  };
  const generate = () => {
    navigate('3d');
  };
  const layerCounts = useMemo(() => { const counts = Object.fromEntries(vectorLayers.map(name => [name, 0])); for (const feature of features) counts[feature.layer]++; return counts; }, [features]);
  const sublayerGroups=useMemo(()=>collectSublayers(features),[features]);
  const visibleCounts=useMemo(()=>Object.fromEntries(vectorLayers.map(name=>[name,layers[name]?sublayerGroups[name].reduce((sum,type)=>sum+(sublayers[type.id]!==false?type.count:0),0):0])),[sublayerGroups,layers,sublayers]);
  const toggleLayer=(name:LayerName,enabled:boolean)=>{
    setLayers(previous=>({...previous,[name]:enabled}));
    if(enabled && name!=='Terrain') setSublayers(previous=>Object.fromEntries(Object.entries(previous).filter(([id])=>!id.startsWith(`${name}|`))));
    if(!enabled && selected?.layer===name) setSelected(null);
  };
  const toggleSublayers=(ids:string[],enabled:boolean)=>{
    setSublayers(previous=>({...previous,...Object.fromEntries(ids.map(id=>[id,enabled]))}));
    if(!enabled && selected && ids.includes(featureSublayer(selected).id)) setSelected(null);
  };
  const clearHiddenSelection=(nextLayers:Record<LayerName,boolean>,nextSublayers:SublayerVisibility)=>{ if(selected && !isFeatureVisible(selected,nextLayers,nextSublayers)) setSelected(null); };
  /** Turn several layers on or off at once; turning a layer on shows all of its types again. */
  const setManyLayers=(names:LayerName[],enabled:boolean)=>{
    const nextLayers={...layers,...Object.fromEntries(names.map(name=>[name,enabled]))} as Record<LayerName,boolean>;
    const nextSublayers=enabled?resetSublayers(sublayers,names):sublayers;
    setLayers(nextLayers);setSublayers(nextSublayers);clearHiddenSelection(nextLayers,nextSublayers);
  };
  /** Show one layer, fully, and hide every other map layer. Terrain is left as it is. */
  const showOnlyLayer=(name:LayerName)=>{
    const nextLayers=Object.fromEntries(layerNames.map(other=>[other,other==='Terrain'&&name!=='Terrain'?layers.Terrain:other===name])) as Record<LayerName,boolean>;
    const nextSublayers=resetSublayers(sublayers,[name]);
    setLayers(nextLayers);setSublayers(nextSublayers);clearHiddenSelection(nextLayers,nextSublayers);
  };
  /** Within one layer, show only the given types; other layers keep their choices. */
  const showOnlySublayers=(name:typeof vectorLayers[number],ids:string[])=>{
    const nextLayers={...layers,[name]:true};
    const nextSublayers=onlySublayers(sublayers,sublayerGroups[name],ids);
    setLayers(nextLayers);setSublayers(nextSublayers);clearHiddenSelection(nextLayers,nextSublayers);
  };
  /** Legend categories: showing one on a hidden layer reveals just that category. */
  /**
   * Child checkboxes (types and categories) stay usable while their layer is off:
   * ticking one turns the layer back on showing just that selection, and hiding the last
   * visible child turns the layer off, so the parent switch always reflects its children.
   */
  const toggleCategory=(name:typeof vectorLayers[number],ids:string[],enabled:boolean)=>{
    if(enabled && !layers[name]) return showOnlySublayers(name,ids);
    if(!enabled && layers[name] && sublayerGroups[name].every(type=>ids.includes(type.id) || sublayers[type.id]===false)) return toggleLayer(name,false);
    toggleSublayers(ids,enabled);
  };
  const expandableLayers=vectorLayers.filter(name=>sublayerGroups[name].length>0);
  const allExpanded=expandableLayers.length>0 && expandableLayers.every(name=>expandedLayers[name]);
  const setAllExpanded=(open:boolean)=>{
    setExpandedLayers(open?Object.fromEntries(expandableLayers.map(name=>[name,true])):{});
    setExpandedGroups(open?Object.fromEntries(expandableLayers.flatMap(name=>(groupSublayers(name,sublayerGroups[name])||[]).map(group=>[group.key,true]))):{});
  };
  const layerStatus = (name: typeof vectorLayers[number]) => {
    const state = sceneLayers.states[groupForLayer(name).id], count = layerCounts[name];
    const countLabel = `${count.toLocaleString()} ${count === 1 ? 'feature' : 'features'}${layers[name] && visibleCounts[name]<count?` · ${visibleCounts[name].toLocaleString()} visible`:''}`;
    if (state.status === 'queued') return count ? `${countLabel} · More data queued` : 'Queued';
    if (state.status === 'waiting') return count ? `${countLabel} · ${state.message}` : state.message || 'Retrying automatically…';
    if (state.status === 'loading') return count ? `${countLabel} · Loading more…` : state.message || 'Loading…';
    if (state.status === 'error') return count ? `${countLabel} · Incomplete` : 'Failed to load';
    if (state.status === 'cancelled') return count ? `${countLabel} · Loading stopped` : 'Not loaded · Stopped';
    return count ? countLabel : state.status === 'ready' ? 'No mapped data here' : 'Not loaded';
  };
  const failedCount = vectorLayers.filter(name => sceneLayers.states[groupForLayer(name).id].status === 'error').length;
  const stoppedCount = vectorLayers.filter(name => sceneLayers.states[groupForLayer(name).id].status === 'cancelled').length;
  const pendingCount = vectorLayers.filter(name => ['loading', 'queued', 'waiting'].includes(sceneLayers.states[groupForLayer(name).id].status)).length;
  const downloadingCount = vectorLayers.filter(name => sceneLayers.states[groupForLayer(name).id].status === 'loading').length;
  const waitingCount = vectorLayers.filter(name => sceneLayers.states[groupForLayer(name).id].status === 'waiting').length;
  const queueCount = pendingCount - downloadingCount - waitingCount;
  const loadingSummary = [downloadingCount && `${downloadingCount} layers downloading`, waitingCount && `${waitingCount} waiting to retry`, queueCount && `${queueCount} queued`].filter(Boolean).join(' · ');
  const dataMessage = !sceneStarted ? 'Preparing scene…' : loading ? `${features.length ? `${features.length} ${features.length === 1 ? 'feature' : 'features'} loaded · ` : ''}${loadingSummary}${failedCount ? ` · ${failedCount} unavailable` : ''}` : failedCount ? `${features.length} ${features.length === 1 ? 'feature' : 'features'} loaded · ${failedCount} layers unavailable` : stoppedCount ? `${features.length} ${features.length === 1 ? 'feature' : 'features'} loaded · ${stoppedCount} layers stopped` : `Scene ready · ${features.length} features`;
  const sceneMessage = preparing ? `${loading ? dataMessage : `${features.length.toLocaleString()} features loaded`} · Preparing 3D geometry (${preparing} layers)` : dataMessage;
  const area = points.length ? Math.abs((Math.max(...points.map(p => p.lat)) - Math.min(...points.map(p => p.lat))) * (Math.max(...points.map(p => p.lng)) - Math.min(...points.map(p => p.lng))) * 12364 * Math.cos(points[0].lat * Math.PI / 180)) : 0;
  const returnToMap = () => navigate('map');
  const exportScene = (format: ExportRequest['format']) => {
    setStatus(''); setError('');
    setExportRequest(previous => ({ id: previous.id + 1, format }));
  };
  const downloadRawData = () => {
    try {
      const ring = points.map(p => [p.lng, p.lat]);
      if (ring.length) ring.push([...ring[0]]);
      const elements = [...new Map(layerGroups.flatMap(group => sceneLayers.sources[group.id] || []).map(element => [`${element.type || 'way'}/${element.id}`, element])).values()];
      const data = {
        version: 0.6,
        generator: 'map3d',
        attribution: '© OpenStreetMap contributors',
        elements,
        scene: {
          exportedAt: new Date().toISOString(), location,
          boundary: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
          batches: Object.fromEntries(layerGroups.map(group => [group.id, { ...sceneLayers.states[group.id], elementCount: sceneLayers.sources[group.id]?.length || 0 }])),
          visibleLayers: layerNames.filter(name => layers[name]),
          sublayers: vectorLayers.flatMap(name=>sublayerGroups[name].map(type=>({...type,parent:name,visible:layers[name] && sublayers[type.id]!==false}))),
          terrain: terrain ? { ...terrain, source: 'Mapzen Terrarium / AWS elevation-tiles-prod', attribution: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' } : null,
        },
      };
      downloadFile('map-data.json', JSON.stringify(data, null, 2), 'application/json');
      setError(''); setStatus(`Raw data downloaded · ${elements.length.toLocaleString()} source elements.`);
    } catch { setError('Could not download the raw data. Please retry.'); }
  };
  const canExportScene = !preparing && (features.some(feature => isFeatureVisible(feature,layers,sublayers)) || !!(layers.Terrain && terrain));
  const downloadRhino=()=>rhinoExport.start({features,points,location,layers,sublayers,terrain,
    layerStatus:Object.fromEntries(layerNames.map(name=>[name,name==='Terrain'?terrainState:sceneLayers.states[groupForLayer(name).id].status])),
    incomplete:loading || failedCount>0 || stoppedCount>0 || terrainState==='loading' || terrainState==='error',
  });
  const loadControls = <>
    {loading && <button onClick={sceneLayers.cancel}>Stop loading layers</button>}
    {!loading && (failedCount > 0 || stoppedCount > 0) && <button onClick={sceneLayers.retryFailed}>Retry unavailable layers</button>}
  </>;
  return <div className={`workspace${view === '3d' ? ' viewer-mode' : view === 'dashboard' ? ' dashboard-mode' : drawerMinimized ? ' sidebar-collapsed' : ''}${focusView ? ' focus-view' : ''}`}>
    <header className="app-header">
      <a className="brand" href="/map" onClick={event => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); returnToMap(); } }} aria-label="Map3d home"><span><Box size={23}/></span>map3d</a>
      {view === '3d' && <button className="back-to-map" onClick={returnToMap}><ArrowLeft size={15}/>Back to map</button>}
      <div ref={toolbarRef} className="top-toolbar" role="toolbar" aria-label="Display and export tools">
        <button className="dashboard-link" aria-label="Site dashboard" aria-current={view === 'dashboard' ? 'page' : undefined} disabled={points.length < 3 || isDrawing} onClick={() => navigate('dashboard')} title="Analyze the selected boundary"><ChartNoAxesCombined size={16}/><span>Site dashboard</span></button>
        <button ref={toolsButtonRef} className="compact-tools-toggle" aria-label="Display and export settings" aria-expanded={toolsOpen} aria-controls="display-settings" onClick={() => { setToolsOpen(value => !value); if (window.matchMedia('(max-width: 700px)').matches) { setLayersMinimized(true); setSelected(null); } }}><SlidersHorizontal size={18}/><span>Tools</span></button>
        <div id="display-settings" className={`display-settings${toolsOpen ? ' open' : ''}`}>
        <div className="compact-settings-heading"><h2>Settings</h2><button aria-label="Close display settings" onClick={() => { setToolsOpen(false); toolsButtonRef.current?.focus(); }}><X size={18}/></button></div>
        <div className="toolbar-control theme-control" role="group" aria-label="Interface theme">
          <span className="toolbar-label">App theme</span>
          <div className="segmented-control">
            <button aria-label="Light theme" aria-pressed={theme==='light'} title="Light interface" onClick={()=>setTheme('light')}><Sun size={15}/><span>Light</span></button>
            <button aria-label="Dark theme" aria-pressed={theme==='dark'} title="Dark interface" onClick={()=>setTheme('dark')}><Moon size={15}/><span>Dark</span></button>
          </div>
        </div>
        {view==='3d' && <>
          <div className="toolbar-control lighting-control" role="group" aria-label="Scene lighting">
            <span className="toolbar-label">Scene light</span>
            <div className="segmented-control">
              <button aria-label="Automatic lighting" aria-pressed={lightingMode==='auto'} title="Day or night, following the current time at the site" onClick={()=>setLightingMode('auto')}><SunMoon size={15}/><span>Auto</span></button><button aria-label="Day lighting" aria-pressed={lightingMode==='day'} title="Daytime scene lighting" onClick={()=>setLightingMode('day')}><Sunrise size={15}/><span>Day</span></button>
              <button aria-label="Night lighting" aria-pressed={lightingMode==='night'} title="Nighttime scene lighting" onClick={()=>setLightingMode('night')}><MoonStar size={15}/><span>Night</span></button>
            </div>
            <button aria-label="Reset camera" title="Reset camera" onClick={()=>{setToolsOpen(false);setReset(value=>value+1);}}><RotateCcw size={16}/></button>
          </div>
          <div className="toolbar-control export-control" role="group" aria-label="Scene exports">
            <span className="toolbar-label">Export</span>
            <div className="viewer-toolbar">

              <button aria-label="Download Rhino 3DM" title="Download all loaded geometry as Rhino 7+ 3DM, including hidden layers, nested sublayers and colors (metres, Z-up)" disabled={rhinoExport.busy || (!features.length && !terrain)} onClick={()=>{setToolsOpen(false);downloadRhino();}}>{rhinoExport.busy?<LoaderCircle className="spin" size={15}/>:<Download size={15}/>}3DM</button>
              <button aria-label="Download GLB" title="Download visible layers as GLB, including materials" disabled={rhinoExport.busy || !canExportScene} onClick={()=>{setToolsOpen(false);exportScene('glb');}}><Download size={15}/>GLB</button>
              <button aria-label="Download OBJ" title="Download visible geometry as OBJ (metres, Y-up; no materials)" disabled={rhinoExport.busy || !canExportScene} onClick={()=>{setToolsOpen(false);exportScene('obj');}}><Download size={15}/>OBJ</button>
              <button aria-label="Download raw data (JSON)" title="Download all loaded source data, boundary, and load statuses as JSON" disabled={!Object.keys(sceneLayers.sources).length} onClick={()=>{setToolsOpen(false);downloadRawData();}}><FileJson size={15}/><span className="raw-data-label">Raw data</span></button>
            </div>
          </div>
        </>}
        </div>
      </div>
    </header>
    {view === 'map' && <aside className="sidebar" aria-label="Map tools">
      <div className="drawer-top">
        <span>{drawerMinimized && mode !== 'pan' ? `Draw ${mode} · tap the map` : 'Map tools'}</span>
        <button className="drawer-toggle" aria-label={drawerMinimized ? 'Expand map tools' : 'Minimize map tools'} title={drawerMinimized ? 'Expand map tools' : 'Minimize map tools'} aria-expanded={!drawerMinimized} aria-controls="map-tools-content" onClick={() => setDrawerMinimized(value => !value)}>{drawerMinimized ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
      </div>
      <div id="map-tools-content" className="drawer-content" hidden={drawerMinimized}>
        <section>
          <div className="section-heading"><h2>Find a location</h2></div>
          <form className="search" onSubmit={search}>
            <Search size={17}/><input aria-label="Search location" placeholder="City, address, or postcode" value={query} onChange={e => setQuery(e.target.value)}/>
            <button aria-label="Search" disabled={searching || !query.trim()}>{searching ? <LoaderCircle className="spin" size={17}/> : <ArrowUpRight size={18}/>}</button>
          </form>
          {searchError && <p role="status" className="error-text">{searchError}</p>}
          {places.length > 0 && <ul className="results">{places.map(place => <li key={place.place_id}><button onClick={() => { setTarget([Number(place.lat), Number(place.lon)]); setSearchedPlace({points, label: place.display_name.split(',').slice(0, 2).join(',')}); setPlaces([]); }}><MapPin size={16}/>{place.display_name}</button></li>)}</ul>}
        </section>
        <section>
          <div className="section-heading"><h2>Boundary</h2></div>
          <div className="draw-tools">{([{ id: 'pan', label: 'Explore', icon: Hand }, { id: 'rectangle', label: 'Rectangle', icon: RectangleHorizontal }, { id: 'polygon', label: 'Polygon', icon: Pentagon }] as const).map(tool => <button key={tool.id} aria-pressed={mode === tool.id} onClick={() => { setMode(tool.id); if (tool.id !== 'pan' && window.matchMedia('(max-width: 700px)').matches) setDrawerMinimized(true); }}><tool.icon size={21}/>{tool.label}</button>)}</div>
          <p className="hint">{mode === 'rectangle' ? 'Tap two opposite corners to draw a rectangle.' : mode === 'polygon' ? 'Tap each corner, then finish or tap the first point.' : 'Choose a tool to draw or replace the boundary.'}</p>
          {points.length > 0 && <div className="boundary-summary"><span><i/>Boundary selected <small>{area.toFixed(2)} km² bounding area</small></span><button aria-label="Clear boundary" onClick={() => updateBoundary([])}><X size={16}/></button></div>}
        </section>
        <button className="primary" disabled={points.length < 3 || loading || isDrawing} onClick={generate}>
          {loading ? <LoaderCircle size={18} className="spin"/> : <Box size={18}/>} {isDrawing ? 'Finish boundary first' : loading ? 'Loading scene layers…' : 'Generate 3D scene'}{!loading && <ArrowUpRight size={18}/>}
        </button>
        <div className="feedback" aria-live="polite">
          {sceneStarted && <><p>{sceneMessage}</p>{loading && <div className="progress"/>}{loadControls}</>}
          {status && <p>{status}</p>}{error && <div role="alert" className="error-text">{error}</div>}
        </div>
      </div>
    </aside>}
    <main>
      {view !== 'dashboard' && <div className="viewport-top">
        <div className="location-pill"><MapPin size={15}/>{view === 'map' && searchLocation ? searchLocation : location}</div>
        {view === '3d' && <WeatherChip weather={weatherState.weather} loading={weatherState.loading} error={weatherState.error} live={liveWeather} onLive={setLiveWeather} effects={weatherEffects} onEffects={setWeatherEffects} autoLighting={lightingMode==='auto'}/>}

      </div>}
      <div className="viewport">
        <div className="map-viewport" hidden={view !== 'map'}><MapComponent mode={mode} points={points} onChange={updateBoundary} onDrawingChange={setIsDrawing} target={target}/></div>
        {view === '3d' && <Space key={boundaryKey(points)} buildingColors={buildingColors} showFloors={showFloors} sublayers={sublayers} features={features} points={points} layers={layers} terrain={terrain} selected={selected} onSelect={setSelected} reset={reset} exportRequest={exportRequest} onExport={message => setStatus(message)} onError={message => setError(message)} onPreparing={setPreparing} onFocus={() => { setSelected(null); setToolsOpen(false); setFocusView(true); }} onMeasureStart={() => { if (window.matchMedia('(max-width: 700px)').matches) setLayersMinimized(true); }} sceneLighting={sceneLighting} weather={liveWeather && weatherEffects ? weatherState.weather : null}/>}
        {view === 'dashboard' && <Suspense fallback={<div className="site-calculating">Opening site dashboard…</div>}><SiteDashboard key={boundaryKey(points)} points={points} location={location} data={sceneLayers} analysis={analysis} onMap={returnToMap} onViewer={generate}/></Suspense>}
      </div>
      {view === '3d' && <>
        {focusView && <button className="exit-focus-view" autoFocus onClick={() => setFocusView(false)}><Minimize2 size={16}/>Exit focus view</button>}
        <div className={`layer-panel${layersMinimized ? ' minimized' : ''}`}>
          <div className="layer-panel-heading">
            <Layers size={16}/><h2 aria-label="Scene layers"><span className="layer-title-prefix">Scene </span>layers</h2>
            <span className="layer-summary" aria-live="polite" title={sceneMessage}>{loading || preparing > 0 ? <><LoaderCircle size={12} className="spin"/>Loading</> : failedCount || stoppedCount ? 'Partial' : features.length ? `${Object.values(layers).filter(Boolean).length} on` : 'Empty'}</span>
            <button aria-label={layersMinimized ? 'Expand scene layers' : 'Minimize scene layers'} title={layersMinimized ? 'Expand scene layers' : 'Minimize scene layers'} aria-expanded={!layersMinimized} aria-controls="scene-layers-content" onClick={() => { setToolsOpen(false); if (layersMinimized && window.matchMedia('(max-width: 700px)').matches) setSelected(null); setLayersMinimized(value => !value); }}>{layersMinimized ? <ChevronDown size={17}/> : <ChevronUp size={17}/>}</button>
          </div>
          <div id="scene-layers-content" className="layer-panel-content" hidden={layersMinimized}>
            <div className="layer-loading-controls">{loadControls}</div>
            <div className="layer-tools">
              <label className="layer-filter"><Search size={14} aria-hidden="true"/><input type="search" aria-label="Filter layers" placeholder="Filter layers and types" value={layerFilter} onChange={event=>setLayerFilter(event.target.value)} onKeyDown={event=>{if(event.key==='Escape' && layerFilter){event.stopPropagation();setLayerFilter('');}}}/>{layerFilter && <button aria-label="Clear layer filter" title="Clear filter" onClick={()=>setLayerFilter('')}><X size={13}/></button>}</label>
              <div className="layer-bulk" role="group" aria-label="All layers">
                <button aria-label="All on" onClick={()=>setManyLayers([...vectorLayers],true)} title="Show every map layer and all of their types (terrain stays as it is)"><Eye size={13}/><span className="bulk-label">All on</span></button>
                <button aria-label="All off" onClick={()=>setManyLayers([...vectorLayers],false)} title="Hide every map layer (terrain stays as it is)"><EyeOff size={13}/><span className="bulk-label">All off</span></button>
                <button onClick={()=>setAllExpanded(!allExpanded)} disabled={!expandableLayers.length} aria-label={allExpanded?'Collapse all layers':'Expand all layers'} title={allExpanded?'Collapse every layer':'Expand every layer and category'}>{allExpanded?<ChevronsDownUp size={13}/>:<ChevronsUpDown size={13}/>}<span className="bulk-label">{allExpanded?'Collapse':'Expand'}</span></button>
              </div>
            </div>
            <div className="layer-list" role="region" aria-label="Scene layer list" tabIndex={0}>{(()=>{
              const filtering=layerFilter.trim().length>0;
              const sections=layerMenuSections.map(section=>({...section,rows:section.layers.map(name=>{
                const types=name==='Terrain'?[]:sublayerGroups[name];
                const groups=name==='Terrain'?null:groupSublayers(name,types);
                return {name,types,groups,match:matchLayer(name,types,groups,layerFilter,layerKeywords[name])};
              }).filter(row=>row.match.visible)})).filter(section=>section.rows.length>0);
              if(!sections.length) return <p className="layer-empty">No layers or types match “{layerFilter.trim()}”.<button onClick={()=>setLayerFilter('')}>Clear filter</button></p>;
              return sections.map(section=>{
                // Terrain loads elevation on demand, so section switches leave it to its own checkbox.
                const switchable=section.layers.filter(name=>name!=='Terrain');
                const onCount=switchable.filter(name=>layers[name]).length;
                return <div className="layer-section" key={section.label}><div className="layer-section-heading"><h3>{section.label}</h3><span className="layer-section-count">{onCount}/{switchable.length} on</span><input type="checkbox" aria-label={`All ${section.label} layers`} title={`Show or hide every ${section.label.toLowerCase()} layer`} checked={onCount===switchable.length} ref={input=>{if(input) input.indeterminate=onCount>0 && onCount<switchable.length;}} aria-checked={onCount>0 && onCount<switchable.length?'mixed':onCount===switchable.length} onChange={event=>setManyLayers(switchable,event.target.checked)}/></div>{section.rows.map(({name,types,groups,match})=>{
              const state = name === 'Terrain' ? null : sceneLayers.states[groupForLayer(name).id];
              const mixed=name!=='Terrain' && layers[name] && visibleCounts[name]>0 && visibleCounts[name]<layerCounts[name];
              const checked=layers[name] && (name==='Terrain' || !layerCounts[name] || visibleCounts[name]===layerCounts[name]);
              const groupId=`sublayers-${layerNames.indexOf(name)}`;
              const expanded=filtering && !match.all ? true : !!expandedLayers[name];
              return <div key={name} className={`layer-entry ${state?.status || ''}`}>
                <div className="layer-main-row">
                  {types.length>0 ? <button className="sublayer-expander" aria-label={`${expanded?'Hide':'Show'} ${name} sublayers`} title={`${types.length} ${types.length===1?'sublayer':'sublayers'}`} aria-expanded={expanded} aria-controls={groupId} onClick={()=>setExpandedLayers(previous=>({...previous,[name]:!expanded}))}>{expanded?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</button>:<span className="sublayer-spacer"/>}
                  <label className="layer-row"><span>{name}<small>{name === 'Terrain' ? !layers.Terrain ? 'Load elevation on demand' : terrainState === 'loading' ? 'Loading elevation…' : terrainState === 'error' ? 'Failed · flat ground shown' : terrain ? `${Math.round(terrain.baseline)}–${Math.round(Math.max(...terrain.elevations))} m elevation` : 'Waiting for scene' : layerStatus(name)}{types.length>1 && <span className="type-count"> · {types.length} types</span>}</small></span><input aria-label={name} type="checkbox" checked={checked} ref={input=>{if(input) input.indeterminate=mixed;}} aria-checked={mixed?'mixed':checked} onChange={e=>toggleLayer(name,e.target.checked)}/></label>
                  {name!=='Terrain' && <button className="only-button" aria-label={`Show only ${name}`} title={`Show only ${name}, hiding the other map layers`} onClick={()=>showOnlyLayer(name)}>Only</button>}
                </div>
                {types.length>0 && name!=='Terrain' && <div className="sublayer-list" id={groupId} role="group" aria-label={`${name} sublayers`} hidden={!expanded}>{(()=>{
                  const shownType=(type:Sublayer)=>match.all || match.types.has(type.id);
                  const typeRow=(type:Sublayer)=><div className="sublayer-line" key={type.id}><label className="sublayer-row"><span>{name==='Points of interest' && <PoiSwatch id={type.id}/>}{name==='Land use' && <LandUseSwatch id={type.id}/>}{type.label}<small>{featureCount(type.count)}</small></span><input type="checkbox" aria-label={`${name}: ${type.label}`} checked={layers[name] && sublayers[type.id]!==false} onChange={e=>toggleCategory(name,[type.id],e.target.checked)}/></label><button className="only-button" aria-label={`Show only ${name}: ${type.label}`} title={`Show only ${type.label} in ${name}`} onClick={()=>showOnlySublayers(name,[type.id])}>Only</button></div>;
                  if(!groups) return types.filter(shownType).map(typeRow);
                  return groups.filter(group=>match.all || match.groups.has(group.key)).map(group=>{
                    const ids=group.types.map(type=>type.id), shown=layers[name]?ids.filter(id=>sublayers[id]!==false).length:0, open=filtering && !match.all ? true : !!expandedGroups[group.key], listId=`${groupId}-${group.category.id}`;
                    return <div className="sublayer-group" key={group.key}>
                      <div className="sublayer-group-row">
                        <button className="sublayer-expander" aria-label={`${open?'Hide':'Show'} ${group.category.label} types`} aria-expanded={open} aria-controls={listId} onClick={()=>setExpandedGroups(previous=>({...previous,[group.key]:!open}))}>{open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}</button>
                        <label className="sublayer-row"><span><CategoryBadge category={group.category} muted={name==='Buildings' && buildingColorMode!=='landUse'}/><span className="sublayer-group-label">{group.category.label}<small>{featureCount(group.count)} · {group.types.length} {group.types.length===1?'type':'types'}{layers[name] && shown<ids.length?` · ${shown} shown`:''}</small></span></span><input type="checkbox" aria-label={`${name}: ${group.category.label}`} checked={shown===ids.length && shown>0} ref={input=>{if(input) input.indeterminate=shown>0 && shown<ids.length;}} aria-checked={shown>0 && shown<ids.length?'mixed':shown===ids.length} onChange={e=>toggleCategory(name,ids,e.target.checked)}/></label>
                        <button className="only-button" aria-label={`Show only ${name}: ${group.category.label}`} title={`Show only ${group.category.label} in ${name}`} onClick={()=>showOnlySublayers(name,ids)}>Only</button>
                      </div>
                      <div className="sublayer-list nested" id={listId} role="group" aria-label={`${group.category.label} types`} hidden={!open}>{group.types.filter(shownType).map(typeRow)}</div>
                    </div>;
                  });
                })()}</div>}
                {state && ['error', 'cancelled'].includes(state.status) && <div className="layer-failure"><details><summary>Why this layer is unavailable</summary><p>{state.message}</p></details><button disabled={loading} title={loading ? 'Other layers are still loading' : `Retry ${name}`} onClick={() => sceneLayers.retry(groupForLayer(name as typeof vectorLayers[number]).id)}>Retry {name}</button></div>}
              </div>;
            })}</div>;
              });
            })()}</div>
            {layers.Terrain && terrainState === 'error' && <div className="terrain-error" role="status">{terrainError}<button onClick={retryTerrain}>Retry elevation</button></div>}
            <p className="layer-hint layer-status" aria-live="polite">{sceneMessage}</p>
          </div>
        </div>
        <LegendPanel layers={layers} sublayers={sublayers} sublayerGroups={sublayerGroups} layerCounts={layerCounts} buildingColorMode={buildingColorMode} onBuildingColorMode={setBuildingColorMode} showFloors={showFloors} onShowFloors={setShowFloors} buildingLegend={buildingLegend} unassignedBuildings={buildingUses ? Math.max(0, layerCounts.Buildings - buildingUses.size) : 0} onToggleLayer={toggleLayer} onToggleCategory={toggleCategory} minimized={legendMinimized} onMinimize={setLegendMinimized}/>
        <div className="viewer-actions">
          {status && <p className="viewer-feedback" role="status">{status}</p>}
          {rhinoExport.busy && <button className="rhino-cancel" onClick={()=>{rhinoExport.cancel();setStatus('Rhino export cancelled.');}}>Cancel Rhino export</button>}
          {error && <p className="viewer-feedback error-text" role="alert">{error}</p>}
        </div>
        {selected && <div ref={trackInspector} className={`inspector${selectedPoi ? ' inspector-poi' : ''}`} style={selectedPoi ? { ['--poi-color' as string]: selectedPoi.category.color } : undefined} role="dialog" aria-label="Feature details"><button className="close" aria-label="Close feature details" onClick={() => setSelected(null)}><X size={18}/></button><div className="eyebrow">{selected.layer === 'Buildings' ? 'BUILDING INSPECTOR' : selectedPoi ? `${selectedPoi.category.label} · ${selected.layer}`.toUpperCase() : selected.layer.toUpperCase()}</div><div className={selectedPoi ? 'inspector-poi-heading' : undefined}>{selectedPoi && <span className="poi-badge-large" style={{ background: selectedPoi.category.color }} aria-hidden="true"><PoiIcon name={selectedPoi.icon} size={20} color="#ffffff"/></span>}<h2>{selected.tags.name || (selected.layer === 'Buildings' ? 'Unnamed building' : selected.tags.amenity || selected.tags.leisure || selected.tags.natural || selected.tags.landuse || selected.tags.highway || selected.layer)}</h2></div><p className="hint">OpenStreetMap · {selected.type}/{selected.id}</p><dl>{Object.entries(selected.tags).map(([k,v]) => <div key={k}><dt>{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div>)}</dl>{selected.layer === 'Buildings' && <><p className="hint">{!buildingDimensions(selected.tags).estimated ? 'Height from map data.' : selected.tags['building:levels'] ? 'Height estimated at 3 m per level.' : 'Height unavailable. Displayed at an estimated 10 m.'}</p>{selected.tags['building:part'] && <p className="hint">Mapped building part · elevation offset respected.</p>}<BuildingStructure tags={selected.tags}/></>}</div>}
      </>}
      {view === '3d' && sceneStarted && (loading || preparing > 0 || failedCount > 0 || stoppedCount > 0 || !features.length) && <div className="scene-notice" role="status">
        {(loading || preparing > 0) && <LoaderCircle size={15} className="spin"/>}
        <span>{!loading && !features.length ? failedCount ? 'No layers loaded.' : stoppedCount ? 'Loading stopped.' : 'No mapped features found. Try another boundary.' : sceneMessage}</span>
        {loadControls}
      </div>}
      <div className="viewport-bottom"><span className="viewport-hint">{view === 'map' ? 'Draw a boundary to generate a scene' : view === 'dashboard' ? 'Indicative metrics from mapped data' : 'Drag to orbit · Right-drag to pan · Scroll to zoom · Click to inspect'}</span><div className="viewport-credits"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a><DataGuide/></div></div>
    </main>
  </div>;
}
export default App;
