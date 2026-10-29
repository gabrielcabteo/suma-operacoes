import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {locationHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(locationHandler({
 async authenticate(token:string){const {data,error}=await service.auth.getUser(token);return !error&&!!data.user;},
 async claim({token,apikey,latitude,longitude}:{token:string;apikey:string|null;latitude:number;longitude:number}){
  const key=apikey||Deno.env.get('SUPABASE_ANON_KEY');
  if(!key)return {error:true};
  const user=createClient(url,key,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await user.rpc('pipa_geo_authorize',{p_lat:latitude,p_lon:longitude});
  return error?{error:true}:data;
 },
 async store(key:string,result:unknown){const {error}=await service.rpc('pipa_geo_store',{p_key:key,p_result:result});if(error)throw error;},
 async lookup(latitude:number,longitude:number){
  // One explicit location-button action. No names, accounts, photos or notes are forwarded.
  const endpoint=new URL('https://photon.komoot.io/reverse');
  endpoint.searchParams.set('lat',String(latitude));endpoint.searchParams.set('lon',String(longitude));
  endpoint.searchParams.set('limit','1');endpoint.searchParams.set('radius','1');
  const response=await fetch(endpoint,{headers:{'User-Agent':'SUMA-Pipas-Piloto/1.0 (https://gabrielcabteo.github.io/suma-operacoes/)','Accept':'application/json','Accept-Language':'pt-BR,pt;q=0.9'},signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw Error('Geocoder unavailable');
  return response.json();
 }
}));
