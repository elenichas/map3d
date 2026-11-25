import type { Feature } from './layers.ts';

/** 3D form drawn at a point. Street furniture gets a small object; venues get a marker post with an icon badge. */
export type PoiForm = 'bench' | 'bin' | 'recycling' | 'tap' | 'postbox' | 'vending' | 'toilets' | 'shelter' | 'bbq' | 'fountain' | 'bikeRack' | 'marker';
export type PoiCategory = { id: string; label: string; color: string; icon: string };
export type PoiStyle = { category: PoiCategory; icon: string; form: PoiForm };

/** Mid-tone hues that stay distinct from each other and readable on both scene backgrounds. Each category has its own icon for group rows. */
export const poiCategories = {
  food: { id: 'food', label: 'Food & cafés', color: '#ec6f2d', icon: 'Utensils' },
  drink: { id: 'drink', label: 'Bars & nightlife', color: '#c23b7e', icon: 'Martini' },
  shop: { id: 'shop', label: 'Shops', color: '#d39a12', icon: 'ShoppingBag' },
  money: { id: 'money', label: 'Banks & money', color: '#1d9a68', icon: 'Banknote' },
  health: { id: 'health', label: 'Health', color: '#dc3d3d', icon: 'HeartPulse' },
  education: { id: 'education', label: 'Education', color: '#3474d4', icon: 'GraduationCap' },
  culture: { id: 'culture', label: 'Arts & culture', color: '#8656ec', icon: 'Palette' },
  tourism: { id: 'tourism', label: 'Tourism & stays', color: '#93673f', icon: 'Luggage' },
  leisure: { id: 'leisure', label: 'Sport & play', color: '#6f9f1f', icon: 'Trophy' },
  civic: { id: 'civic', label: 'Community & services', color: '#5a6a8e', icon: 'Users' },
  transport: { id: 'transport', label: 'Cars & transport', color: '#0c9bb5', icon: 'CarFront' },
  furniture: { id: 'furniture', label: 'Street furniture', color: '#5f8a78', icon: 'Armchair' },
  other: { id: 'other', label: 'Other places', color: '#8a8f9c', icon: 'MapPin' },
} satisfies Record<string, PoiCategory>;
type CategoryId = keyof typeof poiCategories;
type Rule = [CategoryId, string, PoiForm?];

