/**
 * Place a department name in the part of its polygon currently visible on the
 * miniature map. Static administrative label coordinates can be far outside
 * the viewport even while the department itself occupies most of the view.
 * Coordinates at this boundary are [latitude, longitude]; GeoJSON rings use
 * [longitude, latitude]. Nothing is geocoded or sent across the network.
 */

function insideRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[j];
    if ((ay > lat) !== (by > lat) && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

export function insideFeature(feature, lat, lng) {
  const geometry = feature?.geometry;
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some(([outer, ...holes]) =>
    outer?.length > 2 && insideRing(lng, lat, outer)
    && !holes.some((hole) => insideRing(lng, lat, hole)));
}

function featureBounds(feature) {
  const geometry = feature?.geometry;
  const polygons = geometry?.type === 'Polygon'
    ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : [];
  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity;
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    south = Math.min(south, lat); north = Math.max(north, lat);
    west = Math.min(west, lng); east = Math.max(east, lng);
  }
  return { south, north, west, east };
}

/** Returns [lat,lng] inside both the department and the viewport, or null. */
export function departmentLabelPosition(feature, viewport) {
  if (!feature?.geometry || !viewport) return null;
  const bbox = featureBounds(feature);
  const south = Math.max(viewport.south, bbox.south);
  const north = Math.min(viewport.north, bbox.north);
  const west = Math.max(viewport.west, bbox.west);
  const east = Math.min(viewport.east, bbox.east);
  if (south >= north || west >= east) return null;

  // Keep an existing good position steady until the map actually pans away.
  const original = feature.properties?.label;
  if (Array.isArray(original) && original.length === 2
    && original[0] >= south && original[0] <= north
    && original[1] >= west && original[1] <= east
    && insideFeature(feature, original[0], original[1])) return original;

  // Prefer the middle of the visible portion: sample the clipped intersection
  // on a progressively denser grid to handle narrow pieces near the viewport.
  for (const divisions of [3, 7, 15, 31]) {
    let best = null;
    let bestScore = -Infinity;
    for (let row = 0; row < divisions; row += 1) {
      const y = (row + 0.5) / divisions;
      const lat = south + y * (north - south);
      for (let col = 0; col < divisions; col += 1) {
        const x = (col + 0.5) / divisions;
        const lng = west + x * (east - west);
        if (!insideFeature(feature, lat, lng)) continue;
        const score = Math.min(x, 1 - x) + Math.min(y, 1 - y);
        if (score > bestScore) { best = [lat, lng]; bestScore = score; }
      }
    }
    if (best) return best;
  }
  return null;
}
