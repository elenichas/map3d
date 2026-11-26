import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, LoaderCircle, Moon, Sun, X, type LucideIcon } from 'lucide-react';
import { localClock, windFrom, type Weather } from '../data/weather';

export function weatherIcon(weather: Weather): LucideIcon {
  switch (weather.kind) {
    case 'clear': return weather.isDay ? Sun : Moon;
    case 'partly': return weather.isDay ? CloudSun : CloudMoon;
    case 'fog': return CloudFog;
    case 'drizzle': return CloudDrizzle;
    case 'rain': return CloudRain;
    case 'snow': return CloudSnow;
    case 'storm': return CloudLightning;
    default: return Cloud;
  }
}

type Props = {
  weather?: Weather; loading: boolean; error?: string;
  live: boolean; onLive: (value: boolean) => void;
  effects: boolean; onEffects: (value: boolean) => void;
  autoLighting: boolean;
};

/** Current conditions at the site, with switches for live data and their effect on the 3D scene. */
export function WeatherChip({ weather, loading, error, live, onLive, effects, onEffects, autoLighting }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close); window.addEventListener('keydown', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', close); };
  }, [open]);
  const Icon = weather ? weatherIcon(weather) : Cloud;
  const summary = !live ? 'Weather off' : weather ? `${Math.round(weather.temperature)}° ${weather.label}` : loading ? 'Loading weather…' : 'Weather unavailable';
  return <div className={`weather-chip${weather && live ? ` weather-${weather.kind}${weather.isDay ? '' : ' weather-night'}` : ''}`} ref={root}>
    <button className="weather-button" aria-label={`Weather: ${summary}${weather && live ? `, ${localClock(weather)} local time` : ''}`} aria-expanded={open} aria-controls="weather-details" onClick={() => setOpen(value => !value)}>
      {live && loading && !weather ? <LoaderCircle className="spin" size={15}/> : <Icon size={16}/>}
      {live && weather ? <><strong>{Math.round(weather.temperature)}°</strong><span className="weather-label">{weather.label}</span><span className="weather-time">{localClock(weather)}</span></> : <span className="weather-label">{summary}</span>}
    </button>
    {open && <div id="weather-details" className="weather-details" role="dialog" aria-label="Weather details">
      <div className="weather-details-heading"><strong>Weather at the site</strong><button aria-label="Close weather details" onClick={() => setOpen(false)}><X size={14}/></button></div>
      {live && weather && <>
        <div className="weather-now"><Icon size={30}/><div><strong>{Math.round(weather.temperature)}°C</strong><span>{weather.label} · {weather.isDay ? 'Daytime' : 'Night'}</span></div></div>
        <dl className="weather-facts">
          <div><dt>Feels like</dt><dd>{Math.round(weather.apparent)}°C</dd></div>
          <div><dt>Local time</dt><dd>{localClock(weather)}</dd></div>
          <div><dt>Wind</dt><dd>{Math.round(weather.windSpeed)} km/h {windFrom(weather.windDirection)}</dd></div>
          <div><dt>Clouds</dt><dd>{Math.round(weather.cloudCover)}%</dd></div>
          <div><dt>Humidity</dt><dd>{Math.round(weather.humidity)}%</dd></div>
          <div><dt>Precipitation</dt><dd>{weather.precipitation.toFixed(1)} mm</dd></div>
        </dl>
      </>}
      {live && !weather && <p className="weather-note">{loading ? 'Loading current conditions…' : error || 'Live weather is unavailable right now.'}</p>}
      <div className="weather-switches">
        <label><input type="checkbox" checked={live} onChange={event => onLive(event.target.checked)}/>Live weather</label>
        <label><input type="checkbox" checked={effects} disabled={!live} onChange={event => onEffects(event.target.checked)}/>Show in 3D</label>
      </div>
      <p className="weather-note">{autoLighting ? 'Scene light is on Auto, so the viewer switches to night when it is night at the site.' : 'Set Scene light to Auto to follow day and night at the site.'}</p>
      <p className="weather-credit">Weather data by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a> (CC BY 4.0). Only the approximate site location is sent.</p>
    </div>}
  </div>;
}
