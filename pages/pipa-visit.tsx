import {useEffect,useRef,useState} from 'react';
import {Camera,Check,LocateFixed,Play,Save,X} from 'lucide-react';
import {PipaModal} from './pipa-dialogs';
import {PipaError,type PipaClient} from './pipa-api';
import {draftKey,putDraft,removeDraft} from './pipa-drafts';
import {blankVisit,localTime,nearbyAddress,statusLabels,targets,today,validateVisit} from './pipa-model.mjs';
import type {Draft,GeoResult,Job,LocalPhoto,Snapshot,Team,Visit,VisitForm,VisitStatus} from './pipa-types';
async function compress(file:File){
 if(!file.type.startsWith('image/')||file.size>25000000)throw Error('Escolha uma imagem de até 25 MB.');
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.size<=1200000?resolve(blob):reject(Error('Não foi possível preparar a imagem. Escolha uma foto menor.')),'image/jpeg',.7));}finally{bitmap.close();}
}
export default function VisitDialog({job,visit,draft,team,snapshot,name,client,onClose,onSaved,onDraftChanged,onQueued}:{job:Job|null;visit:Visit|null;draft:Draft|null;team:Team;snapshot:Snapshot;name:string;client:PipaClient;onClose:()=>void;onSaved:(row:Visit)=>void;onDraftChanged:()=>void;onQueued:()=>void}){
 const [form,setForm]=useState<VisitForm>(()=>draft?.form||(visit?{...visit}:blankVisit(job,team,name)));
 const [photos,setPhotos]=useState<LocalPhoto[]>(draft?.photos||[]),[preview,setPreview]=useState<{id:string;url:string;phase:string}[]>([]),[savedUrls,setSavedUrls]=useState<string[]>([]);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[capturing,setCapturing]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[draftMessage,setDraftMessage]=useState(draft?'Rascunho recuperado deste aparelho.':''),[suggestion,setSuggestion]=useState<GeoResult|null>(null);
 const metadata=useRef<Draft|null>(draft),timer=useRef<ReturnType<typeof setTimeout>|null>(null),blocked=busy||preparing||capturing;
 const originalExpected=visit?.updated_at||draft?.expected||null;
 function makeDraft(state:Draft['state'],f=form):Draft{
  const base=metadata.current,previous=[...new Set([...(base?.previous||[]),...(base?.state==='pending'?[base.mutation]:[])])].slice(-50);
  return {key:draftKey(snapshot.user_id,f.id),user_id:snapshot.user_id,id:f.id,form:f,photos,expected:base?.expected??originalExpected,mutation:state==='pending'?crypto.randomUUID():base?.mutation||crypto.randomUUID(),previous,state,error:'',modified:Date.now()};
 }
 useEffect(()=>{const next=photos.map(p=>({id:p.id,phase:p.phase,url:URL.createObjectURL(p.blob)}));setPreview(next);return()=>next.forEach(p=>URL.revokeObjectURL(p.url))},[photos]);
 useEffect(()=>{if(!dirty||busy||preparing)return;timer.current=setTimeout(()=>{void putDraft(makeDraft('draft')).then(()=>{setDraftMessage('Rascunho guardado neste aparelho.');onDraftChanged()}).catch(e=>setDraftMessage(e.message))},500);return()=>{if(timer.current)clearTimeout(timer.current)}},[form,photos,dirty,busy,preparing]);
 function change<K extends keyof VisitForm>(k:K,v:VisitForm[K]){setForm(f=>({...f,[k]:v}));setDirty(true);setError('');}
 async function close(){if(blocked)return;if(timer.current)clearTimeout(timer.current);if(dirty){try{await putDraft(makeDraft('draft'));onDraftChanged()}catch(e){setError((e as Error).message);return;}}onClose();}
 async function send(mode:'start'|'finish'|'save'){
  if(blocked)return;if(timer.current)clearTimeout(timer.current);setError('');setBusy(true);
  const now=new Date().toISOString();const next:VisitForm={...form,...(mode==='start'?{status:'in_progress',started_at:form.started_at||now,finished_at:null}:mode==='finish'?{status:form.status==='in_progress'?'completed':form.status,finished_at:now}:{})};
  setForm(next);
  try{
   validateVisit(next,next.photos_before.length+photos.filter(p=>p.phase==='before').length,next.photos_after.length+photos.filter(p=>p.phase==='after').length);
   const queued=makeDraft('pending',next);await putDraft(queued);metadata.current=queued;onDraftChanged();
   if(!navigator.onLine){setDirty(false);onQueued();return;}
   try{const saved=await client.saveVisit(queued);await removeDraft(queued.key);setDirty(false);onDraftChanged();onSaved(saved)}
   catch(e){if(e instanceof PipaError&&e.retryable||!navigator.onLine){setDirty(false);onQueued();return;}const failed={...queued,state:'error' as const,error:(e as Error).message,modified:Date.now()};metadata.current=failed;await putDraft(failed);onDraftChanged();throw e;}
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function add(files:FileList|null,phase:'before'|'after'){
  if(!files)return;setPreparing(true);setError('');try{const count=(phase==='before'?form.photos_before.length:form.photos_after.length)+photos.filter(p=>p.phase===phase).length;if(count+files.length>(phase==='before'?2:3))throw Error(phase==='before'?'Use até duas fotos antes.':'Use até três fotos depois.');const added:LocalPhoto[]=[];for(const file of Array.from(files))added.push({id:crypto.randomUUID(),phase,blob:await compress(file)});setPhotos(p=>[...p,...added]);setDirty(true)}catch(e){setError((e as Error).message)}finally{setPreparing(false)}
 }
 async function locate(){
  setError('');setInfo('');setCapturing(true);try{
   if(!navigator.geolocation)throw Error('A localização não está disponível neste navegador. Informe o endereço manualmente.');
   const position=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
   const stamp=new Date(position.timestamp).toISOString();
   setForm(f=>({...f,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy_m:Math.round(position.coords.accuracy),location_captured_at:stamp}));setDirty(true);
   setInfo('Coordenadas capturadas. Precisão aproximada: '+Math.round(position.coords.accuracy)+' m.');
   const found=position.coords.accuracy<=50?nearbyAddress(snapshot.visits,position.coords.latitude,position.coords.longitude):null;
   if(found){setSuggestion(found);if(!form.location.trim()){setForm(f=>({...f,location:found.location,neighborhood:found.neighborhood||f.neighborhood}));setInfo('Endereço de um atendimento anterior próximo preenchido. Confira antes de salvar.');}}
  }catch(e){const ge=e as GeolocationPositionError;setError(ge.code===1?'Permita a localização nas configurações do navegador ou informe o endereço manualmente.':ge.code===3?'A localização demorou para responder. Tente novamente em uma área aberta ou informe o endereço.':(e as Error).message||'Não foi possível capturar a localização.')}finally{setCapturing(false)}
 }
 const input=<K extends keyof VisitForm>(k:K,label:string,max:number,required=false)=><label>{label}{required?' *':''}<input required={required} maxLength={max} value={String(form[k]??'')} onChange={e=>change(k,e.target.value as VisitForm[K])}/></label>;
 return <PipaModal title={visit||draft?'Atendimento de lavagem':'Novo atendimento de lavagem'} onClose={()=>{void close()}} busy={blocked}><form onSubmit={e=>{e.preventDefault();void send('save')}}>
  <fieldset className="fo-fieldset" disabled={blocked}><div className="pp-visit-summary"><span className="fo-status">{team.name}</span><strong>{job?.title||form.title||'Lavagem avulsa'}</strong>{job&&<p>Programado para {job.service_date.split('-').reverse().join('/')} · sequência {job.sequence}</p>}{job?.notes&&<p><b>Orientações:</b> {job.notes}</p>}</div>
  <section className="fo-form-section"><h3>Local do serviço</h3><button type="button" className="pp-location-button" onClick={()=>{void locate()}}><LocateFixed size={19}/>{capturing?'Localizando…':'Usar minha localização atual'}</button><p className="fo-muted">Confirme o endereço do atendimento. Se estiver preenchendo depois, informe o local onde o serviço aconteceu.</p>
  {info&&<p className="pp-info" role="status">{info}</p>}{suggestion&&<div className="pp-geo-suggestion"><strong>{suggestion.location}</strong><p>{suggestion.neighborhood}</p>{form.location!==suggestion.location&&<button type="button" onClick={()=>{setForm(f=>({...f,location:suggestion.location,neighborhood:suggestion.neighborhood||f.neighborhood}));setDirty(true)}}>Usar este endereço</button>}<small>{suggestion.attribution}. Confirme o local.</small></div>}
  <div className="fo-form-grid"><label>Data do atendimento *<input required type="date" max={today()} value={form.service_date} onChange={e=>change('service_date',e.target.value)}/></label><label>Tipo de local<select value={form.target} onChange={e=>change('target',e.target.value)}>{targets.map(v=><option key={v}>{v}</option>)}</select></label>{input('title','Serviço',160,true)}{input('location','Local / endereço',200,true)}{input('neighborhood','Bairro',120)}</div></section>
  <section className="fo-form-section"><h3>Equipe e caminhão</h3><div className="fo-form-grid">{input('driver','Motorista',160,true)}{input('vehicle','Caminhão / placa ou prefixo',80,true)}{input('responsible','Responsável pelo registro',160,true)}{input('helpers','Ajudantes',300)}</div></section>
  <section className="fo-form-section"><h3>Execução do atendimento</h3><div className="pp-timestamps"><div><span>Início</span><strong>{localTime(form.started_at)}</strong></div><div><span>Término</span><strong>{localTime(form.finished_at)}</strong></div></div>
  <label>Situação<select value={form.status} onChange={e=>{const next=e.target.value as VisitStatus;setForm(f=>({...f,status:next,...(next==='in_progress'?{finished_at:null}:{})}));setDirty(true)}}>{['in_progress','completed','partial','pending','cancelled'].map(s=><option key={s} value={s}>{statusLabels[s]}</option>)}</select></label>
  <label>Observações / motivo da pendência<textarea rows={3} maxLength={2000} value={form.notes} placeholder="Ex.: falta de água, acesso bloqueado ou necessidade de retorno." onChange={e=>change('notes',e.target.value)}/></label></section>
  <section className="fo-form-section"><h3><Camera size={18}/> Fotos do atendimento</h3>
  {(['before','after'] as const).map(phase=><div className="pp-photo-phase" key={phase}><label className="fo-upload">{phase==='before'?'Fotos antes · opcional · até 2':'Fotos depois · até 3'}<input type="file" accept="image/*" multiple onChange={e=>{const element=e.currentTarget;void add(element.files,phase).finally(()=>{element.value=''})}}/></label><div className="fo-photo-grid">{preview.filter(p=>p.phase===phase).map(p=><div key={p.id}><img src={p.url} alt={phase==='before'?'Antes da lavagem':'Depois da lavagem'}/><button type="button" aria-label="Remover foto selecionada" onClick={()=>{setPhotos(all=>all.filter(v=>v.id!==p.id));setDirty(true)}}><X size={16}/></button></div>)}</div><p className="fo-muted">{phase==='before'?form.photos_before.length:form.photos_after.length} foto(s) já salva(s) no sistema.</p></div>)}
  {(form.photos_before.length+form.photos_after.length)>0&&<><button type="button" onClick={async()=>{setError('');try{setSavedUrls(await client.photos([...form.photos_before,...form.photos_after]))}catch(e){setError((e as Error).message)}}}>Abrir / atualizar fotos salvas</button><div className="fo-photo-grid">{savedUrls.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={'Evidência salva '+(i+1)}/></a>)}</div></>}
  <label>Justificativa quando não houver foto após a lavagem<textarea maxLength={1000} rows={2} value={form.photo_justification} placeholder="Explique o motivo, se não conseguir anexar uma foto." onChange={e=>change('photo_justification',e.target.value)}/></label><p className="fo-muted">Para concluir ou registrar como parcial, anexe uma foto depois ou explique a ausência. As fotos salvas são preservadas.</p></section>
  <details className="pp-optional"><summary>Quantitativos opcionais</summary><div className="fo-form-grid">{([['water_liters','Água utilizada (L)',1000000],['refills','Reabastecimentos',100],['headcount','Quantidade de colaboradores',300]] as const).map(([k,label,max])=><label key={k}>{label}<input type="number" inputMode="numeric" min={k==='headcount'?1:0} max={max} step={1} value={form[k]??''} onChange={e=>change(k,e.target.value===''?null:Number(e.target.value))}/></label>)}</div><p className="fo-muted">Deixe em branco o que não souber. Zero significa que foi informado zero.</p></details>
  </fieldset>
  {error&&<p className="fo-alert" role="alert">{error}</p>}<p className="pp-draft-message" role="status">{draftMessage||'O preenchimento será guardado como rascunho neste aparelho.'}</p>
  <div className="fo-editor-actions pp-visit-actions"><button type="button" disabled={blocked} onClick={()=>{void close()}}>Voltar</button>
  {!form.started_at&&<button type="button" className="fo-primary" disabled={blocked} onClick={()=>{void send('start')}}><Play size={17}/>{busy?'Enviando…':'Iniciar serviço'}</button>}
  {form.started_at&&!form.finished_at&&<button type="button" className="fo-primary" disabled={blocked} onClick={()=>{void send('finish')}}><Check size={17}/>{busy?'Enviando…':'Finalizar atendimento'}</button>}
  {(form.started_at||form.status==='pending'||form.status==='cancelled')&&<button type="submit" disabled={blocked} className={form.finished_at?'fo-primary':''}><Save size={17}/>{busy?'Enviando…':'Salvar alterações'}</button>}
  </div>
 </form></PipaModal>;
}
