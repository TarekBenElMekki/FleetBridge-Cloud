import { parseCapture, mergeProfiles } from './parser.mjs';
import {
  buildCityIndex, geoExperience, lastFrenchEmployment,
  nearbyEmployers,
} from './geo.mjs';
import { assessCareerMobility, assessTransitRoleRelevance } from './scoring.mjs';
import { departmentLabelPosition } from './map-labels.mjs';

const $ = (id) => document.getElementById(id);
const state = {
  profile: null, cities: new Map(), employers: [], borders: null,
  departments: null, regions: null, map: null, markers: null, adminLabels: null,
  radiusKm: 50,
};

function element(tag, className = '', text = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

function showError(message) { $('error').hidden = false; $('error').textContent = message; }
function clearError() { $('error').hidden = true; $('error').textContent = ''; }
function setBusy(value) { $('launchBtn').disabled = value; $('launchBtn').setAttribute('aria-busy', String(value)); }

/** Runs ONLY after the user clicks the extension. Never follows links or changes a page. */
function captureVisibleProfile() {
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  // LinkedIn uses more than one desktop profile layout. Some newer cards are
  // div-based rather than section/list-based, so always allow body fallback.
  const main = [...document.querySelectorAll('main')]
    .find((node) => node.querySelector('h1, [id="experience"], .pv-top-card')) || document.body;
  const detailPage = /\/details\/experience\/?/.test(location.pathname);
  const titleName = clean(document.querySelector('meta[property="og:title"]')?.content || document.title)
    .replace(/\s+[|·]\s+LinkedIn.*$/i, '').replace(/\s+-\s+LinkedIn.*$/i, '');
  const headingName = clean(document.querySelector('main h1, h1')?.innerText);
  const name = detailPage ? '' : (/^(experience|expérience|profile|profil)$/i.test(headingName) ? titleName : headingName || titleName);
  const top = document.querySelector('.pv-text-details__left-panel, .pv-top-card') || main.querySelector('section') || main;
  let headline = detailPage ? '' : clean(top.querySelector('.text-body-medium')?.innerText || main.querySelector('[data-field="headline"]')?.innerText);
  if (!headline && name && !detailPage) {
    const lines = (document.body.innerText || '').split(/\r?\n/).map(clean).filter(Boolean);
    const index = lines.findIndex((line) => line === name);
    const next = lines[index + 1] || '';
    if (index >= 0 && next.length > 4 && next.length < 180 && !/^(connect|follow|suivre|message|contact info)$/i.test(next)) headline = next;
  }
  const currentLocation = detailPage ? '' : clean(
    main.querySelector('.pv-text-details__left-panel .text-body-small, .pv-top-card--list-bullet li, [data-field="location"]')?.innerText
    || top.querySelector('.text-body-small')?.innerText);
  const fullMainText = detailPage ? '' : (main.innerText || '');
  const headerText = detailPage ? '' : (top.innerText || '').slice(0, 3000);
  const openToWorkMatch = fullMainText.slice(0, 5000).match(/(?:^|\n)\s*(Open to work|À l'écoute d'opportunités)\s*\n\s*([^\n]{1,130})?/i);
  const sections = [...document.querySelectorAll('main section, section')];

  function byTitle(partial) {
    const target = partial.toLowerCase();
    // getElementById accepts names with spaces and punctuation; CSS #selectors do not.
    const anchor = document.getElementById(target);
    if (anchor) {
      const section = anchor.closest('section') || anchor.parentElement?.closest('section');
      if (section) return section;
    }
    return sections.find((section) => {
      const heading = section.querySelector('h2,h3');
      return heading && clean(heading.textContent).toLowerCase().includes(target);
    }) || [...document.querySelectorAll('h2,h3,[role="heading"]')]
      .find((heading) => clean(heading.textContent).toLowerCase() === target)
      ?.closest('section, article, .artdeco-card, [data-view-name]') || null;
  }

  const experienceSection = byTitle('experience') || byTitle('expérience');
  const container = detailPage ? main : experienceSection;
  let nodes = container ? [...container.querySelectorAll('li.pvs-list__item--line-separated, li.artdeco-list__item')] : [];
  // Exclude nested subentries here; each top-level entry is independently parsed on repeated capture.
  nodes = nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
  if (!nodes.length && container) {
    nodes = [...container.querySelectorAll('.pvs-entity')].filter((node) => !node.parentElement?.closest('.pvs-entity'));
  }
  const experienceCards = nodes.slice(0, 100).map((node) => {
    let lines = [...node.querySelectorAll('span[aria-hidden="true"]')]
      .map((span) => clean(span.innerText || span.textContent))
      .filter((line) => line.length > 1);
    if (!lines.length) lines = (node.innerText || '').split('\n').map(clean).filter(Boolean);
    return { lines: [...new Set(lines)].slice(0, 50) };
  });

  // Final fallback: text actually rendered in the profile's Experience card.
  // No requests, hidden API state, or automated expansion.
  function visibleExperienceText() {
    const direct = experienceSection?.innerText || '';
    if (direct.length > 70) return direct.slice(0, 18000);
    const text = document.body.innerText || '';
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const start = lines.findIndex((line, i) => /^(experience|expérience)$/i.test(line)
      && lines.slice(i + 1, i + 18).some((next) => /\b(?:19|20)\d{2}\s*[-–—]/.test(next)));
    if (start < 0) return '';
    const stop = lines.findIndex((line, i) => i > start + 2
      && /^(education|formation|skills|compétences|licenses\s*&\s*certifications|licences|certifications|interests|centres d.intérêt)$/i.test(line));
    return lines.slice(start, stop < 0 ? start + 250 : stop).join('\n').slice(0, 18000);
  }
  const experienceText = visibleExperienceText();

  function sectionText(...titles) {
    const section = titles.map(byTitle).find(Boolean);
    return section ? clean(section.innerText).slice(0, 12000) : '';
  }
  const skillsSection = byTitle('skills') || byTitle('compétences');
  const skills = skillsSection
    ? [...skillsSection.querySelectorAll('li')].map((li) => clean(li.querySelector('span[aria-hidden="true"]')?.innerText || li.innerText).split('\n')[0]).filter(Boolean).slice(0, 100)
    : [];

  const viewAll = [...(experienceSection?.querySelectorAll('a,button') || [])]
    .some((el) => /(show all|see all|voir toutes|afficher tous|show more|voir plus)/i.test(el.innerText || ''));
  return {
    name, headline, currentLocation,
    profileHeaderText: headerText,
    profileBodyText: fullMainText.slice(0, 4500),
    openToWorkBadge: Boolean(openToWorkMatch),
    openToWorkPreferences: clean(openToWorkMatch?.[2] || ''),
    url: `${location.origin}${location.pathname.match(/\/in\/[^/]+/)?.[0] || location.pathname}/`,
    experienceCards,
    experienceText,
    certificationsText: sectionText('licenses & certifications', 'licences et certifications', 'certifications'),
    licensesText: sectionText('licenses', 'permis'),
    skills,
    openToWorkMention: /#opentowork|open to work|looking for (?:a |new )?(?:job|work|opportunity)|(?:à\s+la\s+)?recherche\s+(?:d['’]un\s+|un\s+|une\s+|de\s+)?(?:cdd|cdi|emploi|poste)/i.test(headline),
    moreExperienceAvailable: viewAll,
    captureDiagnostics: { domCards: experienceCards.length, textChars: experienceText.length },
  };
}

async function capture() {
  clearError(); setBusy(true);
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https:\/\/([a-z-]+\.)?linkedin\.com\/in\/[^/]+/i.test(tab.url || '')) {
      throw new Error('Open a LinkedIn member profile or its “Show all experiences” page, then click the extension again.');
    }
    const injected = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: captureVisibleProfile });
    const raw = injected?.[0]?.result;
    if (!raw) throw new Error('No visible profile details could be read from this page.');
    const parsed = parseCapture(raw);
    if (!parsed.name && !parsed.experience.length && (!state.profile || state.profile.url !== parsed.url)) {
      throw new Error('Profile structure not recognized. Open the full profile or expand its Experience section.');
    }
    // A report may be refreshed after the user expands Experience. Merge only
    // when the stable LinkedIn profile URL matches; never mix candidates.
    state.profile = mergeProfiles(state.profile, parsed);
    // Keep the profile only in the Chrome session, never local persistent storage.
    await chrome.storage.session.set({ fbCandidateProfile: state.profile });
    render();
    if (!state.profile.experience.length) {
      showError('No experience entries were recognized. Expand Experience on LinkedIn, then refresh this report.');
    }
  } catch (error) {
    // Do not display a previously scanned candidate when this tab is invalid.
    state.profile = null;
    render();
    $('emptyMessage').textContent = 'Report unavailable';
    showError(error?.message || String(error));
  } finally { setBusy(false); }
}

