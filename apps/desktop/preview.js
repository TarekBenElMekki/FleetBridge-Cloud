'use strict';

/* Standalone V2 interface review. Never opens or copies the live FleetBridge DB. */
const path = require('node:path');
const {makeServer} = require('./server');
const {createStore} = require('./store');

const port = 18747;
const previewDirectory = path.join(process.env.LOCALAPPDATA || __dirname, 'FleetBridgeV24PreviewData');
const store = createStore(previewDirectory);

const demoPeople = [
  {url: 'https://www.linkedin.com/in/fleetbridge-preview-demo-001', title: 'Camille Laurent — Heavy vehicle maintenance technician',
    profileImport: {name: 'Camille Laurent', headline: 'Heavy vehicle maintenance technician · demo record', location: 'Annecy, France', importedAt: '2026-11-01T09:00:00Z'},
    status: 'shortlisted', age: 38, experienceMetrics: {totalYears: 11}, profileCapture: {roles: [{company:'Sample Workshop A', title:'Heavy vehicle mechanic', location:'Grenoble', startDate:'2015-01',endDate:'2020-06'}, {company:'Sample Fleet B', title:'Fleet technician', location:'Annecy', startDate:'2020-07',endDate:'present'}]}, notes: 'Demonstration record — not a real candidate.'},
  {url: 'https://www.linkedin.com/in/fleetbridge-preview-demo-002', title: 'Alex Martin — Embedded systems engineer',
    profileImport: {name: 'Alex Martin', headline: 'Embedded systems and transport electronics · demo record', location: 'Grenoble, France', importedAt: '2026-11-02T09:00:00Z'},
    status: 'reviewing', age: 33, experienceMetrics: {totalYears: 6.5}, profileCapture: {roles: [{company:'Sample Electronics C', title:'Embedded systems technician', location:'Lyon', startDate:'2019-01',endDate:'2022-06'}, {company:'Sample Employer D', title:'Technical specialist', location:'Grenoble', startDate:'2022-07',endDate:'present'}]}, notes: 'Demonstration record — not a real candidate.'},
  {url: 'https://www.linkedin.com/in/fleetbridge-preview-demo-003', title: 'Noor Haddad — Industrial maintenance specialist',
    profileImport: {name: 'Noor Haddad', headline: 'Industrial maintenance specialist · demo record', location: 'Lyon, France', importedAt: '2026-11-03T09:00:00Z'},
    status: 'contacted', notes: 'Demonstration record — not a real candidate.'},
  {url: 'https://www.linkedin.com/in/fleetbridge-preview-demo-004', title: 'Morgan Dubois — Transport equipment technician',
    profileImport: {name: 'Morgan Dubois', headline: 'Transport equipment technician · demo record', location: 'Nantes, France', importedAt: '2026-11-04T09:00:00Z'},
    status: 'new', notes: 'Demonstration record — not a real candidate.'},
  {url: 'https://www.linkedin.com/in/fleetbridge-preview-demo-005', title: 'Sam Ben Salem — Heavy vehicle technician',
    profileImport: {name: 'Sam Ben Salem', headline: 'Heavy vehicle technician · demo record', location: 'Tunis, Tunisia', importedAt: '2026-11-05T09:00:00Z'},
    status: 'interview', notes: 'Demonstration record — not a real candidate.'}
];

if (store.allCandidates().length === 0) store.upsertCandidates(demoPeople);

// Demonstration assignments appear only on a new, isolated V2.4 database.
// Their dates are relative to first launch and are never copied from V1.
if (store.allContracts().length === 0) {
  const day = delta => { const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate()+delta); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); };
  const examples = [
    {candidateName:'Camille Laurent',candidateUrl:demoPeople[0].url,role:'Heavy vehicle technician',entity:'RS Univers Industrie',clientCompany:'Example Transport Depot (demo)',contractType:'subcontracting',status:'active',startDate:day(-25),initialEndDate:day(9),renewal:'not_requested',renewalEndDate:'',hireDecision:'pending',notes:'DEMONSTRATION ONLY — client decision not recorded.'},
    {candidateName:'Alex Martin',candidateUrl:demoPeople[1].url,role:'Embedded systems specialist',entity:'RS Univers Consulting',clientCompany:'Sample Bus Operator (demo)',contractType:'subcontracting',status:'active',startDate:day(-70),initialEndDate:day(-6),renewal:'confirmed',renewalEndDate:day(45),hireDecision:'yes',notes:'DEMONSTRATION ONLY — illustrative hiring intention, not a real client confirmation.'},
    {candidateName:'Noor Haddad',candidateUrl:demoPeople[2].url,role:'Industrial fleet technician',entity:'Mantingo',clientCompany:'Sample Fleet Group (demo)',contractType:'subcontracting',status:'active',startDate:day(-55),initialEndDate:day(-2),renewal:'declined',renewalEndDate:'',hireDecision:'no',notes:'DEMONSTRATION ONLY — illustrative no-hire decision.'}
  ];
  for (const example of examples) store.saveContract(example);
}

const app = makeServer({port, store, pinAuth:true, pin:process.env.FLEETBRIDGE_V2_PIN || '1234'});
app.listen().then(() => {
  process.stdout.write('\nFLEETBRIDGE V2.4 — PIN-PROTECTED ISOLATED PREVIEW\n');
  process.stdout.write('Open http://127.0.0.1:' + port + '/login in your normal browser.\n');
  process.stdout.write('Map: http://127.0.0.1:' + port + '/#/map\n');
  process.stdout.write('Data: ' + previewDirectory + ' (synthetic demonstration records only).\n');
  process.stdout.write('The live FleetBridge server on port 17842 and Chrome stay untouched.\n');
  process.stdout.write('Press Ctrl+C to stop the V2 preview.\n\n');
}).catch(error => {
  console.error('Preview could not start:', error.message);
  store.close();
  process.exitCode = 1;
});
