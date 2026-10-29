import assert from 'node:assert/strict';
import {readSheet} from 'read-excel-file/node';
import {blankVisit,csvHeaders,deriveImportRows,guessMapping,jobKey,nearbyAddress,parseDate,snapshotRows,today,validateJob,validateVisit,washingCsv} from './pipa-model.mjs';
// A small actual XLSX workbook tests the parser, including a formatted Excel date.
function zip(files){
 const parts=[],directory=[];let offset=0,size=0;
 const crc=data=>{let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;}return(n^0xffffffff)>>>0};
 for(const [path,text] of files){const name=Buffer.from(path),data=Buffer.from(text),sum=crc(data),l=Buffer.alloc(30+name.length),c=Buffer.alloc(46+name.length);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt32LE(sum,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(name.length,26);name.copy(l,30);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt32LE(sum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);name.copy(c,46);parts.push(l,data);directory.push(c);offset+=l.length+data.length;size+=c.length;}const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);return Buffer.concat([...parts,...directory,end]);
}
const inline=(ref,text)=>'<c r="'+ref+'" t="inlineStr"><is><t>'+text+'</t></is></c>';
const serial=(Date.UTC(2026,10,1)-Date.UTC(1899,11,30))/86400000;
const workbook=zip([
 ['[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
 ['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Programação" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml','<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>'],
 ['xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">'+['Data','Local','Equipe','Ordem','Bairro','Observações'].map((s,i)=>inline(String.fromCharCode(65+i)+'1',s)).join('')+'</row><row r="2"><c r="A2" s="1"><v>'+serial+'</v></c>'+inline('B2','Praça da Cidadania')+'<c r="C2"><v>1</v></c><c r="D2"><v>1</v></c>'+inline('E2','Centro')+inline('F2','Lavar após a feira')+'</row><row r="3">'+inline('A3','02/11/2026')+inline('B3','Parque de teste')+inline('C3','Ambas')+'</row><row r="4">'+inline('A4','31/11/2026')+inline('B4','Data inválida')+'</row></sheetData></worksheet>']
]);
const teams=[{id:'pipa-1',name:'Pipa 1',driver:'Motorista 1',vehicle:'Veículo 1',helpers:''},{id:'pipa-2',name:'Pipa 2',driver:'Motorista 2',vehicle:'Veículo 2',helpers:''}];
const data=await readSheet(workbook),map=guessMapping(data[0]),imported=deriveImportRows(data,1,map,'2026-11','',teams);
assert.ok(data[1][0] instanceof Date);assert.equal(imported.length,4);
assert.equal(imported[0].values.service_date,'2026-11-01');assert.equal(imported[0].values.team_id,'pipa-1');
assert.deepEqual(imported.slice(1,3).map(r=>r.values.team_id),['pipa-1','pipa-2']);
assert.equal(validateJob(imported[0].values,'2026-11').length,0);
assert.ok(validateJob(imported[3].values,'2026-11').some(e=>e.includes('Data inválida')));
assert.equal(parseDate('29/02/2028','2028-02'),'2028-02-29');assert.equal(parseDate('29/02/2026','2026-02'),'');
assert.equal(jobKey({...imported[0].values,location:'  PRACA   da Cidadania '}),jobKey(imported[0].values));
assert.notEqual(jobKey(imported[1].values),jobKey(imported[2].values));
const f={...blankVisit(null,teams[0],'Fiscal'),title:'Lavagem',location:'Local',started_at:new Date().toISOString()};
validateVisit(f);assert.throws(()=>validateVisit({...f,status:'completed',finished_at:f.started_at}),/foto/);
assert.throws(()=>validateVisit({...f,status:'partial',finished_at:f.started_at,photo_justification:'Justificativa do teste'}),/motivo/);
validateVisit({...f,status:'completed',finished_at:f.started_at,photo_justification:'Justificativa do teste'});
const v={...f,id:'visit',job_id:'job',service_date:'2026-11-01',status:'completed',title:'=1+1',notes:'Texto; "com aspas"\ne quebra',latitude:0,longitude:0,accuracy_m:5,water_liters:0,refills:0,created_at:'2026-11-01T08:00:00Z',updated_at:'2026-11-01T09:00:00Z',author_id:'author',updated_by:'actor',finished_at:f.started_at};
const job={...imported[0].values,id:'job',source_file:'programação.xlsx',published:true,cancelled:false};
const snapshot={teams,jobs:[job],visits:[v]};
const csv=washingCsv(snapshot,'2026-11');
function parse(raw){const out=[],row=[];let value='',quoted=false;for(let i=1;i<raw.length;i++){const c=raw[i];if(c==='"'){if(quoted&&raw[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(c===';'&&!quoted){row.push(value);value='';}else if(c==='\r'&&raw[i+1]==='\n'&&!quoted){row.push(value);out.push([...row]);row.length=0;value='';i++;}else value+=c;}row.push(value);out.push(row);return out;}
const parsed=parse(csv);assert.equal(csv.charCodeAt(0),0xfeff);assert.equal(parsed[0].length,csvHeaders.length);assert.equal(parsed[1].length,csvHeaders.length);assert.equal(parsed[1][5],"'=1+1");assert.equal(parsed[1][20],'0');assert.equal(parsed[1][21],'0');assert.equal(parsed[1][23],v.notes);assert.ok(parsed[1][31].endsWith('query=0,0'));assert.equal(parsed[1][40],'author');assert.equal(parsed[1][41],'actor');
assert.equal(snapshotRows(snapshot,'2026-11').length,1);assert.equal(snapshotRows(snapshot,'2026-12').length,0);
assert.equal(nearbyAddress([v],0,0)?.location,'Local');assert.equal(nearbyAddress([v],1,1),null);
assert.equal(nearbyAddress([{...v,accuracy_m:300}],0,0),null);
console.log('Pipa checks passed: actual XLSX dates and rows, team distribution, validation, CSV, local address matching.');
