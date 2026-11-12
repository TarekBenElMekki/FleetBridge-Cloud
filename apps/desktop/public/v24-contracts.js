'use strict';
/* FleetBridge Contracts: local-first, recorded trial dates and hiring intentions.
   No statutory probation lengths or automatic renewals are inferred. */
(() => {
  const $ = id => document.getElementById(id);
  const companies = ['RS Univers Industrie','RS Univers Consulting','Mantingo'];
  const hiring = {pending:'Awaiting decision',yes:'Will hire',no:'Will not hire'};
  const assignmentState = {planned:'Planned',active:'Active',on_hold:'On hold',completed:'Completed',ended:'Ended'};
  let contracts = [];
  let selectedId = '';
  let hasLoaded = false;
  let loading = false;
  const text=(el,tag,value,className)=>{const n=document.createElement(tag);n.textContent=String(value??'');if(className)n.className=className;el.append(n);return n;};
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
  const day=date=>Math.floor(new Date(date+'T00:00:00Z').getTime()/86400000);
  const dateLabel=value=>value?new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'}).format(new Date(value+'T00:00:00Z')):'—';
  function phase(c,ref=today()){
    const delta=day(c.initialEndDate)-day(ref);
    const notStarted=c.startDate>ref;
    return {delta,firstEnded:delta<0,notStarted,soon:delta>=0&&delta<=14&&!notStarted,
      status:notStarted?'Not started':delta<0?'First period ended':delta===0?'Ends today':delta<=14?`${delta}d left`: 'In progress',
      style:notStarted?'neutral':delta<0?'ended':delta<=14?'soon':'normal'};
  }
  function firstEndBadge(c){
    const f=phase(c),span=document.createElement('span');span.className='contract-period '+f.style;
    span.textContent=f.status;return span;
  }
  function clearFormError(){const e=$('contract-form-error');e.hidden=true;e.textContent='';}
  function formError(value){const e=$('contract-form-error');e.hidden=false;e.textContent=value;}
  function fillCandidateOptions(){
    const list=$('contract-candidate-url'),previous=list.value;list.replaceChildren();
    const blank=document.createElement('option');blank.value='';blank.textContent='Manual candidate / no linked profile';list.append(blank);
    for(const c of (window.state?.candidates||state.candidates)){
      const option=document.createElement('option');option.value=c.url;option.textContent=label(c);list.append(option);
    }
    if([...list.options].some(o=>o.value===previous))list.value=previous;
  }
  function refreshDatePreview(){
    const start=$('contract-start').value,first=$('contract-first-end').value,el=$('contract-date-preview');
    if(!start||!first){el.textContent='Enter both trial dates to calculate the first-period checkpoint.';el.dataset.state='neutral';return;}
    if(first<start){el.textContent='First period end cannot precede the start date.';el.dataset.state='ended';return;}
    const v=phase({startDate:start,initialEndDate:first});
    el.textContent=`First period: ${v.status} · ${dateLabel(first)}`;
    el.dataset.state=v.style;
  }
  function toggleRenewal(){
    const confirmed=$('contract-renewal').value==='confirmed';
    $('contract-renewal-end').disabled=!confirmed;
    if(!confirmed)$('contract-renewal-end').value='';
  }
  function open(record){
    close();selectedId=record?.id||'';
    fillCandidateOptions();
    $('contract-form').reset();
    $('contract-id').value=selectedId;
    $('contract-form-heading').textContent=record?'Edit assignment':'New assignment';
    $('contract-candidate-url').value=record?.candidateUrl||'';
    $('contract-candidate-name').value=record?.candidateName||'';
    $('contract-role').value=record?.role||'';
    $('contract-entity').value=record?.entity||'RS Univers Industrie';
    $('contract-client').value=record?.clientCompany||'';
    $('contract-type').value=record?.contractType||'subcontracting';
    $('contract-status').value=record?.status||'active';
    $('contract-start').value=record?.startDate||today();
    $('contract-first-end').value=record?.initialEndDate||'';
    $('contract-renewal').value=record?.renewal||'not_requested';
    toggleRenewal();
    $('contract-renewal-end').value=record?.renewalEndDate||'';
    $('contract-hire').value=record?.hireDecision||'pending';
    $('contract-notes').value=record?.notes||'';
    clearFormError();refreshDatePreview();
    $('contract-inspector').classList.add('open');
    $('contract-inspector').setAttribute('aria-hidden','false');
    $('contract-candidate-name').focus();
  }
  function close(){
    $('contract-inspector').classList.remove('open');
    $('contract-inspector').setAttribute('aria-hidden','true');
    selectedId='';
  }
  function applyFilters(){
    const search=$('contracts-search').value.trim().toLocaleLowerCase();
    const entity=$('contracts-entity').value;
    const probation=$('contracts-probation').value;
    const decision=$('contracts-decision').value;
    const filtered=contracts.filter(c=>{
      const p=phase(c);
      if(entity!=='all'&&c.entity!==entity)return false;
      if(decision!=='all'&&c.hireDecision!==decision)return false;
      if(probation==='soon'&&!p.soon)return false;
      if(probation==='ended'&&!p.firstEnded)return false;
      if(probation==='active'&&(p.firstEnded||p.notStarted))return false;
      if(probation==='upcoming'&&!p.notStarted)return false;
      return !search||[c.candidateName,c.clientCompany,c.role,c.entity].some(x=>String(x||'').toLocaleLowerCase().includes(search));
    });
    $('contracts-reset').hidden=!search&&entity==='all'&&probation==='all'&&decision==='all';
    return filtered.sort((a,b)=>{
      const r=c=>{const p=phase(c);return p.soon?0:p.firstEnded&&c.hireDecision==='pending'?1:p.notStarted?3:2;};
      return r(a)-r(b)||a.initialEndDate.localeCompare(b.initialEndDate)||a.candidateName.localeCompare(b.candidateName);
    });
  }
  function renderOrg(){
    $('nav-contract-count').textContent=String(contracts.length);
    $('org-group-count').textContent=contracts.length+' assignment'+(contracts.length===1?'':'s');
    for(const e of companies){
      const cs=contracts.filter(c=>c.entity===e);
      const ongoing=cs.filter(c=>c.status==='active').length;
      const n=document.querySelector(`[data-count="${e}"]`);
      n.textContent=`${ongoing} active · ${cs.length} total`;
      n.closest('.org-entity').classList.toggle('is-active',$('contracts-entity').value===e);
    }
    $('contract-active-count').textContent=contracts.filter(c=>c.status==='active').length;
    $('contract-due-count').textContent=contracts.filter(c=>phase(c).soon).length;
    $('contract-ended-count').textContent=contracts.filter(c=>phase(c).firstEnded).length;
    $('contract-decision-count').textContent=contracts.filter(c=>c.hireDecision==='pending').length;
    $('contracts-total').textContent=String(contracts.length);
  }
  function render(){
    if(!hasLoaded)return;
    const found=applyFilters();renderOrg();
    $('contracts-visible').textContent=String(found.length);
    $('contracts-footer').textContent=`${found.length} shown · ${contracts.length} assignments`;
    $('contracts-empty').hidden=found.length!==0;
    const body=$('contract-rows');body.replaceChildren();
    for(const c of found){
      const tr=document.createElement('tr');tr.className='contract-record';tr.tabIndex=0;
      if(phase(c).soon&&c.hireDecision==='pending')tr.classList.add('is-due');
      const candidate=document.createElement('td');candidate.title=c.candidateName;
      text(candidate,'strong',c.candidateName,'contract-candidate');
      text(candidate,'small',c.role,'contract-secondary');tr.append(candidate);
      const employer=document.createElement('td');text(employer,'span',c.entity,'contract-company');tr.append(employer);
      const client=document.createElement('td');client.title=c.clientCompany;text(client,'span',c.clientCompany,'contract-client');tr.append(client);
      const probation=document.createElement('td');text(probation,'strong',dateLabel(c.initialEndDate),'contract-date');probation.append(firstEndBadge(c));tr.append(probation);
      const decision=document.createElement('td');const badge=text(decision,'span',hiring[c.hireDecision]||'Awaiting decision','hire-badge '+c.hireDecision);badge.title='Client hiring intention entered by the recruiter';
      text(decision,'small',`${assignmentState[c.status]||c.status}${c.renewal==='confirmed'?` · Renewal until ${dateLabel(c.renewalEndDate)}`:''}`,'contract-secondary');tr.append(decision);
      const action=document.createElement('td');const b=text(action,'button','Edit','contract-edit');b.type='button';b.addEventListener('click',e=>{e.stopPropagation();open(c);});tr.append(action);
      tr.addEventListener('click',()=>open(c));tr.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();open(c);}});
      body.append(tr);
    }
  }
  async function load(){
    if(loading)return;
    loading=true;
    try {const payload=await api('/api/contracts');contracts=payload.records||[];hasLoaded=true;render();}
    catch(error){say('Contracts: '+error.message);}finally{loading=false;}
  }
  async function save(e){
    e.preventDefault();clearFormError();
    const data={
      id:$('contract-id').value||undefined,
      candidateName:$('contract-candidate-name').value,candidateUrl:$('contract-candidate-url').value,
      entity:$('contract-entity').value,clientCompany:$('contract-client').value,role:$('contract-role').value,
      contractType:$('contract-type').value,status:$('contract-status').value,
      startDate:$('contract-start').value,initialEndDate:$('contract-first-end').value,
      renewal:$('contract-renewal').value,renewalEndDate:$('contract-renewal-end').value,
      hireDecision:$('contract-hire').value,notes:$('contract-notes').value
    };
    if(!data.candidateName.trim()||!data.clientCompany.trim()||!data.role.trim()||!data.startDate||!data.initialEndDate){formError('Complete the candidate, role, company, and both first-period dates.');return;}
    const button=$('contract-save');button.disabled=true;button.textContent='Saving…';
    try {await post('/api/contracts',data);close();await load();say('Assignment saved.');}
    catch(error){formError(error.message);}finally{button.disabled=false;button.textContent='Save assignment';}
  }
  // Wire controls without touching Candidate and Atlas event handlers.
  $('new-contract').addEventListener('click',()=>open(null));
  $('close-contract-inspector').addEventListener('click',close);
  $('contract-cancel').addEventListener('click',close);
  $('contract-form').addEventListener('submit',save);
  $('contract-candidate-url').addEventListener('change',()=>{
    const c=state.candidates.find(x=>x.url===$('contract-candidate-url').value);
    if(c)$('contract-candidate-name').value=label(c);
  });
  for(const id of ['contract-start','contract-first-end'])$(id).addEventListener('change',refreshDatePreview);
  $('contract-renewal').addEventListener('change',toggleRenewal);
  for(const id of ['contracts-search','contracts-entity','contracts-probation','contracts-decision'])$(id).addEventListener(id==='contracts-search'?'input':'change',render);
  $('contracts-reset').addEventListener('click',()=>{for(const id of ['contracts-entity','contracts-probation','contracts-decision'])$(id).value='all';$('contracts-search').value='';render();});
  for(const button of document.querySelectorAll('.org-entity'))button.addEventListener('click',()=>{
    $('contracts-entity').value=$('contracts-entity').value===button.dataset.entity?'all':button.dataset.entity;render();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('contract-inspector').classList.contains('open'))close();});
  window.FBContracts={load,render,close,phase};
  load(); // Show the saved contract count in navigation before opening the workspace.
})();
