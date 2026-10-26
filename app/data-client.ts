export type Operation = {id:string,date:string,created:string,name:string,team:string,street:string,neighborhood:string,segment:string,notes:string,photos:string[]};
export type OperationFields = Omit<Operation,'id'|'created'|'photos'>;
export interface OperationsClient {
 available:boolean;
 list(start:string,end:string):Promise<Operation[]>;
 save(fields:OperationFields,id:string,photos:Blob[]):Promise<void>;
 photoUrl(id:string):string;
}
export const serverClient:OperationsClient={available:true,
 async list(start,end){const r=await fetch(`/api/operations?start=${start}&end=${end}`);if(!r.ok)throw Error('Não foi possível carregar os registros.');return await r.json() as Operation[];},
 async save(fields,id,photos){const data=new FormData();data.append('data',JSON.stringify({...fields,id}));photos.forEach((p,i)=>data.append('photos',p,`evidencia-${i}.jpg`));const r=await fetch('/api/operations',{method:'POST',body:data});if(!r.ok){const body=await r.json() as {error?:string};throw Error(body.error||'Falha ao enviar.');}},
 photoUrl:id=>'/api/photos/'+id
};
