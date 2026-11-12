/**
 * FleetBridge candidate-to-public-transport opportunity scoring (v0.1).
 *
 * Scores describe DOCUMENTED EVIDENCE and self-declared job-change interest.
 * They are NOT measured probabilities of resigning, being hired, or performing well.
 * Never use these scores to automatically reject applicants or make hiring decisions.
 *
 * Import candidate data supplied directly by the candidate or via authorized channels.
 * This module does not scrape LinkedIn.
 */

const INTENT_BASELINE = Object.freeze({
  actively_looking: 90,
  open_to_offers: 65,
  not_looking: 10,
});

const KNOWN_CONTRACT_UPGRADES = Object.freeze({
  internship: ['permanent'],
  apprenticeship: ['permanent'],
  temporary: ['permanent'],
  fixed_term: ['permanent'],
});

const FIELDS = Object.freeze({
  role: 20,
  skills: 30,
  experience: 20,
  location: 15,
  language: 10,
  desiredPay: 5,
});

function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/\s+/g, ' ')
    .trim();
}

function setOf(items) {
  return new Set((Array.isArray(items) ? items : []).map(norm).filter(Boolean));
}

function dateAgeDays(dateString, asOf) {
  if (!dateString) return null;
  const date = new Date(`${dateString}T00:00:00Z`);
  const today = new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(today.getTime())) return null;
  return Math.floor((today - date) / 86_400_000);
}

