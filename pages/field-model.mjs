export const statusLabels={planned:'Programada',in_progress:'Em andamento',completed:'Concluída',pending:'Pendente',cancelled:'Cancelada'};
export const priorityLabels={normal:'Normal',high:'Alta',urgent:'Urgente'};
export const moduleLabels={demand:'Demandas',washing:'Lavagem · Pipas',sweeping:'Varrição'};
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function monthRange(month){if(!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))throw Error('Escolha um mês válido.');const [y,m]=month.split('-').map(Number);return [month+'-01',month+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')];}
export function blankEntry(kind){return {service_type:kind,service_date:today(),status:'planned',priority:'normal',title:'',service:kind==='washing'?'Lavagem':'Limpeza de área',location:'',neighborhood:'',segment:'',requester:'',protocol:'',responsible:'',team:kind==='washing'?'Pipa':'',headcount:null,description:'',notes:'',vehicle:'',driver:'',helpers:'',washing_target:kind==='washing'?'Praça':'',start_time:null,end_time:null,overnight:false,water_liters:null,refills:null,quantity:null,unit:''};}
export function elapsedMinutes(start,end,overnight=false){if(!start||!end)return null;const minutes=v=>Number(v.slice(0,2))*60+Number(v.slice(3,5));return minutes(end)-minutes(start)+(overnight?1440:0);}
export function validateEntry(f){
 if(!['demand','washing'].includes(f.service_type)||!Object.hasOwn(statusLabels,f.status)||!Object.hasOwn(priorityLabels,f.priority))throw Error('Confira o tipo e a situação da operação.');
 if(!f.title.trim()||!f.location.trim()||!f.responsible.trim()||!f.team.trim())throw Error('Preencha o serviço, o local, o responsável e a equipe.');
 const d=new Date(f.service_date+'T12:00:00Z');
 if(!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(f.service_date)||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==f.service_date)throw Error('Informe uma data válida.');
 if(f.service_type==='washing'&&(!f.vehicle.trim()||!f.driver.trim()))throw Error('Informe o caminhão pipa e o motorista.');
 if(f.status==='completed'&&f.service_date>today())throw Error('Uma operação futura ainda não pode ser concluída.');
 for(const v of [f.start_time,f.end_time])if(v!==null&&!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v))throw Error('Confira os horários.');
 if(f.overnight&&(!f.start_time||!f.end_time))throw Error('Informe os dois horários para marcar término no dia seguinte.');
 const duration=elapsedMinutes(f.start_time,f.end_time,f.overnight);
 if(duration!==null&&(duration<0||duration>1440))throw Error('Confira os horários. Se terminou no dia seguinte, marque essa opção.');
 if(f.quantity!==null&&!f.unit)throw Error('Escolha a unidade da quantidade executada.');
 if(f.unit&&f.quantity===null)throw Error('Informe a quantidade executada ou deixe a unidade em branco.');
 for(const [name,value,max] of [['Efetivo',f.headcount,300],['Água utilizada',f.water_liters,1000000],['Reabastecimentos',f.refills,100],['Quantidade',f.quantity,1000000000]])if(value!==null&&(!Number.isFinite(value)||value<0||value>max||(name!=='Quantidade'&&!Number.isInteger(value))||(name==='Efetivo'&&value<1)))throw Error(name+': informe um valor válido.');
}
export const csvHeaders=['Módulo','ID','Data do serviço','Situação','Prioridade','Serviço / demanda','Tipo de serviço','Local / endereço','Bairro','Trecho / referência','Solicitante','Protocolo','Responsável','Equipe','Efetivo','Caminhão / placa','Motorista','Ajudantes','Tipo de local lavado','Início','Término','Terminou no dia seguinte','Duração (min)','Água utilizada (L)','Reabastecimentos','Quantidade executada','Unidade','Descrição','Observações','Quantidade de fotos','Caminhos das fotos','Criado em (UTC)','Atualizado em (UTC)','ID de quem registrou'];
const cell=v=>'"'+String(v??'').replace(/^[\s\u0000-\u001f]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
export function monthlyCsv(entries,sweeps=[]){
 const records=entries.map(r=>({date:r.service_date,id:r.id,cells:[moduleLabels[r.service_type],r.id,r.service_date,statusLabels[r.status],priorityLabels[r.priority],r.title,r.service,r.location,r.neighborhood,r.segment,r.requester,r.protocol,r.responsible,r.team,r.headcount,r.vehicle,r.driver,r.helpers,r.washing_target,r.start_time?.slice(0,5),r.end_time?.slice(0,5),r.overnight?'Sim':'Não',elapsedMinutes(r.start_time,r.end_time,r.overnight),r.water_liters,r.refills,r.quantity,r.unit,r.description,r.notes,r.photos.length,r.photos.join(' | '),r.created_at,r.updated_at,r.author_id]}));
 for(const r of sweeps)records.push({date:r.date,id:r.id,cells:[moduleLabels.sweeping,r.id,r.date,'Concluída','','Varrição','Varrição',r.street,r.neighborhood,r.segment,'','',r.name,r.team,'','','','','','','','','','','','','','',r.notes,r.photos.length,r.photos.join(' | '),r.created,'',r.author_id||'']});
 records.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return '\ufeff'+[csvHeaders,...records.map(r=>r.cells)].map(row=>row.map(cell).join(';')).join('\r\n');
}
