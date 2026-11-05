/* PWA 등록 — 프로덕션 빌드에서만 서비스워커를 등록합니다.
   (개발 모드에서는 HMR과 충돌하므로 등록하지 않음) */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('[SixBlocks] 서비스워커 등록 실패:', err)
    })
  })
}
