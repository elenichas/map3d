import type { LayerName } from './layers.ts';
import type { Sublayer, SublayerVisibility } from './sublayers.ts';
import type { SublayerGroup } from './sublayerGroups.ts';

/** Case- and accent-insensitive text for matching, so "cafe" finds "Cafés". */
export const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const matches = (label: string, query: string) => normalize(label).includes(query);

/** What a layer row shows under a filter. `all` means the layer name matched, so its whole tree stays visible. */
export type LayerMatch = { visible: boolean; all: boolean; groups: Set<string>; types: Set<string> };

/**
 * Match a filter against a layer, its categories and its types.
 * A matching category keeps all of its types; a matching type keeps its category for context.
 */
export function matchLayer(name: LayerName, types: Sublayer[], groups: SublayerGroup[] | null, query: string, keywords = ''): LayerMatch {
  const q = normalize(query);
  if (!q || matches(name, q) || (keywords && matches(keywords, q))) return { visible: true, all: true, groups: new Set(), types: new Set() };
  const result: LayerMatch = { visible: false, all: false, groups: new Set(), types: new Set() };
  for (const group of groups || []) {
    const groupMatch = matches(group.category.label, q);
    for (const type of group.types) if (groupMatch || matches(type.label, q)) { result.types.add(type.id); result.groups.add(group.key); }
  }
  if (!groups) for (const type of types) if (matches(type.label, q)) result.types.add(type.id);
  result.visible = result.types.size > 0;
  return result;
}

/** Visibility that shows only `ids` within a layer's `types`, leaving other layers' choices untouched. */
export function onlySublayers(previous: SublayerVisibility, types: Sublayer[], ids: string[]): SublayerVisibility {
  const keep = new Set(ids);
  return { ...previous, ...Object.fromEntries(types.map(type => [type.id, keep.has(type.id)])) };
}
/** Visibility with every type of the given layers shown again (their overrides cleared). */
export function resetSublayers(previous: SublayerVisibility, layers: LayerName[]): SublayerVisibility {
  return Object.fromEntries(Object.entries(previous).filter(([id]) => !layers.some(layer => id.startsWith(`${layer}|`))));
}
