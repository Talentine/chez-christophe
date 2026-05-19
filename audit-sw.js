/* Service worker — Audit Marchéo RDV1
   Stratégie : RÉSEAU D'ABORD (toujours la dernière version en ligne),
   repli sur le cache uniquement si hors-ligne. */
const C="audit-rdv1-28672480-v2";
const ASSETS=["/audit-rdv1-28672480.html","/audit-rdv1-28672480.webmanifest"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(ASSETS)).catch(()=>{}));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const r=e.request; if(r.method!=="GET") return;
  const u=new URL(r.url); if(u.origin!==location.origin) return;
  e.respondWith((async()=>{
    const c=await caches.open(C);
    try{
      const resp=await fetch(r);
      if(resp&&resp.status===200&&resp.type==="basic") c.put(r,resp.clone());
      return resp;
    }catch(_){
      const cached=await c.match(r,{ignoreSearch:true});
      return cached||Response.error();
    }
  })());
});
