// Keep login sessions per tab. Only short-lived PKCE verifiers cross tabs so
// confirmation/recovery links opened from email can complete in the same browser.
export function makeAuthStorage(tab:Storage,shared:Storage){
 const isVerifier=(key:string)=>key.endsWith('-code-verifier');
 return {
  getItem(key:string){if(isVerifier(key)){try{const raw=shared.getItem(key);if(raw){const stored=JSON.parse(raw) as {value:string,expires:number};if(stored.expires>Date.now()&&typeof stored.value==='string')return stored.value;shared.removeItem(key);}}catch{}}return tab.getItem(key);},
  setItem(key:string,value:string){if(isVerifier(key)){try{shared.setItem(key,JSON.stringify({value,expires:Date.now()+60*60*1000}));return;}catch{}}tab.setItem(key,value);},
  removeItem(key:string){tab.removeItem(key);if(isVerifier(key)){try{shared.removeItem(key);}catch{}}}
 };
}