function renderAdminLabels() {
  if (!state.map || !state.adminLabels) return;
  state.adminLabels.clearLayers();
  const zoom = state.map.getZoom();
  // At the scale of a single department, *always* keep its full name inside
  // the visible portion. Broad national views use region labels for clarity.
  const showDepartments = zoom >= 7;
  const features = showDepartments ? state.departments?.features : zoom >= 5 ? state.regions?.features : null;
  const kind = showDepartments ? 'department' : 'region';
  if (!features?.length) return;
  const bounds = state.map.getBounds();
  const viewport = { south: bounds.getSouth(), north: bounds.getNorth(),
    west: bounds.getWest(), east: bounds.getEast() };
  for (const feature of features) {
    const coords = showDepartments
      ? departmentLabelPosition(feature, viewport) : feature.properties?.label;
    if (!Array.isArray(coords) || !bounds.contains(coords)) continue;
    const tooltip = L.tooltip({ permanent: true, interactive: false,
      direction: 'center', className: `${kind}-label`, opacity: .94 });
    tooltip.setLatLng(coords);
    tooltip.setContent(element('span', '', feature.properties.name));
    tooltip.addTo(state.adminLabels);
  }
}

function renderMap(history) {
  if (!globalThis.L) return;
  if (!state.map) {
    state.map = L.map('map', { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    state.map.attributionControl.setPrefix('Leaflet');
    state.map.attributionControl.addAttribution('France: IGN / Etalab · Licence Ouverte 2.0');
    if (state.borders) {
      L.geoJSON(state.borders, {
        style: { color: '#c7d7dc', weight: .8, fillColor: '#f8fbfa', fillOpacity: .96 },
        interactive: false,
      }).addTo(state.map);
    }
    if (state.departments) {
      L.geoJSON(state.departments, {
        style: { color: '#b4cbd3', weight: 0.8, opacity: .8, fillOpacity: 0 },
        interactive: false,
      }).addTo(state.map);
    }
    if (state.regions) {
      L.geoJSON(state.regions, {
        style: { color: '#628e9f', weight: 1.7, opacity: .8, fillOpacity: 0 },
        interactive: false,
      }).addTo(state.map);
    }
    state.adminLabels = L.layerGroup().addTo(state.map);
    state.map.on('moveend', renderAdminLabels);
    state.markers = L.layerGroup().addTo(state.map);
  }
  state.markers.clearLayers();
  const bounds = [];
  // Draw older positions first so the most recent colored pin stays visible
  // when several roles share an approximate city-centre coordinate.
  for (const job of [...history].reverse()) {
    if (!job.geo) continue;
    const latest = job.order === 0;
    const color = latest ? '#597889' : job.order <= 2 ? '#78909f' : '#aab7bf';
    const marker = L.circleMarker([job.geo.lat, job.geo.lng], {
      radius: latest ? 8 : 6, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1,
    }).addTo(state.markers);
    const popup = document.createElement('div');
    popup.append(element('strong', '', job.title || 'Workplace'));
    popup.append(document.createElement('br'));
    popup.append(element('span', '', `${job.company || 'Company unknown'} · ${job.geo.city}`));
    marker.bindPopup(popup);
    bounds.push([job.geo.lat, job.geo.lng]);
  }
  // Zoom in as much as possible while keeping every known workplace visible.
  const sameLocation = bounds.length > 1 && bounds.every(([lat, lng]) =>
    lat === bounds[0][0] && lng === bounds[0][1]);
  if (bounds.length === 1 || sameLocation) state.map.setView(bounds[0], 13);
  else if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [22, 22], maxZoom: 14 });
  else state.map.setView([46.7, 2.2], 5);
  setTimeout(() => { state.map?.invalidateSize(); renderAdminLabels(); }, 30);
}

