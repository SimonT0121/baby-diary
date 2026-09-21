/* 寶寶日記 service worker v1.0
   兩件事：(1) 離線可開  (2) 接住從 Google 相簿分享進來的照片 */
const CACHE = "babydiary-v1";
const ASSETS = ["./", "./index.html", "./manifest.webmanifest",
                "./icon-192.png", "./icon-512.png", "./icon-maskable.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* --- 與主程式共用同一個 IndexedDB --- */
function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("babydiary", 1);
    r.onupgradeneeded = ev => {
      const d = ev.target.result;
      ["entries", "photos", "kids", "inbox"].forEach(n => {
        if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: "id" });
      });
      if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta", { keyPath: "k" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function putInbox(d, rec) {
  return new Promise((res, rej) => {
    const t = d.transaction("inbox", "readwrite");
    t.objectStore("inbox").put(rec);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  /* 分享進來：把照片存進 inbox，再導回主畫面 */
  if (event.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll("photos").filter(f => f && f.size);
        const d = await db();
        let i = 0;
        for (const f of files) {
          await putInbox(d, {
            id: Date.now().toString(36) + "_" + (i++),
            name: f.name || "shared.jpg",
            blob: f
          });
        }
      } catch (e) { /* 壞掉就直接進主畫面，不要卡住使用者 */ }
      return Response.redirect("./?share=1", 303);
    })());
    return;
  }

  if (event.request.method !== "GET") return;

  /* 頁面：先連網，失敗用快取；其餘：先快取 */
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(r => { caches.open(CACHE).then(c => c.put("./index.html", r.clone())); return r; })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(r => r || fetch(event.request)));
});
