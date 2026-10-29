import {addressFromPhoton,validCoordinates} from './format.mjs';
const origin='https://gabrielcabteo.github.io';
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json'};
export function locationHandler({authenticate,claim,store,lookup}){
 const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
 return async req=>{
  if(req.headers.get('Origin')&&req.headers.get('Origin')!==origin)return reply({error:'Origem não autorizada.'},403);
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return reply({error:'Método indisponível.'},405);
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return reply({error:'Autenticação necessária.'},401);
  try{
   if(!await authenticate(token))return reply({error:'Sessão inválida.'},401);
   const raw=await req.text();if(raw.length>4096)return reply({error:'Solicitação inválida.'},413);
   let input;try{input=JSON.parse(raw)}catch{return reply({error:'Solicitação inválida.'},400);}
   const {latitude,longitude}=input||{};
   if(!validCoordinates(latitude,longitude))return reply({error:'Coordenadas inválidas.'},400);
   const grant=await claim({token,apikey:req.headers.get('apikey'),latitude,longitude});
   if(!grant||grant.error)return reply({error:'Conta sem acesso ao piloto.'},403);
   if(grant.cached)return reply(grant.cached);
   if(grant.retry)return reply({error:'Aguarde alguns segundos e tente novamente.'},429);
   if(typeof grant.key!=='string')return reply({error:'Consulta de endereço indisponível.'},502);
   const result=addressFromPhoton(await lookup(latitude,longitude));
   if(!result)return reply({error:'Endereço não encontrado. Informe o local manualmente.'},404);
   try{await store(grant.key,result)}catch{/* A temporary cache failure must not discard a valid address. */}
   return reply(result);
  }catch{return reply({error:'Consulta de endereço indisponível. As coordenadas foram mantidas; confira o endereço manualmente.'},502);}
 };
}
