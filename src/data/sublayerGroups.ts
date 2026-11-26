import type { VectorLayer } from './layers.ts';
import type { Sublayer } from './sublayers.ts';
import { poiCategories, poiStyleForSublayer } from './poiStyle.ts';
import { buildingCategoryForSublayer, landUseCategories, landUseCategoryForSublayer, unspecifiedBuilding } from './landUseStyle.ts';

/** A colour-coded, iconed category between a layer and its OSM types, e.g. Points of interest › Banks & money › ATMs. */
export type SublayerCategory = { id: string; label: string; color: string; icon: string };
export type SublayerGroup = { key: string; category: SublayerCategory; types: Sublayer[]; count: number };

type Grouping = { categorize: (id: string) => SublayerCategory; order: string[] };
/** Only layers whose categories also colour the 3D view are grouped, so the panel and the scene always agree. */
const groupings: Partial<Record<VectorLayer, Grouping>> = {
  'Points of interest': { categorize: id => poiStyleForSublayer(id)?.category ?? poiCategories.other, order: Object.keys(poiCategories) },
  'Land use': { categorize: id => landUseCategoryForSublayer(id) ?? landUseCategories.other, order: Object.keys(landUseCategories) },
  Buildings: { categorize: buildingCategoryForSublayer, order: [...Object.keys(landUseCategories), unspecifiedBuilding.id] },
};

/**
 * Group a layer's types into its categories, in a fixed order so the list reads the same on every site.
 * Returns null when the layer has no categories or everything falls into one, where a flat list is clearer.
 */
export function groupSublayers(layer: VectorLayer, types: Sublayer[]): SublayerGroup[] | null {
  const groups = categorizeSublayers(layer, types);
  return groups && groups.length > 1 ? groups : null;
}
/** Every category a layer's types fall into, even a single one, for the legend. Null for uncategorised layers. */
export function categorizeSublayers(layer: VectorLayer, types: Sublayer[]): SublayerGroup[] | null {
  const grouping = groupings[layer];
  if (!grouping) return null;
  const groups = new Map<string, SublayerGroup>();
  for (const type of types) {
    const category = grouping.categorize(type.id);
    let group = groups.get(category.id);
    if (!group) { group = { key: `${layer}|${category.id}`, category, types: [], count: 0 }; groups.set(category.id, group); }
    group.types.push(type); group.count += type.count;
  }
  const rank = (id: string) => { const index = grouping.order.indexOf(id); return index < 0 ? grouping.order.length : index; };
  return [...groups.values()].sort((a, b) => rank(a.category.id) - rank(b.category.id));
}
