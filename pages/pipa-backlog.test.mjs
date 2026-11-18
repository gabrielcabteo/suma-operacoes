import assert from 'node:assert/strict';
import {brasilia,canReprogram,csvHeaders,deriveImportRows,openBacklog,rowStatus,snapshotRows,statusLabels,washingCsv} from './pipa-model.mjs';
// Pendências em aberto, Atrasado, Reprogramado e CSV com horário de Brasília.
const teams=[{id:'pipa-1',name:'Pipa 1',driver:'',vehicle:'',helpers:'',updated_at:''},{id:'pipa-2',name:'Pipa 2',driver:'',vehicle:'',helpers:'',updated_at:''}];
const job=(id,date,extra={})=>({id,team_id:'pipa-1',service_date:date,sequence:1,title:'Lavagem',location:'Praça '+id,neighborhood:'',target:'Praça',notes:'',priority:'normal',source_ref:'',maps_url:'',source_file:'',published:true,cancelled:false,author_id:'a',created_at:'2026-10-01T12:00:00Z',updated_at:'2026-10-01T12:00:00Z',return_of:null,...extra});
const visit=(id,jobId,date,status)=>({id,job_id:jobId,team_id:'pipa-1',service_date:date,status,title:'Lavagem',location:'x',neighborhood:'',target:'Praça',driver:'d',vehicle:'v',helpers:'',responsible:'r',headcount:null,started_at:'2026-10-30T13:05:00Z',finished_at:'2026-10-30T14:00:00Z',water_liters:null,refills:null,notes:'chuva',photo_justification:'',photos_before:[],photos_after:[],latitude:null,longitude:null,accuracy_m:null,location_captured_at:null,author_id:'u1',updated_by:'u2',mutation_id:'m',created_at:'2026-10-30T13:05:00Z',updated_at:'2026-10-30T14:00:00Z'});
const now='2026-11-18';
const s={teams,members:[],user_id:'u',admin:true,
 jobs:[job('late','2026-10-29'),job('partial','2026-10-30'),job('done','2026-10-31'),job('moved','2026-11-03'),job('ret','2026-11-20',{return_of:'moved'}),job('future','2026-11-25'),job('draft','2026-11-01',{published:false}),job('cancel','2026-11-02',{cancelled:true})],
 visits:[visit('v1','partial','2026-10-30','partial'),visit('v2','done','2026-10-31','completed'),visit('v3','moved','2026-11-03','pending')],
 returned:['moved']};
assert.equal(statusLabels.overdue,'Atrasado');assert.equal(statusLabels.rescheduled,'Reprogramado');
assert.equal(rowStatus(s.jobs[0],null,new Set(),now),'overdue');
assert.equal(rowStatus(s.jobs[5],null,new Set(),now),'planned');
assert.equal(rowStatus(s.jobs[6],null,new Set(),now),'draft');
assert.equal(rowStatus(s.jobs[7],null,new Set(),now),'cancelled');
const backlog=openBacklog(s,now);
assert.deepEqual(backlog.map(r=>r.job.id),['late','partial']);
assert.deepEqual(backlog.map(r=>r.status),['overdue','partial']);
assert.ok(backlog.every(canReprogram));
const nov=snapshotRows(s,'2026-11',now);
assert.equal(nov.find(r=>r.job?.id==='moved').status,'rescheduled');
assert.equal(canReprogram(nov.find(r=>r.job?.id==='moved')),false);
assert.equal(canReprogram(nov.find(r=>r.job?.id==='future')),false);
assert.equal(snapshotRows(s,'2026-10',now).find(r=>r.job?.id==='done').status,'completed');
// Horário de Brasília (UTC-3) e nomes no CSV.
assert.equal(brasilia('2026-10-30T13:05:00Z'),'2026-10-30 10:05');assert.equal(brasilia(null),'');
const csv=washingCsv(s,'2026-10',{u1:'Ana',u2:'Bruno'}).slice(1).split('\r\n').map(l=>l.split(';').map(c=>c.replace(/^"|"$/g,'')));
assert.equal(csv[0].length,csvHeaders.length);
const row=csv.find(r=>r.includes('v1'));
assert.equal(row[csvHeaders.indexOf('Iniciado em (Brasília)')],'2026-10-30 10:05');
assert.equal(row[csvHeaders.indexOf('Autor do registro')],'Ana');assert.equal(row[csvHeaders.indexOf('Última alteração por')],'Bruno');
const novCsv=washingCsv(s,'2026-11').slice(1).split('\r\n').map(l=>l.split(';').map(c=>c.replace(/^"|"$/g,'')));
assert.equal(novCsv.find(r=>r.includes('ret'))[csvHeaders.indexOf('Retorno do serviço (ID)')],'moved');
// Sequência automática contada por equipe quando a linha vale para as duas.
const rows=deriveImportRows([['Data','Local','Equipe'],['03/11','Praça A','ambas'],['03/11','Praça B','pipa 1'],['03/11','Praça C','pipa 2']],1,{date:0,location:1,title:-1,team:2,neighborhood:-1,target:-1,sequence:-1,notes:-1,reference:-1,maps:-1},'2026-11','pipa-1',teams);
assert.deepEqual(rows.map(r=>r.values.team_id+':'+r.values.sequence),['pipa-1:1','pipa-2:1','pipa-1:2','pipa-2:2']);
console.log('Backlog checks passed: atrasados, retornos, reprogramação, CSV em horário de Brasília, sequência por equipe.');
