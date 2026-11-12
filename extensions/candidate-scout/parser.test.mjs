import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCapture, parseExperienceText, mergeProfiles, roleFamily, extractProfileHeaderEvidence } from './parser.mjs';
import { buildCityIndex, resolveLocation, nearbyEmployers, nearbyVacancies, lastFrenchEmployment } from './geo.mjs';

const capture = {
  url: 'https://www.linkedin.com/in/example-person/',
  name: 'Example Person',
  headline: 'Conducteur de bus',
  currentLocation: 'Lille, Hauts-de-France, France',
  experienceCards: [{ lines: ['Conducteur de bus', 'Example Transit', 'Jan 2021 - Present · 5 yrs', 'Lille, Hauts-de-France, France'] }],
  certificationsText: 'FIMO Voyageurs',
  licensesText: 'Permis D',
};

test('Extracts job, location, mentioned qualifications and category', () => {
  const result = parseCapture(capture);
  assert.equal(result.experience.length, 1);
  assert.equal(result.experience[0].roleFamily, 'bus_driver');
  assert.equal(result.experience[0].company, 'Example Transit');
  assert.equal(result.experience[0].location, 'Lille, Hauts-de-France, France');
  assert.ok(result.licenseMentions.includes('Permis D'));
  assert.ok(result.certificateMentions.includes('FIMO Voyageurs'));
});

test('Parses the div-based LinkedIn Experience layout shown in the reported screenshot', () => {
  const text = `Experience
Mécanicien Poids Lourds/Véhicules Légers
Petit Forestier Group · Permanent
Jan 2025 - Present · 1 yr 11 mos
Rungis, Île-de-France, France · On-site
Employé Polyvalent
B&M Retail · Contract
Nov 2024 - Dec 2024 · 2 mos
Fresnes, Île-de-France, France`;
  assert.equal(parseExperienceText(text).length, 2);
  const result = parseCapture({
    name: 'Example Candidate',
    url: 'https://www.linkedin.com/in/example/',
    experienceCards: [],
    experienceText: text,
  });
  assert.equal(result.experience.length, 2);
  assert.equal(result.experience[0].roleFamily, 'heavy_vehicle_mechanic');
  assert.match(result.experience[0].company, /Petit Forestier/);
  assert.match(result.experience[0].location, /Rungis/);
  assert.match(result.experience[1].location, /Fresnes/);
});

test('Recovers the candidate location from the visible header when LinkedIn CSS selectors differ', () => {
  const header = `Gabriel de Sousa Tavares
Recherche un CDD ou CDI.
UVSQ Université de Versailles Saint-Quentin-en-Yvelines
Fresnes, Île-de-France, France · Contact info
Open to work
Fresnes +4 more | On-site
Show details
About
Experienced mechanic`;
  const result = parseCapture({ name: 'Gabriel de Sousa Tavares',
    headline: 'Recherche un CDD ou CDI.', profileHeaderText: header,
    currentLocation: '500+ connections', url: 'https://www.linkedin.com/in/example/' });
  assert.equal(result.currentLocation, 'Fresnes, Île-de-France, France');
  assert.equal(result.openToWorkBadge, true);
  assert.equal(result.openToWorkPreferences, 'Fresnes +4 more | On-site');
  assert.equal(result.seekingHeadline, true);
});

test('Does not confuse workplace addresses with candidate header location', () => {
  const header = `Test Person
Heavy vehicle mechanic
Experience
Bus mechanic
Sample Company
Mar 2024 - Present
Lille, Hauts-de-France, France`;
  assert.equal(extractProfileHeaderEvidence(header, 'Test Person').location, '');
});

test('Uses the full profile header when compact header omits the city', () => {
  const profile = parseCapture({ name: 'Test Person', headline: 'Mécanicien',
    profileHeaderText: 'Test Person\nMécanicien\nAbout\nBiography',
    profileBodyText: 'Test Person\nMécanicien\nFresnes, Île-de-France, France\nOpen to work\nFresnes +4 more | On-site\nAbout',
  });
  assert.equal(profile.currentLocation, 'Fresnes, Île-de-France, France');
  assert.equal(profile.openToWorkBadge, true);
});

test('Complete experience merges additional visible jobs without duplicating previous jobs', () => {
  const first = parseCapture(capture);
  const more = parseCapture({
    ...capture, name: '', experienceCards: [
      ...capture.experienceCards,
      { lines: ['Mécanicien poids lourds', 'Example Workshop', '2018 - 2020', 'Lyon, Auvergne-Rhône-Alpes, France'] },
    ],
  });
  const merged = mergeProfiles(first, more);
  assert.equal(merged.name, 'Example Person');
  assert.equal(merged.experience.length, 2);
  assert.equal(merged.captureCount, 2);
  assert.equal(roleFamily(merged.experience[1].title), 'heavy_vehicle_mechanic');
});

const cities = [
  ['Lille', 50.633, 3.058, '59'], ['Lyon', 45.76, 4.83, '69'], ['Paris', 48.85, 2.35, '75'],
];
const employers = [
  { id: 'e1', name: 'Transit Lille', city: 'Lille', code: 'FR', country: 'France', lat: 50.633, lng: 3.058 },
  { id: 'e2', name: 'Transit Paris', city: 'Paris', code: 'FR', country: 'France', lat: 48.85, lng: 2.35 },
];
const idx = buildCityIndex(cities, employers);

test('Maps locations to city centres, not addresses', () => {
  const place = resolveLocation('Lille, Hauts-de-France, France', idx);
  assert.equal(place.city, 'Lille');
  assert.equal(place.precision, 'city centre');
  assert.equal(resolveLocation('Paris, Texas, USA', idx), null);
});

test('Uses latest French employment as geographic reference', () => {
  const history = parseCapture(capture).experience;
  const selected = lastFrenchEmployment(history, idx);
  assert.equal(selected.geo.city, 'Lille');
  assert.equal(nearbyEmployers(employers, selected.geo)[0].name, 'Transit Lille');
  assert.deepEqual(nearbyEmployers(employers, selected.geo, { radiusKm: 0 }).map((x) => x.name), ['Transit Lille']);
  assert.deepEqual(nearbyEmployers(employers, selected.geo, { radiusKm: 2 }).map((x) => x.name), ['Transit Lille']);
});

test('Does not use older French employment when the latest role is abroad or unlocated', () => {
  const history = [
    { title: 'Bus driver', location: 'Berlin, Germany' },
    { title: 'Bus driver', location: 'Lille, Hauts-de-France, France' },
  ];
  assert.equal(lastFrenchEmployment(history, idx), null);
});

test('Unverified employer pages are never mislabeled as open vacancies', () => {
  const point = resolveLocation('Lille, France', idx);
  const jobs = [
    { id: '1', title: 'Bus driver', city: 'Lille', status: 'unverified', sourceUrl: 'https://example.org', verifiedAt: '2026-11-05' },
    { id: '2', title: 'Bus driver', city: 'Paris', status: 'open', sourceUrl: 'https://example.org', verifiedAt: '2026-11-05' },
  ];
  assert.deepEqual(nearbyVacancies(jobs, point, idx).map((x) => x.id), ['2']);
});