function renderExperience(profile) {
  const history = geoExperience(profile.experience, state.cities);
  $('historyCount').textContent = `${history.length} roles`;
  const list = $('historyList'); list.replaceChildren();
  for (const [index, job] of history.entries()) {
    const row = element('div', 'history-row');
    row.append(element('span', 'history-index', String(index + 1).padStart(2, '0')));
    const content = element('div', 'history-content');
    content.append(element('b', '', job.title));
    content.append(element('p', '', job.company || 'Company not identified'));
    content.append(element('small', '', [job.period, job.location].filter(Boolean).join(' · ') || 'Dates and location not found'));
    row.append(content);
    if (!job.geo) row.append(element('span', 'loc-badge', 'Not mapped'));
    list.append(row);
  }
  const count = history.filter((x) => x.geo).length;
  $('mapNote').textContent = `${count}/${history.length} locations mapped to approximate city centres.${profile.incompleteHint ? ' Some roles may be hidden; expand Experience on LinkedIn and refresh.' : ''}`;
  renderMap(history);
  return history;
}

function renderNearby(profile, history) {
  const reference = lastFrenchEmployment(history, state.cities);
  const point = reference?.geo;
  $('nearestReference').textContent = point ? `Near ${point.city}` : 'France location unknown';
  $('nearbyIntro').textContent = point
    ? `Closest recorded operators within ${state.radiusKm} km of ${point.city}.`
    : 'A French workplace location is needed to estimate nearby operators.';
  const listings = nearbyEmployers(state.employers, point, { radiusKm: state.radiusKm, limit: 12 });
  const list = $('nearbyList'); list.replaceChildren();
  if (!listings.length) {
    list.append(element('p', 'section-intro', point
      ? `No recorded transport employers found within ${state.radiusKm} km.`
      : 'No employer comparison is available without a French workplace location.'));
    return listings;
  }
  for (const item of listings) {
    const row = element('div', 'nearby-row');
    const info = element('div', 'nearby-info');
    info.append(element('strong', '', item.name || 'Employer'));
    info.append(element('small', '', item.city || 'Location unavailable'));
    row.append(info);
    row.append(element('span', 'nearby-distance', `${item.distanceKm} km`));
    list.append(row);
  }
  return listings;
}

