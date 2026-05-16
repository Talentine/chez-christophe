/* Service worker — Audit Marchéo RDV1 (offline) */
const C="audit-rdv1-28672480-v1";
const ASSETS=["/audit-rdv1-28672480.html","/audit-rdv1-28672480.webmanifest"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request; if(r.method!=="GET") return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;
  e.respondWith(caches.open(C).then(async c=>{
    const cached=await c.match(r,{ignoreSearch:true});
    const net=fetch(r).then(resp=>{ if(resp&&resp.status===200&&resp.type==="basic") c.put(r,resp.clone()); return resp; }).catch(()=>cached);
    return cached||net;
  }));
});
