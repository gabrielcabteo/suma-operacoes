import {createClient} from '@supabase/supabase-js';
import {makeAuthStorage} from './auth-storage';
import {SessionRestoreError,verifiedSessionUser} from './auth-session';
import type {OperationsClient,Operation,OperationFields} from '../app/data-client';
import projectConfig from './supabase-config.json';
export const projectUrl=(import.meta.env.VITE_SUPABASE_URL||projectConfig.url).replace(/\/$/,'');
const publicKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||projectConfig.publishableKey;
export const configured=!!projectUrl&&!!publicKey;
const sessionKey='suma-auth-session-v2';
export const supabase=configured?createClient(projectUrl,publicKey,{auth:{flowType:'pkce',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:makeAuthStorage(sessionStorage,localStorage),storageKey:sessionKey}}):null;
export async function clearSession(){if(supabase){const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw Error('Não foi possível concluir a saída. Confira a conexão e tente novamente.');}sessionStorage.removeItem('suma-auth-session');}
export async function signIn(email:string,password:string){if(!supabase)throw Error('Armazenamento não conectado.');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw Error('Não foi possível entrar. Confira seu e-mail e sua senha.');}
export async function googleProviderEnabled(){if(!configured)return false;const r=await fetch(projectUrl+'/auth/v1/settings',{headers:{apikey:publicKey}});if(!r.ok)throw Error('Não foi possível verificar o login Google.');const settings=await r.json() as {external?:{google?:boolean}};return settings.external?.google===true;}
export async function signInWithGoogle(){if(!supabase)throw Error('Armazenamento não conectado.');if(!await googleProviderEnabled())throw Error('O login Google ainda está em configuração. Use e-mail e senha por enquanto.');const redirectTo=new URL(import.meta.env.BASE_URL,window.location.origin).href;const {error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo,queryParams:{prompt:'select_account'}}});if(error)throw Error('Não foi possível abrir o login Google. Tente novamente.');}
async function currentSession(){if(!supabase)throw Error('Armazenamento não conectado.');const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('Entre novamente para continuar.');return data.session;}
async function request(path:string,init:RequestInit={}){const session=await currentSession();const r=await fetch(projectUrl+path,{...init,headers:{apikey:publicKey,Authorization:'Bearer '+session.access_token,...init.headers}});if(!r.ok){if(r.status===401)throw Error('Sua sessão expirou. Entre novamente.');if(r.status===403)throw Error('Seu usuário não tem permissão para esta operação.');throw Error('Não foi possível acessar o armazenamento. Confira a conexão e suas permissões.');}return r;}
export async function restoreAccess(){
 const signedOut={signedIn:false,authorized:false,admin:false,email:'',userId:''};
 if(!supabase)return signedOut;
 const user=await verifiedSessionUser(supabase.auth,clearSession);
 if(!user)return signedOut;
 const q=new URLSearchParams({select:'role,display_name',user_id:'eq.'+user.id});
 let members:{role:string,display_name?:string}[];
 try{members=await (await request('/rest/v1/members?'+q)).json();}
 catch{throw new SessionRestoreError('Seu acesso está salvo. Não foi possível conferir suas permissões agora. Tente novamente.');}
 return {admin:members.some(m=>m.role==='admin'),signedIn:true,authorized:members.some(m=>m.role==='admin'||m.role==='worker'),email:user.email||'',userId:user.id,name:String(user.user_metadata?.full_name||user.user_metadata?.name||members[0]?.display_name||user.email||'')};
}
const urls=new Map<string,string>();
export const storageClient:OperationsClient={available:configured,
 async list(start,end){const q=new URLSearchParams({select:'*',date:'gte.'+start,order:'created.desc',limit:'1000'});q.append('date','lte.'+end);const out:Operation[]=[];let offset=0;while(true){q.set('offset',String(offset));const r=await request('/rest/v1/operations?'+q);const batch=await r.json() as Operation[];out.push(...batch);if(batch.length<1000)break;offset+=1000;}const paths=[...new Set(out.flatMap(r=>r.photos))];for(let n=0;n<paths.length;n+=100){const subset=paths.slice(n,n+100);const signed=await request('/storage/v1/object/sign/evidencias',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:60,paths:subset})});const results=await signed.json() as {path:string,signedURL?:string,error?:string}[];for(const r of results){if(!r.signedURL)throw Error('Não foi possível carregar uma das fotos. Atualize a consulta.');urls.set(r.path,projectUrl+'/storage/v1'+r.signedURL);}}return out;},
 async save(fields:OperationFields,id:string,photos:Blob[]){if(!photos.length||photos.length>3)throw Error('Adicione de 1 a 3 fotos.');const session=await currentSession();const q=new URLSearchParams({id:'eq.'+id,select:'id'});const existing=await (await request('/rest/v1/operations?'+q)).json() as {id:string}[];if(existing.length)return;const userId=session.user.id;const paths:string[]=[];for(let i=0;i<photos.length;i++){if(photos[i].size>1200000)throw Error('Foto muito grande.');const path=userId+'/'+id+'/'+i+'.jpg';await request('/storage/v1/object/evidencias/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'true'},body:photos[i]});paths.push(path);}await request('/rest/v1/operations',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({...fields,id,author_id:userId,photos:paths})});},
 photoUrl:id=>urls.get(id)||''
};
export const unavailableClient:OperationsClient={available:false,async list(){throw Error('As consultas estarão disponíveis quando o armazenamento for conectado.');},async save(){throw Error('O armazenamento ainda não foi conectado.');},photoUrl:()=>''};
