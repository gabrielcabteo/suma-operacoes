import React,{useState,useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import './pages.css';
import PipaHub from './pipa-hub';
import InstallApp from './install-app';
import AccountPanel from './account-panel';
import {createAccount,requestPasswordReset} from './account-api';
import {SessionRestoreError} from './auth-session';
import {configured,supabase,restoreAccess,signIn,signInWithGoogle,googleProviderEnabled,clearSession,storageClient,unavailableClient} from './storage';
function GoogleLogo(){return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.05 46.98 31.9 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}
function Root(){const [profileName,setProfileName]=useState('');const [isAdmin,setIsAdmin]=useState(false),[logged,setLogged]=useState(false),[checking,setChecking]=useState(configured),[pending,setPending]=useState(false),[account,setAccount]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[googleReady,setGoogleReady]=useState<boolean|null>(null),[mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[newName,setNewName]=useState(''),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState(''),[accountOpen,setAccountOpen]=useState(false),[recovering,setRecovering]=useState(false);
 const [userId,setUserId]=useState(''),[restoreFailed,setRestoreFailed]=useState(false);
 const activeUser=useRef(''),generation=useRef(0),retryNeeded=useRef(false),scheduledCheck=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 async function check(){
  if(scheduledCheck.current!==undefined){clearTimeout(scheduledCheck.current);scheduledCheck.current=undefined;}
  const request=++generation.current;setChecking(true);setError('');
  try{
   const access=await restoreAccess();
   if(request!==generation.current)return;
   activeUser.current=access.userId;setUserId(access.userId);
   retryNeeded.current=false;setRestoreFailed(false);
   setIsAdmin(access.admin);setLogged(access.authorized);setPending(access.signedIn&&!access.authorized);setAccount(access.email);setProfileName('name' in access?String(access.name||access.email):access.email);
  }catch(e){
   if(request!==generation.current)return;
   retryNeeded.current=e instanceof SessionRestoreError;setRestoreFailed(retryNeeded.current);
   throw e;
  }finally{if(request===generation.current)setChecking(false);}
 }
 useEffect(()=>{
  if(!configured)return;
  let alive=true;
  const retry=()=>{if(alive)void check().catch(e=>{if(alive)setError((e as Error).message)});};
  const listener=supabase?.auth.onAuthStateChange((event,session)=>{
   if(!alive)return;
   if(event==='SIGNED_OUT'){
    ++generation.current;activeUser.current='';retryNeeded.current=false;
    if(scheduledCheck.current!==undefined){clearTimeout(scheduledCheck.current);scheduledCheck.current=undefined;}
    setChecking(false);setUserId('');setLogged(false);setPending(false);setRestoreFailed(false);setAccount('');setProfileName('');setAccountOpen(false);setRecovering(false);
   }else if(session&&(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='PASSWORD_RECOVERY')&&(session.user.id!==activeUser.current||retryNeeded.current)){
    const changed=session.user.id!==activeUser.current;
    ++generation.current;activeUser.current=session.user.id;
    setChecking(true);setLogged(false);setPending(false);
    if(changed){setUserId('');setAccountOpen(false);setRecovering(false);setProfileName('');}
    if(scheduledCheck.current!==undefined)clearTimeout(scheduledCheck.current);
    // Keep SDK calls outside its synchronous auth notification/lock.
    scheduledCheck.current=setTimeout(retry,0);
   }
   if(event==='PASSWORD_RECOVERY'){setRecovering(true);setAccountOpen(true);}
  });
  async function initialize(){try{const callback=new URL(window.location.href);if(callback.searchParams.has('error')||callback.hash.includes('error=')){window.history.replaceState({},'',import.meta.env.BASE_URL);setChecking(false);throw Error('O login foi cancelado ou não pôde ser concluído. Tente novamente.');}await check();}catch(e){if(alive)setError((e as Error).message);}}
  const reconnect=()=>{if(retryNeeded.current)retry();};
  window.addEventListener('online',reconnect);
  initialize();googleProviderEnabled().then(v=>alive&&setGoogleReady(v)).catch(()=>{});
  return()=>{alive=false;++generation.current;if(scheduledCheck.current!==undefined)clearTimeout(scheduledCheck.current);window.removeEventListener('online',reconnect);listener?.data.subscription.unsubscribe()};
 },[]);
 function chooseMode(next:'login'|'signup'|'reset'){setMode(next);setError('');setNotice('');setPassword('');setConfirmation('');}
 async function login(e:React.FormEvent){e.preventDefault();setError('');setNotice('');if(mode==='signup'&&password!==confirmation){setError('As senhas não coincidem.');return;}setBusy(true);try{if(mode==='signup'){const result=await createAccount(newName,email,password);setPassword('');setConfirmation('');setMode('login');if(result.needsConfirmation)setNotice('Confira seu e-mail e confirme o cadastro. Depois volte aqui para entrar. Se já tiver uma conta, use Entrar.');else await check();}else if(mode==='reset'){await requestPasswordReset(email);setNotice('Se houver uma conta para esse e-mail, você receberá um link para definir uma nova senha. Abra no mesmo navegador em que fez a solicitação.');}else{await signIn(email.trim(),password);setPassword('');await check();}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function googleLogin(){setError('');setBusy(true);try{await signInWithGoogle();}catch(e){setError((e as Error).message);setBusy(false);}}
 async function logout(){setBusy(true);setError('');try{await clearSession();setLogged(false);setPending(false);setRestoreFailed(false);retryNeeded.current=false;setAccount('');setAccountOpen(false);setRecovering(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(configured&&checking)return <div className="login-shell"><div className="login-card" role="status"><img src={import.meta.env.BASE_URL+'suma-brasil.png'} alt="SUMA Brasil" width="132"/><h1>Validando seu acesso…</h1><p>Aguarde um instante.</p></div></div>;
 if(configured&&restoreFailed)return <div className="login-shell"><div className="login-card"><img src={import.meta.env.BASE_URL+'suma-brasil.png'} alt="SUMA Brasil" width="132"/><h1>Acesso salvo</h1><p>Precisamos de conexão para validar seu acesso e carregar a operação.</p>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={()=>void check().catch(e=>setError((e as Error).message))}>Tentar novamente</button><button className="logout-secondary" disabled={busy} onClick={logout}>Sair / trocar conta</button></div></div>;
 if(configured&&pending)return <div className="login-shell"><div className="login-card"><img src={import.meta.env.BASE_URL+'suma-brasil.png'} alt="SUMA Brasil" width="132"/><h1>Acesso indisponível</h1><p>Não foi possível acessar a operação com esta conta. Ela pode estar bloqueada ou precisar de confirmação.</p><p className="account-email">{account}</p><p>Fale com o responsável ou tente outra conta.</p>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await check()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>Tentar novamente</button><button className="logout-secondary" disabled={busy} onClick={logout}>Usar outra conta</button></div></div>;
 if(configured&&!logged)return <div className="login-shell"><div className="login-card"><img src={import.meta.env.BASE_URL+'suma-brasil.png'} alt="SUMA Brasil" width="132"/><h1>{mode==='signup'?'Criar conta':mode==='reset'?'Recuperar senha':'Lavagens · SUMA Brasil'}</h1><p>{mode==='signup'?'Preencha seus dados para começar.':mode==='reset'?'Receba por e-mail um link para definir uma nova senha.':'Entre com sua conta Google ou com e-mail e senha.'}</p>{mode!=='reset'&&<><button className="google-login" disabled={busy||googleReady===false} onClick={googleLogin}><GoogleLogo/>{busy?'Aguarde…':mode==='signup'?'Criar conta com Google':'Entrar com Google'}</button>{googleReady===false&&<p className="provider-note">Login Google em configuração. O acesso com e-mail e senha continua disponível.</p>}<div className="login-divider"><span>ou use e-mail e senha</span></div></>}{notice&&<p className="account-success" role="status">{notice}</p>}<form onSubmit={login}>{mode==='signup'&&<label>Nome completo<input required autoComplete="name" maxLength={160} value={newName} onChange={e=>setNewName(e.target.value)}/></label>}<label>E-mail<input type="email" autoComplete="username" inputMode="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>{mode!=='reset'&&<label>{mode==='signup'?'Crie uma senha':'Senha'}<input type="password" autoComplete={mode==='signup'?'new-password':'current-password'} required minLength={mode==='signup'?8:undefined} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}{mode==='signup'&&<><label>Confirmar senha<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label><p className="hint">Use pelo menos 8 caracteres. Crie uma senha própria para este sistema.</p></>}{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Aguarde…':mode==='signup'?'Criar minha conta':mode==='reset'?'Enviar link de recuperação':'Entrar no sistema'}</button></form><div className="account-links">{mode==='login'?<><button type="button" disabled={busy} onClick={()=>chooseMode('signup')}>Criar conta</button><button type="button" disabled={busy} onClick={()=>chooseMode('reset')}>Esqueci minha senha</button></>:<button type="button" disabled={busy} onClick={()=>chooseMode('login')}>Voltar para entrar</button>}</div><p className="hint">Após confirmar o login, o responsável vincula sua conta à equipe do pipa.</p></div></div>;
 const sessionNotice=<><div className="session-notice"><span>{account||'Acesso autenticado'}</span><div className="account-toolbar"><button disabled={busy} onClick={()=>setAccountOpen(true)}>Minha conta</button><button disabled={busy} onClick={logout}>Sair / trocar conta</button></div></div>{error&&<p className="alert" role="alert">{error}</p>}</>;
 return <>{configured&&logged?<PipaHub key={userId} notice={sessionNotice} name={profileName||account}/>:<div className="login-shell"><div className="login-card"><h1>Lavagens · SUMA Brasil</h1><p>O acesso estará disponível quando o armazenamento for conectado.</p></div></div>}{logged&&accountOpen&&<AccountPanel recoveryMode={recovering} onClose={()=>{setAccountOpen(false);setRecovering(false);setNotice('')}}/>}</>;

}
if('serviceWorker' in navigator)window.addEventListener('load',()=>{navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{/* Web access remains available without installation. */})});
createRoot(document.getElementById('root')!).render(<><Root/><InstallApp/></>);

