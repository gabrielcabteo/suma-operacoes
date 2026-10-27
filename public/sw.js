// Cache only the public offline notice. Never cache auth, APIs, records or photos.
const CACHE='suma-offline-v1';
const OFFLINE=new URL('offline.html',self.registration.scope).href;
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.add(OFFLINE)))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('suma-offline-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||event.request.mode!=='navigate'||!event.request.url.startsWith(self.registration.scope))return;event.respondWith(fetch(event.request).catch(async()=>await caches.match(OFFLINE)||Response.error()))});
