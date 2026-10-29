import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Camera,Check,ChevronRight,X,MapPin,Truck,ClipboardList} from 'lucide-react';
import type {EntryFields,FieldEntry,Module} from './field-types';
import type {FieldClient} from './field-api';
import {blankEntry,statusLabels,priorityLabels,validateEntry} from './field-model.mjs';

type Photo={blob:Blob,url:string};
async function compress(file:File){const bmp=await createImageBitmap(file);try{const c=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(bmp.width,bmp.height));c.width=Math.max(1,Math.round(bmp.width*scale));c.height=Math.max(1,Math.round(bmp.height*scale));c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);return await new Promise<Blob>((resolve,reject)=>c.toBlob(b=>b&&b.size<=1200000?resolve(b):reject(Error('Não foi possível preparar a foto. Tente uma imagem menor.')),'image/jpeg',.7));}finally{bmp.close();}}
export default function FieldEditor({kind,original,client,onClose,onSaved}:{kind:Module,original:FieldEntry|null,client:FieldClient,onClose:()=>void,onSaved:(row:FieldEntry)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),id=useRef(original?.id||crypto.randomUUID()),photoRefs=useRef<Photo[]>([]);
 const [form,setForm]=useState<EntryFields>(()=>{const f=blankEntry(kind);if(original)for(const k of Object.keys(f) as (keyof EntryFields)[])Object.assign(f,{[k]:original[k]});return f;});
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[photos,setPhotos]=useState<Photo[]>([]),[existingUrls,setExistingUrls]=useState<string[]>([]);
 useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{photoRefs.current.forEach(p=>URL.revokeObjectURL(p.url));dialog.current?.close();previous?.focus()}},[]);
 const blocked=busy||preparing;
 function close(){if(!blocked&&(!dirty||window.confirm('Descartar as alterações deste formulário?')))onClose();}
 function field<K extends keyof EntryFields>(key:K,value:EntryFields[K]){setForm(f=>({...f,[key]:value}));setDirty(true);}
 const text=(key:keyof EntryFields,label:string,required=false,placeholder='',maxLength=160)=><label>{label}{required&&<span aria-hidden="true"> *</span>}<input required={required} maxLength={maxLength} value={String(form[key]??'')} placeholder={placeholder} onChange={e=>field(key,e.target.value as never)}/></label>;
 const number=(key:'headcount'|'water_liters'|'refills'|'quantity',label:string,max:number)=><label>{label}<input type="number" inputMode={key==='quantity'?'decimal':'numeric'} min={key==='headcount'?1:0} max={max} step={key==='quantity'?'0.01':1} value={form[key]??''} onChange={e=>field(key,e.target.value===''?null:Number(e.target.value))}/></label>;
 async function addPhotos(files:FileList|null){if(!files)return;setPreparing(true);setError('');const added:Photo[]=[];try{if(photos.length+files.length>3)throw Error('Você pode anexar até três fotos por lançamento.');for(const file of Array.from(files)){if(!file.type.startsWith('image/'))throw Error('Selecione apenas imagens.');if(file.size>25000000)throw Error('Escolha uma imagem de até 25 MB.');const blob=await compress(file);added.push({blob,url:URL.createObjectURL(blob)});}const next=[...photoRefs.current,...added];photoRefs.current=next;setPhotos(next);setDirty(true);}catch(e){added.forEach(p=>URL.revokeObjectURL(p.url));setError((e as Error).message);}finally{setPreparing(false);}}
 async function save(event:FormEvent){event.preventDefault();setError('');setBusy(true);try{validateEntry(form);const row=await client.save(form,id.current,original,photos.map(p=>p.blob));setDirty(false);onSaved(row);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <dialog ref={dialog} className="fo-dialog" aria-labelledby="entry-title" onCancel={e=>{e.preventDefault();close()}}>
  <div className="fo-dialog-head"><div><span className="fo-overline">{kind==='washing'?'LAVAGEM · PIPAS':'DEMANDAS'}</span><h2 id="entry-title">{original?'Editar lançamento':'Novo lançamento'}</h2></div><button type="button" aria-label="Fechar formulário" disabled={blocked} onClick={close}><X size={21}/></button></div>
  <form onSubmit={save}><fieldset disabled={blocked} className="fo-fieldset"><div className="fo-form-intro">Registre um atendimento por local. Os campos com * são obrigatórios.</div>
   <section className="fo-form-section"><h3><ClipboardList size={18}/> Serviço e situação</h3><div className="fo-form-grid">
    <label>Data do serviço *<input type="date" required value={form.service_date} onChange={e=>field('service_date',e.target.value)}/></label>
    <label>Situação *<select value={form.status} onChange={e=>field('status',e.target.value as EntryFields['status'])}>{Object.entries(statusLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    {text('title',kind==='washing'?'Serviço / local de lavagem':'Título da demanda',true,kind==='washing'?'Ex.: Lavagem da Praça 7 de Setembro':'Ex.: Limpeza de descarte irregular')}
    <label>Prioridade<select value={form.priority} onChange={e=>field('priority',e.target.value as EntryFields['priority'])}>{Object.entries(priorityLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
    {kind==='demand'?<label>Tipo de serviço<select value={form.service} onChange={e=>field('service',e.target.value)}>{['Limpeza de área','Coleta de resíduos','Capina','Roçada','Varrição de apoio','Apoio operacional','Outro'].map(v=><option key={v}>{v}</option>)}</select></label>:<label>Tipo de local<select value={form.washing_target} onChange={e=>field('washing_target',e.target.value)}>{['Praça','Parque','Feira livre','Via pública','Outro'].map(v=><option key={v}>{v}</option>)}</select></label>}
    {text('protocol','Protocolo / ordem de serviço',false,'Se houver',100)}
   </div></section>
   <section className="fo-form-section"><h3><MapPin size={18}/> Local e equipe</h3><div className="fo-form-grid">
    {text('location','Local / endereço',true,'Rua, praça, parque ou feira',200)}
    {text('neighborhood','Bairro',false,'Ex.: Campos Elíseos',120)}
    {text('segment','Trecho / ponto de referência',false,'Ex.: entre as ruas A e B',200)}
    {text('requester','Solicitante',false,'Ex.: programação diária / Prefeitura')}
    {text('responsible','Responsável pelo registro / fiscal',true,'Nome do responsável')}
    {text('team','Equipe',true,'Ex.: Padrão 1 / Pipa')}
    {number('headcount','Quantidade de colaboradores',300)}
   </div></section>
   {kind==='washing'&&<section className="fo-form-section"><h3><Truck size={18}/> Caminhão pipa</h3><div className="fo-form-grid">
    {text('vehicle','Caminhão / placa ou prefixo',true,'Ex.: final 75',80)}
    {text('driver','Motorista',true,'Nome do motorista')}
    {text('helpers','Ajudantes',false,'Nomes dos ajudantes',300)}
    {number('water_liters','Água utilizada (litros)',1000000)}
    {number('refills','Quantidade de reabastecimentos',100)}
   </div><p className="fo-muted">Água e reabastecimentos são opcionais. Deixe em branco quando não souber.</p></section>}
   <section className="fo-form-section"><h3>Execução e observações</h3><div className="fo-form-grid">
    <label>Horário de início<input type="time" value={form.start_time??''} onChange={e=>field('start_time',e.target.value||null)}/></label>
    <label>Horário de término<input type="time" value={form.end_time??''} onChange={e=>field('end_time',e.target.value||null)}/></label>
    {number('quantity','Quantidade executada',1000000000)}
    <label>Unidade da quantidade<select value={form.unit} onChange={e=>field('unit',e.target.value)}><option value="">Não informada</option>{['m²','m','kg','sacos','unidades','locais'].map(v=><option key={v}>{v}</option>)}</select></label>
   </div><label className="fo-checkbox"><input type="checkbox" checked={form.overnight} onChange={e=>field('overnight',e.target.checked)}/>O serviço terminou no dia seguinte</label>
    <label>Descrição do serviço<textarea rows={3} maxLength={2000} value={form.description} placeholder="O que foi programado ou realizado?" onChange={e=>field('description',e.target.value)}/></label>
    <label>Observações / motivo da pendência<textarea rows={3} maxLength={2000} value={form.notes} placeholder="Impedimentos, necessidade de retorno ou outras informações." onChange={e=>field('notes',e.target.value)}/></label>
   </section>
   <section className="fo-form-section"><h3><Camera size={18}/> Fotos do atendimento <span className="fo-muted">opcional</span></h3>
    {!original?<><label className="fo-upload">Adicionar até 3 fotos<input type="file" accept="image/*" multiple onChange={e=>{void addPhotos(e.target.files);e.target.value=''}}/></label><div className="fo-photo-grid">{photos.map((p,i)=><div key={p.url}><img src={p.url} alt={'Evidência '+(i+1)}/><button type="button" aria-label={'Remover foto '+(i+1)} onClick={()=>{URL.revokeObjectURL(p.url);const next=photos.filter((_,n)=>n!==i);photoRefs.current=next;setPhotos(next);setDirty(true)}}><X size={16}/></button></div>)}</div></>:<>{original.photos.length?<><button type="button" onClick={async()=>{setError('');try{setExistingUrls(await client.photoUrls(original.photos))}catch(e){setError((e as Error).message)}}}>Abrir / atualizar {original.photos.length} foto(s)</button><div className="fo-photo-grid">{existingUrls.map((url,i)=><a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt={'Evidência salva '+(i+1)}/></a>)}</div><p className="fo-muted">As fotos originais são preservadas. Os links expiram em um minuto.</p></>:<p className="fo-muted">Nenhuma foto anexada a este lançamento.</p>}</>}
   </section>
  </fieldset>
  {error&&<p className="fo-alert" role="alert">{error}</p>}
  <div className="fo-editor-actions"><button type="button" disabled={blocked} onClick={close}>Cancelar</button><button className="fo-primary" disabled={blocked} type="submit">{busy?'Salvando…':preparing?'Preparando fotos…':original?'Salvar alterações':'Salvar lançamento'}{!blocked&&<Check size={18}/>}</button></div>
  </form>
 </dialog>;
}
