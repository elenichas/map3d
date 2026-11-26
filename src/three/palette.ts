import type { VectorLayer } from '../data/layers.ts';

// White "architectural model" massing on a neutral ground, so data colours
// (land use, selection, transit) are the only saturated marks in the scene.
export const palette: Record<VectorLayer, string> = {
  Buildings: '#eceef2', Roads: '#c2c6ce', 'Walking & cycling': '#d6d8de',
  Transit: '#5cb8ee', 'Trees & woodland': '#8fcea6', Water: '#c9e5f5',
  Waterways: '#9fd0ef', 'Green spaces': '#d5ecdc', 'Land use': '#e9eaee',
  'Points of interest': '#2f9be8', 'Recreation & parking': '#e1e7ee',
};
export const sceneColors = {
  roof: '#fafbfc', terrain: '#e7e9ec', trunk: '#b5a594',
  selectedPoint: '#2f9be8', selectionFill: '#2f9be8',
  haloOuter: '#2f9be8', haloCyan: '#8fd8f7', haloBlue: '#2f9be8', haloCore: '#ffffff',
  measurement: '#2f9be8', measurementShadow: '#1c1c1e',
};
