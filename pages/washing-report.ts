import type {PipaClient} from './pipa-api';
import type {Snapshot,Visit} from './pipa-types';
import {makeZip,download} from './archive-format';

const enc=new TextEncoder();
const xml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const emu=(inches:number)=>Math.round(inches*914400);
const paragraph=(text:string,style='Normal')=>'<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+xml(text)+'</w:t></w:r></w:p>';
function jpegSize(data:Uint8Array){
 let i=2;
 while(i<data.length-9){
  if(data[i]!==0xff){i++;continue;}
  const marker=data[i+1];i+=2;
  if(marker===0xd8||marker===0xd9||marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
  const length=(data[i]<<8)|data[i+1];
  if(length<2||i+length>data.length)break;
  if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
   const height=(data[i+3]<<8)|data[i+4],width=(data[i+5]<<8)|data[i+6];
   if(width&&height)return {width,height};
  }
  i+=length;
 }
 return {width:4,height:3};
}
function imageDrawing(rel:string,id:number,name:string,data:Uint8Array){
 const {width,height}=jpegSize(data),maxW=emu(5.9),maxH=emu(3.9),scale=Math.min(maxW/width,maxH/height);
 const cx=Math.round(width*scale),cy=Math.round(height*scale);
 return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="180"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="'+cx+'" cy="'+cy+'"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="'+id+'" name="'+xml(name)+'" descr="'+xml(name)+'"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="'+id+'" name="'+xml(name)+'"/><pic:cNvPicPr><a:picLocks noChangeAspect="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="'+rel+'"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="'+cx+'" cy="'+cy+'"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}
function dateLabel(date:string){return date.split('-').reverse().join('/');}
function visitPhotos(v:Visit){return [...v.photos_before.map(path=>({path,caption:'Antes da lavagem'})),...v.photos_after.map(path=>({path,caption:'Depois da lavagem'}))];}

export async function createWashingDocx(snapshot:Snapshot,month:string,client:PipaClient,onProgress?:(message:string)=>void):Promise<Blob>{
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Escolha um mês válido.');
 const visits=snapshot.visits.filter(v=>v.service_date.startsWith(month)&&v.status!=='cancelled').sort((a,b)=>a.service_date.localeCompare(b.service_date)||(a.started_at||a.created_at).localeCompare(b.started_at||b.created_at)||a.id.localeCompare(b.id));
 if(!visits.length)throw Error('Não há atendimentos registrados neste mês para gerar o relatório.');
 const groups:{date:string;location:string;visits:Visit[]}[]=[];
 const groupMap=new Map<string,{date:string;location:string;visits:Visit[]}>();
 for(const v of visits){const location=v.location.trim()||'Local não informado';const key=v.service_date+'|'+location.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');let group=groupMap.get(key);if(!group){group={date:v.service_date,location,visits:[]};groupMap.set(key,group);groups.push(group);}group.visits.push(v);}
 const entries=groups.flatMap(g=>g.visits.flatMap(v=>visitPhotos(v).map(p=>({...p,visit:v}))));
 const downloaded=new Map<string,Uint8Array>();
 for(let start=0;start<entries.length;start+=40){
  const batch=entries.slice(start,start+40),paths=batch.map(p=>p.path);
  const urls=await client.photos(paths);
  if(urls.length!==batch.length)throw Error('Não foi possível localizar todas as fotografias do relatório.');
  const responses=await Promise.all(urls.map(url=>fetch(url)));
  if(responses.some(response=>!response.ok))throw Error('Falha ao baixar uma fotografia. Atualize os registros e tente novamente.');
  const buffers=await Promise.all(responses.map(response=>response.arrayBuffer()));
  for(let i=0;i<batch.length;i++){
   downloaded.set(batch[i].path,new Uint8Array(buffers[i]));
   onProgress?.('Baixando fotografias: '+(start+i+1)+' de '+entries.length);
  }
 }
 const rels:string[]=['<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'];
 const media:{name:string,data:Uint8Array}[]=[];
 let imageId=0;
 const body=[paragraph('SUMA BRASIL','Title'),paragraph('RELATÓRIO MENSAL DE LAVAGEM','Subtitle'),paragraph(new Date(month+'-02T12:00:00Z').toLocaleDateString('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}),'Subtitle')];
 let currentDate='';
 for(const group of groups){
  if(group.date!==currentDate){currentDate=group.date;body.push(paragraph(dateLabel(currentDate),'Heading1'));}
  body.push(paragraph(group.location,'Heading2'));
  const photos=group.visits.flatMap(v=>visitPhotos(v));
  if(!photos.length){body.push(paragraph('Nenhuma fotografia registrada neste local nesta data.'));continue;}
  for(const p of photos){
   imageId++;
   const rel='rIdImage'+imageId,name='fotografia-'+String(imageId).padStart(4,'0')+'.jpg';
   rels.push('<Relationship Id="'+rel+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/'+name+'"/>');
   media.push({name:'word/media/'+name,data:downloaded.get(p.path)!});
   body.push(paragraph(p.caption,'Caption'));
   body.push(imageDrawing(rel,imageId,name,downloaded.get(p.path)!));
  }
 }
 body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr>');
 const documentXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>'+body.join('')+'</w:body></w:document>';
 const styles='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="20"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="1800" w:after="180"/></w:pPr><w:rPr><w:b/><w:color w:val="002332"/><w:sz w:val="34"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="120"/></w:pPr><w:rPr><w:color w:val="005F24"/><w:sz w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="180"/><w:pBdr><w:bottom w:val="single" w:sz="8" w:space="5" w:color="88CC00"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="002332"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="005F24"/><w:sz w:val="23"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="caption"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="50"/></w:pPr><w:rPr><w:color w:val="647078"/><w:sz w:val="18"/></w:rPr></w:style></w:styles>';
 const contentTypes='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
 const rootRels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
 const files=[{name:'[Content_Types].xml',data:enc.encode(contentTypes)},{name:'_rels/.rels',data:enc.encode(rootRels)},{name:'word/document.xml',data:enc.encode(documentXml)},{name:'word/styles.xml',data:enc.encode(styles)},{name:'word/_rels/document.xml.rels',data:enc.encode('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+rels.join('')+'</Relationships>')},...media];
 onProgress?.('Montando documento Word…');
 return makeZip(files);
}
export function downloadWashingDocx(blob:Blob,month:string){download(blob,'relatorio-lavagem-'+month+'.docx');}
