import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
// Import only the icons poiStyle and landUseStyle name, so the bundle keeps tree-shaking the rest of Lucide.
import { Apple, Armchair, Baby, Banknote, BedDouble, Beef, Beer, Bike, Binoculars, Book, BookOpen, Building2, BusFront, Camera, Car, Castle, Church, Clapperboard, Coffee, Croissant, Dog, Drama, Droplet, Droplets, Dumbbell, FerrisWheel, Flame, Flower2, Footprints, Fuel, Gem, Gift, Glasses, GraduationCap, Hammer, HandHeart, HeartPulse, Hospital, IceCreamCone, Info, Landmark, Laptop, Mail, Mailbox, MapPin, Martini, Music, Palette, Phone, Pill, PlugZap, Recycle, Sandwich, School, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles, SquareParking, Star, Stethoscope, Store, Tent, Toilet, TrainFront, TramFront, Trash2, Trees, Users, Utensils, UtensilsCrossed, Wine, Wrench, Blocks, Briefcase, CarFront, Construction, Cross, Factory, House, Luggage, Shapes, TreePine, Trophy, Wheat, type LucideIcon } from 'lucide-react';
import * as THREE from 'three';

const icons: Record<string, LucideIcon> = { Apple, Armchair, Baby, Banknote, BedDouble, Beef, Beer, Bike, Binoculars, Book, BookOpen, Building2, BusFront, Camera, Car, Castle, Church, Clapperboard, Coffee, Croissant, Dog, Drama, Droplet, Droplets, Dumbbell, FerrisWheel, Flame, Flower2, Footprints, Fuel, Gem, Gift, Glasses, GraduationCap, Hammer, HandHeart, HeartPulse, Hospital, IceCreamCone, Info, Landmark, Laptop, Mail, Mailbox, MapPin, Martini, Music, Palette, Phone, Pill, PlugZap, Recycle, Sandwich, School, Scissors, Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sparkles, SquareParking, Star, Stethoscope, Store, Tent, Toilet, TrainFront, TramFront, Trash2, Trees, Users, Utensils, UtensilsCrossed, Wine, Wrench, Blocks, Briefcase, CarFront, Construction, Cross, Factory, House, Luggage, Shapes, TreePine, Trophy, Wheat };
const SIZE = 96;
const markup = new Map<string, string>(), textures = new Map<string, THREE.CanvasTexture>();

export function PoiIcon({ name, size = 14, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const Icon = icons[name] || MapPin;
  return createElement(Icon, { size, color, strokeWidth: 2.25, 'aria-hidden': true });
}
/** Serialise a Lucide icon once. The app already ships react-dom, so no server renderer is needed. */
function iconMarkup(name: string) {
  let svg = markup.get(name);
  if (svg) return svg;
  const host = document.createElement('div'), root = createRoot(host);
  flushSync(() => root.render(createElement(PoiIcon, { name, size: 52, color: '#ffffff' })));
  svg = host.innerHTML; root.unmount();
  markup.set(name, svg);
  return svg;
}
/** A round badge: category colour, white ring and white icon. Drawn once per icon and colour, shared by every batch. */
export function badgeTexture(icon: string, color: string, onReady: () => void) {
  const key = `${icon}|${color}`;
  let texture = textures.get(key);
  if (texture) return texture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d')!, centre = SIZE / 2;
  context.beginPath(); context.arc(centre, centre, centre - 3, 0, Math.PI * 2);
  context.fillStyle = color; context.fill();
  context.lineWidth = 6; context.strokeStyle = '#ffffff'; context.stroke();
  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, texture);
  const image = new Image(), created = texture;
  image.onload = () => { context.drawImage(image, centre - 26, centre - 26, 52, 52); created.needsUpdate = true; onReady(); };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconMarkup(icon))}`;
  return texture;
}
