import {supabase} from './storage';
import type {Account,Audit,Draft,GeoResult,ImportResult,Job,JobInput,Snapshot,Team,Visit} from './pipa-types';
import {validateVisit} from './pipa-model.mjs';
export class PipaError extends Error{constructor(message:string,public retryable=false,public code=''){super(message);}}
function db(){if(!supabase)throw new PipaError('Entre novamente para continuar.');return supabase;}
function fail(error:unknown):never{
 const e=error as {code?:string;message?:string;name?:string};const code=e?.code||'';
 const network=error instanceof TypeError||/fetch|network|connection|timeout|offline/i.test(e?.message||'');
 if(network)throw new PipaError('A conexão falhou. O preenchimento ficou guardado neste aparelho.',true,code);
 if(code==='40001')throw new PipaError('Este atendimento foi alterado. Atualize a lista e confira o registro antes de reenviar.',false,code);
 if(code==='42501')throw new PipaError('Esta conta não tem acesso à equipe ou o serviço ainda não foi liberado.',false,code);
 if(code==='23505')throw new PipaError('Este atendimento já foi iniciado ou aparece repetido. Atualize a lista para conferir.',false,code);
 if(code==='23514')throw new PipaError('Confira os campos, horários, fotos e justificativas do atendimento.',false,code);
 throw new PipaError('Não foi possível concluir a operação. Confira sua conexão e tente novamente.',false,code);
}
export interface PipaClient{
 snapshot(month:string):Promise<Snapshot>;
 accounts():Promise<Account[]>;
 saveTeam(team:Team):Promise<void>;
 assign(userId:string,teamId:string|null):Promise<void>;
 importJobs(rows:JobInput[],source:string,published:boolean):Promise<ImportResult>;
 updateJob(job:Job):Promise<void>;
 saveVisit(draft:Draft):Promise<Visit>;
 photos(paths:string[]):Promise<string[]>;
 history(entity:string,id:string):Promise<Audit[]>;
 reverse(lat:number,lon:number):Promise<GeoResult>;
}
export const pipaClient:PipaClient={
 async snapshot(month){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new PipaError('Escolha um mês válido.');const {data,error}=await db().rpc('pipa_snapshot',{p_month:month+'-01'});if(error)fail(error);return data as Snapshot;},
 async accounts(){const {data,error}=await db().rpc('pipa_accounts');if(error)fail(error);return data as Account[];},
 async saveTeam(t){const {error}=await db().from('pipa_teams').update({name:t.name.trim(),driver:t.driver.trim(),vehicle:t.vehicle.trim(),helpers:t.helpers.trim(),updated_at:new Date().toISOString()}).eq('id',t.id);if(error)fail(error);},
 async assign(user_id,team_id){if(team_id){const {error}=await db().from('pipa_members').upsert({user_id,team_id,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)fail(error);}else{const {error}=await db().from('pipa_members').delete().eq('user_id',user_id);if(error)fail(error);}},
 async importJobs(rows,source,published){const {data,error}=await db().rpc('import_pipa_jobs',{p_rows:rows,p_source:source,p_published:published});if(error)fail(error);return data as ImportResult;},
 async updateJob(j){const {data,error}=await db().from('pipa_jobs').update({team_id:j.team_id,service_date:j.service_date,sequence:j.sequence,title:j.title,location:j.location,neighborhood:j.neighborhood,target:j.target,notes:j.notes,priority:j.priority,published:j.published,cancelled:j.cancelled,source_ref:j.source_ref}).eq('id',j.id).eq('updated_at',j.updated_at).select('id');if(error)fail(error);if(!data?.length)throw new PipaError('A programação mudou. Atualize a lista antes de editar.',false,'40001');},
 async saveVisit(d){
  validateVisit(d.form,d.form.photos_before.length+d.photos.filter(p=>p.phase==='before').length,d.form.photos_after.length+d.photos.filter(p=>p.phase==='after').length);
  const client=db(),{data:session,error:sessionError}=await client.auth.getSession();if(sessionError)fail(sessionError);if(!session.session||session.session.user.id!==d.user_id)throw new PipaError('Entre na conta que criou este rascunho para enviar.');
  const fields={...d.form,photos_before:[...d.form.photos_before],photos_after:[...d.form.photos_after]};
  for(const p of d.photos){
   if(p.blob.type!=='image/jpeg'||p.blob.size>1200000)throw new PipaError('Uma das fotos não está no formato ou tamanho permitido.');
   const path=d.user_id+'/'+d.id+'/'+p.phase+'-'+p.id+'.jpg';
   const {error}=await client.storage.from('evidencias').upload(path,p.blob,{contentType:'image/jpeg',upsert:false});
   if(error&&!/already exists|duplicate/i.test(error.message))fail(error);
   const key=p.phase==='before'?'photos_before':'photos_after';if(!fields[key].includes(path))fields[key].push(path);
  }
  const {data,error}=await client.rpc('save_pipa_visit',{p_data:fields,p_expected:d.expected,p_mutation:d.mutation,p_previous:d.previous});if(error)fail(error);return data as Visit;
 },
 async photos(paths){if(!paths.length)return [];const {data,error}=await db().storage.from('evidencias').createSignedUrls(paths,60);if(error)fail(error);if(!data||data.some(p=>!p.signedUrl))throw new PipaError('Atualize para abrir novamente as fotos.');return data.map(p=>p.signedUrl!);},
 async history(entity,id){const {data,error}=await db().from('pipa_audit').select('*').eq('entity',entity).eq('entity_id',id).order('id',{ascending:false}).limit(100);if(error)fail(error);return data as Audit[];},
 async reverse(){throw new PipaError('Coordenadas capturadas. Confira o endereço da programação ou informe o local do atendimento.');}
};
