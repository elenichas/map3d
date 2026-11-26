import { contains, isBuilding, type Feature } from './layers.ts';

export type LandUseCategory = { id: string; label: string; color: string; icon: string };
export type BuildingColorMode = 'default' | 'landUse';

/**
 * Clean, saturated data hues on white massing: sky-blue commercial (the hero hue),
 * amber residential, pink retail, violet industry, blue education, mint civic.
 */
export const landUseCategories = {
  residential: { id: 'residential', label: 'Residential', color: '#f3b445', icon: 'House' },
  commercial: { id: 'commercial', label: 'Commercial & office', color: '#4fbdf0', icon: 'Briefcase' },
  retail: { id: 'retail', label: 'Retail', color: '#ef6fa6', icon: 'ShoppingBag' },
  industrial: { id: 'industrial', label: 'Industrial', color: '#9584f0', icon: 'Factory' },
  education: { id: 'education', label: 'Education', color: '#3f84ec', icon: 'GraduationCap' },
  civic: { id: 'civic', label: 'Civic & institutional', color: '#22c98a', icon: 'Landmark' },
  religious: { id: 'religious', label: 'Religious', color: '#c48aef', icon: 'Church' },
  transport: { id: 'transport', label: 'Transport & parking', color: '#9ea4ae', icon: 'TrainFront' },
  construction: { id: 'construction', label: 'Construction & vacant', color: '#e2c08e', icon: 'Construction' },
  recreation: { id: 'recreation', label: 'Recreation', color: '#86dba9', icon: 'Trees' },
  agriculture: { id: 'agriculture', label: 'Agriculture', color: '#cbdc7e', icon: 'Wheat' },
  cemetery: { id: 'cemetery', label: 'Cemetery', color: '#a6c8b2', icon: 'Cross' },
  forest: { id: 'forest', label: 'Forest', color: '#4fb784', icon: 'TreePine' },
  military: { id: 'military', label: 'Military', color: '#d48b78', icon: 'Shield' },
  other: { id: 'other', label: 'Other land use', color: '#cfd2d9', icon: 'Shapes' },
} satisfies Record<string, LandUseCategory>;
type CategoryId = keyof typeof landUseCategories;

const landUses: Record<string, CategoryId> = {
  residential: 'residential', commercial: 'commercial', retail: 'retail', industrial: 'industrial',
  port: 'industrial', quarry: 'industrial', depot: 'transport', railway: 'transport', garages: 'transport',
  education: 'education', school: 'education', institutional: 'civic', civic: 'civic', government: 'civic', healthcare: 'civic',
  religious: 'religious', construction: 'construction', brownfield: 'construction', greenfield: 'construction',
  recreation_ground: 'recreation', allotments: 'recreation', flowerbed: 'recreation', plant_nursery: 'agriculture',
  farmland: 'agriculture', farmyard: 'agriculture', orchard: 'agriculture', vineyard: 'agriculture', greenhouse_horticulture: 'agriculture',
  cemetery: 'cemetery', forest: 'forest', military: 'military',
};
// A building's own type is more specific than the land-use area around it.
const buildingTypes: Record<string, CategoryId> = {
  residential: 'residential', apartments: 'residential', house: 'residential', detached: 'residential', semidetached_house: 'residential',
  terrace: 'residential', dormitory: 'residential', bungalow: 'residential', duplex: 'residential',
  commercial: 'commercial', office: 'commercial', hotel: 'commercial', bank: 'commercial',
  retail: 'retail', supermarket: 'retail', kiosk: 'retail', shop: 'retail',
  industrial: 'industrial', warehouse: 'industrial', factory: 'industrial', manufacture: 'industrial', storage_tank: 'industrial',
  school: 'education', university: 'education', college: 'education', kindergarten: 'education',
  civic: 'civic', public: 'civic', government: 'civic', hospital: 'civic', fire_station: 'civic', townhall: 'civic', courthouse: 'civic', library: 'civic',
  church: 'religious', cathedral: 'religious', chapel: 'religious', mosque: 'religious', synagogue: 'religious', temple: 'religious', religious: 'religious', shrine: 'religious',
  train_station: 'transport', transportation: 'transport', garage: 'transport', garages: 'transport', parking: 'transport', carport: 'transport',
  construction: 'construction', sports_centre: 'recreation', stadium: 'recreation', sports_hall: 'recreation', pavilion: 'recreation',
  farm: 'agriculture', barn: 'agriculture', greenhouse: 'agriculture', farm_auxiliary: 'agriculture', military: 'military', bunker: 'military',
};

