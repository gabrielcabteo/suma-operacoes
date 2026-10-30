import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {makeAuthStorage} from './auth-storage.ts';
import {SessionRestoreError,verifiedSessionUser} from './auth-session.ts';

class MemoryStorage {
 data=new Map();
 get length(){return this.data.size;}
 clear(){this.data.clear();}
 key(index){return [...this.data.keys()][index]??null;}
 getItem(key){return this.data.get(key)??null;}
 setItem(key,value){this.data.set(key,String(value));}
 removeItem(key){this.data.delete(key);}
}
const key='test-auth-session',verifier=key+'-code-verifier';

test('login survives closing the original tab and opening another',()=>{
 const shared=new MemoryStorage(),tab=new MemoryStorage();
 makeAuthStorage(tab,shared).setItem(key,'synthetic-session');
 tab.clear();
 assert.equal(makeAuthStorage(new MemoryStorage(),shared).getItem(key),'synthetic-session');
});

test('an existing tab login migrates without requiring another password',()=>{
 const shared=new MemoryStorage(),legacy=new MemoryStorage();
 assert.equal(makeAuthStorage(new MemoryStorage(),shared).getItem(key),null);
 legacy.setItem(key,'legacy-session');
 assert.equal(makeAuthStorage(legacy,shared).getItem(key),'legacy-session');
 assert.equal(legacy.getItem(key),null);
 assert.equal(makeAuthStorage(new MemoryStorage(),shared).getItem(key),'legacy-session');
});

test('the shared account wins over an old tab and logout cannot resurrect it',()=>{
 const shared=new MemoryStorage(),oldTab=new MemoryStorage();
 const current=makeAuthStorage(new MemoryStorage(),shared);
 current.setItem(key,'current-account');oldTab.setItem(key,'old-account');
 assert.equal(makeAuthStorage(oldTab,shared).getItem(key),'current-account');
 oldTab.setItem(key,'another-legacy-copy');
 current.removeItem(key);
 assert.equal(makeAuthStorage(oldTab,shared).getItem(key),null);
 assert.equal(oldTab.getItem(key),null);
 current.setItem(key,'new-login');
 assert.equal(makeAuthStorage(new MemoryStorage(),shared).getItem(key),'new-login');
});

test('PKCE callbacks share a verifier, which expires after one hour',()=>{
 const shared=new MemoryStorage(),tab=new MemoryStorage();let clock=1000;
 const auth=makeAuthStorage(tab,shared,()=>clock);
 auth.setItem(verifier,'synthetic-pkce');
 const other=makeAuthStorage(new MemoryStorage(),shared,()=>clock);
 assert.equal(other.getItem(verifier),'synthetic-pkce');
 tab.setItem(verifier,'old-copy');clock+=60*60*1000;
 assert.equal(auth.getItem(verifier),null);
 assert.equal(tab.getItem(verifier),null);assert.equal(shared.getItem(verifier),null);
 auth.setItem(verifier,'next-pkce');auth.removeItem(verifier);
 assert.equal(other.getItem(verifier),null);
});

test('a malformed shared verifier does not fall back to an older one',()=>{
 const shared=new MemoryStorage(),tab=new MemoryStorage();
 shared.setItem(verifier,'invalid-json');tab.setItem(verifier,'old-copy');
 assert.equal(makeAuthStorage(tab,shared).getItem(verifier),null);
 assert.equal(tab.getItem(verifier),null);
});

