import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Weather } from '../data/weather';

const falling = (weather: Weather) => weather.kind === 'rain' || weather.kind === 'drizzle' || weather.kind === 'storm' || weather.kind === 'snow';

/** How much the weather greys and dims the scene, 0–1. */
export function overcast(weather: Weather | null | undefined) {
  if (!weather) return 0;
  const clouds = weather.cloudCover / 100 * (weather.kind === 'clear' ? .3 : weather.kind === 'partly' ? .6 : 1);
  return Math.min(1, clouds * .75 + (falling(weather) ? .25 : 0) + (weather.kind === 'fog' ? .35 : 0));
}
/** Scene colours and fog under the current weather. */
export function weatherLighting(weather: Weather | null | undefined, background: string, night: boolean, distance: number, fog: [number, number]) {
  const amount = overcast(weather);
  const tinted = `#${new THREE.Color(background).lerp(new THREE.Color(night ? '#07090c' : '#c3c9d1'), amount * .7).getHexString()}`;
  const [near, far] = !weather ? fog : weather.kind === 'fog' ? [distance * .35, distance * 1.8] : falling(weather) ? [fog[0] * .7, fog[1] * (.75 - weather.intensity * .2)] : fog;
  return { background: tinted, key: 1 - amount * .55, ambient: 1 - amount * .12, fog: [near, far] as [number, number] };
}

/**
 * Falling rain or drifting snow, and lightning in storms. Drops fill a box in front of the camera,
 * sized to the viewing distance, so they read at the same density at any zoom. Animates only while falling.
 */
export function WeatherEffects({ weather }: { weather: Weather; distance?: number }) {
  const invalidate = useThree(state => state.invalidate), camera = useThree(state => state.camera);
  const snow = weather.kind === 'snow', active = falling(weather), night = !weather.isDay;
  const reduced = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const count = active ? Math.round((snow ? 3500 : weather.kind === 'drizzle' ? 3000 : 4500) * (.45 + weather.intensity * .55)) : 0;
  // Wind blows from `windDirection`; drops drift the other way. Scene x is east and −z is north.
  const toward = (weather.windDirection + 180) * Math.PI / 180, drift = Math.min(.8, weather.windSpeed / 70);
  const { object, seeds } = useMemo(() => {
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) seeds.set([Math.random(), Math.random(), Math.random(), .75 + Math.random() * .5], i * 4);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * (snow ? 3 : 6)), 3));
    const object = snow
      ? new THREE.Points(geometry, new THREE.PointsMaterial({ color: night ? '#ffffff' : '#f4f7fb', size: 3, sizeAttenuation: false, transparent: true, opacity: .95, depthWrite: false, fog: false }))
      : new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: night ? '#b4c8de' : '#4f6680', transparent: true, opacity: weather.kind === 'drizzle' ? .45 : .62, depthWrite: false, fog: false }));
    object.name = 'weather-precipitation'; object.frustumCulled = false; object.renderOrder = 30;
    return { object, seeds };
  }, [count, snow, night, weather.kind]);
  useEffect(() => () => { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }, [object]);
  const time = useRef(0), flash = useRef<THREE.AmbientLight>(null), nextFlash = useRef(3);
  const centre = useMemo(() => new THREE.Vector3(), []), forward = useMemo(() => new THREE.Vector3(), []);
  const place = (elapsed: number) => {
    // The box sits between the camera and what it looks at.
    const range = Math.max(30, Math.min(3000, camera.position.length() * .9));
    camera.getWorldDirection(forward);
    centre.copy(camera.position).addScaledVector(forward, range * .6);
    const size = range, height = range * .9, speed = snow ? height / 9 : height / (weather.kind === 'drizzle' ? 1.6 : 1.1);
    const length = snow ? 0 : range * (weather.kind === 'drizzle' ? .018 : .03), dx = Math.sin(toward) * drift, dz = -Math.cos(toward) * drift;
    const positions = object.geometry.getAttribute('position') as THREE.BufferAttribute, array = positions.array as Float32Array;
    for (let i = 0; i < count; i++) {
      const k = i * 4, fall = ((seeds[k + 1] - elapsed * speed * seeds[k + 3] / height) % 1 + 1) % 1;
      const y = centre.y + (fall - .5) * height, carried = (1 - fall) * height * .5;
      const sway = snow ? Math.sin(elapsed * .9 + i) * size * .004 : 0;
      const x = centre.x + (seeds[k] - .5) * size + dx * carried + sway, z = centre.z + (seeds[k + 2] - .5) * size + dz * carried;
      if (snow) array.set([x, y, z], i * 3);
      else array.set([x, y, z, x - dx * length, y + length, z - dz * length], i * 6);
    }
    positions.needsUpdate = true;
  };
  useEffect(() => { place(time.current); invalidate(); });
  useFrame((_, delta) => {
    if (!active) return;
    if (!reduced) time.current += Math.min(delta, .1);
    place(time.current);
    if (weather.kind === 'storm' && flash.current && !reduced) {
      // A brief double flash every few seconds.
      const since = time.current - nextFlash.current;
      flash.current.intensity = since > 0 && since < .08 || since > .16 && since < .22 ? 2.5 : 0;
      if (since > .3) nextFlash.current = time.current + 4 + Math.random() * 6;
    }
    if (!reduced) invalidate();
  });
  return <>{count > 0 && <primitive object={object}/>}{weather.kind === 'storm' && <ambientLight ref={flash} intensity={0} color="#dfe8ff"/>}</>;
}
