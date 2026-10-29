import {supabase} from './storage';
import type {Operation} from '../app/data-client';
import type {EntryFields,FieldEntry} from './field-types';
import {monthRange,validateEntry} from './field-model.mjs';
export interface FieldClient {
 list(month:string):Promise<FieldEntry[]>;
 sweeps(month:string):Promise<Operation[]>;
 save(fields:EntryFields,id:string,original:FieldEntry|null,photos:Blob[]):Promise<FieldEntry>;
 photoUrls(paths:string[]):Promise<string[]>;
}
function db(){if(!supabase)throw Error('Entre novamente para continuar.');return supabase;}
function failure(error:{code?:string}|null){if(!error)return;if(error.code==='42501')throw Error('Seu acesso não permite esta operação. Entre novamente ou fale com o responsável.');if(error.code==='23514')throw Error('Confira os campos e horários informados. Há um valor inválido.');throw Error('Não foi possível acessar os registros. Confira sua conexão e tente novamente.');}
async function listMonth<T>(table:string,dateColumn:string,createdColumn:string,month:string):Promise<T[]>{
 const [start,end]=monthRange(month),captured=new Date().toISOString(),rows:T[]=[];let last='';
 while(true){let query=db().from(table).select('*').gte(dateColumn,start).lte(dateColumn,end).lte(createdColumn,captured).order('id',{ascending:true}).limit(1000);if(last)query=query.gt('id',last);const {data,error}=await query;failure(error);if(!data)throw Error('A consulta não retornou dados.');rows.push(...data as T[]);if(data.length<1000)break;last=data[data.length-1].id;}
 return rows;
}
export const fieldClient:FieldClient={
 list:month=>listMonth<FieldEntry>('operational_entries','service_date','created_at',month),
 sweeps:month=>listMonth<Operation>('operations','date','created',month),
 async save(fields,id,original,photos){
  validateEntry(fields);const client=db();const {data:user,error:authError}=await client.auth.getUser();if(authError||!user.user)throw Error('Entre novamente para salvar.');
  if(photos.length>3)throw Error('Selecione até três fotos.');
  const clean=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,typeof v==='string'?v.trim():v])) as EntryFields;
  const paths=original?[...original.photos]:[];
  if(!original){
   // A retry after an uncertain response keeps the original record and its evidence.
   const check=await client.from('operational_entries').select('*').eq('id',id).maybeSingle();failure(check.error);if(check.data)return check.data as FieldEntry;
   for(let i=0;i<photos.length;i++){const path=user.user.id+'/'+id+'/'+i+'.jpg';if(photos[i].type!=='image/jpeg'||photos[i].size>1200000)throw Error('Use fotos JPEG com até 1,2 MB.');const {error}=await client.storage.from('evidencias').upload(path,photos[i],{contentType:'image/jpeg',upsert:true});if(error)throw Error('Não foi possível enviar uma foto. Tente novamente sem fechar o formulário.');paths.push(path);}
  }
  if(original){const {data,error}=await client.from('operational_entries').update(clean).eq('id',id).eq('updated_at',original.updated_at).select('*');failure(error);if(!data?.length)throw Error('Este lançamento foi atualizado por outra pessoa ou seu acesso mudou. Feche, atualize a lista e confira antes de editar.');return data[0] as FieldEntry;}
  const {data,error}=await client.from('operational_entries').insert({...clean,id,author_id:user.user.id,photos:paths}).select('*').single();
  if(error?.code==='23505'){const existing=await client.from('operational_entries').select('*').eq('id',id).single();failure(existing.error);if(existing.data)return existing.data as FieldEntry;}
  failure(error);if(!data)throw Error('Não foi possível confirmar o salvamento.');return data as FieldEntry;
 },
 async photoUrls(paths){if(!paths.length)return [];const {data,error}=await db().storage.from('evidencias').createSignedUrls(paths,60);if(error||!data||data.some(v=>!v.signedUrl))throw Error('Não foi possível abrir as fotos. Atualize e tente novamente.');return data.map(v=>v.signedUrl);}
};
