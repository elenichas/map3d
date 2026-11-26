import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LoaderCircle, Pause, Play, Sun, X } from 'lucide-react';
import { compassPoint, daylight, formatSolarTime, solarDeclination, studyDates, sunlightColor, sunlightScale, sunlightStops, sunPosition, type SunlightResult } from '../data/sun';

export type SunState = { date: string; time: number; hours: boolean };
export const defaultSunState = (): SunState => ({ date: studyDates()[1].date.toISOString().slice(0, 10), time: 10, hours: false });

/** Sun direction in scene space: x east, y up, z south (the viewer draws north as −z). */
export function sunVector(azimuth: number, altitude: number) {
  const a = azimuth * Math.PI / 180, h = altitude * Math.PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(h), Math.sin(h), -Math.cos(a) * Math.cos(h));
}

/** Buildings and trees cast shadows; buildings and terrain receive them. */
function shadowRole(object: THREE.Object3D) {
  if (!(object instanceof THREE.Mesh)) return null;
  const feature = object.userData.mapFeature, batch = object.userData.mapBatch?.batch;
  if (object.name === 'scene-terrain') return { cast: false, receive: true };
  if (feature?.layer === 'Buildings' || (batch?.layer === 'Buildings' && batch.kind === 'mesh')) return { cast: true, receive: true };
  if (feature?.tags?.natural === 'tree' || batch?.form === 'trunk' || batch?.form === 'crown') return { cast: true, receive: false };
  return null;
}

/**
 * The sun as a shadow-casting light, placed from the site's latitude, date and solar time,
 * with a transparent ground plane that only shows the shadows falling on it.
 */
export function SunRig({ azimuth, altitude, distance, flatGround }: { azimuth: number; altitude: number; distance: number; flatGround: boolean }) {
  const { scene, invalidate } = useThree();
  const light = useMemo(() => {
    const light = new THREE.DirectionalLight('#fff8ec', 2.6);
    light.name = 'scene-sun';
    light.shadow.mapSize.set(4096, 4096);
    light.shadow.bias = -.0004; light.shadow.normalBias = .35;
    return light;
  }, []);
  const up = altitude > 0;
  useEffect(() => {
    light.position.copy(sunVector(azimuth, altitude).multiplyScalar(distance * 3));
    light.target.position.set(0, 0, 0);
    // Low sun is warmer and weaker; the sun below the horizon casts nothing.
    const strength = Math.min(1, Math.max(0, Math.sin(altitude * Math.PI / 180) * 2.4));
    light.intensity = up ? .9 + strength * 2 : 0;
    light.color.set(altitude < 12 ? '#ffd6a0' : '#fff8ec');
    light.castShadow = up;
    const camera = light.shadow.camera, extent = distance * 1.6;
    camera.left = -extent; camera.right = extent; camera.top = extent; camera.bottom = -extent;
    camera.near = 1; camera.far = distance * 8; camera.updateProjectionMatrix();
    invalidate();
  }, [light, azimuth, altitude, distance, up, invalidate]);
  useFrame(() => {
    // Map chunks stream in over time, so shadow flags are kept in step on every rendered frame.
    let changed = false;
    scene.traverse(object => {
      const role = shadowRole(object);
      if (role && (object.castShadow !== role.cast || object.receiveShadow !== role.receive)) { object.castShadow = role.cast; object.receiveShadow = role.receive; changed = true; }
    });
    // The viewer renders on demand; draw once more so newly flagged meshes show their shadows.
    if (changed) invalidate();
  });
  useEffect(() => () => { scene.traverse(object => { if (shadowRole(object)) { object.castShadow = false; object.receiveShadow = false; } }); invalidate(); }, [scene, invalidate]);
  return <>
    <primitive object={light}/><primitive object={light.target}/>
    {flatGround && up && <mesh name="sun-shadow-catcher" rotation={[-Math.PI / 2, 0, 0]} position={[0, .05, 0]} renderOrder={15} receiveShadow>
      <planeGeometry args={[distance * 8, distance * 8]}/>
      <shadowMaterial transparent opacity={.36} color="#1b2140" depthWrite={false}/>
    </mesh>}
  </>;
}

/** Draw a sunlight result as an image, one pixel per cell, north at the top. */
export function sunlightCanvas(result: SunlightResult) {
  const canvas = document.createElement('canvas');
  canvas.width = result.cols; canvas.height = result.rows;
  const context = canvas.getContext('2d')!, image = context.createImageData(result.cols, result.rows), scale = sunlightScale(result);
  result.hours.forEach((hours, index) => {
    if (Number.isNaN(hours)) return;
    image.data.set([...sunlightColor(hours / scale), 255], index * 4);
  });
  context.putImageData(image, 0, 0);
  return canvas;
}