test('restricted persistent storage still allows the current tab to sign in and out',()=>{
 const shared={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 const tab=new MemoryStorage(),auth=makeAuthStorage(tab,shared);
 auth.setItem(key,'tab-session');assert.equal(auth.getItem(key),'tab-session');
 auth.setItem(verifier,'tab-pkce');assert.equal(auth.getItem(verifier),'tab-pkce');
 auth.removeItem(key);auth.removeItem(verifier);
 assert.equal(auth.getItem(key),null);assert.equal(auth.getItem(verifier),null);
});

test('a failed persistent write never selects an older account in the current tab',()=>{
 const shared=new MemoryStorage(),tab=new MemoryStorage();shared.setItem(key,'old-account');
 shared.setItem=()=>{throw Error('quota');};
 const auth=makeAuthStorage(tab,shared);auth.setItem(key,'new-account');
 assert.equal(auth.getItem(key),'new-account');assert.equal(shared.getItem(key),null);
});

const stored={data:{session:{access_token:'synthetic-only'}},error:null};
test('server validation is required even when a session is stored',async()=>{
 let checked=0;
 const auth={async getSession(){return stored;},async getUser(){checked++;return {data:{user:{id:'verified-user'}},error:null};}};
 assert.equal((await verifiedSessionUser(auth,async()=>assert.fail('unexpected logout'))).id,'verified-user');
 assert.equal(checked,1);
 const empty={...auth,async getSession(){return {data:{session:null},error:null};}};
 assert.equal(await verifiedSessionUser(empty,async()=>{}),null);assert.equal(checked,1);
});

test('network errors, rate limits and server failures keep the login and fail closed',async()=>{
 for(const error of [{status:0},{status:429},{status:500},{status:503},null]){
  const auth={async getSession(){return stored;},async getUser(){return {data:{user:null},error};}};
  await assert.rejects(verifiedSessionUser(auth,async()=>assert.fail('login was erased')),SessionRestoreError);
 }
 const thrown={async getSession(){return stored;},async getUser(){throw new TypeError('offline');}};
 await assert.rejects(verifiedSessionUser(thrown,async()=>assert.fail('login was erased')),SessionRestoreError);
 const refreshFailed={async getSession(){return {data:{session:null},error:{status:503}};},async getUser(){assert.fail('not verified');}};
 await assert.rejects(verifiedSessionUser(refreshFailed,async()=>assert.fail('login was erased')),SessionRestoreError);
 const interrupted={async getSession(){throw new TypeError('offline');},async getUser(){assert.fail('not verified');}};
 await assert.rejects(verifiedSessionUser(interrupted,async()=>assert.fail('login was erased')),SessionRestoreError);
});

test('a rejected or revoked session is cleared and never grants access',async()=>{
 for(const error of [{status:401},{status:403},{code:'session_not_found'},{name:'AuthSessionMissingError'}]){
  let cleared=0;
  const auth={async getSession(){return stored;},async getUser(){return {data:{user:null},error};}};
  await assert.rejects(verifiedSessionUser(auth,async()=>{cleared++;}),/sessão expirou/);
  assert.equal(cleared,1);
 }
});

test('the real Supabase SDK restores, refreshes and removes a persistent session',async()=>{
 const shared=new MemoryStorage(),legacyTab=new MemoryStorage();
 const user={id:'00000000-0000-4000-8000-000000000001',email:'fixture@example.test',user_metadata:{}};
 let refreshes=0,verified=0;
 const fetchFixture=async(input,init)=>{
  const url=new URL(String(input));
  if(url.pathname==='/auth/v1/token'){
   if(url.searchParams.get('grant_type')==='refresh_token')refreshes++;
   return Response.json({access_token:'synthetic-access-'+refreshes,refresh_token:'synthetic-refresh-'+refreshes,expires_in:3600,token_type:'bearer',user});
  }
  if(url.pathname==='/auth/v1/user'){verified++;return Response.json(user);}
  if(url.pathname==='/auth/v1/logout')return new Response(null,{status:204});
  assert.fail('unexpected fixture request: '+url.pathname);
 };
 const client=tab=>createClient('https://session-fixture.supabase.co','synthetic-publishable-key',{global:{fetch:fetchFixture},auth:{storage:makeAuthStorage(tab,shared),storageKey:key,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 const first=client(legacyTab);
 try{
  const {error}=await first.auth.signInWithPassword({email:user.email,password:'synthetic-test-password'});assert.equal(error,null);
  assert.equal(legacyTab.getItem(key),null);
  await first.auth.dispose();legacyTab.clear();
  const saved=JSON.parse(shared.getItem(key));saved.expires_at=Math.floor(Date.now()/1000)-10;
  makeAuthStorage(legacyTab,shared).setItem(key,JSON.stringify(saved));
  const reopened=client(new MemoryStorage());
  try{
   assert.equal((await verifiedSessionUser(reopened.auth,async()=>assert.fail('unexpected logout'))).id,user.id);
   assert.equal(refreshes,1);assert.equal(verified,1);
   const {error:logoutError}=await reopened.auth.signOut({scope:'local'});assert.equal(logoutError,null);
   assert.equal(makeAuthStorage(new MemoryStorage(),shared).getItem(key),null);
   assert.equal((await reopened.auth.getSession()).data.session,null);
  }finally{await reopened.auth.dispose();}
 }finally{await first.auth.dispose();}
});
