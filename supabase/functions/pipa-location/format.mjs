const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max):'';
export function validCoordinates(latitude,longitude){
 return typeof latitude==='number'&&typeof longitude==='number'&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180;
}
export function addressFromPhoton(body){
 const p=body?.features?.[0]?.properties;
 if(!p||typeof p!=='object')return null;
 const street=text(p.street,160)||text(p.name,160),number=text(p.housenumber,25);
 if(!street)return null;
 return {location:(street+(number?', '+number:'')).slice(0,200),neighborhood:text(p.district,120)||text(p.locality,120)||text(p.suburb,120),city:text(p.city,120)||text(p.county,120),attribution:'Photon/Komoot · © OpenStreetMap contributors'};
}