/** Sunlight hours as a translucent map lying on the ground. */
export function SunlightOverlay({ result }: { result: SunlightResult }) {
  const invalidate = useThree(state => state.invalidate);
  const texture = useMemo(() => {
    const texture = new THREE.CanvasTexture(sunlightCanvas(result));
    texture.colorSpace = THREE.SRGBColorSpace; texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearFilter;
    return texture;
  }, [result]);
  useEffect(() => { invalidate(); return () => texture.dispose(); }, [texture, invalidate]);
  const width = result.cols * result.cell, height = result.rows * result.cell;
  return <mesh name="sunlight-hours" rotation={[-Math.PI / 2, 0, 0]} position={[result.minX + width / 2, .15, -(result.maxY - height / 2)]} renderOrder={16}>
    <planeGeometry args={[width, height]}/>
    <meshBasicMaterial map={texture} transparent opacity={.82} depthWrite={false} toneMapped={false}/>
  </mesh>;
}

/** Date, time and overlay controls for the sun study. */
export function SunPanel({ latitude, state, onChange, onClose, sunlight, busy }: { latitude: number; state: SunState; onChange: (next: SunState) => void; onClose: () => void; sunlight?: SunlightResult; busy: boolean }) {
  const [playing, setPlaying] = useState(false);
  const declination = useMemo(() => declinationFor(state.date), [state.date]);
  const day = daylight(latitude, declination);
  const range = day ? { min: Math.ceil(day.sunrise * 4) / 4, max: Math.floor(day.sunset * 4) / 4 } : { min: 0, max: 24 };
  const sun = sunPosition(latitude, declination, state.time);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const next = state.time + .1;
      if (next > range.max) { setPlaying(false); onChange({ ...state, time: range.max }); } else onChange({ ...state, time: Math.round(next * 100) / 100 });
    }, 60);
    return () => clearInterval(timer);
  }, [playing, state, range.max, onChange]);
  const play = () => { if (!playing && state.time >= range.max) onChange({ ...state, time: range.min }); setPlaying(!playing); };
  const presets = studyDates(Number(state.date.slice(0, 4)) || undefined);
  const scale = sunlight ? sunlightScale(sunlight) : day?.length ?? 12;
  return <div className="sun-panel" role="region" aria-label="Sun study">
    <div className="sun-heading"><Sun size={15}/><strong>Sun study</strong><small title="Local apparent solar time: 12:00 is when the sun is highest">solar time</small><button aria-label="Close sun study" title="Close sun study" onClick={onClose}><X size={15}/></button></div>
    <div className="sun-dates">
      <div className="segmented-control compact" role="group" aria-label="Study date presets">{presets.map(preset => {
        const value = preset.date.toISOString().slice(0, 10);
        return <button key={preset.id} aria-pressed={state.date === value} title={preset.detail} onClick={() => onChange({ ...state, date: value, time: clamp(state.time, latitude, value) })}>{preset.label}</button>;
      })}</div>
      <input type="date" aria-label="Study date" value={state.date} onChange={event => event.target.value && onChange({ ...state, date: event.target.value, time: clamp(state.time, latitude, event.target.value) })}/>
    </div>
    <div className="sun-time">
      <button className="sun-play" aria-label={playing ? 'Pause day animation' : 'Play the day'} title={playing ? 'Pause' : 'Animate from sunrise to sunset'} disabled={!day} onClick={play}>{playing ? <Pause size={14}/> : <Play size={14}/>}</button>
      <input type="range" aria-label="Time of day (solar time)" min={range.min} max={range.max} step={.25} value={Math.min(range.max, Math.max(range.min, state.time))} disabled={!day} onChange={event => { setPlaying(false); onChange({ ...state, time: Number(event.target.value) }); }}/>
      <output>{formatSolarTime(state.time)}</output>
    </div>
    <p className="sun-readout" role="status">{!day ? 'Polar night · the sun does not rise' : sun.altitude <= 0 ? 'Sun below the horizon' : <>Sun <strong>{Math.round(sun.altitude)}°</strong> high, from the <strong>{compassPoint(sun.azimuth)}</strong> ({Math.round(sun.azimuth)}°)</>}{day && <span> · Sunrise {formatSolarTime(day.sunrise)} · Sunset {formatSolarTime(day.sunset)}</span>}</p>
    <div className="sun-hours">
      <button className="floor-toggle" aria-pressed={state.hours} onClick={() => onChange({ ...state, hours: !state.hours })} title="Shade open ground by hours of direct sun on this date">Sunlight hours</button>
      {state.hours && (busy ? <span className="sun-busy"><LoaderCircle className="spin" size={13}/>Calculating sunlight…</span> : sunlight && <span className="sun-share"><strong>{Math.round(sunlight.stats.atLeast[4] * 100)}%</strong> of open ground gets 4 h+</span>)}
    </div>
    {state.hours && <div className="sun-legend" aria-label={`Colour scale from 0 to ${scale.toFixed(1)} hours of direct sun`}>
      <span className="sun-ramp" style={{ background: `linear-gradient(90deg, ${sunlightStops.join(', ')})` }}/>
      <span className="sun-ramp-labels"><span>0 h · shade</span><span>{scale.toFixed(1)} h · all day</span></span>
    </div>}
  </div>;
}
export const declinationFor = (date: string) => solarDeclination(new Date(`${date}T12:00:00Z`));
function clamp(time: number, latitude: number, date: string) {
  const day = daylight(latitude, declinationFor(date));
  return day ? Math.min(Math.floor(day.sunset * 4) / 4, Math.max(Math.ceil(day.sunrise * 4) / 4, time)) : time;
}
