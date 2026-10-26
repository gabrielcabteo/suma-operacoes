import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import App from '../app/page';
import '../app/globals.css';
import './pages.css';
import {configured,hasSession,signIn,clearSession,storageClient,unavailableClient} from './storage';
function Root(){const [logged,setLogged]=useState(hasSession()),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function login(e:React.FormEvent){e.preventDefault();setError('');setBusy(true);try{await signIn(email.trim(),password);setPassword('');setLogged(true);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 if(configured&&!logged)return <div className="login-shell"><div className="login-card"><img src={import.meta.env.BASE_URL+'suma-brasil.png'} alt="SUMA Brasil" width="132"/><h1>Operações de varrição</h1><p>Entre com seu acesso autorizado.</p><form onSubmit={login}><label>E-mail<input type="email" autoComplete="username" inputMode="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="alert" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Entrando…':'Entrar no sistema'}</button></form><p className="hint">Para obter ou recuperar seu acesso, fale com o responsável pela operação.</p></div></div>;
 return <App client={configured?storageClient:unavailableClient} notice={configured?<div className="session-notice"><span>Acesso autenticado</span><button onClick={()=>{clearSession();setLogged(false)}}>Sair / entrar novamente</button></div>:<div className="setup-notice" role="status"><strong>Armazenamento ainda não conectado</strong><p>Você já está no sistema. O envio de registros e as consultas serão liberados após a configuração do armazenamento. Os dados digitados e as fotos selecionadas ainda não serão salvos.</p></div>}/>;
}
createRoot(document.getElementById('root')!).render(<Root/>);
