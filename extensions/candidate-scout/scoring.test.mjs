import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCareerMobility, assessMobility, assessTransitRoleRelevance, scoreCandidateForTransit } from './scoring.mjs';

const vacancy = {
  id: 'vacancy-bus-01',
  employer: 'Example Urban Mobility (fictional)',
  roleFamily: 'bus_driver',
  city: 'Lille',
  requiredSkills: ['passenger_safety', 'customer_service'],
  requiredLicenses: ['Permis D'],
  requiredCertifications: ['FIMO Voyageurs'],
  requiredLanguages: ['French'],
  minYearsExperience: 2,
  grossMonthlyEurMin: 2650,
  contractType: 'permanent',
  sourceUrl: 'https://example.org/jobs/bus-01',
  status: 'open',
};

const candidate = {
  id: 'example-001',
  // All personal details are fictional. No sensitive characteristics are scored.
  intent: {
    status: 'open_to_offers',
    source: 'candidate_self_report',
    recordedAt: '2026-11-03',
  },
  currentJob: { roleFamily: 'bus_driver', contractType: 'fixed_term', grossMonthlyEur: 2300 },
  profile: {
    skills: ['passenger_safety', 'customer_service'],
    licenses: ['Permis D'],
    certifications: ['FIMO Voyageurs'],
    languages: ['French'],
    roleExperience: [{ roleFamily: 'bus_driver', years: 5 }],
  },
  preferences: {
    targetRoleFamilies: ['bus_driver'],
    targetCities: ['Lille'],
    minGrossMonthlyEur: 2500,
  },
};

test('Unknown intent remains unknown; not a fabricated job-change probability', () => {
  const result = assessMobility({ id: 'x' }, '2026-11-05');
  assert.equal(result.readinessScore, null);
  assert.equal(result.confidence, 'none');
});

test('Strong documented fit and genuine pay/contract improvement are recognized', () => {
  const result = scoreCandidateForTransit(candidate, [vacancy]);
  assert.equal(result.mobility.readinessScore, 65);
  assert.equal(result.mobility.confidence, 'high');
  assert.equal(result.opportunities[0].fitScore, 100);
  assert.equal(result.opportunities[0].eligibility, 'no_documented_hard_blocker');
  assert.equal(result.opportunities[0].improvement.verifiedImprovement, true);
  assert.equal(result.jobChangeProbability, null);
  assert.equal(result.offerProbability, null);
});

test('A missing license in a sparse profile means verify, not reject', () => {
  const partlyKnown = structuredClone(candidate);
  partlyKnown.profile.licenses = [];
  const result = scoreCandidateForTransit(partlyKnown, [vacancy]);
  assert.equal(result.opportunities[0].eligibility, 'needs_qualification_verification');
  assert.ok(result.opportunities[0].questions.some((text) => text.includes('Permis D')));
});

test('A confirmed absent required license is a verified blocker for that vacancy', () => {
  const unavailableLicense = structuredClone(candidate);
  unavailableLicense.profile.licenses = [];
  unavailableLicense.profile.verifiedNotHeldLicenses = ['Permis D'];
  const result = scoreCandidateForTransit(unavailableLicense, [vacancy]);
  assert.equal(result.opportunities[0].eligibility, 'blocked_by_verified_requirement');
  assert.equal(result.bestOpportunity, null);
});

test('Unverified/closed jobs cannot be recommended as currently open', () => {
  const result = scoreCandidateForTransit(candidate, [{ ...vacancy, status: 'closed' }]);
  assert.equal(result.bestOpportunity, null);
});

test('Sparse evidence cannot produce a confident fit percentage', () => {
  const result = scoreCandidateForTransit({ id: 'sparse' }, [vacancy]);
  assert.equal(result.opportunities[0].fitScore, null);
  assert.equal(result.opportunities[0].fitConfidence, 'low');
});

test('Sensitive/protected properties do not affect scoring', () => {
  const first = scoreCandidateForTransit(candidate, [vacancy]);
  const second = scoreCandidateForTransit({ ...candidate, age: 68, gender: 'undisclosed' }, [vacancy]);
  assert.deepEqual(first, second);
});

test('Transit relevance is possible without an open vacancy, but is not an offer probability', () => {
  const result = assessTransitRoleRelevance({ experience: [
    { roleFamily: 'heavy_vehicle_mechanic', period: 'Jan 2022 - Present · 4 yrs' },
  ] });
  assert.equal(result.score, 90);
  assert.equal(result.isHiringProbability, false);
  assert.equal(assessTransitRoleRelevance({ experience: [{ roleFamily: null }] }).score, null);
});

test('Move readiness is estimated from employment history, without any intent signal', () => {
  const currentPermanent = assessCareerMobility({
    experience: [{ title: 'Mécanicien poids lourds', company: 'Sample · Permanent',
      period: 'Feb 2023 - Present · 3 yrs 9 mos' }],
  }, '2026-11-05');
  const currentTemporary = assessCareerMobility({
    experience: [{ title: 'Mécanicien poids lourds', company: 'Sample · CDD',
      period: 'Feb 2026 - Present · 9 mos' }],
  }, '2026-11-05');
  assert.ok(currentTemporary.readinessScore > currentPermanent.readinessScore);
  assert.equal(currentPermanent.isStatisticalProbability, false);
});

test('Recently ended listed work and frequent role transitions raise the heuristic', () => {
  const ended = assessCareerMobility({ experience: [
    { title: 'Mécanicien', company: 'Renault Trucks · Permanent', period: 'Feb 2024 - Sep 2026 · 2 yrs 8 mos' },
    { title: 'Mécanicien poids lourd', company: 'Workshop', period: 'Mar 2024 - May 2024' },
    { title: 'Technicien', company: 'Service center', period: 'Jan 2023 - Dec 2023' },
  ] }, '2026-11-05');
  assert.ok(ended.readinessScore > 60);
  assert.match(ended.summary, /ended 2 month/);
  assert.ok(ended.evidence.length >= 2);
});

test('Sparse profiles and personal attributes cannot fabricate confidence or affect career estimate', () => {
  assert.equal(assessCareerMobility({ experience: [] }).readinessScore, null);
  const profile = { experience: [{ title: 'Mécanicien', period: 'Jan 2025 - Present' }] };
  assert.deepEqual(assessCareerMobility(profile, '2026-11-05'),
    assessCareerMobility({ ...profile, age: 19, gender: 'female', openToWorkMention: true }, '2026-11-05'));
});

