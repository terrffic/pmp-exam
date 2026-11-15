/* PMP 模考题库 · 离线缓存
   应用是单文件 HTML：缓存整页就等于缓存了全部 1,611 道题、样式与脚本。
   策略：页面请求「网络优先 + 1.5 秒超时 + 缓存兜底」，联网时自动更新，断网时秒开；
         manifest / 图标等小文件走缓存优先。
   ★ 题库内容更新后，请把 CACHE 版本号 +1，并同步改页面里的同名版本号。 */
const CACHE = 'pmp-exam-offline-v23';
const PAGE_KEY = './index.html';

/* 本站静态文件需要分享码鉴权；注册时把 sharecode 附在 sw.js 后面，这里取出来用于预缓存。
   平台对 / 与 /index.html 的放行情况可能不同，两个都试一遍，任一成功即可。 */
const Q = new URL(self.location.href).search;
const PAGE_URLS = ['./' + Q, './index.html' + Q];

async function warm() {
  const c = await caches.open(CACHE);
  if (await c.match(PAGE_KEY)) return true;
  for (const u of PAGE_URLS) {
    try {
      const r = await fetch(u, { cache: 'reload' });
      if (r && r.ok) { await c.put(PAGE_KEY, r.clone()); return true; }
    } catch (e) { /* 换下一个地址 */ }
  }
  return false;
}

self.addEventListener('install', e => {
  e.waitUntil(warm().then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    await warm();   /* 首次 install 时鉴权未就绪的话，这里再补一次 */
  })());
});

function isPage(req) {
  const p = new URL(req.url).pathname;
  return req.mode === 'navigate' || /\/(index\.html)?$/.test(p);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isPage(req)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const cached = await c.match(PAGE_KEY);
      try {
        const fresh = await Promise.race([
          fetch(req),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
        ]);
        if (fresh && fresh.ok) {
          c.put(PAGE_KEY, fresh.clone()).catch(() => {});   /* 后台回写，不阻塞响应 */
          return fresh;
        }
      } catch (err) { /* 离线或超时 → 走缓存 */ }
      if (cached) return cached;
      try {
        const r = await fetch(PAGE_URLS[0]);
        if (r && r.ok) { c.put(PAGE_KEY, r.clone()).catch(() => {}); return r; }
      } catch (err) {}
      return new Response(
        '<!doctype html><meta charset="utf-8"><title>离线内容未就绪</title>' +
        '<p style="font:16px/1.7 sans-serif;padding:24px;max-width:520px">' +
        '离线内容还没准备好。请<b>联网打开一次本页</b>，看到首页显示「✅ 已可离线」后再关闭网络。</p>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      return new Response('', { status: 504 });
    }
  })());
});
