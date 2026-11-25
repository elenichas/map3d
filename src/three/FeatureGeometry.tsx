import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { buildingDimensions, type Feature, type GeoPoint } from '../data/layers';
import { terrainHeight, type Terrain } from '../data/terrain';
import { buildFeatureGeometries, featureColor, floorColor, floorSegments, outlineColor, outlineSegments } from './geometry';
import type { Projection } from './geometry';
import { isSurface, surfaceMaterial, surfaceOrder } from './surfaces';
import { sceneColors } from './palette';
import { poiStyle } from '../data/poiStyle';
import { badgeHeight, poiGeometry, poiMatrix } from './poiShapes';
import { PoiIcon } from './poiIcons';
export function FeatureGeometry({ feature, project, terrain, selected, onSelect, exportable = true, surfaceStackOrder, surfaceTint = '#ffffff', buildingColor, showFloors = true }: { showFloors?: boolean; surfaceTint?: string; buildingColor?: string; feature: Feature; project: Projection; terrain: Terrain | null; selected: boolean; onSelect: (f: Feature) => void; exportable?: boolean; surfaceStackOrder?: number }) {
  const building = feature.layer === 'Buildings';
  const surface = isSurface(feature);
  const renderOrder = selected ? 30 : surface ? surfaceStackOrder ?? surfaceOrder(feature.layer) : 10;
  const color = selected ? sceneColors.selectedPoint : buildingColor || featureColor(feature);
  const landUse = feature.layer === 'Land use' && feature.kind === 'area';
  const outline = useMemo(() => landUse ? new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(outlineSegments(feature, project, terrain), 3)) : null, [landUse, feature, project, terrain]);
  useEffect(() => () => outline?.dispose(), [outline]);
  const floors = useMemo(() => building && feature.kind === 'area' && showFloors ? new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(floorSegments(feature, project, terrain), 3)) : null, [building, showFloors, feature, project, terrain]);
  useEffect(() => () => floors?.dispose(), [floors]);
  const center = feature.geometry.reduce((p,v) => ({ lat: p.lat + v.lat / feature.geometry.length, lon: p.lon + v.lon / feature.geometry.length }), { lat: 0, lon: 0 });
  const anchor = project(center), ground = terrainHeight(terrain, center);
  const dimensions = buildingDimensions(feature.tags);
  const geometries = useMemo(() => buildFeatureGeometries(feature, project, terrain), [feature, project, terrain]);
  useEffect(() => () => geometries.forEach(g => g.dispose()), [geometries]);
  const line = useMemo(() => feature.kind === 'line' ? new THREE.Line(geometries[0], new THREE.LineBasicMaterial({ color })) : null, [feature.kind, geometries, color]);
  useEffect(() => () => { if (line) (line.material as THREE.Material).dispose(); }, [line]);
  if (feature.kind === 'point') {
    const tree = feature.tags.natural === 'tree';
    const emissive = { emissive: selected ? sceneColors.selectedPoint : '#000000', emissiveIntensity: selected ? .35 : 0 };
    if (tree) return <group position={[anchor.x, ground, -anchor.y]}><mesh position={[0,2,0]} userData={{ exportToGLB: exportable, mapFeature: feature }}><cylinderGeometry args={[.35,.5,4,6]}/><meshStandardMaterial color={sceneColors.trunk}/></mesh><mesh position={[0,6,0]} userData={{ exportToGLB: exportable, mapFeature: feature }}><icosahedronGeometry args={[3.5,0]}/><meshStandardMaterial color={color} {...emissive}/></mesh></group>;
    const style = poiStyle(feature), label = feature.tags.name || style.category.label;
    const name = feature.tags.name || feature.tags.amenity || feature.tags.shop || feature.tags.railway || feature.tags.public_transport || feature.layer;
    return <group>
      <mesh geometry={poiGeometry(style.form)} matrixAutoUpdate={false} matrix={selected ? poiMatrix(anchor.x, ground, -anchor.y, feature.tags, style.form).multiply(new THREE.Matrix4().makeScale(1.08, 1.04, 1.08)) : poiMatrix(anchor.x, ground, -anchor.y, feature.tags, style.form)} userData={{ exportToGLB: exportable, mapFeature: feature }}><meshStandardMaterial color={selected ? sceneColors.selectedPoint : style.category.color} roughness={.85} {...emissive}/></mesh>
      {(style.form === 'marker' || selected) && <group position={[anchor.x, ground + (style.form === 'marker' ? badgeHeight(feature.tags) : 4), -anchor.y]}><Html center zIndexRange={selected ? [12,8] : [4,0]}>
        {/* The selected badge matches the inspector card's badge: larger, ringed and pulsing in the category colour. */}
        <button className={`feature-marker${selected ? ' selected' : ''}`} style={{ background: style.category.color, ['--poi-color' as string]: style.category.color }} aria-label={`Inspect ${name}`} aria-pressed={selected} title={`${label} · ${style.category.label}`} onClick={e => { e.stopPropagation(); onSelect(feature); }}><PoiIcon name={style.icon} size={selected ? 20 : 14} color="#ffffff"/></button>
      </Html></group>}
    </group>;
  }
  if (line) return <primitive name={feature.key} object={line} renderOrder={20} userData={{ exportToGLB: exportable, mapFeature: feature }}/>;
  return <>{floors && floors.getAttribute('position').count > 0 && <lineSegments geometry={floors} renderOrder={20} userData={{ mapFeature: feature }}><lineBasicMaterial color={floorColor(buildingColor || featureColor(feature))} transparent opacity={.7}/></lineSegments>}{outline && <lineSegments geometry={outline} renderOrder={20} userData={{ mapFeature: feature }}><lineBasicMaterial color={new THREE.Color(outlineColor(featureColor(feature))).multiply(new THREE.Color(surfaceTint))} toneMapped={false}/></lineSegments>}<group rotation={[-Math.PI / 2,0,0]} position={[0, building ? ground + dimensions.base + .2 : 0, 0]}>
    <mesh name={feature.key} renderOrder={renderOrder} geometry={geometries[0]} userData={{ exportToGLB: exportable, mapFeature: feature }}>{landUse ? <meshBasicMaterial color={new THREE.Color(color).multiply(new THREE.Color(surfaceTint))} toneMapped={false} {...surfaceMaterial(selected)} side={THREE.DoubleSide}/> : <meshStandardMaterial color={color} roughness={.85} polygonOffset={selected || building} polygonOffsetFactor={selected ? -2 : 1} polygonOffsetUnits={selected ? -2 : 1} {...(surface ? surfaceMaterial(selected) : {})} side={THREE.DoubleSide}/>}</mesh>
    {geometries[1] && <mesh name={`${feature.key}/roof`} renderOrder={renderOrder} geometry={geometries[1]} position={[0,0,dimensions.bodyHeight]} userData={{ exportToGLB: exportable, mapFeature: feature }}><meshStandardMaterial color={selected ? sceneColors.selectedPoint : buildingColor ? `#${new THREE.Color(buildingColor).offsetHSL(0, 0, -.08).getHexString()}` : featureColor(feature,true)} roughness={.9} polygonOffset={selected} polygonOffsetFactor={-2} polygonOffsetUnits={-2} side={THREE.DoubleSide}/></mesh>}
  </group></>;
}
