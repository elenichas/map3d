import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { recolorBuildings, type BuildingColors } from './buildingColors';
export type { BuildingColors } from './buildingColors';
import { BADGE_PIXELS, poiGeometry } from './poiShapes';
import { badgeTexture } from './poiIcons';
import type { PoiForm } from '../data/poiStyle';
import { vectorLayers, type Feature, type LayerName, type VectorLayer } from '../data/layers';
import type { Terrain } from '../data/terrain';
import { projection, type Batch, type Origin } from './batches';
import { FeatureGeometry } from './FeatureGeometry';
import { surfaceMaterial, surfaceOrder } from './surfaces';
import { isFeatureVisible, type SublayerVisibility } from '../data/sublayers';
const allSublayers:SublayerVisibility={};
type Prepared = { batches: Batch[]; features: Feature[]; origin: Origin; terrain: Terrain | null };
export type BatchMetadata = { batch: Batch; features: Feature[] };
function setBounds(object: THREE.BufferGeometry | THREE.InstancedMesh, bounds: number[]) {
  object.boundingBox = new THREE.Box3(new THREE.Vector3(...bounds.slice(0,3)), new THREE.Vector3(...bounds.slice(3,6)));
  object.boundingSphere = object.boundingBox.getBoundingSphere(new THREE.Sphere());
}
function Chunk({ batch, features, order, surfaceTint, buildingColors }: BatchMetadata & { order: number; surfaceTint: string; buildingColors: BuildingColors }) {
  const invalidate = useThree(state => state.invalidate), pixelRatio = useThree(state => state.viewport.dpr);
  const object = useMemo(() => {
    let object: THREE.Mesh | THREE.LineSegments | THREE.InstancedMesh | THREE.Points;
    if (batch.kind === 'badges') {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions!, 3));
      setBounds(geometry, batch.bounds);
      const material = new THREE.PointsMaterial({ size: BADGE_PIXELS * pixelRatio, sizeAttenuation: false, map: badgeTexture(batch.icon!, batch.color!, invalidate), transparent: true, alphaTest: .4, depthWrite: false, depthTest: false });
      // Like map labels, badges stay readable in front of buildings instead of being cut by facades.
      object = new THREE.Points(geometry, material);
    } else if (batch.kind === 'instances') {
      const tree = batch.form === 'trunk' || batch.form === 'crown';
      const shape = batch.form === 'trunk' ? new THREE.CylinderGeometry(.35,.5,4,6) : batch.form === 'crown' ? new THREE.IcosahedronGeometry(3.5,0) : poiGeometry(batch.form as PoiForm);
      const material = new THREE.MeshStandardMaterial({ color: batch.color || '#ffffff', roughness: .85 });
      const mesh = new THREE.InstancedMesh(shape, material, batch.indices!.length);
      mesh.instanceMatrix = new THREE.InstancedBufferAttribute(batch.matrices!, 16);
      if (batch.colors) {
        const colors = new Float32Array(batch.colors.length);
        // Instance colours multiply the material colour, which stays white; convert sRGB bytes to linear.
        for (let i = 0; i < colors.length; i += 3) { const c = new THREE.Color().setRGB(batch.colors[i] / 255, batch.colors[i+1] / 255, batch.colors[i+2] / 255, THREE.SRGBColorSpace); colors.set([c.r, c.g, c.b], i); }
        mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
      }
      mesh.userData.sharedGeometry = !tree;
      setBounds(mesh, batch.bounds); object = mesh;
    } else {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(batch.positions!, 3));
      // Buildings get their own copy so a colour mode can be applied and undone without a rebuild.
      geometry.setAttribute('color', new THREE.BufferAttribute(batch.layer === 'Buildings' ? batch.colors!.slice() : batch.colors!, 3, true));
      if (batch.normals) geometry.setAttribute('normal', new THREE.BufferAttribute(batch.normals, 3));
      setBounds(geometry, batch.bounds);
      const landUse = batch.layer === 'Land use';
      // Land use is unlit and skips tone mapping, so its zoning colours show as chosen instead of washing out.
      const surface = landUse ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide, ...surfaceMaterial() }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, side: THREE.DoubleSide, ...(batch.layer !== 'Buildings' ? surfaceMaterial() : { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) });
      // Building faces are pushed back slightly in depth so storey lines on them stay crisp.
      object = batch.kind === 'line' ? new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, toneMapped: !landUse, ...(batch.form === 'floors' ? { transparent: true, opacity: .7 } : {}) })) : new THREE.Mesh(geometry, surface);
    }
    object.name = batch.key; object.userData.mapBatch = { batch, features } satisfies BatchMetadata;
    return object;
  }, [batch, features, invalidate, pixelRatio]);
  useEffect(() => () => {
    // Badge textures and POI shapes are shared caches; only per-chunk resources are released.
    if (!object.userData.sharedGeometry) object.geometry.dispose();
    (object.material as THREE.Material).dispose(); if (object instanceof THREE.InstancedMesh) object.dispose();
  }, [object]);
  useEffect(() => {
    if (batch.layer !== 'Land use') return;
    // Unlit colours would glow at night; the tint dims them with the scene.
    (object.material as THREE.MeshBasicMaterial).color.set(surfaceTint); invalidate();
  }, [object, batch.layer, surfaceTint, invalidate]);
  useEffect(() => {
    if (batch.layer !== 'Buildings' || batch.kind === 'instances' || batch.kind === 'badges') return;
    recolorBuildings(batch, features, (object as THREE.Mesh | THREE.LineSegments).geometry.getAttribute('color') as THREE.BufferAttribute, buildingColors); invalidate();
  }, [object, batch, features, buildingColors, invalidate]);
  return <primitive object={object} renderOrder={batch.kind === 'badges' ? 40 : order}/>;
}
export function BatchedFeatures({ features, origin, terrain, layers, selected, onSelect, onPreparing, onError, sublayers=allSublayers, surfaceTint='#ffffff', buildingColors=null, showFloors=true }: { showFloors?: boolean; surfaceTint?: string; buildingColors?: BuildingColors; features: Feature[]; origin: Origin; terrain: Terrain | null; layers: Record<LayerName, boolean>; selected: Feature | null; onSelect: (feature: Feature) => void; onPreparing?: (count: number) => void; onError: (message: string) => void; sublayers?:SublayerVisibility }) {
  const [prepared, setPrepared] = useState<Partial<Record<VectorLayer, Prepared>>>({});
  const [pending, setPending] = useState(() => new Set(features.filter(feature => layers[feature.layer]).map(feature => feature.layer)).size);
  const worker = useRef<Worker | null>(null), serial = useRef(0);
  const inputs = useRef(new Map<VectorLayer, Feature[]>());
  const jobs = useRef(new Map<VectorLayer, { id: number; features: Feature[] }>());
  const errorCallback = useRef(onError), progressCallback = useRef(onPreparing);
  errorCallback.current = onError; progressCallback.current = onPreparing;
  useEffect(() => {
    inputs.current.clear(); jobs.current.clear();
    const instance = new Worker(new URL('./scene.worker.ts', import.meta.url), { type: 'module' });
    worker.current = instance;
    instance.onmessage = ({ data }: MessageEvent<{ id: number; layer: VectorLayer; batches: Batch[]; error?: string }>) => {
      if (worker.current !== instance) return;
      const job = jobs.current.get(data.layer);
      if (!job || job.id !== data.id) return;
      jobs.current.delete(data.layer); setPending(jobs.current.size);
      if (data.error) errorCallback.current(`Could not prepare ${data.layer}: ${data.error}`);
      else setPrepared(previous => ({ ...previous, [data.layer]: { batches: data.batches, features: job.features, origin, terrain } }));
    };
    instance.onerror = () => { if (worker.current !== instance) return; jobs.current.clear(); setPending(0); errorCallback.current('The geometry worker could not start. Reload the viewer to retry.'); };
    return () => { instance.terminate(); worker.current = null; };
  }, [origin, terrain]);
  useEffect(() => {
    if (!worker.current) return;
    const grouped = new Map<VectorLayer, Feature[]>();
    for (const feature of features) { let group = grouped.get(feature.layer); if (!group) { group = []; grouped.set(feature.layer, group); } group.push(feature); }
    for (const layer of vectorLayers) {
      if (!layers[layer]) continue;
      const next = grouped.get(layer) || [], previous = inputs.current.get(layer);
      if (previous && previous.length === next.length && previous.every((feature, index) => feature === next[index])) continue;
      inputs.current.set(layer, next);
      if (!next.length) { jobs.current.delete(layer); setPrepared(value => ({ ...value, [layer]: { batches: [], features: [], origin, terrain } })); continue; }
      const id = ++serial.current;
      jobs.current.set(layer, { id, features: next });
      worker.current.postMessage({ id, layer, features: next, origin, terrain });
    }
    setPending(jobs.current.size);
  }, [features, origin, terrain, layers]);
  useEffect(() => { progressCallback.current?.(pending); return () => { progressCallback.current?.(0); }; }, [pending]);
  const project = useMemo(() => projection(origin), [origin]);
  const currentPrepared = useMemo(() => Object.fromEntries(Object.entries(prepared).filter(([,value]) => value.origin === origin && value.terrain === terrain)) as typeof prepared, [prepared, origin, terrain]);
  const selectedVisible = selected && isFeatureVisible(selected,layers,sublayers) ? selected : null;
  const visibleFeatureCount=useMemo(()=>Object.values(currentPrepared).reduce((count, layer) => count + layer!.features.reduce((sum,feature)=>sum+Number(isFeatureVisible(feature,layers,sublayers)),0),0),[currentPrepared,layers,sublayers]);
  return <group name="map-features" userData={{ preparing: pending, featureCount: visibleFeatureCount }}>
    {vectorLayers.filter(layer => layers[layer]).flatMap(layer => {
      const batches = [...(currentPrepared[layer]?.batches || [])].filter(batch=>sublayers[batch.sublayer]!==false && (showFloors || batch.form !== 'floors')).sort((a,b) => a.key.localeCompare(b.key));
      return batches.map((batch, index) => <Chunk key={batch.key} batch={batch} features={currentPrepared[layer]!.features} surfaceTint={surfaceTint} buildingColors={buildingColors} order={batch.kind === 'line' ? 20 : batch.kind === 'mesh' && layer !== 'Buildings' ? surfaceOrder(layer) + index / (batches.length + 1) : 10}/>);
    })}
    {selectedVisible?.kind === 'point' && <FeatureGeometry feature={selectedVisible} project={project} terrain={terrain} selected onSelect={onSelect} exportable={false}/>}

  </group>;
}
