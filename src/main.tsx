import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './pwa.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: 서비스워커 등록 (프로덕션 빌드에서만 동작)
registerServiceWorker()

// 인앱 스플래시 페이드아웃 (UX Audit §3.4) — 앱 첫 페인트 후 300ms 페이드 후 제거
requestAnimationFrame(() => requestAnimationFrame(() => {
  const splash = document.getElementById('app-splash')
  if (splash) {
    splash.style.opacity = '0'
    window.setTimeout(() => splash.remove(), 450)
  }
}))
