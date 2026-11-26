import { BookOpen, ChevronDown, ChevronUp, Rows3 } from 'lucide-react';
import type { LayerName, VectorLayer } from '../data/layers';
import type { Sublayer, SublayerVisibility } from '../data/sublayers';
import { categorizeSublayers } from '../data/sublayerGroups';
import type { BuildingColorMode, LandUseCategory } from '../data/landUseStyle';
import { palette } from '../three/palette';
import { PoiIcon } from '../three/poiIcons';

/** Layers drawn as plain colours, in reading order; lines get a stroke swatch, areas a fill. */
const plainLayers: { name: VectorLayer; shape: 'line' | 'fill' | 'dot' }[] = [
  { name: 'Roads', shape: 'line' }, { name: 'Walking & cycling', shape: 'line' }, { name: 'Transit', shape: 'line' },
  { name: 'Trees & woodland', shape: 'dot' }, { name: 'Green spaces', shape: 'fill' }, { name: 'Water', shape: 'fill' },
  { name: 'Waterways', shape: 'line' }, { name: 'Recreation & parking', shape: 'fill' },
];

type Props = {
  layers: Record<LayerName, boolean>;
  sublayers: SublayerVisibility;
  sublayerGroups: Record<VectorLayer, Sublayer[]>;
  layerCounts: Record<string, number>;
  buildingColorMode: BuildingColorMode;
  onBuildingColorMode: (mode: BuildingColorMode) => void;
  showFloors: boolean;
  onShowFloors: (value: boolean) => void;
  buildingLegend: { category: LandUseCategory; count: number }[];
  unassignedBuildings: number;
  onToggleLayer: (name: LayerName, enabled: boolean) => void;
  /** Show or hide a category's types; enabling one on a hidden layer shows just that category. */
  onToggleCategory: (layer: VectorLayer, ids: string[], enabled: boolean) => void;
  minimized: boolean;
  onMinimize: (value: boolean) => void;
};

/**
 * What each colour in the scene means, kept apart from the layer list.
 * Every entry is also a switch for what it describes, so the legend doubles as a quick filter.
 */