function renderScores(profile) {
  const mobility = assessCareerMobility(profile);
  $('readinessScore').textContent = mobility.readinessScore === null ? '—' : String(mobility.readinessScore);
  $('readinessSuffix').textContent = mobility.readinessScore === null ? 'Unknown' : '/100';
  $('readinessBar').style.width = `${mobility.readinessScore || 0}%`;
  $('readinessText').textContent = mobility.readinessScore === null
    ? 'No experience data to estimate mobility'
    : `${mobility.confidence} confidence · heuristic, not a probability`;
  const alignment = assessTransitRoleRelevance(profile);
  $('fitScore').textContent = alignment.score === null ? '—' : String(alignment.score);
  $('fitSuffix').textContent = alignment.score === null ? 'Unknown' : '/100';
  $('fitBar').style.width = `${alignment.score || 0}%`;
  $('fitText').textContent = alignment.score === null
    ? 'No transport role evidence yet'
    : `${alignment.confidence} confidence · sector relevance only`;
}

function render() {
  const p = state.profile;
  $('emptyState').hidden = Boolean(p);
  $('results').hidden = !p;
  if (!p) return;
  $('candidateName').textContent = p.name || 'Name not captured';
  $('candidateHeadline').textContent = p.headline || '';
  $('candidatePlace').textContent = p.currentLocation
    ? p.currentLocation.replace(/\s*[·|]\s*(?:Contact info|Coordonn[eé]es|Contact).*$/i, '').trim()
    : '';
  const workStatus = $('workStatus');
  workStatus.hidden = !(p.openToWorkBadge || p.seekingHeadline);
  workStatus.textContent = p.openToWorkBadge
    ? `Open to work${p.openToWorkPreferences ? ` · ${p.openToWorkPreferences}` : ''}`
    : p.seekingHeadline ? 'Seeking work · stated in headline' : '';
  $('candidateInitials').textContent = (p.name || '?').split(/\s+/).slice(0, 2).map((x) => x[0] || '').join('').toUpperCase();
  $('sourceStatus').textContent = `${p.experience.length} roles captured · visible LinkedIn content only`;
  // Show qualifications only if the visible profile contains relevant evidence.
  // An absent mention never means the candidate lacks the qualification.
  const mentioned = [...new Set([...(p.licenseMentions || []), ...(p.certificateMentions || [])])];
  $('qualificationsSection').hidden = mentioned.length === 0;
  const qualificationsList = $('qualificationsList');
  qualificationsList.replaceChildren();
  for (const name of mentioned) qualificationsList.append(element('span', 'qualification-item', name));
  const history = renderExperience(p);
  renderNearby(p, history);
  renderScores(p);
}

async function init() {
  const [cities, atlas, borders, departments, regions, session] = await Promise.all([
    fetch('data/cities-fr.json').then((r) => r.json()),
    fetch('data/operators.json').then((r) => r.json()),
    fetch('data/europe-base.geojson').then((r) => r.json()),
    fetch('data/france-departments.json').then((r) => r.json()).catch(() => null),
    fetch('data/france-regions.json').then((r) => r.json()).catch(() => null),
    chrome.storage.session.get(['fbCandidateProfile']),
  ]);
  state.employers = atlas;
  state.cities = buildCityIndex(cities.cities, atlas);
  state.borders = borders;
  state.departments = departments;
  state.regions = regions;
  state.profile = session.fbCandidateProfile || null;
  $('launchBtn').addEventListener('click', capture);
  // Opening the extension is the user's explicit scan action. Show the report
  // immediately; no separate dashboard, export flow, or repeat Analyze button.
  await capture();
}

init().catch((error) => showError(`Extension initialization failed: ${error.message}`));
