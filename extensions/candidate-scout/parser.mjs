const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalize = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const PERIOD = /\b(?:Jan(?:uary|vier)?|Feb(?:ruary|vrier)?|Mar(?:ch|s)?|Apr(?:il)?|May|Mai|Jun(?:e|in)?|Jul(?:y|let)?|Aug(?:ust|out)?|Sep(?:t(?:ember|embre)?)?|Oct(?:ober|obre)?|Nov(?:ember|embre)?|Dec(?:ember|embre)?|D[eé]c(?:embre)?|\d{1,2}\/)(?:\s+|\/)?\d{4}\s*[-–—]\s*(?:present|aujourd'hui|en poste|maintenant|current|[a-zéû.]+\s+)?\d{0,4}|\b\d{4}\s*[-–—]\s*(?:present|aujourd'hui|en poste|\d{4})/i;
const LOCATION_HINT = /\b(france|belgium|belgique|luxembourg|germany|allemagne|switzerland|suisse|tunisia|tunisie|spain|espagne|italy|italie|netherlands|pays-bas|united kingdom|royaume-uni|ireland|irlande)\b/i;
const BAD_LINE = /^(experience|expérience|show all|see more|voir plus|description|skills|compétences|expe?rience$)/i;
const HEADER_END = /^(activity|activit[eé]|about|infos|experience|exp[eé]rience|education|formation|skills|comp[eé]tences)$/i;
const PROFILE_COUNTRY = /\b(France|Belgique|Belgium|Luxembourg|Germany|Allemagne|Suisse|Switzerland|Tunisie|Tunisia|Spain|Espagne|Italie|Italy|Netherlands|Pays-Bas|United Kingdom|Royaume-Uni)\b/i;

/** Fall back to the visible lines around the profile name, not the job-history address. */
export function extractProfileHeaderEvidence(visibleText = '', name = '', headline = '') {
  const lines = String(visibleText).split(/\r?\n/).map(clean).filter(Boolean);
  const nameIndex = lines.findIndex((line) => normalize(line) === normalize(name) && Boolean(name));
  const start = nameIndex < 0 ? 0 : nameIndex + 1;
  const header = [];
  for (const line of lines.slice(start, start + 26)) {
    if (HEADER_END.test(line)) break;
    header.push(line);
  }
  const location = header.find((line) => {
    const head = line.split(/\s+[·|]\s+(?:Contact info|Coordonn[eé]es|Contact)/i)[0];
    return head.includes(',') && PROFILE_COUNTRY.test(head)
      && head.split(',')[0].trim().length >= 2 && head.length < 160;
  });
  const openIndex = header.findIndex((line) => /^(open to work|[àa] l'[eé]coute d'opportunit[eé]s)$/i.test(line));
  const badge = openIndex >= 0;
  const preference = badge
    ? header.slice(openIndex + 1, openIndex + 4).find((line) =>
      /\b(on-site|remote|hybrid|sur site|hybride|t[eé]l[eé]travail)\b/i.test(line)) || ''
    : '';
  const seekingHeadline = /(?:recherche\s+(?:un|une|d['’]un|d['’]une)\s+(?:CDD|CDI|emploi|poste)|looking for (?:a |new )?(?:job|work))/i.test(headline);
  return {
    location: location ? location.split(/\s+[·|]\s+(?:Contact info|Coordonn[eé]es|Contact)/i)[0].trim() : '',
    openToWorkBadge: badge,
    openToWorkPreferences: preference,
    seekingHeadline,
  };
}