export function LegendPanel(props: Props) {
  const { layers, sublayers, sublayerGroups, layerCounts } = props;
  const categories = (layer: VectorLayer) => (categorizeSublayers(layer, sublayerGroups[layer]) || []).map(group => {
    const ids = group.types.map(type => type.id), shown = layers[layer] ? ids.filter(id => sublayers[id] !== false).length : 0;
    return { group, ids, on: shown > 0 };
  });
  const categorySection = (layer: VectorLayer, title: string, icons: boolean) => {
    const rows = layerCounts[layer] ? categories(layer) : [];
    if (!rows.length) return null;
    return <section className="legend-section" aria-label={`${title} legend`}>
      <h3>{title}</h3>
      {/* A hidden layer collapses to one row rather than a list of struck-through categories. */}
      {!layers[layer] ? <ul className="legend-list"><li><button className="legend-entry" aria-pressed={false} aria-label={`Show ${layer}, ${rows.length} hidden ${rows.length === 1 ? 'category' : 'categories'}`} title={`Show ${layer}`} onClick={() => props.onToggleLayer(layer, true)}>
        <span className="legend-stack" aria-hidden="true">{rows.slice(0, 4).map(({ group }) => <span key={group.key} style={{ background: group.category.color }}/>)}</span>
        <span className="legend-label">{rows.length} {rows.length === 1 ? 'category' : 'categories'} · hidden</span><small>Show</small>
      </button></li></ul> : <ul className="legend-list">{rows.map(({ group, ids, on }) => <li key={group.key}>
        <button className="legend-entry" aria-pressed={on} aria-label={`${group.category.label}, ${group.count.toLocaleString()}`} title={`${on ? 'Hide' : 'Show'} ${group.category.label}`} onClick={() => props.onToggleCategory(layer, ids, !on)}>
          {icons ? <span className="legend-badge" style={{ background: group.category.color }}><PoiIcon name={group.category.icon} size={10} color="#ffffff"/></span> : <span className="legend-swatch fill" style={{ background: group.category.color }}/>}
          <span className="legend-label">{group.category.label}</span><small>{group.count.toLocaleString()}</small>
        </button>
      </li>)}</ul>}
    </section>;
  };
  const plain = plainLayers.filter(({ name }) => layerCounts[name] > 0);
  const hasBuildings = layerCounts.Buildings > 0;
  const empty = !hasBuildings && !plain.length && !layerCounts['Land use'] && !layerCounts['Points of interest'];
  if (empty) return null;
  return <div className={`legend-panel${props.minimized ? ' minimized' : ''}`} role="region" aria-label="Legend">
    <div className="legend-heading">
      <BookOpen size={15}/><h2>Legend</h2>
      <button aria-label={props.minimized ? 'Expand legend' : 'Minimize legend'} title={props.minimized ? 'Expand legend' : 'Minimize legend'} aria-expanded={!props.minimized} aria-controls="legend-content" onClick={() => props.onMinimize(!props.minimized)}>{props.minimized ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}</button>
    </div>
    <div id="legend-content" className="legend-content" hidden={props.minimized}>
      {hasBuildings && <section className="legend-section" aria-label="Buildings legend">
        <h3>Buildings</h3>
        <div className="legend-controls">
          <div className="segmented-control compact" role="group" aria-label="Building colours">
            <button aria-pressed={props.buildingColorMode === 'default'} onClick={() => props.onBuildingColorMode('default')} title="Mapped building and roof colours">Mapped</button>
            <button aria-pressed={props.buildingColorMode === 'landUse'} onClick={() => props.onBuildingColorMode('landUse')} title="Colour buildings by their type, or by the land use they stand in">By use</button>
          </div>
          <button className="floor-toggle" aria-pressed={props.showFloors} onClick={() => props.onShowFloors(!props.showFloors)} title="Draw a line at each storey on building facades"><Rows3 size={13}/>Floors</button>
        </div>
        {props.buildingColorMode === 'landUse' ? <ul className="legend-list static" aria-label="Building use legend">
          {props.buildingLegend.map(({ category, count }) => <li key={category.id}><span className="legend-entry"><span className="legend-swatch block" style={{ background: category.color }}/><span className="legend-label">{category.label}</span><small>{count.toLocaleString()}</small></span></li>)}
          {props.unassignedBuildings > 0 && <li><span className="legend-entry"><span className="legend-swatch block unassigned"/><span className="legend-label">No mapped use</span><small>{props.unassignedBuildings.toLocaleString()}</small></span></li>}
        </ul> : <ul className="legend-list static"><li><span className="legend-entry"><span className="legend-swatch block" style={{ background: palette.Buildings }}/><span className="legend-label" title="Colours tagged in OpenStreetMap; untagged buildings are white">Mapped colours</span><small>{layerCounts.Buildings.toLocaleString()}</small></span></li></ul>}
      </section>}
      {categorySection('Land use', 'Land use', false)}
      {categorySection('Points of interest', 'Places', true)}
      {plain.length > 0 && <section className="legend-section" aria-label="Network and landscape legend">
        <h3>Network & landscape</h3>
        <ul className="legend-list">{plain.map(({ name, shape }) => <li key={name}>
          <button className="legend-entry" aria-pressed={layers[name]} aria-label={`${name}, ${layerCounts[name].toLocaleString()}`} title={`${layers[name] ? 'Hide' : 'Show'} ${name}`} onClick={() => props.onToggleLayer(name, !layers[name])}>
            <span className={`legend-swatch ${shape}`} style={{ ['--swatch' as string]: palette[name] }}/>
            <span className="legend-label">{name}</span><small>{layerCounts[name].toLocaleString()}</small>
          </button>
        </li>)}</ul>
      </section>}
      <p className="legend-hint">Select an entry to show or hide it.</p>
    </div>
  </div>;
}
