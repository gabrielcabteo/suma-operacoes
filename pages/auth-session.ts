import type {SupabaseClient} from '@supabase/supabase-js';

export class SessionRestoreError extends Error {
 name='SessionRestoreError';
}

function invalidSession(error:{status?:number,code?:string,name?:string}|null){
 return !!error&&(error.status===401||error.status===403||error.name==='AuthSessionMissingError'||['session_not_found','refresh_token_not_found','refresh_token_already_used','user_not_found','bad_jwt'].includes(error.code||''));
}

// Server validation remains mandatory. A network failure must not erase a login.
export async function verifiedSessionUser(auth:Pick<SupabaseClient['auth'],'getSession'|'getUser'>,clearInvalidSession:()=>Promise<void>){
 let result;
 try{result=await auth.getSession();}catch{throw new SessionRestoreError('Não foi possível restaurar seu acesso. Confira a conexão e tente novamente.');}
 const {data:stored,error:sessionError}=result;
 if(sessionError){
  if(invalidSession(sessionError))throw Error('Sua sessão expirou. Entre novamente.');
  throw new SessionRestoreError('Não foi possível restaurar seu acesso. Confira a conexão e tente novamente.');
 }
 if(!stored.session)return null;
 let verified;
 try{verified=await auth.getUser();}catch{throw new SessionRestoreError('Seu acesso está salvo. Confira a conexão e tente novamente.');}
 if(verified.error||!verified.data.user){
  if(invalidSession(verified.error)){
   await clearInvalidSession();
   throw Error('Sua sessão expirou. Entre novamente.');
  }
  throw new SessionRestoreError('Seu acesso está salvo. Não foi possível validá-lo agora. Confira a conexão e tente novamente.');
 }
 return verified.data.user;
}
