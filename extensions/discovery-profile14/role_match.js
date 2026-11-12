/* Explainable keyword evidence for a selected target job, not an employment
 * decision or a qualification guarantee. No remote inference or scoring API. */
(function(root){
  'use strict';
  const TARGETS={
    heavy_maintenance:{name:'Heavy-vehicle mechanic',direct:[/mecanicien.{0,30}(poids lourds|autobus|autocar|bus|diesel|pl\b)/,/((poids lourds|autobus|autocar|bus|heavy.vehicle|diesel).{0,30}(mecanicien|mechanic|technician))/,/heavy.vehicle.mechanic/],
      related:[/\b(mecanicien|mechanic|maintenance|atelier|garage|renault trucks|vehicle technician)\b/]},
    automation:{name:'Industrial automation',direct:[/\b(automaticien|automation|automatisme|gtb|gtc|plc|programmable.logic.controller)\b/],
      related:[/\b(profibus|supervision|controle|commande|scada|capteur|simulateur|ladder)\b/]},
    electronics:{name:'Electronics / embedded',direct:[/\b(electronique|electronicien|electronics|embedded|embarque|firmware|microcontroleur)\b/],
      related:[/\b(electrique|electrical|hardware|iot|c\+\+|linux|pcb|sensor)\b/]},
    bus_driver:{name:'Bus driver',direct:[/\b(conducteur de bus|chauffeur de bus|bus driver|conducteur d.autobus|conduite de bus)\b/],
      related:[/\b(chauffeur|conducteur|driver|permis d|transport voyageurs)\b/]}
  };
  const LABELS=['Direct role evidence','Related skills','Not demonstrated'];
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  function evaluate(row,target='heavy_maintenance'){
    const template=TARGETS[target]||TARGETS.heavy_maintenance;
    const approved=row?.profileImport?.importedAt?row.profileImport:null;
    const captured=row?.profileCapture||null;
    const record=approved||captured?.fields||{};
    const roles=approved?.experienceRoles?.length?approved.experienceRoles:captured?.roles||[];
    const snippets=[record.headline,...roles.map(role=>role.title)].filter(Boolean).map(String);
    if(!snippets.length)snippets.push(row?.title||'',row?.snippet||'');
    const direct=snippets.find(item=>template.direct.some(pattern=>pattern.test(fold(item))));
    const related=snippets.find(item=>template.related.some(pattern=>pattern.test(fold(item))));
    return {label:direct?LABELS[0]:related?LABELS[1]:LABELS[2],
      evidence:(direct||related||'').slice(0,150),
      source:approved?'Human-reviewed profile':captured?'Captured profile, pending review':'Google snippet only',
      explanation:'Keyword evidence only. Credentials, job suitability and candidate interest require review.'};
  }
  const api={TARGETS,LABELS,evaluate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBMatch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
