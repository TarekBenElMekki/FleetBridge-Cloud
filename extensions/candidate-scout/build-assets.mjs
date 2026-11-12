/** Mechanical data build from the workspace Atlas release; no remote requests. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const atlas = path.resolve(here, '../atlas-map-shell-8uj7nu/dist');
const out = path.join(here, 'data');
const assets = path.join(here, 'assets');
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(assets, { recursive: true });

const source = JSON.parse(fs.readFileSync(path.join(atlas, 'data.json'), 'utf8'));
const operators = source.operators
  .filter((item) => item.name && item.city && Number.isFinite(item.lat) && Number.isFinite(item.lng))
  .map(({ id, name, city, code, country, lat, lng, group, mode }) =>
    ({ id, name, city, code, country, lat, lng, group, mode }));
fs.writeFileSync(path.join(out, 'operators.json'), JSON.stringify(operators));
fs.copyFileSync(path.join(atlas, 'france-communes.json'), path.join(out, 'cities-fr.json'));
fs.copyFileSync(path.join(atlas, 'europe-base.geojson'), path.join(out, 'europe-base.geojson'));
const departments = JSON.parse(fs.readFileSync(path.join(atlas, 'assets/admin/FR-2.json'), 'utf8'));
fs.writeFileSync(path.join(out, 'france-departments.json'), JSON.stringify(departments));

// The 18 current French regions (13 metropolitan and 5 overseas), built from
// Atlas' existing department geometry. Shared internal edges are suppressed so
// the region layer highlights regional boundaries without outlining every dept twice.
const regions = [
  ['Auvergne-Rhône-Alpes',46.05,4.7,'01 03 07 15 26 38 42 43 63 69 73 74'],
  ['Bourgogne-Franche-Comté',47.25,5.35,'21 25 39 58 70 71 89 90'],
  ['Bretagne',48.3,-3.2,'22 29 35 56'],
  ['Centre-Val de Loire',47.65,1.7,'18 28 36 37 41 45'],
  ['Corse',42.15,9.05,'2A 2B'],
  ['Grand Est',48.7,6.2,'08 10 51 52 54 55 57 67 68 88'],
  ['Hauts-de-France',50.15,2.9,'02 59 60 62 80'],
  ['Île-de-France',48.73,2.45,'75 77 78 91 92 93 94 95'],
  ['Normandie',49.05,0.15,'14 27 50 61 76'],
  ['Nouvelle-Aquitaine',45.6,0.5,'16 17 19 23 24 33 40 47 64 79 86 87'],
  ['Occitanie',43.7,2.2,'09 11 12 30 31 32 34 46 48 65 66 81 82'],
  ['Pays de la Loire',47.5,-0.6,'44 49 53 72 85'],
  ["Provence-Alpes-Côte d'Azur",44.15,6.25,'04 05 06 13 83 84'],
  ['Guadeloupe',16.2,-61.5,'971'],
  ['Martinique',14.65,-61.0,'972'],
  ['Guyane',4.0,-53.1,'973'],
  ['La Réunion',-21.1,55.5,'974'],
  ['Mayotte',-12.8,45.15,'976'],
];
const edgeOwners = new Map();
const regionByCode = new Map();
for (const [name, , , codes] of regions) for (const code of codes.split(' ')) regionByCode.set(code, name);
for (const feature of departments.features) {
  const region = regionByCode.get(feature.properties.code);
  if (!region) throw new Error(`Missing region for ${feature.properties.code}`);
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  for (const polygon of polygons) for (const ring of polygon) {
    for (let i = 1; i < ring.length; i += 1) {
      const a = ring[i - 1], b = ring[i];
      const sa = a.join(','), sb = b.join(',');
      const key = sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`;
      if (!edgeOwners.has(key)) edgeOwners.set(key, []);
      edgeOwners.get(key).push({ region, line: [a, b] });
    }
  }
}
const regionBorders = new Map(regions.map(([name]) => [name, []]));
for (const owners of edgeOwners.values()) {
  for (const edge of owners) {
    if (owners.some((other) => other !== edge && other.region === edge.region)) continue;
    regionBorders.get(edge.region).push(edge.line);
  }
}
fs.writeFileSync(path.join(out, 'france-regions.json'), JSON.stringify({
  type: 'FeatureCollection',
  features: regions.map(([name, lat, lng, codes]) => ({
    type: 'Feature', properties: { name, codes: codes.split(' '), label: [lat, lng] },
    geometry: { type: 'MultiLineString', coordinates: regionBorders.get(name) },
  })),
}));
fs.copyFileSync(path.join(atlas, 'assets/leaflet.js'), path.join(assets, 'leaflet.js'));
fs.copyFileSync(path.join(atlas, 'assets/leaflet.css'), path.join(assets, 'leaflet.css'));
console.log(`Packed ${operators.length} Atlas employers, ${departments.features.length} French departments, ${regions.length} regions, city index, Europe outline and local Leaflet.`);
