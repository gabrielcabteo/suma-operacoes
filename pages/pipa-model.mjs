export const statusLabels={planned:'Programada',in_progress:'Em andamento',completed:'Concluída',partial:'Parcial',pending:'Pendente',cancelled:'Cancelada',draft:'Não liberada',overdue:'Atrasado',rescheduled:'Reprogramado'};
export const targets=['Praça','Parque','Feira livre','Via pública','Outro'];
export const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const localTime=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Não informado';
export function nearbyAddress(visits,lat,lon){
 const rad=v=>v*Math.PI/180;let nearest=null,best=50;
 for(const v of visits){if(v.latitude===null||v.longitude===null||!v.location?.trim()||!Number.isFinite(v.latitude)||!Number.isFinite(v.longitude)||v.accuracy_m===null||v.accuracy_m>50)continue;
  const dlat=rad(v.latitude-lat),dlon=rad(v.longitude-lon),a=Math.sin(dlat/2)**2+Math.cos(rad(lat))*Math.cos(rad(v.latitude))*Math.sin(dlon/2)**2,d=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  if(d<best){best=d;nearest={location:v.location,neighborhood:v.neighborhood,city:'',attribution:'Endereço de um atendimento anterior da equipe'};}
 }
 return nearest;
}
export function parseDate(value,month){
 let out='';
 if(value instanceof Date){if(Number.isFinite(value.getTime()))out=value.toISOString().slice(0,10);}
 else if(typeof value==='number'&&value>20000&&value<100000)out=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000).toISOString().slice(0,10);
 else {
  const s=String(value??'').trim(),iso=s.match(/^(\d{4})-(\d{2})-(\d{2})$/),br=s.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?(?:\s.*)?$/);
  if(iso)out=s;
  else if(br){const year=br[3]?(br[3].length===2?'20'+br[3]:br[3]):month.slice(0,4);out=year+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0');}
  else if(/^\d{1,2}$/.test(s))out=month+'-'+s.padStart(2,'0');
 }
 const d=new Date(out+'T12:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(out)&&Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===out?out:'';
}
export function jobKey(j){return j.source_ref.trim()?'ref:'+j.service_date.slice(0,7)+':'+normalize(j.source_ref):'local:'+j.service_date+'|'+j.team_id+'|'+normalize(j.location);}
export function validateJob(j,month){
 const errors=[];
 if(!parseDate(j.service_date,month)||!j.service_date.startsWith(month+'-'))errors.push('Data inválida ou fora do mês escolhido');
 if(!['pipa-1','pipa-2'].includes(j.team_id))errors.push('Escolha a equipe');
 if(!j.location.trim()||j.location.length>200)errors.push('Informe o local (até 200 caracteres)');
 if(!j.title.trim()||j.title.length>160)errors.push('Informe o serviço (até 160 caracteres)');
 if(!Number.isInteger(j.sequence)||j.sequence<0||j.sequence>10000)errors.push('Confira a sequência');
 if(!targets.includes(j.target))errors.push('Confira o tipo de local');
 if(j.notes.length>2000||j.neighborhood.length>120||j.source_ref.length>120)errors.push('Há um campo acima do tamanho permitido');
 if(j.maps_url.length>2000||j.maps_url&&!/^https:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.[a-z.]+\/maps\/)/i.test(j.maps_url))errors.push('Informe um link válido do Google Maps (https://maps.app.goo.gl/...).');
 return errors;
}
export function guessMapping(headers){
 const aliases={date:['data','dia','data do servico','data lavagem'],location:['local','endereco','localidade','logradouro','local de lavagem','rua'],title:['servico','titulo','demanda','descricao'],team:['equipe','pipa','caminhao','motorista'],neighborhood:['bairro'],target:['tipo','tipo de local'],sequence:['sequencia','ordem','rota'],notes:['observacoes','observacao','orientacoes','obs'],reference:['id','codigo','referencia','protocolo'],maps:['link google maps','google maps','maps','link do maps','url maps','link mapa']};
 return Object.fromEntries(Object.entries(aliases).map(([k,a])=>[k,headers.findIndex(h=>a.includes(normalize(h)))]));
}
export function deriveImportRows(data,headerRow,mapping,month,defaultTeam,teams){
 const result=[];const text=v=>String(v??'').trim();
 const perTeam={};
 for(let i=headerRow;i<data.length;i++){
  const row=data[i];if(row.every(v=>v===null||v===undefined||v===''))continue;
  const get=k=>mapping[k]>=0?row[mapping[k]]:null;
  const teamValue=normalize(get('team')),both=/^(ambos|ambas|as duas|duas equipes|2 pipas)$/.test(teamValue);
  let team=teams.find(t=>[t.id,t.name,t.driver,t.vehicle,t.id==='pipa-1'?'1':'2'].some(x=>x&&normalize(x)===teamValue))?.id;
  if(!team&&/(pipa|equipe)\s*1\b/.test(teamValue))team='pipa-1';
  if(!team&&/(pipa|equipe)\s*2\b/.test(teamValue))team='pipa-2';
  team=team||defaultTeam;
  const location=text(get('location')),rawTarget=normalize(get('target')||location),target=rawTarget.includes('feira')?'Feira livre':rawTarget.includes('praca')?'Praça':rawTarget.includes('parque')?'Parque':/via|rua|avenida/.test(rawTarget)?'Via pública':'Outro';
  for(const assigned of both?['pipa-1','pipa-2']:[team])result.push({line:i+1,selected:true,values:{service_date:parseDate(get('date'),month),location,title:text(get('title'))||location,team_id:assigned||'',neighborhood:text(get('neighborhood')),target,sequence:get('sequence')===null||get('sequence')===''?(perTeam[assigned||'']=(perTeam[assigned||'']||0)+1):Number(get('sequence')),notes:text(get('notes')),source_ref:text(get('reference'))+(both&&get('reference')?'#'+assigned:''),maps_url:text(get('maps')),priority:'normal'}});
 }
 return result;
}
export function blankVisit(job,team,name){
 return {id:crypto.randomUUID(),job_id:job?.id||null,team_id:team.id,service_date:today(),title:job?.title||'',location:job?.location||'',neighborhood:job?.neighborhood||'',target:job?.target||'Outro',driver:team.driver,vehicle:team.vehicle,helpers:team.helpers,responsible:name||team.driver,headcount:null,status:'in_progress',started_at:null,finished_at:null,water_liters:null,refills:null,notes:'',photo_justification:'',photos_before:[],photos_after:[],latitude:null,longitude:null,accuracy_m:null,location_captured_at:null};
}
export function validateVisit(f,beforeCount=f.photos_before.length,afterCount=f.photos_after.length){
 if(!['pipa-1','pipa-2'].includes(f.team_id))throw Error('Escolha a equipe do pipa.');
 for(const [k,label,max] of [['title','Serviço',160],['location','Local',200],['driver','Motorista',160],['vehicle','Caminhão',80],['responsible','Responsável',160]])if(!f[k]?.trim()||f[k].length>max)throw Error('Confira o campo '+label+'.');
 if(!parseDate(f.service_date,f.service_date.slice(0,7))||f.service_date>today())throw Error('Informe uma data válida, até hoje.');
 if(!['in_progress','completed','partial','pending','cancelled'].includes(f.status))throw Error('Escolha a situação do atendimento.');
 if(!targets.includes(f.target))throw Error('Escolha o tipo de local.');
 if(['in_progress','completed','partial'].includes(f.status)&&!f.started_at)throw Error('Toque em Iniciar para registrar o início.');
 if(['completed','partial'].includes(f.status)&&!f.finished_at)throw Error('Toque em Finalizar para registrar o término.');
 for(const value of [f.started_at,f.finished_at,f.location_captured_at])if(value&&!Number.isFinite(new Date(value).getTime()))throw Error('Há uma data ou um horário inválido.');
 if(f.finished_at&&(!f.started_at||new Date(f.finished_at)<new Date(f.started_at)))throw Error('O término deve ser posterior ao início.');
 if(beforeCount>3||afterCount>4)throw Error('Use até três fotos antes e quatro fotos depois.');
 if(['completed','partial'].includes(f.status)&&!afterCount&&f.photo_justification.trim().length<10)throw Error('Anexe uma foto depois da lavagem ou justifique a ausência (pelo menos 10 caracteres).');
 if(['partial','pending','cancelled'].includes(f.status)&&f.notes.trim().length<3)throw Error('Informe o motivo da situação ou da necessidade de retorno.');
 if(['completed','partial'].includes(f.status)){
  if(f.water_liters===null||f.water_liters===undefined)throw Error('Informe a água utilizada (litros) para finalizar.');
  if(f.refills===null||f.refills===undefined)throw Error('Informe os reabastecimentos (use 0 se não houve).');
  if(f.status==='completed'&&f.water_liters===0)throw Error('Lavagem concluída precisa de consumo de água maior que zero.');
 }
 if(f.notes.length>2000||f.photo_justification.length>1000||f.helpers.length>300||f.neighborhood.length>120)throw Error('Há um campo acima do tamanho permitido.');
 for(const [k,max,min] of [['water_liters',1000000,0],['refills',100,0],['headcount',300,1]])if(f[k]!==null&&(!Number.isInteger(f[k])||f[k]<min||f[k]>max))throw Error('Confira os quantitativos informados.');
 if((f.latitude===null)!==(f.longitude===null)||f.latitude!==null&&(!Number.isFinite(f.latitude)||Math.abs(f.latitude)>90||!Number.isFinite(f.longitude)||Math.abs(f.longitude)>180))throw Error('Coordenadas inválidas. Capture a localização novamente.');
}
// Situação exibida: a do atendimento; sem atendimento, a da programação. Um serviço com retorno ativo
// e sem conclusão aparece como Reprogramado; um serviço liberado e vencido sem atendimento, como Atrasado.
export function rowStatus(j,v,returned,now=today()){
 if(j&&!j.cancelled&&returned?.has(j.id)&&(!v||['in_progress','partial','pending'].includes(v.status)))return 'rescheduled';
 if(v)return v.status;
 if(!j)return 'pending';
 if(j.cancelled)return 'cancelled';
 if(!j.published)return 'draft';
 return j.service_date<now?'overdue':'planned';
}
export function snapshotRows(s,month,now=today()){
 const byJob=new Map(s.visits.filter(v=>v.job_id).map(v=>[v.job_id,v])),returned=new Set(s.returned||[]);
 const out=s.jobs.map(j=>({id:'job-'+j.id,job:j,visit:byJob.get(j.id)||null,date:j.service_date,status:rowStatus(j,byJob.get(j.id)||null,returned,now)}));
 for(const v of s.visits)if(!v.job_id||!s.jobs.some(j=>j.id===v.job_id))out.push({id:'visit-'+v.id,job:null,visit:v,date:v.service_date,status:v.status});
 return out.filter(r=>r.job?.service_date.startsWith(month)||r.visit?.service_date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date)||(a.job?.sequence||0)-(b.job?.sequence||0)||a.id.localeCompare(b.id));
}
// Pendências em aberto, de qualquer mês: liberadas, não canceladas, vencidas, sem retorno ativo e sem conclusão.
export function openBacklog(s,now=today()){
 const byJob=new Map(s.visits.filter(v=>v.job_id).map(v=>[v.job_id,v])),returned=new Set(s.returned||[]);
 return s.jobs.filter(j=>j.published&&!j.cancelled&&j.service_date<now&&!returned.has(j.id)).map(j=>{const v=byJob.get(j.id)||null;return {id:'job-'+j.id,job:j,visit:v,date:j.service_date,status:rowStatus(j,v,returned,now)};})
  .filter(r=>['overdue','in_progress','partial','pending'].includes(r.status)).sort((a,b)=>a.date.localeCompare(b.date)||a.job.sequence-b.job.sequence);
}
// Pode reprogramar: parcial ou pendente, ou vencido sem atendimento; nunca concluído, cancelado ou já reprogramado.
export function canReprogram(r){return !!r.job&&!r.job.cancelled&&r.job.published&&['partial','pending','overdue'].includes(r.status);}
export const brasilia=v=>{if(!v)return '';const d=new Date(v);return Number.isFinite(d.getTime())?d.toLocaleString('sv-SE',{timeZone:'America/Sao_Paulo',hour12:false}).slice(0,16):'';};
export const csvHeaders=['Mês do relatório','Equipe','Data programada','Data da execução','Sequência','Serviço','Local programado','Local executado','Bairro','Tipo de local','Situação','Prioridade','Motorista','Caminhão','Ajudantes','Responsável','Efetivo','Iniciado em (Brasília)','Finalizado em (Brasília)','Duração (min)','Água utilizada (L)','Reabastecimentos','Orientações da programação','Ocorrências / observações','Justificativa sem foto','Fotos antes','Fotos depois','Latitude','Longitude','Precisão (m)','Localização capturada em (Brasília)','Mapa','ID da programação','ID do atendimento','Arquivo de origem','Referência do Excel','Liberada aos pipeiros','Programação cancelada','Criado em (Brasília)','Atualizado em (Brasília)','Autor do registro','Última alteração por','Retorno do serviço (ID)'];
const cell=v=>'"'+(typeof v==='number'&&Number.isFinite(v)?String(v):String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,"'$&")).replaceAll('"','""')+'"';
export function washingCsv(s,month,people={}){
 const who=id=>id?(people[id]||id):'';
 const rows=snapshotRows(s,month).map(({job:j,visit:v,status})=>{const team=s.teams.find(t=>t.id===(j?.team_id||v?.team_id));return [month,team?.name||j?.team_id||v?.team_id,j?.service_date,v?.service_date,j?.sequence,v?.title||j?.title,j?.location,v?.location,v?.neighborhood||j?.neighborhood,v?.target||j?.target,statusLabels[status]||status,j?.priority,v?.driver||team?.driver,v?.vehicle||team?.vehicle,v?.helpers,v?.responsible,v?.headcount,brasilia(v?.started_at),brasilia(v?.finished_at),v?.started_at&&v.finished_at?Math.round((new Date(v.finished_at)-new Date(v.started_at))/60000):null,v?.water_liters,v?.refills,j?.notes,v?.notes,v?.photo_justification,v?.photos_before.join(' | '),v?.photos_after.join(' | '),v?.latitude,v?.longitude,v?.accuracy_m,brasilia(v?.location_captured_at),v?.latitude!==null&&v?.latitude!==undefined?'https://www.google.com/maps/search/?api=1&query='+v.latitude+','+v.longitude:'',j?.id,v?.id,j?.source_file,j?.source_ref,j?.published?'Sim':'Não',j?.cancelled?'Sim':'Não',brasilia(v?.created_at||j?.created_at),brasilia(v?.updated_at||j?.updated_at),who(v?.author_id||j?.author_id),who(v?.updated_by),j?.return_of||''];});
 return '\ufeff'+[csvHeaders,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}
