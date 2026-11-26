/**
 * Current weather from Open-Meteo (https://open-meteo.com): free for non-commercial use,
 * no API key, CC BY 4.0 attribution. Only rounded site coordinates (about 1 km) are sent.
 */
export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm';
export type Weather = {
  temperature: number; apparent: number; humidity: number; isDay: boolean; precipitation: number;
  code: number; kind: WeatherKind; label: string; intensity: number; cloudCover: number;
  windSpeed: number; windDirection: number;
  /** Local wall-clock time at the site, as reported by the service (`YYYY-MM-DDTHH:mm`). */
  localTime: string; timezone: string; fetchedAt: number;
};

/** WMO weather interpretation codes, as used by Open-Meteo. Intensity is 0–1 for precipitation and storms. */
const codes: Record<number, [WeatherKind, string, number]> = {
  0: ['clear', 'Clear sky', 0], 1: ['clear', 'Mainly clear', 0], 2: ['partly', 'Partly cloudy', 0], 3: ['cloudy', 'Overcast', 0],
  45: ['fog', 'Fog', 0], 48: ['fog', 'Freezing fog', 0],
  51: ['drizzle', 'Light drizzle', .2], 53: ['drizzle', 'Drizzle', .3], 55: ['drizzle', 'Dense drizzle', .4],
  56: ['drizzle', 'Freezing drizzle', .3], 57: ['drizzle', 'Dense freezing drizzle', .4],
  61: ['rain', 'Light rain', .35], 63: ['rain', 'Rain', .6], 65: ['rain', 'Heavy rain', 1],
  66: ['rain', 'Freezing rain', .5], 67: ['rain', 'Heavy freezing rain', .9],
  71: ['snow', 'Light snow', .35], 73: ['snow', 'Snow', .6], 75: ['snow', 'Heavy snow', 1], 77: ['snow', 'Snow grains', .3],
  80: ['rain', 'Light showers', .4], 81: ['rain', 'Showers', .7], 82: ['rain', 'Violent showers', 1],
  85: ['snow', 'Snow showers', .5], 86: ['snow', 'Heavy snow showers', .9],
  95: ['storm', 'Thunderstorm', .8], 96: ['storm', 'Thunderstorm with hail', .9], 99: ['storm', 'Thunderstorm with heavy hail', 1],
};
export function describeWeather(code: number) {
  const [kind, label, intensity] = codes[code] || ['cloudy', 'Unknown conditions', 0];
  return { kind, label, intensity };
}

export const weatherUrl = (lat: number, lon: number) => `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}`
  + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m&timezone=auto';

type Response = { timezone?: string; current?: Record<string, number | string> };
export function parseWeather(json: Response, now = Date.now()): Weather {
  const current = json.current;
  if (!current || typeof current.weather_code !== 'number' || typeof current.temperature_2m !== 'number') throw new Error('Unexpected weather response');
  const value = (key: string) => typeof current[key] === 'number' ? current[key] as number : 0;
  return {
    temperature: value('temperature_2m'), apparent: value('apparent_temperature'), humidity: value('relative_humidity_2m'),
    isDay: value('is_day') === 1, precipitation: value('precipitation'), code: value('weather_code'), ...describeWeather(value('weather_code')),
    cloudCover: value('cloud_cover'), windSpeed: value('wind_speed_10m'), windDirection: value('wind_direction_10m'),
    localTime: String(current.time || ''), timezone: json.timezone || '', fetchedAt: now,
  };
}

const cache = new Map<string, Weather>(), maxAge = 10 * 60 * 1000;
export async function fetchWeather(lat: number, lon: number, signal?: AbortSignal) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`, saved = cache.get(key);
  if (saved && Date.now() - saved.fetchedAt < maxAge) return saved;
  const response = await fetch(weatherUrl(lat, lon), { signal });
  if (!response.ok) throw new Error(`Weather service returned ${response.status}`);
  const weather = parseWeather(await response.json());
  cache.set(key, weather);
  return weather;
}

const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const windFrom = (degrees: number) => directions[Math.round(((degrees % 360) + 360) % 360 / 45) % 8];
export const localClock = (weather: Weather) => weather.localTime.slice(11, 16);
