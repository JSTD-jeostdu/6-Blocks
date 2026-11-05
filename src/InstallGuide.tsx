import { useEffect, useState } from 'react'

/* ==================== PWA 설치 안내 + 오프라인 표시 ====================
   - Android/Chrome: beforeinstallprompt 발생 시 하단 설치 배너 → 프롬프트 호출
   - iOS Safari: 설치 프롬프트 API가 없으므로 "홈 화면에 추가" 가이드 카드 표시
   - 설치 후(standalone 모드)에는 표시하지 않음
   - 닫기: 7일 후 다시 표시 (설치 기회를 놓치지 않도록)
   ====================================================================== */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'sixblocks-install-dismissed-at'
const RE_SHOW_MS = 7 * 24 * 60 * 60 * 1000 // 7일

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent)
}

function isDismissedRecently(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
  return at > 0 && Date.now() - at < RE_SHOW_MS
}

export function InstallGuide() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosGuide, setIosGuide] = useState(false)

  useEffect(() => {
    if (isStandalone() || isDismissedRecently()) return

    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      setVisible(false)
      setDeferredPrompt(null)
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari는 beforeinstallprompt를 지원하지 않음 → 가이드 카드
    if (isIOS()) {
      const timer = window.setTimeout(() => {
        setIosGuide(true)
        setVisible(true)
      }, 2500)
      return () => {
        window.clearTimeout(timer)
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setVisible(false)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const choice = await deferredPrompt.userChoice
    if (choice.outcome === 'accepted') {
      setVisible(false)
    } else {
      dismiss()
    }
    setDeferredPrompt(null)
  }

  if (!visible) return null

  return (
    <div className="install-banner" role="dialog" aria-label="홈 화면에 설치">
      <div className="install-card">
        <div className="install-icon" aria-hidden="true">
          <span style={{ background: '#3B4D8C' }} />
          <span style={{ background: '#D49A3A' }} />
          <span style={{ background: '#6E8B6A' }} />
          <span style={{ background: '#5A6472' }} />
          <span style={{ background: '#7B4B6E' }} />
          <span style={{ background: '#232A3E' }} />
        </div>
        <div className="install-text">
          <div className="install-title">홈 화면에 설치</div>
          {iosGuide ? (
            <ol className="install-steps">
              <li>하단의 <b>공유</b> 버튼 <span className="ios-share" aria-hidden="true">⎋</span> 을 눌러요</li>
              <li><b>홈 화면에 추가</b>를 선택해요</li>
              <li><b>추가</b>를 누르면 앱처럼 쓸 수 있어요</li>
            </ol>
          ) : (
            <div className="install-desc">버튼 하나로 앱처럼 설치하고, 오프라인에서도 쓸 수 있어요.</div>
          )}
        </div>
        <div className="install-actions">
          {!iosGuide && deferredPrompt && (
            <button className="install-btn" onClick={install}>설치</button>
          )}
          <button className="install-later" onClick={dismiss}>나중에</button>
        </div>
      </div>
    </div>
  )
}

/* 오프라인 상태를 알려주는 상단 표시 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(() => !window.navigator.onLine)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null
  return (
    <div className="offline-pill" role="status">
      오프라인 — 지금 쓰는 기록은 이 기기에 저장돼요. 연결되면 클라우드에 자동 동기화돼요.
    </div>
  )
}