export const landUseCategory = (value: string | undefined): LandUseCategory => value ? landUseCategories[landUses[value] || 'other'] : landUseCategories.other;
/** Category for a sublayer id such as `Land use|landuse:retail`, for the layer legend. */
export function landUseCategoryForSublayer(id: string) {
  const [layer, type = ''] = id.split('|');
  return layer === 'Land use' && type.startsWith('landuse:') ? landUseCategory(type.slice(8)) : null;
}
/** Buildings with no specific type, such as building=yes or an untyped part. */
export const unspecifiedBuilding: LandUseCategory = { id: 'unspecified', label: 'Unspecified type', color: '#e8eaee', icon: 'Blocks' };
/** Use category for a building sublayer id such as `Buildings|building:house`, so the layer list groups types the way "By use" colours them. */
export function buildingCategoryForSublayer(id: string): LandUseCategory {
  const [, type = ''] = id.split('|'), value = type.startsWith('building:part:') ? type.slice(14) : type.startsWith('building:') ? type.slice(9) : '';
  const category = buildingTypes[value];
  return category ? landUseCategories[category] : unspecifiedBuilding;
}
const buildingCategory = (tags: Record<string, string>) => {
  const id = buildingTypes[tags.building] || buildingTypes[tags['building:part']];
  return id ? landUseCategories[id] : null;
};

type Area = { feature: Feature; category: LandUseCategory; area: number; box: [number, number, number, number] };
const centre = (ring: Feature['geometry']) => ({ lat: ring.reduce((n, p) => n + p.lat, 0) / ring.length, lon: ring.reduce((n, p) => n + p.lon, 0) / ring.length });
const boxArea = (box: Area['box']) => (box[2] - box[0]) * (box[3] - box[1]);

/**
 * Use category per building key. A specific building type wins; otherwise the building's centre takes the
 * smallest land-use area containing it, so a church plot inside a residential district stays religious.
 * Buildings with neither are left out and keep their default colour.
 */
export function assignBuildingLandUse(features: Feature[]) {
  const areas: Area[] = [];
  for (const feature of features) {
    if (feature.layer !== 'Land use' || feature.kind !== 'area' || !feature.tags.landuse) continue;
    const lats = feature.geometry.map(p => p.lat), lons = feature.geometry.map(p => p.lon);
    const box: Area['box'] = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
    areas.push({ feature, category: landUseCategory(feature.tags.landuse), area: boxArea(box), box });
  }
  areas.sort((a, b) => a.area - b.area);
  const result = new Map<string, LandUseCategory>();
  for (const feature of features) {
    if (feature.layer !== 'Buildings' || !isBuilding(feature.tags)) continue;
    const own = buildingCategory(feature.tags);
    if (own) { result.set(feature.key, own); continue; }
    const point = centre(feature.geometry.length > 1 ? feature.geometry.slice(0, -1) : feature.geometry);
    const match = areas.find(({ feature: area, box }) => point.lon >= box[0] && point.lon <= box[2] && point.lat >= box[1] && point.lat <= box[3]
      && contains(point, area.geometry) && !(area.holes || []).some(hole => contains(point, hole)));
    if (match) result.set(feature.key, match.category);
  }
  return result;
}