// Keyed by `tag:value`. Unlisted values fall back to the tag's default below.
const rules: Record<string, Rule> = {
  'amenity:restaurant': ['food', 'UtensilsCrossed'], 'amenity:cafe': ['food', 'Coffee'], 'amenity:fast_food': ['food', 'Sandwich'],
  'amenity:food_court': ['food', 'Utensils'], 'amenity:ice_cream': ['food', 'IceCreamCone'],
  'amenity:bar': ['drink', 'Martini'], 'amenity:pub': ['drink', 'Beer'], 'amenity:biergarten': ['drink', 'Beer'],
  'amenity:nightclub': ['drink', 'Music'],
  'amenity:bank': ['money', 'Landmark'], 'amenity:atm': ['money', 'Banknote'], 'amenity:bureau_de_change': ['money', 'Banknote'],
  'amenity:money_transfer': ['money', 'Banknote'],
  'amenity:pharmacy': ['health', 'Pill'], 'amenity:hospital': ['health', 'Hospital'], 'amenity:clinic': ['health', 'Stethoscope'],
  'amenity:doctors': ['health', 'Stethoscope'], 'amenity:dentist': ['health', 'Stethoscope'], 'amenity:veterinary': ['health', 'HeartPulse'],
  'amenity:school': ['education', 'School'], 'amenity:university': ['education', 'GraduationCap'], 'amenity:college': ['education', 'GraduationCap'],
  'amenity:kindergarten': ['education', 'Baby'], 'amenity:childcare': ['education', 'Baby'], 'amenity:library': ['education', 'BookOpen'],
  'amenity:cinema': ['culture', 'Clapperboard'], 'amenity:theatre': ['culture', 'Drama'], 'amenity:arts_centre': ['culture', 'Palette'],
  'amenity:place_of_worship': ['civic', 'Church'], 'amenity:townhall': ['civic', 'Building2'], 'amenity:police': ['civic', 'Shield'],
  'amenity:fire_station': ['civic', 'Flame'], 'amenity:post_office': ['civic', 'Mail'], 'amenity:community_centre': ['civic', 'Users'],
  'amenity:social_facility': ['civic', 'HandHeart'], 'amenity:courthouse': ['civic', 'Landmark'],
  'amenity:fuel': ['transport', 'Fuel'], 'amenity:charging_station': ['transport', 'PlugZap'], 'amenity:bicycle_rental': ['transport', 'Bike'],
  'amenity:car_sharing': ['transport', 'Car'], 'amenity:car_rental': ['transport', 'Car'], 'amenity:taxi': ['transport', 'Car'],
  'amenity:parking': ['transport', 'SquareParking'], 'amenity:bicycle_parking': ['transport', 'Bike', 'bikeRack'],
  'amenity:bench': ['furniture', 'Armchair', 'bench'], 'amenity:waste_basket': ['furniture', 'Trash2', 'bin'],
  'amenity:waste_disposal': ['furniture', 'Trash2', 'bin'], 'amenity:recycling': ['furniture', 'Recycle', 'recycling'],
  'amenity:drinking_water': ['furniture', 'Droplet', 'tap'], 'amenity:water_point': ['furniture', 'Droplet', 'tap'],
  'amenity:post_box': ['furniture', 'Mailbox', 'postbox'], 'amenity:vending_machine': ['furniture', 'Store', 'vending'],
  'amenity:toilets': ['furniture', 'Toilet', 'toilets'], 'amenity:shelter': ['furniture', 'Tent', 'shelter'],
  'amenity:bbq': ['furniture', 'Flame', 'bbq'], 'amenity:fountain': ['furniture', 'Droplets', 'fountain'],
  'amenity:telephone': ['furniture', 'Phone', 'vending'],
  'shop:supermarket': ['shop', 'ShoppingCart'], 'shop:convenience': ['shop', 'ShoppingCart'], 'shop:bakery': ['food', 'Croissant'],
  'shop:clothes': ['shop', 'Shirt'], 'shop:hairdresser': ['shop', 'Scissors'], 'shop:beauty': ['shop', 'Sparkles'],
  'shop:books': ['shop', 'Book'], 'shop:florist': ['shop', 'Flower2'], 'shop:optician': ['shop', 'Glasses'],
  'shop:mobile_phone': ['shop', 'Smartphone'], 'shop:electronics': ['shop', 'Laptop'], 'shop:hardware': ['shop', 'Hammer'],
  'shop:doityourself': ['shop', 'Hammer'], 'shop:butcher': ['food', 'Beef'], 'shop:greengrocer': ['food', 'Apple'],
  'shop:alcohol': ['drink', 'Wine'], 'shop:wine': ['drink', 'Wine'], 'shop:jewelry': ['shop', 'Gem'], 'shop:gift': ['shop', 'Gift'],
  'shop:pet': ['shop', 'Dog'], 'shop:shoes': ['shop', 'Footprints'], 'shop:car_repair': ['transport', 'Wrench'], 'shop:bicycle': ['transport', 'Bike'],
  'shop:car': ['transport', 'CarFront'], 'shop:car_parts': ['transport', 'Wrench'], 'shop:tyres': ['transport', 'Wrench'], 'shop:motorcycle': ['transport', 'Bike'],
  'amenity:car_wash': ['transport', 'Droplets'], 'amenity:motorcycle_parking': ['transport', 'SquareParking'], 'shop:art': ['culture', 'Palette'],
  'amenity:studio': ['culture', 'Music'], 'amenity:music_school': ['education', 'Music'], 'amenity:payment_terminal': ['money', 'Banknote'],
  'tourism:hotel': ['tourism', 'BedDouble'], 'tourism:hostel': ['tourism', 'BedDouble'], 'tourism:guest_house': ['tourism', 'BedDouble'],
  'tourism:motel': ['tourism', 'BedDouble'], 'tourism:apartment': ['tourism', 'BedDouble'], 'tourism:museum': ['culture', 'Landmark'],
  'tourism:gallery': ['culture', 'Palette'], 'tourism:artwork': ['culture', 'Palette'], 'tourism:attraction': ['tourism', 'Star'],
  'tourism:viewpoint': ['tourism', 'Binoculars'], 'tourism:information': ['tourism', 'Info'], 'tourism:picnic_site': ['furniture', 'Trees', 'bench'],
  'leisure:playground': ['leisure', 'FerrisWheel'], 'leisure:fitness_centre': ['leisure', 'Dumbbell'], 'leisure:sports_centre': ['leisure', 'Dumbbell'],
  'leisure:picnic_table': ['furniture', 'Trees', 'bench'],
  'highway:bus_stop': ['transport', 'BusFront'], 'railway:station': ['transport', 'TrainFront'], 'railway:halt': ['transport', 'TrainFront'],
  'railway:tram_stop': ['transport', 'TramFront'], 'railway:subway_entrance': ['transport', 'TrainFront'],
  'public_transport:platform': ['transport', 'BusFront'], 'public_transport:stop_position': ['transport', 'BusFront'],
  'public_transport:station': ['transport', 'TrainFront'],
};
const tagDefaults: Record<string, Rule> = {
  shop: ['shop', 'ShoppingBag'], tourism: ['tourism', 'Camera'], historic: ['culture', 'Castle'],
  amenity: ['other', 'MapPin'], leisure: ['leisure', 'Trees'], railway: ['transport', 'TrainFront'],
  public_transport: ['transport', 'BusFront'], highway: ['transport', 'MapPin'],
};
const tagOrder = ['amenity', 'shop', 'tourism', 'historic', 'leisure', 'railway', 'public_transport', 'highway'];
const cache = new WeakMap<Feature, PoiStyle>();

export function poiStyleForTags(tags: Record<string, string>): PoiStyle {
  for (const key of tagOrder) {
    const value = tags[key];
    if (!value) continue;
    const rule = rules[`${key}:${value}`] || tagDefaults[key];
    return { category: poiCategories[rule[0]], icon: rule[1], form: rule[2] || 'marker' };
  }
  return { category: poiCategories.other, icon: 'MapPin', form: 'marker' };
}
export function poiStyle(feature: Feature) {
  let style = cache.get(feature);
  if (!style) { style = poiStyleForTags(feature.tags); cache.set(feature, style); }
  return style;
}
/** Style for a sublayer id such as `Points of interest|amenity:bench`, for the layer legend. */
export function poiStyleForSublayer(id: string) {
  const [, type = ''] = id.split('|'), split = type.indexOf(':');
  return split > 0 ? poiStyleForTags({ [type.slice(0, split)]: type.slice(split + 1) }) : null;
}
/** OSM `direction` is a compass bearing in degrees; cardinal letters are also common. */
export function poiHeading(tags: Record<string, string>) {
  const raw = tags.direction?.trim().toUpperCase();
  if (!raw) return 0;
  const compass = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'].indexOf(raw);
  const degrees = compass >= 0 ? compass * 22.5 : Number(raw);
  return Number.isFinite(degrees) ? degrees * Math.PI / 180 : 0;
}
