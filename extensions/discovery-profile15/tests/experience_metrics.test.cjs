const test=require('node:test');
const assert=require('node:assert/strict');
const {summarize}=require('../experience_metrics.js');
const FB=require('../core.js');

const reference=new Date(2026,10,3);

test('French LinkedIn month abbreviations calculate inclusive job duration and employer',()=>{
  const result=summarize('Mécanicien poids lourds\nMOUZILLON POIDS LOURDS\nmars 2016 - avr. 2016 · 2 mois',reference);
  assert.equal(result.datedRoles,1);
  assert.equal(result.totalMonths,2);
  assert.equal(result.totalYears,0.2);
  assert.equal(result.latestCompany,'MOUZILLON POIDS LOURDS');
  assert.equal(result.latestDuration,'2 mos');
  assert.equal(result.estimated,false);
});

test('English current role and older French role: latest company and duration are separate from total',()=>{
  const experience=[
    'Maintenance technician','RATP','Jan 2022 - Present · Full-time',
    'Mécanicien poids lourds','Renault Trucks','janv. 2018 - déc. 2020'
  ].join('\n');
  const result=summarize(experience,reference);
  assert.equal(result.totalMonths,95);
  assert.equal(result.totalDuration,'7 yrs 11 mos');
  assert.equal(result.latestCompany,'RATP');
  assert.equal(result.latestDuration,'4 yrs 11 mos');
  assert.equal(result.latestYears,4.9);
});

test('Overlapping employment periods are counted once in total experience',()=>{
  const result=summarize([
    'Mechanic','Company A','janvier 2020 - décembre 2022',
    'Maintenance','Company B','janv. 2022 - décembre 2024'
  ].join('\n'),reference);
  assert.equal(result.totalMonths,60);
  assert.equal(result.totalYears,5);
  assert.equal(result.latestCompany,'Company B');
  assert.equal(result.latestMonths,36);
});

test('Year-only ranges are flagged approximate and roles without dates remain unknown',()=>{
  const estimate=summarize('Mécanicien\nToyota\n2019 - 2021',reference);
  assert.equal(estimate.estimated,true);
  assert.equal(estimate.totalMonths,36);
  const missing=summarize('Mécanicien\nToyota\nDiagnostic des moteurs',reference);
  assert.equal(missing.totalMonths,null);
  assert.equal(missing.latestCompany,'');
  assert.equal(missing.latestYears,null);
});

test('CSV derives metrics for old profile imports without altering original row',()=>{
  const row={...FB.newRecord('https://linkedin.com/in/candidate'),profileImport:{name:'Marie Dupont',
    experience:'Mécanicienne\nRenault Trucks\nmars 2016 - avr. 2016',importedAt:'2026-11-01'}};
  const csv=FB.toCsv([row]);
  assert.match(csv,/"Renault Trucks"/);
  assert.match(csv,/"2 mos"/);
  assert.equal(row.profileImport.experienceSummary,undefined);
});
