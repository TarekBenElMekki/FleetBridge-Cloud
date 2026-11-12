export const normLocation = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[’']/g, ' ')
  .replace(/[^a-z0-9 -]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export function buildCityIndex(cities = [], employers = []) {
  const index = new Map();
  for (const [name, lat, lng, department] of cities) {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const key = normLocation(name);
      if (!index.has(key)) index.set(key, { city: name, lat, lng, country: 'France', department, precision: 'city centre' });
    }
  }
  for (const employer of employers) {
    if (Number.isFinite(employer.lat) && Number.isFinite(employer.lng) && employer.city) {
      const key = normLocation(employer.city);
      if (!index.has(key)) index.set(key, {
        city: employer.city, lat: employer.lat, lng: employer.lng,
        country: employer.country || employer.code, precision: 'city centre',
      });
    }
  }
  return index;
}

export function resolveLocation(location, cityIndex) {
  if (!location) return null;
  const raw = String(location);
  const fragments = raw.split(',').map(normLocation).filter(Boolean);
  const full = normLocation(raw);
  let city = null;
  for (const fragment of fragments) {
    city = cityIndex.get(fragment);
    if (city) break;
    const trimmed = fragment.replace(/^(metropole de|greater|region de|ville de)\s+/, '');
    city = cityIndex.get(trimmed);
    if (city) break;
  }
  if (!city) {
    for (const likely of ['paris', 'lyon', 'marseille', 'lille', 'toulouse', 'bordeaux', 'nice', 'strasbourg', 'nantes']) {
      if (new RegExp(`\\b${likely}\\b`).test(full) && cityIndex.has(likely)) {
        city = cityIndex.get(likely);
        break;
      }
    }
  }
  if (!city) return null;
  // Explicit countries override false matches: do not plot French "Paris" for "Paris, Texas".
  if (/\b(united states|usa|canada|australia|texas)\b/.test(full)) return null;
  return { ...city, input: raw };
}

export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

export function geoExperience(experiences, cityIndex) {
  return (experiences ?? []).map((item, index) => ({
    ...item,
    geo: resolveLocation(item.location, cityIndex),
    order: index,
  }));
}

export function lastFrenchEmployment(experiences, cityIndex) {
  // Do not fall back to an older French job if the most recent job is abroad
  // or its location is unknown. The user's rule explicitly requires the LAST job in France.
  const mostRecent = geoExperience(experiences, cityIndex)[0];
  return mostRecent?.geo && normLocation(mostRecent.geo.country) === 'france'
    ? mostRecent : null;
}

export function nearbyEmployers(employers, point, { radiusKm = 50, limit = 50 } = {}) {
  if (!point) return [];
  const radius = Number.isFinite(radiusKm) ? Math.max(0, radiusKm) : 50;
  return employers
    .filter((e) => e.code === 'FR' && Number.isFinite(e.lat) && Number.isFinite(e.lng))
    .map((e) => ({ ...e, distanceKm: haversineKm(point, e) }))
    .filter((e) => e.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}

export function nearbyVacancies(vacancies, point, cityIndex, limit = 6) {
  if (!point) return [];
  return vacancies
    .filter((job) => job.status === 'open' && Boolean(job.sourceUrl) && Boolean(job.verifiedAt))
    .map((job) => {
      const geo = Number.isFinite(job.lat) && Number.isFinite(job.lng)
        ? { lat: job.lat, lng: job.lng }
        : resolveLocation(job.city, cityIndex);
      return geo ? { ...job, geo, distanceKm: haversineKm(point, geo) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);
}
