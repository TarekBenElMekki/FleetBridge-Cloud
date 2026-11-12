const test=require('node:test');
const assert=require('node:assert/strict');
const FB=require('../core.js');

test('deduplicates LinkedIn profile variants while rejecting other sites',()=>{
  assert.equal(FB.canonicalUrl('https://www.linkedin.com/in/JOHN-DOE/?utm_source=google'),'https://linkedin.com/in/john-doe');
  assert.equal(FB.canonicalUrl('https://fr.linkedin.com/in/JOHN-DOE/'),'https://linkedin.com/in/john-doe');
  assert.equal(FB.canonicalUrl('https://www.google.com/url?q=https%3A%2F%2Fwww.linkedin.com%2Fin%2FJOHN-DOE'), 'https://linkedin.com/in/john-doe');
  assert.equal(FB.canonicalUrl('https://linkedin.com/company/company-name'),'');
  assert.equal(FB.canonicalUrl('https://example.com/in/john'),'');
});
test('Google recapture preserves existing recruiter information and profile import',()=>{
  const original={...FB.newRecord('https://linkedin.com/in/driver','Old title','Old snippet','mechanic'),
    notes:'Recruiter note',status:'contacted',aiScore:83,profileImport:{name:'Jane Doe',importedAt:'2026-01-01'}};
  const newer=FB.mergeDiscovery(original,{url:'https://www.linkedin.com/in/driver',title:'New role',snippet:'New summary'},'heavy mechanic');
  assert.equal(newer.profileImport.name,'Jane Doe');assert.equal(newer.notes,'Recruiter note');
  assert.equal(newer.status,'contacted');assert.equal(newer.aiScore,83);
  assert.deepEqual(newer.sourceQueries,['mechanic','heavy mechanic']);
});
test('four-field review keeps legacy data and redacts sensitive contact values',()=>{
  const original=FB.newRecord('https://linkedin.com/in/mecano','Mechanic','Diesel engine technician');
  original.profileImport={about:'Older professional summary',importedAt:'2026-01-01'};
  const result=FB.mergeReview(original,original.url,{name:'Marie Dupont',headline:'Mécanicienne poids lourds',
    experience:'Mécanicienne\nRenault Trucks\nmars 2016 - avr. 2016\ncontact: mary@work.org and +33 6 12 34 56 78'},'explicit_visible_page_click');
  assert.equal(result.snippet,original.snippet);assert.equal(result.profileImport.name,'Marie Dupont');
  assert.equal(result.profileImport.about,'Older professional summary','legacy fields remain in database without being captured again');
  assert.match(result.profileImport.experience,/\[email removed\]/);
  assert.match(result.profileImport.experience,/\[phone removed\]/);
  assert.equal(result.profileImport.experienceSummary.totalMonths,2);
  assert.equal(result.profileImport.experienceSummary.latestCompany,'Renault Trucks');
  assert.equal(result.profileImport.sourceMethod,'explicit_visible_page_click');
  assert.deepEqual(FB.FIELDS,['name','headline','location','experience']);
});
test('queue excludes enriched and rejected profiles',()=>{
  const a=FB.newRecord('https://linkedin.com/in/a');
  const b={...FB.newRecord('https://linkedin.com/in/b'),profileImport:{importedAt:'2026-01-01'}};
  const c={...FB.newRecord('https://linkedin.com/in/c'),status:'rejected'};
  assert.deepEqual(FB.pending([a,b,c]),[a.url]);
});
test('CSV header includes all fields, quotes commas and neutralizes spreadsheet formulas',()=>{
  const row=FB.newRecord('https://linkedin.com/in/mecano','A, B','=HYPERLINK("bad")');
  const csv=FB.toCsv([row]);
  assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/"A, B"/);
  assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);
  assert.match(csv,/"profileImport\.experience"/);
  assert.match(csv,/"profileImport\.experienceSummary\.totalYears"/);
  assert.doesNotMatch(csv,/"profileImport\.education"/);
});
