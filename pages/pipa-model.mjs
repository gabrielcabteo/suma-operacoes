export const statusLabels={planned:'Programada',in_progress:'Em andamento',completed:'Concluída',partial:'Parcial',pending:'Pendente',cancelled:'Cancelada',draft:'Não liberada'};
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
 return errors;
}
export function guessMapping(headers){
 const aliases={date:['data','dia','data do servico','data lavagem'],location:['local','endereco','localidade','logradouro','local de lavagem','rua'],title:['servico','titulo','demanda','descricao'],team:['equipe','pipa','caminhao','motorista'],neighborhood:['bairro'],target:['tipo','tipo de local'],sequence:['sequencia','ordem','rota'],notes:['observacoes','observacao','orientacoes','obs'],reference:['id','codigo','referencia','protocolo']};
 return Object.fromEntries(Object.entries(aliases).map(([k,a])=>[k,headers.findIndex(h=>a.includes(normalize(h)))]));
}
export function deriveImportRows(data,headerRow,mapping,month,defaultTeam,teams){
 const result=[];const text=v=>String(v??'').trim();
 for(let i=headerRow;i<data.length;i++){
  const row=data[i];if(row.every(v=>v===null||v===undefined||v===''))continue;
  const get=k=>mapping[k]>=0?row[mapping[k]]:null;
  const teamValue=normalize(get('team')),both=/^(ambos|ambas|as duas|duas equipes|2 pipas)$/.test(teamValue);
  let team=teams.find(t=>[t.id,t.name,t.driver,t.vehicle,t.id==='pipa-1'?'1':'2'].some(x=>x&&normalize(x)===teamValue))?.id;
  if(!team&&/(pipa|equipe)\s*1\b/.test(teamValue))team='pipa-1';
  if(!team&&/(pipa|equipe)\s*2\b/.test(teamValue))team='pipa-2';
  team=team||defaultTeam;
  const location=text(get('location')),rawTarget=normalize(get('target')||location),target=rawTarget.includes('feira')?'Feira livre':rawTarget.includes('praca')?'Praça':rawTarget.includes('parque')?'Parque':/via|rua|avenida/.test(rawTarget)?'Via pública':'Outro';
  for(const assigned of both?['pipa-1','pipa-2']:[team])result.push({line:i+1,selected:true,values:{service_date:parseDate(get('date'),month),location,title:text(get('title'))||location,team_id:assigned||'',neighborhood:text(get('neighborhood')),target,sequence:get('sequence')===null||get('sequence')===''?result.length+1:Number(get('sequence')),notes:text(get('notes')),source_ref:text(get('reference'))+(both&&get('reference')?'#'+assigned:''),priority:'normal'}});
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
 if(beforeCount>2||afterCount>3)throw Error('Use até duas fotos antes e três fotos depois.');
 if(['completed','partial'].includes(f.status)&&!afterCount&&f.photo_justification.trim().length<10)throw Error('Anexe uma foto depois da lavagem ou justifique a ausência (pelo menos 10 caracteres).');
 if(['partial','pending','cancelled'].includes(f.status)&&f.notes.trim().length<3)throw Error('Informe o motivo da situação ou da necessidade de retorno.');
 if(f.notes.length>2000||f.photo_justification.length>1000||f.helpers.length>300||f.neighborhood.length>120)throw Error('Há um campo acima do tamanho permitido.');
 for(const [k,max,min] of [['water_liters',1000000,0],['refills',100,0],['headcount',300,1]])if(f[k]!==null&&(!Number.isInteger(f[k])||f[k]<min||f[k]>max))throw Error('Confira os quantitativos informados.');
 if((f.latitude===null)!==(f.longitude===null)||f.latitude!==null&&(!Number.isFinite(f.latitude)||Math.abs(f.latitude)>90||!Number.isFinite(f.longitude)||Math.abs(f.longitude)>180))throw Error('Coordenadas inválidas. Capture a localização novamente.');
}
export function snapshotRows(s,month){
 const byJob=new Map(s.visits.filter(v=>v.job_id).map(v=>[v.job_id,v]));
 const out=s.jobs.map(j=>({id:'job-'+j.id,job:j,visit:byJob.get(j.id)||null,date:j.service_date,status:byJob.get(j.id)?.status||(j.cancelled?'cancelled':j.published?'planned':'draft')}));
 for(const v of s.visits)if(!v.job_id||!s.jobs.some(j=>j.id===v.job_id))out.push({id:'visit-'+v.id,job:null,visit:v,date:v.service_date,status:v.status});
 return out.filter(r=>r.job?.service_date.startsWith(month)||r.visit?.service_date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date)||(a.job?.sequence||0)-(b.job?.sequence||0)||a.id.localeCompare(b.id));
}
export const csvHeaders=['Mês do relatório','Equipe','Data programada','Data da execução','Sequência','Serviço','Local programado','Local executado','Bairro','Tipo de local','Situação','Prioridade','Motorista','Caminhão','Ajudantes','Responsável','Efetivo','Iniciado em (UTC)','Finalizado em (UTC)','Duração (min)','Água utilizada (L)','Reabastecimentos','Orientações da programação','Ocorrências / observações','Justificativa sem foto','Fotos antes','Fotos depois','Latitude','Longitude','Precisão (m)','Localização capturada em (UTC)','Mapa','ID da programação','ID do atendimento','Arquivo de origem','Referência do Excel','Liberada aos pipeiros','Programação cancelada','Criado em (UTC)','Atualizado em (UTC)','Autor do registro','Última alteração por'];
const cell=v=>'"'+String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
export function washingCsv(s,month){
 const rows=snapshotRows(s,month).map(({job:j,visit:v,status})=>{const team=s.teams.find(t=>t.id===(j?.team_id||v?.team_id));return [month,team?.name||j?.team_id||v?.team_id,j?.service_date,v?.service_date,j?.sequence,v?.title||j?.title,j?.location,v?.location,v?.neighborhood||j?.neighborhood,v?.target||j?.target,statusLabels[status]||status,j?.priority,v?.driver||team?.driver,v?.vehicle||team?.vehicle,v?.helpers,v?.responsible,v?.headcount,v?.started_at,v?.finished_at,v?.started_at&&v.finished_at?Math.round((new Date(v.finished_at)-new Date(v.started_at))/60000):null,v?.water_liters,v?.refills,j?.notes,v?.notes,v?.photo_justification,v?.photos_before.join(' | '),v?.photos_after.join(' | '),v?.latitude,v?.longitude,v?.accuracy_m,v?.location_captured_at,v?.latitude!==null&&v?.latitude!==undefined?'https://www.google.com/maps/search/?api=1&query='+v.latitude+','+v.longitude:'',j?.id,v?.id,j?.source_file,j?.source_ref,j?.published?'Sim':'Não',j?.cancelled?'Sim':'Não',v?.created_at||j?.created_at,v?.updated_at||j?.updated_at,v?.author_id||j?.author_id,v?.updated_by];});
 return '\ufeff'+[csvHeaders,...rows].map(row=>row.map(cell).join(';')).join('\r\n');
}