export function roleFamily(title = '') {
  const t = normalize(title);
  if (/\b(tram|tramway|metro|m[eé]tro|train conductor)\b/.test(t)) return 'tram_operator';
  if (/(conducteur|conductrice|chauffeur|driver|machiniste).*(bus|car\b|autocar|voyageur|transport en commun)/.test(t) || /bus driver/.test(t)) return 'bus_driver';
  if (/\b(mecanicien|mechanic|technicien maintenance|maintenance technician|maintenance autobus)\b/.test(t) && /(poids lourd|bus|car|camion|truck|vehicule industriel|fleet)/.test(t)) return 'heavy_vehicle_mechanic';
  if (/(billettique|ticketing|embedded|embarque|systeme electronique|electronic system)/.test(t)) return 'embedded_ticketing_technician';
  if (/\b(mecanicien|mechanic|maintenance|atelier|workshop)\b/.test(t)) return 'fleet_maintenance';
  return null;
}

export function parseExperienceCard(card = {}) {
  const lines = [...new Set((card.lines ?? [])
    .map(clean)
    .filter((line) => line && !BAD_LINE.test(line) && line.length < 240))];
  if (!lines.length && card.text) {
    lines.push(...String(card.text).split(/\n+/).map(clean).filter(Boolean));
  }
  const periodIndex = lines.findIndex((line) => PERIOD.test(line) || /\b(?:present|aujourd'hui)\b/i.test(line) && /\d{4}/.test(line));
  const period = periodIndex >= 0 ? lines[periodIndex] : '';
  let location = lines.find((line, index) => index !== periodIndex && LOCATION_HINT.test(line) && line.includes(',')) || '';
  if (!location && periodIndex >= 0) {
    location = lines.slice(periodIndex + 1).find((line) => LOCATION_HINT.test(line)) || '';
  }
  const heading = lines.filter((line, index) => index < (periodIndex >= 0 ? periodIndex : 3));
  const title = heading[0] || lines[0] || '';
  const company = heading.find((line, index) => index > 0 && line !== location) || '';
  return {
    title,
    company,
    period,
    location,
    roleFamily: roleFamily(title),
    active: /\b(present|aujourd'hui|en poste|current)\b/i.test(period),
    evidence: 'visible_page',
  };
}

/**
 * Fallback for the newer LinkedIn layout: DOM lists may be div-based or
 * class names may change, while the *visible* experience section still reads
 * title / company / dates / location. This does not read private API data.
 */
export function parseExperienceText(sectionText = '') {
  const lines = String(sectionText)
    .split(/\r?\n/)
    .map(clean)
    .filter((line) => line && !BAD_LINE.test(line) && line.length < 240)
    .slice(0, 600);
  const cards = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!PERIOD.test(lines[i])) continue;
    const title = lines[i - 2] || '';
    const company = lines[i - 1] || '';
    if (!title || !company || PERIOD.test(title) || PERIOD.test(company)) continue;
    const location = LOCATION_HINT.test(lines[i + 1] || '') ? lines[i + 1] : '';
    cards.push({ lines: [title, company, lines[i], location].filter(Boolean) });
  }
  return cards;
}

function mentionList(text, patterns) {
  const found = [];
  for (const [name, rx] of patterns) if (rx.test(text)) found.push(name);
  return found;
}

const LICENSE_PATTERNS = [
  ['Permis B', /\bpermis\s*(?:de\s*conduire\s*)?B\b/i],
  ['Permis C', /\bpermis\s*(?:de\s*conduire\s*)?C\b/i],
  ['Permis CE', /\bpermis\s*(?:de\s*conduire\s*)?CE\b/i],
  ['Permis D', /\bpermis\s*(?:de\s*conduire\s*)?D\b/i],
  ['Permis DE', /\bpermis\s*(?:de\s*conduire\s*)?DE\b/i],
];
const CERT_PATTERNS = [
  ['FIMO Voyageurs', /\bFIMO\b.{0,35}(voyageur|passenger)/i],
  ['FIMO (type unspecified)', /\bFIMO\b/i],
  ['FCO', /\bFCO\b/i],
  ['CACES', /\bCACES\b/i],
  ['SST', /\bSST\b/i],
  ['Carte de qualification conducteur', /carte\s+de\s+qualification\s+conducteur/i],
];

export function mergeProfiles(previous, incoming) {
  if (!previous) return incoming;
  if (!incoming || previous.url !== incoming.url) return incoming;
  const map = new Map();
  for (const item of [...(previous.experience ?? []), ...(incoming.experience ?? [])]) {
    const key = normalize([item.title, item.company, item.period].join('|'));
    if (key && !map.has(key)) map.set(key, item);
  }
  return {
    ...previous,
    ...incoming,
    name: incoming.name || previous.name,
    headline: incoming.headline || previous.headline,
    currentLocation: incoming.currentLocation || previous.currentLocation,
    openToWorkBadge: incoming.openToWorkBadge || previous.openToWorkBadge,
    openToWorkPreferences: incoming.openToWorkPreferences || previous.openToWorkPreferences,
    seekingHeadline: incoming.seekingHeadline || previous.seekingHeadline,
    experience: [...map.values()],
    licenseMentions: [...new Set([...(previous.licenseMentions ?? []), ...(incoming.licenseMentions ?? [])])],
    certificateMentions: [...new Set([...(previous.certificateMentions ?? []), ...(incoming.certificateMentions ?? [])])],
    profileSkills: [...new Set([...(previous.profileSkills ?? []), ...(incoming.profileSkills ?? [])])],
    captureCount: (previous.captureCount || 1) + 1,
  };
}

export function parseCapture(raw = {}) {
  const header = extractProfileHeaderEvidence(raw.profileHeaderText, raw.name, raw.headline);
  const bodyHeader = extractProfileHeaderEvidence(raw.profileBodyText, raw.name, raw.headline);
  const domCards = (raw.experienceCards ?? [])
    .map(parseExperienceCard)
    .filter((item) => item.title && !BAD_LINE.test(item.title));
  const textCards = parseExperienceText(raw.experienceText)
    .map(parseExperienceCard);
  // Combine both strategies: DOM gives richer data, text finds otherwise missed entries.
  const unique = new Map();
  for (const item of [...domCards, ...textCards]) {
    const key = normalize([item.title, item.company, item.period].join('|'));
    if (key && !unique.has(key)) unique.set(key, item);
  }
  const experience = [...unique.values()].slice(0, 100);
  const certificateScope = [raw.certificationsText, raw.licensesText, ...(raw.skills ?? []), ...experience.map((item) => [item.title, item.company].join(' '))]
    .filter(Boolean).join('\n');
  const licenseMentions = mentionList(certificateScope, LICENSE_PATTERNS);
  const certificateMentions = mentionList(certificateScope, CERT_PATTERNS);
  // A certification mentioned in text is NOT a verified valid certificate.
  return {
    name: clean(raw.name),
    headline: clean(raw.headline),
    currentLocation: PROFILE_COUNTRY.test(raw.currentLocation || '')
      ? clean(raw.currentLocation) : (header.location || bodyHeader.location),
    openToWorkBadge: Boolean(raw.openToWorkBadge || header.openToWorkBadge || bodyHeader.openToWorkBadge),
    openToWorkPreferences: clean(raw.openToWorkPreferences || header.openToWorkPreferences || bodyHeader.openToWorkPreferences),
    seekingHeadline: Boolean(raw.seekingHeadline || header.seekingHeadline || bodyHeader.seekingHeadline),
    url: clean(raw.url).split('?')[0],
    experience,
    licenseMentions,
    certificateMentions: certificateMentions.filter((item) => item !== 'FIMO (type unspecified)' || !certificateMentions.includes('FIMO Voyageurs')),
    profileSkills: [...new Set((raw.skills ?? []).map(clean).filter(Boolean))].slice(0, 100),
    openToWorkMention: Boolean(raw.openToWorkMention),
    incompleteHint: Boolean(raw.moreExperienceAvailable) || experience.length === 0,
    capturedAt: new Date().toISOString(),
    captureCount: 1,
  };
}
