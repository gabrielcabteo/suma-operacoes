export type Module='demand'|'washing';
export type Status='planned'|'in_progress'|'completed'|'pending'|'cancelled';
export type FieldEntry={
 id:string;author_id:string;created_at:string;updated_at:string;
 service_type:Module;service_date:string;status:Status;priority:'normal'|'high'|'urgent';
 title:string;service:string;location:string;neighborhood:string;segment:string;
 requester:string;protocol:string;responsible:string;team:string;headcount:number|null;
 description:string;notes:string;vehicle:string;driver:string;helpers:string;washing_target:string;
 start_time:string|null;end_time:string|null;overnight:boolean;water_liters:number|null;refills:number|null;
 quantity:number|null;unit:string;photos:string[];
};
export type EntryFields=Omit<FieldEntry,'id'|'author_id'|'created_at'|'updated_at'|'photos'>;
