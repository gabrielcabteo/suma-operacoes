// Persist the SDK's session, never the password. PKCE verifiers remain short-lived.
export function makeAuthStorage(tab:Storage,shared:Storage,now=()=>Date.now()){
 const fallback=new Set<string>();
 const isVerifier=(key:string)=>key.endsWith('-code-verifier');
 const marker=(key:string)=>key+'-persistent-migrated';
 const remove=(storage:Storage,key:string)=>{try{storage.removeItem(key);}catch{}};
 return {
  getItem(key:string){
   if(fallback.has(key))return tab.getItem(key);
   try{
    const saved=shared.getItem(key);
    if(isVerifier(key)){
     if(saved!==null){
      try{const stored=JSON.parse(saved) as {value:string,expires:number};if(stored.expires>now()&&typeof stored.value==='string')return stored.value;}catch{}
      remove(shared,key);remove(tab,key);return null;
     }
     return tab.getItem(key);
    }
    if(saved!==null){try{shared.setItem(marker(key),'1');}catch{}remove(tab,key);return saved;}
    // A logout must win over a legacy token left in another already-open tab.
    if(shared.getItem(marker(key))==='1'){remove(tab,key);return null;}
    const legacy=tab.getItem(key);
    if(legacy!==null){shared.setItem(key,legacy);shared.setItem(marker(key),'1');remove(tab,key);}
    return legacy;
   }catch{return tab.getItem(key);}
  },
  setItem(key:string,value:string){
   try{
    if(!isVerifier(key))shared.setItem(marker(key),'1');
    shared.setItem(key,isVerifier(key)?JSON.stringify({value,expires:now()+60*60*1000}):value);
    fallback.delete(key);remove(tab,key);
   }catch{
    // Restricted browser storage may still allow the current tab to function.
    fallback.add(key);remove(shared,key);tab.setItem(key,value);
   }
  },
  removeItem(key:string){
   remove(tab,key);remove(shared,key);fallback.delete(key);
   if(!isVerifier(key)){try{shared.setItem(marker(key),'1');}catch{}}
  }
 };
}
