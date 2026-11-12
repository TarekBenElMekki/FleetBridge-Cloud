'use strict';
// Fictitious demonstration records only. No imports from Desktop, Chrome or disk.
const candidates = Object.freeze([
  {url:'https://www.linkedin.com/in/fleetbridge-demo-profile-001',title:'Camille Laurent — Heavy-vehicle technician',profileImport:{name:'Camille Laurent',headline:'Heavy-vehicle maintenance technician · fictional example',location:'Annecy, France',importedAt:'2026-11-01T09:00:00Z'},status:'shortlisted',age:38,experienceMetrics:{totalYears:11},profileCapture:{roles:[{company:'Example Workshop A',title:'Mechanic',location:'Grenoble',startDate:'2015-01',endDate:'2020-06'},{company:'Example Fleet B',title:'Technician',location:'Annecy',startDate:'2020-07',endDate:'present'}]},notes:'SYNTHETIC — not a real person.'},
  {url:'https://www.linkedin.com/in/fleetbridge-demo-profile-002',title:'Alex Martin — Embedded-systems engineer',profileImport:{name:'Alex Martin',headline:'Transport electronics · fictional example',location:'Grenoble, France',importedAt:'2026-11-02T09:00:00Z'},status:'reviewing',age:33,experienceMetrics:{totalYears:6.5},notes:'SYNTHETIC — not a real person.'},
  {url:'https://www.linkedin.com/in/fleetbridge-demo-profile-003',title:'Noor Haddad — Maintenance specialist',profileImport:{name:'Noor Haddad',headline:'Industrial maintenance · fictional example',location:'Lyon, France',importedAt:'2026-11-03T09:00:00Z'},status:'contacted',notes:'SYNTHETIC — not a real person.'},
  {url:'https://www.linkedin.com/in/fleetbridge-demo-profile-004',title:'Morgan Dubois — Equipment technician',profileImport:{name:'Morgan Dubois',headline:'Fleet equipment · fictional example',location:'Nantes, France',importedAt:'2026-11-04T09:00:00Z'},status:'new',notes:'SYNTHETIC — not a real person.'},
  {url:'https://www.linkedin.com/in/fleetbridge-demo-profile-005',title:'Sam Ben Salem — Heavy-vehicle technician',profileImport:{name:'Sam Ben Salem',headline:'Heavy-vehicle technician · fictional example',location:'Tunis, Tunisia',importedAt:'2026-11-05T09:00:00Z'},status:'interview',notes:'SYNTHETIC — not a real person.'}
]);
const contracts = Object.freeze([
  {id:'demo-contract-1',candidateName:'Camille Laurent',candidateUrl:candidates[0].url,role:'Heavy-vehicle technician',entity:'RS Univers Industrie',clientCompany:'Fictional Transport Depot',contractType:'subcontracting',status:'active',startDate:'2026-10-20',initialEndDate:'2026-12-20',renewal:'not_requested',renewalEndDate:'',hireDecision:'pending',notes:'SYNTHETIC example.'},
  {id:'demo-contract-2',candidateName:'Alex Martin',candidateUrl:candidates[1].url,role:'Transport electronics specialist',entity:'RS Univers Consulting',clientCompany:'Fictional Bus Operator',contractType:'subcontracting',status:'active',startDate:'2026-09-01',initialEndDate:'2026-11-01',renewal:'confirmed',renewalEndDate:'2027-01-01',hireDecision:'yes',notes:'SYNTHETIC example; hiring intention only.'},
  {id:'demo-contract-3',candidateName:'Noor Haddad',candidateUrl:candidates[2].url,role:'Industrial technician',entity:'Mantingo',clientCompany:'Fictional Fleet Group',contractType:'subcontracting',status:'active',startDate:'2026-08-10',initialEndDate:'2026-10-10',renewal:'declined',renewalEndDate:'',hireDecision:'no',notes:'SYNTHETIC example.'}
]);
const send = (req,res,payload,code=200) => {
  res.statusCode=code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.end(JSON.stringify(payload));
};
const readOnly = (req,res,payload) => req.method==='GET' ? send(req,res,payload) : send(req,res,{error:'Synthetic preview is read-only; no data was saved.'},405);
module.exports={candidates,contracts,send,readOnly};
