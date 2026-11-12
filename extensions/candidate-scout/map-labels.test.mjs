import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentLabelPosition, insideFeature } from './map-labels.mjs';

const rectangle = (name, west, south, east, north, label) => ({
  type: 'Feature',
  properties: { name, label },
  geometry: { type: 'Polygon', coordinates: [[
    [west, south], [east, south], [east, north], [west, north], [west, south],
  ]] },
});

test('Keeps full department labels on-screen even if its geographical label point is outside viewport', () => {
  const oise = rectangle('Oise', 1, 49, 3, 50, [49.9, 1.1]);
  const viewport = { south: 49.2, north: 49.4, west: 2.1, east: 2.4 };
  const label = departmentLabelPosition(oise, viewport);
  assert.ok(label);
  assert.ok(label[0] >= viewport.south && label[0] <= viewport.north);
  assert.ok(label[1] >= viewport.west && label[1] <= viewport.east);
  assert.ok(insideFeature(oise, ...label));
});

test('Preserves valid labels when they already fall inside the viewport and department', () => {
  const dept = rectangle('Val-d’Oise', 1, 48, 3, 50, [49.1, 2.1]);
  assert.deepEqual(departmentLabelPosition(dept, { south: 49, north: 49.3, west: 2, east: 2.3 }), [49.1, 2.1]);
});

test('Does not invent a label for an entirely off-screen department', () => {
  const dept = rectangle('Finistère', -5, 48, -3, 49, [48.3, -4]);
  assert.equal(departmentLabelPosition(dept, { south: 48, north: 49, west: 2, east: 3 }), null);
});

test('Avoids holes when placing labels inside visible department portions', () => {
  const dept = rectangle('Sample', 0, 0, 4, 4, [2, 2]);
  dept.geometry.coordinates.push([[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]);
  const result = departmentLabelPosition(dept, { south: .5, north: 3.5, west: .5, east: 3.5 });
  assert.ok(result && insideFeature(dept, ...result));
  assert.equal(insideFeature(dept, 2, 2), false);
});
