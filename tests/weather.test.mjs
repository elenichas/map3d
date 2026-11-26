import test from 'node:test';
import assert from 'node:assert/strict';
import { describeWeather, parseWeather, weatherUrl, windFrom, localClock } from '../src/data/weather.ts';

test('WMO codes map to a visual kind, label and intensity', () => {
  assert.deepEqual(describeWeather(0), { kind: 'clear', label: 'Clear sky', intensity: 0 });
  assert.equal(describeWeather(3).kind, 'cloudy');
  assert.equal(describeWeather(45).kind, 'fog');
  assert.deepEqual(describeWeather(65), { kind: 'rain', label: 'Heavy rain', intensity: 1 });
  assert.equal(describeWeather(73).kind, 'snow');
  assert.equal(describeWeather(95).kind, 'storm');
  assert.equal(describeWeather(1234).label, 'Unknown conditions');
});

test('Open-Meteo current weather is parsed, including day or night at the site', () => {
  const weather = parseWeather({ timezone: 'America/New_York', current: { time: '2026-11-26T21:45', temperature_2m: 6.4, apparent_temperature: 3.1, relative_humidity_2m: 81, is_day: 0, precipitation: 1.2, weather_code: 63, cloud_cover: 100, wind_speed_10m: 18.5, wind_direction_10m: 225 } }, 42);
  assert.equal(weather.isDay, false); assert.equal(weather.kind, 'rain'); assert.equal(weather.label, 'Rain');
  assert.equal(weather.temperature, 6.4); assert.equal(weather.cloudCover, 100); assert.equal(weather.fetchedAt, 42);
  assert.equal(localClock(weather), '21:45'); assert.equal(windFrom(weather.windDirection), 'SW'); assert.equal(windFrom(-10), 'N');
  assert.throws(() => parseWeather({ current: {} }));
});

test('only rounded coordinates are sent, with local time zone resolved by the service', () => {
  const url = weatherUrl(40.78123456, -73.96654321);
  assert.match(url, /latitude=40\.78&longitude=-73\.97/);
  assert.match(url, /timezone=auto/); assert.match(url, /is_day/);
});
