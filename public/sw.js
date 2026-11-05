/* ============================================================
   SixBlocks Service Worker — 앱셸 오프라인 캐시
   ------------------------------------------------------------
   - 설치 시 앱셸(index.html, manifest, 아이콘)을 미리 캐시
   - 해시가 붙은 정적 에셋(JS/CSS)은 cache-first + 백그라운드 갱신
   - 페이지 탐색(HTML)은 network-first → 오프라인 시 캐시 응답
   - 구글 폰트는 stale-while-revalidate로 오프라인에서도 폰트 유지
   - Firebase(로그인/동기화) 요청은 절대 캐시하지 않고 통과
   - 모든 URL은 상대 경로 → GitHub Pages(/6-Blocks/)와
     로컬 preview 어디에서도 동일하게 동작
   ============================================================ */

const VERSION = 'v1.1.0'
const SHELL_CACHE = `sixblocks-shell-${VERSION}`
const RUNTIME_CACHE = `sixblocks-runtime-${VERSION}`

// 설치 시 미리 캐시할 앱셸 목록 (sw.js 위치 기준 상대 경로)
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './favicon.svg',
  './favicon-64.png',
  './icon-192.png',
  './icon-512.png',
  './maskable-512.png',
  './apple-touch-icon.png',
]

// 구글 폰트 (CSS + woff2) — 오프라인에서도 동일 폰트 유지용
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // 앱셸을 미리 캐시 (한 파일이 없어도 설치 전체가 실패하지 않도록 allSettled)
    const cache = await caches.open(SHELL_CACHE)
    await Promise.allSettled(SHELL_ASSETS.map(asset => cache.add(asset)))
    // 새 버전 SW는 설치 직후 즉시 활성화 (해시된 에셋 + network-first HTML이라 안전)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // 구 버전 캐시 정리
    const keys = await caches.keys()
    await Promise.all(
      keys
        .filter(k => k.startsWith('sixblocks-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k)),
    )
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // 페이지 탐색(HTML 문서 요청) — network-first
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  // 구글 폰트 — stale-while-revalidate
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
    return
  }

  // 같은 오리진의 정적 에셋(JS/CSS/PNG 등, 해시 파일명) — cache-first + 백그라운드 갱신
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
    return
  }

  // 그 외(Firebase 등)는 캐시하지 않고 네트워크로 통과
})

// ---------------- 전략별 핸들러 ----------------

async function handleNavigation(request) {
  try {
    const fresh = await fetch(request)
    const cache = await caches.open(SHELL_CACHE)
    cache.put('./index.html', fresh.clone())
    return fresh
  } catch {
    // 오프라인: 캐시된 셸로 응답
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ||
      (await caches.match('./index.html'))
    if (cached) return cached
    return new Response(
      '<html lang="ko"><head><meta charset="utf-8"><title>SixBlocks</title></head><body style="font-family:sans-serif;background:#F7F3EC;color:#1A1A1A;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px"><p>오프라인 상태예요.<br>네트워크에 연결한 뒤 앱을 한 번 열면<br>다음부터는 오프라인에서도 사용할 수 있어요.</p></body></html>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request, { ignoreSearch: false })
  const network = fetch(request)
    .then(response => {
      // opaque(교차 오리진 no-cors) 응답도 cache.put 으로는 저장 가능
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).catch(() => {})
      }
      return response
    })
    .catch(() => null)
  if (cached) return cached
  const fresh = await network
  if (fresh) return fresh
  return new Response('', { status: 504, statusText: 'Offline' })
}