function bounded(number) {
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function assessMobility(candidate, asOf) {
  const declared = candidate?.intent ?? {};
  const status = declared.status ?? 'unknown';
  let score = INTENT_BASELINE[status] ?? null;
  let source = score === null ? null : (declared.source ?? 'unspecified');
  const evidence = [];

  if (score !== null) {
    evidence.push(`Declared job-search intent: ${status}`);
  } else if (candidate?.linkedinOpenToWork === true) {
    score = 55;
    source = 'linkedin_profile';
    evidence.push('Open-to-work indicator reported from profile; intent not confirmed directly');
  }

  // A direct conversation overrides older passive profile indicators.
  if (declared.lastResponse === 'positive') {
    score = Math.max(score ?? 0, 85);
    source = 'candidate_response';
    evidence.push('Candidate responded positively to a job discussion');
  } else if (declared.lastResponse === 'negative') {
    score = 5;
    source = 'candidate_response';
    evidence.push('Candidate declined a job discussion');
  }

  const age = dateAgeDays(declared.recordedAt, asOf);
  let confidence = 'none';
  if (score !== null) {
    if (source === 'candidate_response' || source === 'candidate_self_report') {
      confidence = age === null || age > 180 ? 'medium' : 'high';
    } else {
      confidence = 'low';
    }
  }

  return {
    readinessScore: score === null ? null : bounded(score),
    confidence,
    evidence,
    isStatisticalProbability: false,
    questions: score === null || confidence === 'low'
      ? ['Are you open to exploring another position in public transportation?']
      : [],
  };
}

const MONTH_INDEX = Object.freeze({
  jan: 0, feb: 1, fev: 1, mar: 2, apr: 3, avr: 3, may: 4, mai: 4,
  jun: 5, jui: 6, jul: 6, aug: 7, aou: 7, sep: 8, oct: 9, nov: 10, dec: 11,
});

function parseMonthYear(input) {
  const normalized = norm(input).replace(/\./g, '');
  const match = normalized.match(/\b([a-z]{3,12})\s+(\d{4})\b/);
  if (match && MONTH_INDEX[match[1].slice(0, 3)] !== undefined) {
    const month = match[1].startsWith('juin') ? 5
      : match[1].startsWith('juil') ? 6 : MONTH_INDEX[match[1].slice(0, 3)];
    return { year: +match[2], month };
  }
  const year = normalized.match(/\b((?:19|20)\d{2})\b/);
  return year ? { year: +year[1], month: 0 } : null;
}

function yearMonth(value) { return value ? value.year * 12 + value.month : null; }

function parseRolePeriod(period, now) {
  const range = String(period || '').split(/\s+[-–—]\s+/);
  const start = parseMonthYear(range[0]);
  const endText = (range[1] || '').split(/[·|]/)[0].trim();
  const active = /\b(present|current|aujourd'hui|aujourd hui|en poste|maintenant)\b/i.test(endText);
  const end = active ? now : parseMonthYear(endText);
  return { start, end, active };
}

function contractFromRole(role) {
  const text = norm([role.company, role.contractType].filter(Boolean).join(' '));
  if (/\b(interim|temporary|temporaire|cdd|fixed.term|contract|freelance|mission)\b/.test(text)) return 'temporary';
  if (/\b(apprenticeship|alternance|stage|internship|apprentissage)\b/.test(text)) return 'training';
  if (/\b(cdi|permanent|indefinite|indetermine)\b/.test(text)) return 'permanent';
  return 'unknown';
}

/**
 * Explainable heuristic from EMPLOYMENT EVENTS, not intention or demographic proxies.
 * A 0–100 index expresses observed employment mobility signals; it is NOT a
 * statistically calibrated probability of accepting an offer or resigning.
 */
export function assessCareerMobility(profile, asOf = new Date().toISOString().slice(0, 10)) {
  const jobs = (Array.isArray(profile?.experience) ? profile.experience : [])
    .filter((entry) => entry && (entry.title || entry.company));
  if (!jobs.length) {
    return { readinessScore: null, confidence: 'none', evidence: [],
      summary: 'No work history captured', isStatisticalProbability: false };
  }
  const nowDate = new Date(`${asOf}T00:00:00Z`);
  const now = Number.isNaN(nowDate.getTime())
    ? { year: 2026, month: 10 }
    : { year: nowDate.getUTCFullYear(), month: nowDate.getUTCMonth() };
  const latest = jobs[0];
  const period = parseRolePeriod(latest.period, now);
  const contract = contractFromRole(latest);
  const evidence = [];
  let score = 48;
  const knownPeriod = Boolean(period.start && period.end);
  const elapsed = knownPeriod ? Math.max(0, yearMonth(period.end) - yearMonth(period.start)) : null;

  if (period.active) {
    if (contract === 'temporary') { score += 16; evidence.push('Latest role reports a temporary or fixed-term contract'); }
    else if (contract === 'training') { score += 12; evidence.push('Latest role reports an apprenticeship or internship'); }
    else if (contract === 'permanent') { score -= 13; evidence.push('Latest role reports a permanent contract'); }
    else evidence.push('Latest role shown as ongoing; contract type unspecified');
  } else if (period.end && yearMonth(period.end) <= yearMonth(now)) {
    const monthsSince = yearMonth(now) - yearMonth(period.end);
    if (monthsSince <= 3) score += 25;
    else if (monthsSince <= 12) score += 15;
    else score += 6;
    evidence.push(`Latest listed role ended ${monthsSince} month(s) ago; current employment unconfirmed`);
  } else if (contract === 'temporary') {
    score += 10;
    evidence.push('Latest role reports a temporary or fixed-term contract');
  }

  if (elapsed !== null) {
    if (elapsed < 10) { score += 7; evidence.push('Short tenure in latest listed role'); }
    else if (elapsed >= 36 && period.active) { score -= 7; evidence.push('Long tenure in current listed role'); }
  }

  const startsInLast36Months = jobs.slice(1).filter((job) => {
    const start = parseRolePeriod(job.period, now).start;
    return start && yearMonth(now) - yearMonth(start) >= 0
      && yearMonth(now) - yearMonth(start) <= 36;
  }).length;
  if (startsInLast36Months >= 2) {
    score += Math.min(16, startsInLast36Months * 5);
    evidence.push(`${startsInLast36Months} other roles started within the last 3 years`);
  } else if (startsInLast36Months === 1) {
    score += 4;
    evidence.push('One other role started within the last 3 years');
  }

  const availableFields = Number(knownPeriod) + Number(contract !== 'unknown') + Number(jobs.length >= 2);
  const confidence = availableFields >= 3 ? 'medium' : availableFields >= 1 ? 'low' : 'very low';
  return {
    readinessScore: bounded(score), confidence, evidence,
    summary: evidence[0] || 'Limited work-history evidence',
    signalCount: availableFields,
    isStatisticalProbability: false,
    explanation: 'Career mobility signal only; candidate willingness must be confirmed in conversation.',
  };
}

function evidenceCriterion(name, weight, ratio, evidence, unknown) {
  return { name, weight, ratio, evidence, unknown };
}

function assessJobFit(candidate, vacancy) {
  const profile = candidate?.profile ?? {};
  const preferences = candidate?.preferences ?? {};
  const signals = [];
  const questions = [];
  const blockers = [];
  const criteria = [];

  const heldLicenses = setOf(profile.licenses);
  const missingLicenses = setOf(profile.verifiedNotHeldLicenses);
  const heldCerts = setOf(profile.certifications);
  const missingCerts = setOf(profile.verifiedNotHeldCertifications);

  for (const [kind, required, held, verifiedAbsent] of [
    ['license', vacancy.requiredLicenses ?? [], heldLicenses, missingLicenses],
    ['certificate', vacancy.requiredCertifications ?? [], heldCerts, missingCerts],
  ]) {
    for (const item of required) {
      if (held.has(norm(item))) {
        signals.push(`Documented ${kind}: ${item}`);
      } else if (verifiedAbsent.has(norm(item))) {
        blockers.push(`Verified missing ${kind}: ${item}`);
      } else {
        questions.push(`Verify required ${kind}: ${item}`);
      }
    }
  }

  const targetRoles = setOf(preferences.targetRoleFamilies);
  const priorRoles = (profile.roleExperience ?? []).filter(
    (entry) => norm(entry.roleFamily) === norm(vacancy.roleFamily),
  );
  const roleEvidence = targetRoles.has(norm(vacancy.roleFamily)) || priorRoles.length > 0;
  criteria.push(evidenceCriterion(
    'role', FIELDS.role,
    targetRoles.size || (profile.roleExperience ?? []).length ? Number(roleEvidence) : null,
    roleEvidence ? 'Target role or relevant work history documented' : 'Role preference / work history not matched',
    'Ask which public-transport roles the candidate would accept',
  ));

  const requiredSkills = setOf(vacancy.requiredSkills);
  const candidateSkills = setOf(profile.skills);
  const preferredSkills = setOf(vacancy.preferredSkills);
  const skillPool = requiredSkills.size ? requiredSkills : preferredSkills;
  criteria.push(evidenceCriterion(
    'skills', FIELDS.skills,
    skillPool.size && candidateSkills.size
      ? [...skillPool].filter((item) => candidateSkills.has(item)).length / skillPool.size
      : null,
    skillPool.size ? 'Evidence coverage for skills listed in vacancy' : 'Vacancy has no stated skill requirements',
    'Confirm technical skills against vacancy requirements',
  ));

  const minimumYears = Number.isFinite(vacancy.minYearsExperience)
    ? Math.max(0, vacancy.minYearsExperience)
    : null;
  const knownRoleYears = priorRoles.length
    ? priorRoles.reduce((total, entry) => total + Math.max(0, Number(entry.years) || 0), 0)
    : null;
  criteria.push(evidenceCriterion(
    'experience', FIELDS.experience,
    minimumYears === null || knownRoleYears === null
      ? null
      : minimumYears === 0 ? 1 : Math.min(1, knownRoleYears / minimumYears),
    minimumYears === null ? 'Vacancy does not state experience threshold' : `${knownRoleYears ?? 'Unknown'} evidenced years / ${minimumYears} requested`,
    'Confirm relevant experience duration',
  ));

  const preferredCities = setOf(preferences.targetCities);
  criteria.push(evidenceCriterion(
    'location', FIELDS.location,
    preferredCities.size && vacancy.city ? Number(preferredCities.has(norm(vacancy.city))) : null,
    preferredCities.size ? 'Compared stated city preferences' : 'Candidate location preference unknown',
    `Would you work in ${vacancy.city || 'the offered city'}?`,
  ));

  const requiredLanguages = setOf(vacancy.requiredLanguages);
  const candidateLanguages = setOf(profile.languages);
  criteria.push(evidenceCriterion(
    'language', FIELDS.language,
    requiredLanguages.size && candidateLanguages.size
      ? [...requiredLanguages].filter((item) => candidateLanguages.has(item)).length / requiredLanguages.size
      : null,
    requiredLanguages.size ? 'Compared stated language evidence' : 'Vacancy has no stated language requirements',
    'Confirm working-language ability',
  ));

  const desiredPay = preferences.minGrossMonthlyEur;
  const offerPay = vacancy.grossMonthlyEurMin;
  criteria.push(evidenceCriterion(
    'desiredPay', FIELDS.desiredPay,
    Number.isFinite(desiredPay) && Number.isFinite(offerPay)
      ? Number(offerPay >= desiredPay) : null,
    'Compares documented gross monthly EUR salary minimum with stated target',
    'Ask desired minimum gross monthly salary and verify vacancy pay',
  ));

  let evidenceWeight = 0;
  let weightedScore = 0;
  for (const item of criteria) {
    if (item.ratio === null) {
      questions.push(item.unknown);
    } else {
      evidenceWeight += item.weight;
      weightedScore += item.ratio * item.weight;
    }
  }
  const evidenceCoverage = evidenceWeight / 100;
  // Below 50% coverage, a percentage would look more precise than the evidence.
  const fitScore = evidenceCoverage >= 0.5 ? bounded(weightedScore / evidenceCoverage) : null;
  const eligibility = blockers.length
    ? 'blocked_by_verified_requirement'
    : questions.some((question) => question.startsWith('Verify required'))
      ? 'needs_qualification_verification'
      : 'no_documented_hard_blocker';
  const confidence = evidenceCoverage >= 0.85 ? 'high' : evidenceCoverage >= 0.65 ? 'medium' : 'low';

  return {
    fitScore,
    fitConfidence: confidence,
    evidenceCoverage: Math.round(evidenceCoverage * 100),
    eligibility,
    verifiedBlockers: blockers,
    criteria: criteria.map(({ name, weight, ratio, evidence }) => ({
      name, weight, documentedMatch: ratio === null ? null : bounded(ratio * 100), evidence,
    })),
    evidence: signals,
    questions: [...new Set(questions)],
  };
}

function assessImprovement(candidate, vacancy) {
  const current = candidate?.currentJob ?? {};
  const demonstrated = [];
  const unverified = [];

  const currentPay = current.grossMonthlyEur;
  const offeredMinimum = vacancy.grossMonthlyEurMin;
  if (Number.isFinite(currentPay) && currentPay > 0 && Number.isFinite(offeredMinimum)) {
    if (offeredMinimum > currentPay) {
      const improvement = Math.round(((offeredMinimum / currentPay) - 1) * 100);
      demonstrated.push(`Posted minimum pay is ${improvement}% above stated current gross monthly pay`);
    } else {
      unverified.push('Posted salary floor does not establish a pay improvement');
    }
  } else {
    unverified.push('Salary improvement unknown: current pay or vacancy minimum unavailable');
  }

  const currentContract = norm(current.contractType);
  const targetContract = norm(vacancy.contractType);
  if ((KNOWN_CONTRACT_UPGRADES[currentContract] ?? []).includes(targetContract)) {
    demonstrated.push(`Contract stability improves from ${currentContract} to ${targetContract}`);
  } else {
    unverified.push('No evidenced contract upgrade');
  }

  unverified.push('Career development, shifts and commute require candidate confirmation');

  return {
    verifiedImprovement: demonstrated.length > 0,
    demonstrated,
    unverified,
    // The candidate, not the system, decides whether an opportunity is better overall.
    candidateConfirmedBetter: candidate?.confirmedBetterVacancyIds?.includes(vacancy.id) === true,
  };
}

export function scoreCandidateForTransit(candidate, vacancies, { asOf = '2026-11-05' } = {}) {
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id.trim()) {
    throw new TypeError('candidate.id must be a non-empty string');
  }
  if (!Array.isArray(vacancies)) throw new TypeError('vacancies must be an array');

  const mobility = assessMobility(candidate, asOf);
  const opportunities = vacancies.map((vacancy) => {
    if (!vacancy?.id || !vacancy?.roleFamily) {
      throw new TypeError('Each vacancy needs id and roleFamily');
    }
    const fit = assessJobFit(candidate, vacancy);
    const improvement = assessImprovement(candidate, vacancy);
    return {
      vacancyId: vacancy.id,
      employer: vacancy.employer ?? null,
      roleFamily: vacancy.roleFamily,
      city: vacancy.city ?? null,
      sourceUrl: vacancy.sourceUrl ?? null,
      vacancyStatus: vacancy.status ?? 'unverified',
      ...fit,
      improvement,
      recruiterReviewEligible: vacancy.status === 'open'
        && fit.eligibility !== 'blocked_by_verified_requirement',
    };
  });

  const candidateOpportunities = opportunities
    .filter((item) => item.recruiterReviewEligible && item.fitScore !== null)
    .sort((a, b) => b.fitScore - a.fitScore);

  return {
    candidateId: candidate.id,
    mobility,
    bestOpportunity: candidateOpportunities[0] ?? null,
    opportunities,
    jobChangeProbability: null,
    offerProbability: null,
    probabilitiesStatus: 'not_calibrated_from_real_outcomes',
    decision: 'human_review_required',
    caveat: 'Documented fit is not an estimate of receiving an offer. Readiness is not a resignation probability.',
  };
}

/**
 * Compact, exploratory sector-relevance indicator used when there is no
 * vacancy feed. It measures evidence of transferable public-transport work,
 * NOT eligibility, selection quality or probability of an offer.
 */
export function assessTransitRoleRelevance(profile) {
  const jobs = Array.isArray(profile?.experience) ? profile.experience : [];
  const relevant = jobs.filter((job) => [
    'bus_driver', 'tram_operator', 'heavy_vehicle_mechanic',
    'fleet_maintenance', 'embedded_ticketing_technician',
  ].includes(job.roleFamily));
  if (!relevant.length) {
    return { score: null, confidence: 'none', evidence: 'No relevant transport role established from the visible history' };
  }
  const currentRelevant = relevant.some((job) => jobs.indexOf(job) === 0);
  const current = relevant[0];
  const durationText = String(current.period || '');
  const years = Number(/(\d+(?:\.\d+)?)\s*(?:yrs|years|ans|an\b)/i.exec(durationText)?.[1] ?? 0);
  const months = Number(/(\d+(?:\.\d+)?)\s*(?:mos|months|mois)/i.exec(durationText)?.[1] ?? 0);
  const knownDuration = years > 0 || months > 0;
  const experienceYears = years + months / 12;
  const score = Math.min(95, 60
    + (currentRelevant ? 20 : 0)
    + (knownDuration && experienceYears >= 2 ? 10 : 0)
    + (relevant.length > 1 ? 5 : 0));
  return {
    score,
    confidence: knownDuration ? 'medium' : 'low',
    evidence: `${relevant.length} transferable role(s) found in the visible experience`,
    isHiringProbability: false,
  };
}
