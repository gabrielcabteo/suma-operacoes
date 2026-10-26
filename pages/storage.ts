import type {OperationsClient,Operation,OperationFields} from '../app/data-client';
import projectConfig from './supabase-config.json';
export const projectUrl=(import.meta.env.VITE_SUPABASE_URL||projectConfig.url).replace(/\/$/,'');
const publicKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||projectConfig.publishableKey;
export const configured=!!projectUrl&&!!publicKey;
const sessionKey='suma-auth-session';
type Session={access_token:string,refresh_token:string,expires_at:number,user:{id:string}};
let session:Session|null=null;
try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{}
export function hasSession(){return !!session;}
function setSession(s:any){session={...s,expires_at:s.expires_at||Math.floor(Date.now()/1000)+s.expires_in};sessionStorage.setItem(sessionKey,JSON.stringify(session));}
export function clearSession(){session=null;sessionStorage.removeItem(sessionKey);}
async function authRequest(grant:string,body:unknown){const r=await fetch(projectUrl+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error('Não foi possível entrar. Confira suas credenciais ou solicite acesso ao responsável.');setSession(d);}
export async function signIn(email:string,password:string){await authRequest('password',{email,password});}
let refreshing:Promise<void>|null=null;
async function token(){if(!session)throw Error('Entre novamente para continuar.');if(session.expires_at<Date.now()/1000+60){if(!refreshing)refreshing=authRequest('refresh_token',{refresh_token:session.refresh_token}).catch(e=>{clearSession();throw e}).finally(()=>{refreshing=null});await refreshing;}return session!.access_token;}
async function request(path:string,init:RequestInit={}){if(!configured)throw Error('O armazenamento ainda não foi conectado.');const access=await token();const r=await fetch(projectUrl+path,{...init,headers:{apikey:publicKey,Authorization:'Bearer '+access,...init.headers}});if(!r.ok){if(r.status===401){clearSession();throw Error('Sua sessão expirou. Entre novamente.');}if(r.status===403)throw Error('Seu usuário não tem permissão para esta operação.');throw Error('Não foi possível acessar o armazenamento. Confira a conexão e suas permissões.');}return r;}
const urls=new Map<string,string>();
export const storageClient:OperationsClient={available:configured,
 async list(start,end){const q=new URLSearchParams({select:'*',date:'gte.'+start,order:'created.desc',limit:'1000'});q.append('date','lte.'+end);const out:Operation[]=[];let offset=0;while(true){q.set('offset',String(offset));const r=await request('/rest/v1/operations?'+q);const batch=await r.json() as Operation[];out.push(...batch);if(batch.length<1000)break;offset+=1000;}const paths=[...new Set(out.flatMap(r=>r.photos))];for(let n=0;n<paths.length;n+=100){const subset=paths.slice(n,n+100);const signed=await request('/storage/v1/object/sign/evidencias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:3600,paths:subset})});const results=await signed.json() as {path:string,signedURL?:string,error?:string}[];for(const r of results){if(!r.signedURL)throw Error('Não foi possível carregar uma das fotos. Atualize a consulta.');urls.set(r.path,projectUrl+'/storage/v1'+r.signedURL);}}return out;},
 async save(fields:OperationFields,id:string,photos:Blob[]){if(!photos.length||photos.length>3)throw Error('Adicione de 1 a 3 fotos.');await token();const q=new URLSearchParams({id:'eq.'+id,select:'id'});const existing=await (await request('/rest/v1/operations?'+q)).json() as {id:string}[];if(existing.length)return;const userId=session!.user.id;const paths:string[]=[];for(let i=0;i<photos.length;i++){if(photos[i].size>1200000)throw Error('Foto muito grande.');const path=userId+'/'+id+'/'+i+'.jpg';await request('/storage/v1/object/evidencias/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'true'},body:photos[i]});paths.push(path);}await request('/rest/v1/operations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({...fields,id,author_id:userId,photos:paths})});},
 photoUrl:id=>urls.get(id)||''
};
export const unavailableClient:OperationsClient={available:false,async list(){throw Error('As consultas estarão disponíveis quando o armazenamento for conectado.');},async save(){throw Error('O armazenamento ainda não foi conectado.');},photoUrl:()=>''};
