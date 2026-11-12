'use strict';
const $=id=>document.getElementById(id);let allRows=[],filtered=[];
function info(message,error=false){$('message').textContent=message;$('message').classList.toggle('error',error);}
function download(name,text,type){const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function create(tag,value){const node=document.createElement(tag);node.textContent=String(value??'');return node;}
function short(value,max=240){const s=String(value||'');return s.length>max?s.slice(0,max-1)+'…':s;}
function render(){
  $('total').textContent=allRows.length;
  $('enriched').textContent=allRows.filter(r=>r.profileImport?.importedAt).length;
  $('pending').textContent=FB.pending(allRows).length;
  const term=$('search').value.trim().toLowerCase(),mode=$('filter').value;
  filtered=allRows.filter(row=>{
    const imp=!!row.profileImport?.importedAt;
    if(mode==='enriched'&&!imp||mode==='pending'&&imp)return false;
    const hay=[row.title,row.snippet,row.url,row.notes,...FB.FIELDS.map(x=>row.profileImport?.[x]),
      row.profileImport?.experienceSummary?.latestCompany].join(' ').toLowerCase();
    return !term||hay.includes(term);
  }).sort((a,b)=>Number(b.aiScore||b.score||0)-Number(a.aiScore||a.score||0));
  $('visibleCount').textContent=`${filtered.length} visible of ${allRows.length} stored. CSV exports the filtered view.`;
  const tbody=$('tableBody');tbody.replaceChildren();
  for(const row of filtered.slice(0,1500)){
    const tr=create('tr','');const td=create('td','');const a=create('a',short(row.profileImport?.name||row.title||row.url,120));
    a.href=FB.canonicalUrl(row.url)||'#';a.target='_blank';a.rel='noopener noreferrer';td.append(a);
    if(row.profileImport?.headline)td.append(create('div',short(row.profileImport.headline,120)));
    if(row.profileImport?.experience){
      const experience=row.profileImport.experienceSummary||FB.summarizeExperience(row.profileImport.experience);
      const details=[experience.totalMonths==null?'':`Total ${experience.totalDuration}`,
        experience.latestCompany?`Latest: ${experience.latestCompany} (${experience.latestDuration})`:''].filter(Boolean).join(' · ');
      if(details){const summary=create('div',short(details,180));summary.className='meta';td.append(summary);}
    }
    const statusCell=create('td','');const status=create('select','');status.ariaLabel='Recruiter status';
    for(const value of ['new','reviewing','shortlisted','contacted','interview','rejected']){
      const option=create('option',value);option.value=value;status.append(option);
    }
    status.value=['new','reviewing','shortlisted','contacted','interview','rejected'].includes(row.status)?row.status:'new';
    status.addEventListener('change',async()=>{try{row.status=status.value;await FBDB.save(row);}catch(error){info(error.message,true);}});
    statusCell.append(status,create('div',row.profileImport?.importedAt?'Professional details saved':'Not yet enriched'));
    const notesCell=create('td',''),notes=create('textarea','');notes.rows=2;notes.value=row.notes||'';notes.placeholder='Recruiter notes';
    notes.addEventListener('change',async()=>{try{row.notes=notes.value;await FBDB.save(row);info('Recruiter notes saved.');}catch(error){info(error.message,true);}});
    notesCell.append(notes);
    tr.append(td,create('td',short(row.snippet)),create('td',row.profileImport?.location),create('td',row.score),
      statusCell,notesCell,create('td',String(row.lastSeen||'').slice(0,10)));
    tbody.append(tr);
  }
  if(filtered.length>1500)tbody.append(create('tr',`Only the first 1,500 records are rendered for browser performance; the CSV contains all ${filtered.length}.`));
  if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.className='empty';td.textContent='No candidates in this view.';tr.append(td);tbody.append(tr);}
}
async function reload(){try{allRows=await FBDB.all();render();}catch(error){info(`Database error: ${error.message}`,true);}}
$('search').addEventListener('input',render);$('filter').addEventListener('change',render);
$('refresh').addEventListener('click',reload);
$('exportCsv').addEventListener('click',()=>{
  download('FleetBridge_candidates_'+new Date().toISOString().slice(0,10)+'.csv',FB.toCsv(filtered),'text/csv;charset=utf-8');info(`Exported ${filtered.length} profiles to CSV.`);
});
$('exportJson').addEventListener('click',()=>{
  download('FleetBridge_database_backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(allRows,null,2),'application/json;charset=utf-8');info(`Saved backup of ${allRows.length} profiles.`);
});
$('restore').addEventListener('click',()=>$('restoreFile').click());
$('restoreFile').addEventListener('change',async event=>{
  try{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>80_000_000)throw new Error('Backup exceeds the 80 MB import limit.');
    const json=JSON.parse(await file.text());const records=Array.isArray(json)?json:(json.records||json.profiles||json.rows);
    if(!Array.isArray(records))throw new Error('Expected a JSON array, or an object containing records/profiles/rows.');
    if(!confirm(`Merge ${records.length} profiles into the existing local database? Existing data will be preserved when possible.`))return;
    const outcome=await FBDB.restore(records);await reload();info(`Restored: ${outcome.added} new, ${outcome.updated} updated. Your existing records remain available.`);
  }catch(error){info(`Restore failed: ${error.message}`,true);}finally{event.target.value='';}
});
$('sidePanel').addEventListener('click',async()=>{
  try{const win=await chrome.windows.getCurrent();await chrome.sidePanel.open({windowId:win.id});}
  catch(error){info(`Couldn't open sidebar: ${error.message}`,true);}
});
reload();
