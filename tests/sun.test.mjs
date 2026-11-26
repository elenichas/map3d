import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSunlight, daylight, solarDeclination, sunPosition, sunlightColor } from '../src/data/sun.ts';

const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

test('declination follows the seasons', () => {
  near(solarDeclination(new Date(Date.UTC(2026, 5, 21))), 23.44, .3, 'June solstice');
  near(solarDeclination(new Date(Date.UTC(2026, 11, 21))), -23.44, .3, 'December solstice');
  near(solarDeclination(new Date(Date.UTC(2026, 2, 20))), 0, .5, 'March equinox');
});

test('sun stands south at noon in the north, rises in the east and sets in the west', () => {
  const london = 51.5;
  const noon = sunPosition(london, 0, 12);
  near(noon.azimuth, 180, .01, 'noon azimuth'); near(noon.altitude, 38.5, .01, 'noon altitude');
  assert.ok(sunPosition(london, 0, 9).azimuth > 90 && sunPosition(london, 0, 9).azimuth < 180, 'morning sun in the south-east');
  assert.ok(sunPosition(london, 0, 15).azimuth > 180 && sunPosition(london, 0, 15).azimuth < 270, 'afternoon sun in the south-west');
  near(sunPosition(-33.9, 0, 12).azimuth, 0, .01, 'southern hemisphere noon sun is north');
  near(sunPosition(0, 0, 12).altitude, 90, .01, 'equator equinox noon is overhead');
});

test('day length, polar night and midnight sun', () => {
  near(daylight(51.5, 0).length, 12.1, .15, 'equinox day length');
  near(daylight(51.5, 23.44).length, 16.4, .3, 'London midsummer');
  assert.equal(daylight(80, -23.44), null);
  assert.equal(daylight(80, 23.44).length, 24);
});

test('a tall building shades the ground to its north, not to its south', () => {
  const boundary = [-50, -50, 50, -50, 50, 50, -50, 50];
  const building = { ring: [-10, -10, 10, -10, 10, 10, -10, 10], base: 0, top: 60, box: [-10, -10, 10, 10] };
  const result = computeSunlight({ buildings: [building], boundary, latitude: 51.5, declination: 0, cells: 20 });
  const at = (x, y) => result.hours[Math.floor((result.maxY - y) / result.cell) * result.cols + Math.floor((x - result.minX) / result.cell)];
  assert.ok(Number.isNaN(at(0, 0)), 'ground under the building is excluded');
  assert.ok(at(0, 20) < at(0, -20) - 3, `north side ${at(0, 20)} h vs south side ${at(0, -20)} h`);
  near(at(0, -45), result.day.length, .5, 'open ground to the south gets the whole day (sun within 0.5° of the horizon is ignored)');
  assert.ok(result.stats.atLeast[4] > .5 && result.stats.atLeast[4] < 1);
  near(result.stats.buckets.reduce((sum, b) => sum + b.share, 0), 1, 1e-9, 'buckets cover every cell');
  const empty = computeSunlight({ buildings: [], boundary, latitude: 51.5, declination: 0, cells: 10 });
  near(empty.stats.mean, empty.day.length, .5, 'no buildings means sun all day');
});

test('a raised part shades only where the sun ray passes under or through it', () => {
  const boundary = [-50, -50, 50, -50, 50, 50, -50, 50];
  // A bridge 40–42 m up: low sun rays from ground just north pass beneath it.
  const bridge = { ring: [-20, -2, 20, -2, 20, 2, -20, 2], base: 40, top: 42, box: [-20, -2, 20, 2] };
  const result = computeSunlight({ buildings: [bridge], boundary, latitude: 51.5, declination: 0, cells: 20 });
  assert.ok(result.stats.mean > result.day.length - 2, `mostly sunlit: ${result.stats.mean}`);
  assert.deepEqual(sunlightColor(0), [61, 58, 122]); assert.deepEqual(sunlightColor(1), [247, 169, 59]);
});
