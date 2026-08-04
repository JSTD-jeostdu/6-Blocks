import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { isFirebaseConfigured, onAuthChange, signInWithGoogle, signOutUser, fetchRemoteData, syncRemoteData, type SyncUser } from './firebase'
import {
  dateFromKey,
  dateKey,
  cyclePosition,
  dayFromTemplate,
  defaultData,
  ensureDay,
  FRANKLIN_PRESET,
  incompleteTasks,
  mergeAppData,
  migrateData,
  shiftDateKey,
  startOfWeekKey,
  templateFromBlocks,
  uid,
  weekDateKeys,
  type AppData,
  type Block,
  type DayData,
  type Purpose,
  type Task,
} from './appData'

// ==================== TYPES ====================
type Screen = 'onboarding' | 'canvas' | 'morning' | 'evening' | 'virtue' | 'review'
type Tab = 'canvas' | 'virtue' | 'review'

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error'

// ==================== CONSTANTS ====================
const PURPOSE_COLORS: Record<string, string> = {
  deepwork: '#3B4D8C',
  study: '#D49A3A',
  rest: '#6E8B6A',
  organize: '#5A6472',
  evening: '#7B4B6E',
  sleep: '#232A3E',
}

const PURPOSE_LABELS: Record<string, string> = {
  deepwork: '딥워크',
  study: '학습',
  rest: '휴식',
  organize: '정리',
  evening: '저녁/반성',
  sleep: '수면',
}

const PURPOSES = ['deepwork', 'study', 'rest', 'organize', 'evening', 'sleep'] as const

const VIRTUES = [
  { ko: '절제', en: 'Temperance', precept: 'Eat not to dullness; drink not to elevation.' },
  { ko: '침묵', en: 'Silence', precept: 'Speak not but what may benefit others or yourself.' },
  { ko: '질서', en: 'Order', precept: 'Let all your things have their places.' },
  { ko: '결단', en: 'Resolution', precept: 'Resolve to perform what you ought.' },
  { ko: '검소', en: 'Frugality', precept: 'Make no expense but to do good to others or yourself.' },
  { ko: '근면', en: 'Industry', precept: 'Lose no time; be always employed in something useful.' },
  { ko: '성실', en: 'Sincerity', precept: 'Use no hurtful deceit; think innocently and justly.' },
  { ko: '정의', en: 'Justice', precept: 'Wrong none by doing injuries, or omitting the benefits that are your duty.' },
  { ko: '중용', en: 'Moderation', precept: 'Avoid extremes; forbear resenting injuries so much as you think they deserve.' },
  { ko: '청결', en: 'Cleanliness', precept: 'Tolerate no uncleanliness in body, clothes, or habitation.' },
  { ko: '평정', en: 'Tranquillity', precept: 'Be not disturbed at trifles, or at accidents common or unavoidable.' },
  { ko: '겸손', en: 'Humility', precept: 'Imitate Jesus and Socrates.' },
]

const VIRTUE_CYCLE_LENGTH = VIRTUES.length

const STORAGE_KEY = 'sixblocks-data'

// ==================== HELPERS ====================
function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return ensureDay(migrateData(JSON.parse(raw)), dateKey())
  } catch {}
  return ensureDay(defaultData(), dateKey())
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

// ==================== 샘플 데모 데이터 생성 ====================
// "샘플 데이터로 체험해보기"를 누르면 최근 7일치의 그럴듯한 기록을 미리 채워줍니다.
// 실제 사용자 데이터가 아니므로 언제든 지우거나 덮어써도 안전합니다.
const DEMO_MORNING_ANSWERS = [
  '집중력을 잃지 않고 딥워크 블록을 끝까지 지켜내는 것',
  '조급해하지 않고 오늘 정한 순서대로만 진행하는 것',
  '작은 일에도 성실하게, 미루지 않고 바로 처리하는 것',
  '몸과 마음을 함께 돌보며 무리하지 않는 것',
  '주변 사람들에게 오늘 하루만큼은 더 다정하게 대하는 것',
  '어제 못 끝낸 일을 오늘 첫 블록에서 마무리하는 것',
  '한 주를 돌아보고 다음 주 계획을 여유 있게 세우는 것',
]

const DEMO_EVENING_ANSWERS = [
  '딥워크 블록 두 개를 계획대로 끝냈고, 저녁엔 가볍게 산책도 했다.',
  '중간에 흐트러졌지만 저녁 블록에서 다시 정리하고 마무리했다.',
  '생각보다 일이 빨리 끝나서 남은 시간엔 책을 읽었다.',
  '컨디션이 좋지 않았지만 무리하지 않고 필수적인 것만 처리했다.',
  '동료와 나눈 짧은 대화가 오늘 하루 중 가장 좋았던 순간이었다.',
  '어제 미룬 일을 마무리해서 마음이 한결 가벼워졌다.',
  '이번 주를 돌아보니 꾸준히 6블록을 지킨 게 스스로 뿌듯했다.',
]

const DEMO_REFLECTIONS: Record<Purpose, string[]> = {
  deepwork: ['생각보다 몰입이 잘 됐다', '중간에 알림 때문에 살짝 끊겼다', '계획한 만큼 정확히 끝냈다'],
  study: ['새로운 내용을 배워서 즐거웠다', '집중이 잘 안 됐지만 끝까지 했다', '메모를 정리하며 복습했다'],
  rest: ['짧게 쉬었더니 오히려 개운했다', '너무 오래 쉬어서 살짝 늘어졌다', '산책하며 머리를 비웠다'],
  organize: ['하루 계획을 다시 점검했다', '책상 정리까지 같이 끝냈다', '내일 할 일을 미리 적어뒀다'],
  evening: ['하루를 차분히 되짚어봤다', '오늘 배운 점을 기록해뒀다', '내일 우선순위를 정리했다'],
  sleep: ['평소보다 일찍 잠들었다', '조금 늦게 잤지만 푹 잤다', '알람 없이 자연스럽게 깼다'],
  '': [],
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

// 오늘로부터 daysAgo일 전 날짜의 dateKey를 반환합니다.
function dateKeyDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return dateKey(d)
}

// 데모용 하루 데이터를 만듭니다. daysAgo가 0이면 오늘, 클수록 과거의 날짜입니다.
// completeness: 0(전혀 안함)~1(완벽하게) 사이 값으로, 오래된 날일수록 더 꾸준히 채워진 느낌을 줍니다.
function demoDay(daysAgo: number): DayData {
  const seed = daysAgo + 1
  const blocks: Block[] = FRANKLIN_PRESET.map((preset, i) => {
    const purpose = preset.purpose
    const fillThisBlock = (seed + i) % 5 !== 0 // 가끔 한 블록은 비워둬서 "완벽하지 않은" 현실감을 줌
    const tasks: Task[] = fillThisBlock
      ? [
          { id: uid(), text: `${preset.title} 핵심 작업 1`, done: (seed + i) % 3 !== 0 },
          { id: uid(), text: `${preset.title} 핵심 작업 2`, done: (seed + i) % 2 === 0 },
        ]
      : []
    return {
      id: uid(),
      order: i,
      title: fillThisBlock ? preset.title : '',
      intention: fillThisBlock ? '집중해서 끝내기' : '',
      purpose: fillThisBlock ? purpose : '',
      startTime: fillThisBlock ? preset.startTime : undefined,
      endTime: fillThisBlock ? preset.endTime : undefined,
      tasks,
      reflection: daysAgo > 0 && fillThisBlock && purpose ? pick(DEMO_REFLECTIONS[purpose], seed + i) : undefined,
      rating: daysAgo > 0 && fillThisBlock ? (['good', 'good', 'ok', 'good', 'bad'] as const)[(seed + i) % 5] : undefined,
    }
  })

  const morningDone = daysAgo > 0 || seed % 4 !== 0
  const eveningDone = daysAgo > 0

  return {
    blocks,
    morningAnswer: morningDone ? pick(DEMO_MORNING_ANSWERS, seed) : '',
    morningResolution: '',
    morningDone,
    eveningAnswer: eveningDone ? pick(DEMO_EVENING_ANSWERS, seed) : '',
    eveningDone,
    virtueDots: eveningDone && seed % 3 !== 0 ? { [dateKeyDaysAgo(daysAgo)]: true } : {},
    stamps: [true, true, seed % 4 !== 0, true, true, daysAgo < 2 ? false : true, false].slice(0, 7) as boolean[],
    updatedAt: Date.now() - daysAgo * 86400000,
  }
}

// 최근 7일치(오늘 포함) 데모 데이터로 AppData를 채웁니다. currentVirtue/cycleWeek도 그럴듯하게 채웁니다.
function fillDemoData(base: AppData): AppData {
  const days: Record<string, DayData> = {}
  for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
    days[dateKeyDaysAgo(daysAgo)] = demoDay(daysAgo)
  }
  return {
    ...base,
    onboarded: true,
    currentVirtue: 3,
    cycleWeek: 4,
    cycleStartVirtue: 0,
    cycleStartedOn: shiftDateKey(startOfWeekKey(dateKey()), -21),
    blockTemplate: FRANKLIN_PRESET.map(block => ({ ...block })),
    virtueHistory: Object.fromEntries(Object.entries(days)
      .filter(([key, day]) => day.virtueDots[key])
      .map(([key]) => [key, true])),
    virtueUpdatedAt: Object.fromEntries(Object.entries(days).map(([key, day]) => [key, day.updatedAt])),
    days,
    updatedAt: Date.now(),
  }
}

function currentTimeStr(): string {
  return new Date().toTimeString().slice(0, 5)
}

function isCurrentBlock(block: Block): boolean {
  if (!block.startTime || !block.endTime) return false
  const now = currentTimeStr()
  // Handle overnight blocks (e.g., 22:00-05:00)
  if (block.startTime <= block.endTime) {
    return now >= block.startTime && now < block.endTime
  }
  return now >= block.startTime || now < block.endTime
}

// ==================== MAIN APP ====================
export default function App() {
  const [data, setData] = useState<AppData>(() => loadData())
  const [selectedDate, setSelectedDate] = useState(() => dateKey())
  const [tab, setTab] = useState<Tab>('canvas')
  const [screen, setScreen] = useState<Screen>(() => {
    const d = loadData()
    return d.onboarded ? 'canvas' : 'onboarding'
  })
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // ---- 구글 로그인 & 클라우드 동기화 상태 ----
  const [authUser, setAuthUser] = useState<SyncUser | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string>('')
  const hasMergedRef = useRef(false)
  const skipNextUploadRef = useRef(false)

  // Save on every data change
  useEffect(() => { saveData(data) }, [data])

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', data.theme)
  }, [data.theme])

  // 로그인 상태 감지: 로그인되면 클라우드 데이터를 가져와 "병합"하고, 이후 변경사항은 자동 업로드합니다.
  useEffect(() => {
    if (!isFirebaseConfigured) return
    const unsub = onAuthChange(async user => {
      setAuthUser(user)
      if (user && !hasMergedRef.current) {
        setSyncStatus('syncing')
        setSyncError('')
        try {
          const remote = await fetchRemoteData<AppData>(user.uid)
          setData(prev => {
            const merged = remote ? mergeAppData(prev, remote) : { ...prev, updatedAt: Date.now() }
            return merged
          })
          hasMergedRef.current = true
          setSyncStatus('synced')
        } catch (e) {
          setSyncStatus('error')
          setSyncError(e instanceof Error ? e.message : '동기화 중 오류가 발생했어요.')
        }
      }
      if (!user) {
        hasMergedRef.current = false
        setSyncStatus('idle')
      }
    })
    return unsub
  }, [])

  // 로그인 상태에서 데이터가 바뀌면 자동으로 클라우드에 업로드(백업)합니다.
  // (이미 위에서 로컬↔클라우드를 병합한 뒤이므로, 여기서의 저장은 "합쳐진 최신본"을 올리는 것 → 데이터 손실 없음)
  useEffect(() => {
    if (!authUser || !isFirebaseConfigured || !hasMergedRef.current) return
    if (skipNextUploadRef.current) {
      skipNextUploadRef.current = false
      return
    }
    const timer = window.setTimeout(async () => {
      setSyncStatus('syncing')
      try {
        const merged = await syncRemoteData(authUser.uid, data, mergeAppData)
        skipNextUploadRef.current = true
        setData(merged)
        setSyncStatus('synced')
      } catch (e) {
        setSyncStatus('error')
        setSyncError(e instanceof Error ? e.message : '업로드 중 오류가 발생했어요.')
      }
    }, 1200) // 짧은 시간 안에 여러 번 수정해도 한 번만 업로드 (디바운스)
    return () => window.clearTimeout(timer)
  }, [data, authUser])

  async function handleGoogleSignIn() {
    setSyncStatus('syncing')
    setSyncError('')
    try {
      await signInWithGoogle()
      // onAuthChange 콜백이 이어서 병합을 처리합니다.
    } catch (e) {
      setSyncStatus('error')
      setSyncError(e instanceof Error ? e.message : '로그인에 실패했어요.')
    }
  }

  async function handleSignOut() {
    await signOutUser()
    setAuthUser(null)
    setSyncStatus('idle')
  }

  const selectedDay = data.days[selectedDate] || dayFromTemplate(data.blockTemplate)

  // Update data helper
  const update = useCallback((updater: (d: AppData) => void) => {
    setData(prev => {
      const next = { ...prev }
      updater(next)
      next.updatedAt = Date.now()
      return next
    })
  }, [])

  // Update the selected day's data helper
  // NOTE: Must deep-clone blocks/tasks (not just the day object) because React 18
  // StrictMode invokes the setState updater function twice in development.
  // A shallow clone would let both invocations mutate the SAME nested arrays
  // (e.g. tasks.push(...)), causing duplicate entries from a single click.
  const updateSelectedDay = useCallback((updater: (day: DayData) => void) => {
    setData(prev => {
      const prevDay = prev.days[selectedDate] || dayFromTemplate(prev.blockTemplate)
      const nextDay: DayData = {
        ...prevDay,
        blocks: prevDay.blocks.map(b => ({ ...b, tasks: b.tasks.map(t => ({ ...t })) })),
        virtueDots: { ...prevDay.virtueDots },
        stamps: [...prevDay.stamps],
      }
      updater(nextDay)
      nextDay.updatedAt = Date.now()
      const nextVirtue = Boolean(nextDay.virtueDots[selectedDate])
      const virtueChanged = nextVirtue !== Boolean(prev.virtueHistory[selectedDate])
      return {
        ...prev,
        days: { ...prev.days, [selectedDate]: nextDay },
        virtueHistory: { ...prev.virtueHistory, [selectedDate]: nextVirtue },
        virtueUpdatedAt: virtueChanged
          ? { ...prev.virtueUpdatedAt, [selectedDate]: Date.now() }
          : prev.virtueUpdatedAt,
        updatedAt: Date.now(),
      }
    })
  }, [selectedDate])

  function selectDate(key: string) {
    setData(prev => ensureDay(prev, key))
    setSelectedDate(key)
    setScreen('canvas')
  }

  function handleExportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `sixblocks-backup-${dateKey()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function handleResetData() {
    if (!window.confirm('모든 기기 내 기록을 초기화할까요? 이 작업은 되돌릴 수 없어요.')) return
    const fresh = ensureDay(defaultData(), dateKey())
    fresh.resetAt = Date.now()
    fresh.updatedAt = fresh.resetAt
    setData(fresh)
    setSelectedDate(dateKey())
    setScreen('onboarding')
    setTab('canvas')
  }

  useEffect(() => {
    const position = cyclePosition(data, dateKey(), VIRTUE_CYCLE_LENGTH)
    if (position.week === data.cycleWeek && position.virtue === data.currentVirtue) return
    setData(prev => ({ ...prev, cycleWeek: position.week, currentVirtue: position.virtue, updatedAt: Date.now() }))
  }, [data])

  // ==================== ONBOARDING ====================
  if (screen === 'onboarding') {
    return <Onboarding
      update={update}
      onComplete={() => {
        update(d => { d.onboarded = true })
        setScreen('canvas')
      }}
      onDemoComplete={() => setScreen('canvas')}
    />
  }

  const accountPanel = (
    <AccountPanel
      authUser={authUser}
      syncStatus={syncStatus}
      syncError={syncError}
      onSignIn={handleGoogleSignIn}
      onSignOut={handleSignOut}
      onExport={handleExportData}
      onReset={handleResetData}
    />
  )

  // ==================== MORNING QUESTION ====================
  if (screen === 'morning') {
    return <MorningQuestion today={selectedDay} updateToday={updateSelectedDay} onDone={() => setScreen('canvas')} />
  }

  // ==================== EVENING QUESTION ====================
  if (screen === 'evening') {
    return <EveningQuestion today={selectedDay} updateToday={updateSelectedDay} selectedDate={selectedDate} onDone={() => setScreen('canvas')} />
  }

  // ==================== MAIN APP ====================
  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <div className="app-title">SixBlocks</div>
          <div className="app-date">{dateFromKey(selectedDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
        </div>
        <div className="header-right">
          {accountPanel}
          <button className="theme-toggle" onClick={() => update(d => { d.theme = d.theme === 'light' ? 'dark' : 'light' })}>
            {data.theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      <div className="date-nav" aria-label="날짜 이동">
        <button onClick={() => selectDate(shiftDateKey(selectedDate, -1))} aria-label="이전 날짜">‹</button>
        <button className={selectedDate === dateKey() ? 'active' : ''} onClick={() => selectDate(dateKey())}>
          {selectedDate === dateKey() ? '오늘' : '오늘로 이동'}
        </button>
        <button onClick={() => selectDate(shiftDateKey(selectedDate, 1))} aria-label="다음 날짜">›</button>
      </div>

      <nav className="tab-bar" aria-label="주요 화면">
        <button className={`tab ${tab === 'canvas' ? 'active' : ''}`} aria-current={tab === 'canvas' ? 'page' : undefined} onClick={() => setTab('canvas')}>캔버스</button>
        <button className={`tab ${tab === 'virtue' ? 'active' : ''}`} aria-current={tab === 'virtue' ? 'page' : undefined} onClick={() => setTab('virtue')}>덕목</button>
        <button className={`tab ${tab === 'review' ? 'active' : ''}`} aria-current={tab === 'review' ? 'page' : undefined} onClick={() => setTab('review')}>리뷰</button>
      </nav>

      <div className="content page-enter" key={tab}>
        {tab === 'canvas' && (
          <CanvasTab
            today={selectedDay}
            updateToday={updateSelectedDay}
            selectedDate={selectedDate}
            previousDay={data.days[shiftDateKey(selectedDate, -1)]}
            onSaveTemplate={() => update(d => { d.blockTemplate = templateFromBlocks(selectedDay.blocks) })}
            dragIndex={dragIndex}
            setDragIndex={setDragIndex}
            onMorning={() => setScreen('morning')}
            onEvening={() => setScreen('evening')}
          />
        )}
        {tab === 'virtue' && <VirtueTab data={data} update={update} selectedDate={selectedDate} />}
        {tab === 'review' && <ReviewTab today={selectedDay} data={data} selectedDate={selectedDate} />}
      </div>
    </div>
  )
}

// ==================== ACCOUNT / GOOGLE SYNC PANEL ====================
function AccountPanel({ authUser, syncStatus, syncError, onSignIn, onSignOut, onExport, onReset }: {
  authUser: SyncUser | null
  syncStatus: SyncStatus
  syncError: string
  onSignIn: () => void
  onSignOut: () => void
  onExport: () => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)

  const statusLabel: Record<SyncStatus, string> = {
    idle: '',
    syncing: '동기화 중…',
    synced: '클라우드에 저장됨 ✓',
    error: '동기화 오류',
  }

  return (
    <div className="account-panel">
      <button className="account-toggle" onClick={() => setOpen(o => !o)} title="구글 계정 동기화">
        {authUser?.photoURL ? (
          <img className="account-avatar" src={authUser.photoURL} alt="" />
        ) : (
          <span className="account-icon">{authUser ? '👤' : '☁️'}</span>
        )}
      </button>

      {open && (
        <div className="account-dropdown">
          {!isFirebaseConfigured ? (
            <div className="account-empty">
              <div className="account-empty-title">☁️ 클라우드 동기화 준비 중</div>
              <div className="account-empty-desc">
                구글 로그인으로 여러 기기에서 데이터를 동기화하려면, 앱 관리자가 Firebase 설정을 먼저 등록해야 해요.
                지금은 이 기기의 브라우저에만 데이터가 저장됩니다.
              </div>
            </div>
          ) : authUser ? (
            <>
              <div className="account-info">
                {authUser.photoURL && <img className="account-avatar-lg" src={authUser.photoURL} alt="" />}
                <div>
                  <div className="account-name">{authUser.displayName || '사용자'}</div>
                  <div className="account-email">{authUser.email}</div>
                </div>
              </div>
              <div className={`sync-status sync-status--${syncStatus}`}>
                {syncStatus === 'syncing' && <span className="sync-spinner" />}
                {statusLabel[syncStatus]}
              </div>
              {syncStatus === 'error' && syncError && <div className="sync-error-detail">{syncError}</div>}
              <button className="account-signout-btn" onClick={onSignOut}>로그아웃</button>
            </>
          ) : (
            <>
              <div className="account-empty-title">구글로 로그인</div>
              <div className="account-empty-desc">로그인하면 이 기기의 데이터를 클라우드에 안전하게 백업하고, 다른 기기와 자동으로 합쳐서(병합) 동기화해요. 기존 데이터가 사라지지 않아요.</div>
              <button className="google-signin-btn" onClick={onSignIn}>
                <span className="google-g">G</span> 구글로 로그인
              </button>
            </>
          )}
          <div className="account-data-actions">
            <button onClick={onExport}>백업 파일 내보내기</button>
            <button className="danger" onClick={onReset}>모든 기록 초기화</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== INTRO CAROUSEL (첫 소개 화면 - 애니메이션 슬라이드) ====================
interface IntroSlide {
  emoji: string
  title: string
  subtitle: string
  accent: string
  visual: (accent: string) => React.ReactNode
}

const INTRO_SLIDES: IntroSlide[] = [
  {
    emoji: '📖',
    title: 'SixBlocks',
    subtitle: '벤저민 프랭클린의 "하루 6블록" 철학으로\n하루를 설계하고 성장을 기록해요.',
    accent: '#3B4D8C',
    visual: (accent) => (
      <div className="intro-visual intro-visual-rails">
        {['#3B4D8C', '#D49A3A', '#6E8B6A', '#5A6472', '#7B4B6E', '#232A3E'].map((c, i) => (
          <div key={i} className="intro-rail-bar" style={{ background: c, animationDelay: `${i * 90}ms` }} />
        ))}
        <div className="intro-glow" style={{ background: accent }} />
      </div>
    ),
  },
  {
    emoji: '🧩',
    title: '하루 6가지 중요한 일',
    subtitle: '가장 중요한 일 6가지에만 집중해요.\n프랭클린 원형으로 바로 시작하거나 직접 입력할 수 있어요.',
    accent: '#D49A3A',
    visual: () => (
      <div className="intro-visual intro-visual-blocks">
        {[
          { label: '기상·계획', color: '#5A6472' },
          { label: '딥워크', color: '#3B4D8C' },
          { label: '독서·식사', color: '#D49A3A' },
        ].map((b, i) => (
          <div key={i} className="intro-block-row" style={{ animationDelay: `${i * 140}ms` }}>
            <div className="intro-block-dot" style={{ background: b.color }} />
            <div className="intro-block-label">{b.label}</div>
            <div className="intro-block-check">✓</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    emoji: '☀️',
    title: '아침 의도 · 저녁 반성',
    subtitle: '"오늘 나는 무슨 선을 행할 것인가?"\n하루를 의식적으로 열고 닫아요.',
    accent: '#7B4B6E',
    visual: () => (
      <div className="intro-visual intro-visual-questions">
        <div className="intro-q-card intro-q-morning">
          <span className="intro-q-icon">☀️</span>
          <span className="intro-q-text">오늘 무슨 선을 행할 것인가?</span>
        </div>
        <div className="intro-q-card intro-q-evening">
          <span className="intro-q-icon">🌙</span>
          <span className="intro-q-text">오늘 무슨 선을 행했는가?</span>
        </div>
      </div>
    ),
  },
  {
    emoji: '🏆',
    title: `${VIRTUE_CYCLE_LENGTH}덕목으로 성장 추적`,
    subtitle: '매주 하나의 덕목에 집중하며\n스탬프와 사이클로 꾸준함을 눈으로 확인해요.',
    accent: '#D49A3A',
    visual: () => (
      <div className="intro-visual intro-visual-virtue">
        <div className="intro-virtue-ring">
          <div className="intro-virtue-ring-fill" />
          <div className="intro-virtue-ring-label">4/12</div>
        </div>
        <div className="intro-stamp-row">
          {[true, true, true, false, false, false, false].map((earned, i) => (
            <div key={i} className={`intro-stamp-mini ${earned ? 'earned' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
              {earned ? '✓' : ''}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    emoji: '☁️',
    title: '구글 로그인으로 안전하게',
    subtitle: '로그인하면 기기와 클라우드 데이터를 자동으로 합쳐줘요.\n덮어쓰기로 데이터가 사라질 걱정은 없어요.',
    accent: '#6E8B6A',
    visual: () => (
      <div className="intro-visual intro-visual-sync">
        <div className="intro-sync-device">📱</div>
        <div className="intro-sync-arrow">⇄</div>
        <div className="intro-sync-cloud">☁️</div>
      </div>
    ),
  },
]

function IntroCarousel({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const isLast = index === INTRO_SLIDES.length - 1

  useEffect(() => {
    if (paused || isLast) return
    const timer = window.setTimeout(() => setIndex(i => Math.min(i + 1, INTRO_SLIDES.length - 1)), 3200)
    return () => window.clearTimeout(timer)
  }, [index, paused, isLast])

  function goTo(i: number) {
    setIndex(Math.max(0, Math.min(i, INTRO_SLIDES.length - 1)))
    setPaused(true)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const diff = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(diff) > 40) {
      if (diff < 0 && index < INTRO_SLIDES.length - 1) goTo(index + 1)
      else if (diff > 0 && index > 0) goTo(index - 1)
    }
    touchStartX.current = null
  }

  const slide = INTRO_SLIDES[index]

  return (
    <div
      className="intro-carousel"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="intro-skip-row">
        <button className="intro-skip-btn" onClick={onStart}>건너뛰기</button>
      </div>

      <div className="intro-slide-area" key={index}>
        <div className="intro-emoji" style={{ ['--accent' as string]: slide.accent }}>{slide.emoji}</div>
        {slide.visual(slide.accent)}
        <div className="intro-title" style={{ color: slide.accent }}>{slide.title}</div>
        <div className="intro-subtitle">
          {slide.subtitle.split('\n').map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>

      <div className="intro-dots">
        {INTRO_SLIDES.map((_, i) => (
          <div
            key={i}
            className={`intro-dot ${i === index ? 'active' : ''}`}
            style={i === index ? { background: slide.accent, width: 20 } : {}}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <button className="cta-btn" style={{ background: slide.accent }} onClick={() => {
        if (isLast) onStart()
        else goTo(index + 1)
      }}>
        {isLast ? '시작하기 →' : '다음'}
      </button>

      <button className="intro-demo-btn" onClick={onDemo}>
        ✨ 샘플 데이터로 먼저 체험해보기
      </button>
    </div>
  )
}

// ==================== ONBOARDING COMPONENT ====================
function Onboarding({ update, onComplete, onDemoComplete }: {
  update: (fn: (d: AppData) => void) => void
  onComplete: () => void
  onDemoComplete: () => void
}) {
  const [step, setStep] = useState(0)
  // 기본값: 프랭클린 원형 프리셋. "직접 입력할래요"를 누르면 manual로 전환됩니다.
  const [mode, setMode] = useState<'preset' | 'manual'>('preset')
  const [blockTitles, setBlockTitles] = useState<string[]>(FRANKLIN_PRESET.map(b => b.title))
  const [blockPurposes, setBlockPurposes] = useState<Purpose[]>(FRANKLIN_PRESET.map(b => b.purpose))
  const [selectedVirtue, setSelectedVirtue] = useState(0)

  function switchToManual() {
    setMode('manual')
    setBlockTitles(['', '', '', '', '', ''])
    setBlockPurposes(['', '', '', '', '', ''])
  }

  function switchToPreset() {
    setMode('preset')
    setBlockTitles(FRANKLIN_PRESET.map(b => b.title))
    setBlockPurposes(FRANKLIN_PRESET.map(b => b.purpose))
  }

  if (step === 0) {
    return <IntroCarousel onStart={() => setStep(1)} onDemo={() => {
      update(d => {
        const filled = fillDemoData(d)
        Object.assign(d, filled)
      })
      onDemoComplete()
    }} />
  }

  if (step === 1) {
    return (
      <div className="onboarding">
        <div className="onboard-title">오늘 하루 6가지 중요한 일을 적어보세요</div>
        <div className="onboard-subtitle">
          {mode === 'preset'
            ? '기본값으로 벤저민 프랭클린의 원형 6블록을 채워드렸어요. 그대로 시작해도 좋고, 자유롭게 수정해도 괜찮아요.'
            : '시간은 설정하지 않아도 괜찮아요. 순서대로 채우면 됩니다.'}
        </div>

        {mode === 'preset' && (
          <div className="preset-card">
            <div className="preset-title">📖 프랭클린 원형 6블록 (기본값)</div>
            {FRANKLIN_PRESET.map((b, i) => (
              <div key={i} className="preset-block">
                <div className="preset-rail" style={{ background: PURPOSE_COLORS[b.purpose] }} />
                <div className="preset-name">{b.title}</div>
                <div className="preset-time">{b.startTime}–{b.endTime}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>시간은 내 리듬에 맞게 나중에 자유롭게 조정할 수 있어요.</div>
          </div>
        )}

        {mode === 'manual' && blockTitles.map((title, i) => (
          <div key={i} className="onboard-block">
            <div className="onboard-block-rail" style={{ background: blockPurposes[i] ? PURPOSE_COLORS[blockPurposes[i]] : '#CCC' }} />
            <input
              className="onboard-block-input"
              placeholder={`${i + 1}번째 중요한 일`}
              value={title}
              onChange={e => {
                const arr = [...blockTitles]
                arr[i] = e.target.value
                setBlockTitles(arr)
              }}
            />
          </div>
        ))}

        {mode === 'preset' ? (
          <button className="link-btn" onClick={switchToManual}>✏️ 직접 입력할래요</button>
        ) : (
          <button className="link-btn" onClick={switchToPreset}>📖 프랭클린 원형으로 다시 시작할래요</button>
        )}

        <div style={{ marginTop: 16 }}>
          <button className="cta-btn" onClick={() => setStep(2)} disabled={!blockTitles.some((t) => t.trim())}>
            다음 →
          </button>
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div className="onboarding">
        <div className="onboard-title">첫 주 덕목을 선택하세요</div>
        <div className="onboard-subtitle">{VIRTUE_CYCLE_LENGTH}주 동안 매주 하나의 덕목에 집중합니다. 추천: 절제(Temperance)</div>
        {VIRTUES.map((v, i) => (
          <div key={i} className="virtue-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedVirtue(i)}>
            <div className={`virtue-dot ${selectedVirtue === i ? 'active' : ''}`} />
            <div>
              <div className="virtue-name">{v.ko} <span className="virtue-name-en">({v.en})</span></div>
              <div className="virtue-precept">"{v.precept}"</div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 16 }}>
          <button className="cta-btn" onClick={() => {
            // Save onboarding data
            update(d => {
              d.onboarded = true
              d.currentVirtue = selectedVirtue
              d.cycleStartVirtue = selectedVirtue
              d.cycleWeek = 1
              d.cycleStartedOn = startOfWeekKey(dateKey())
              const key = dateKey()
              if (!d.days[key]) d.days[key] = dayFromTemplate([])
              d.days[key].blocks = blockTitles.map((title, i) => ({
                id: uid(),
                order: i,
                title: title || '',
                intention: '',
                purpose: blockPurposes[i] || '',
                startTime: mode === 'preset' ? FRANKLIN_PRESET[i].startTime : undefined,
                endTime: mode === 'preset' ? FRANKLIN_PRESET[i].endTime : undefined,
                tasks: [],
              }))
              d.blockTemplate = templateFromBlocks(d.days[key].blocks)
            })
            onComplete()
          }}>
            시작하기 →
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ==================== CANVAS TAB ====================
function CanvasTab({ today, updateToday, selectedDate, previousDay, onSaveTemplate, dragIndex, setDragIndex, onMorning, onEvening }: {
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
  selectedDate: string
  previousDay?: DayData
  onSaveTemplate: () => void
  dragIndex: number | null
  setDragIndex: (i: number | null) => void
  onMorning: () => void
  onEvening: () => void
}) {
  const [editingTime, setEditingTime] = useState<number | null>(null)
  const [timerState, setTimerState] = useState<{ blockId: string; seconds: number; running: boolean } | null>(null)
  const [carrySelection, setCarrySelection] = useState<Record<string, boolean>>({})
  const [templateSaved, setTemplateSaved] = useState(false)
  const timerInterval = useRef<number | null>(null)

  // Timer effect
  useEffect(() => {
    if (timerState?.running) {
      timerInterval.current = window.setInterval(() => {
        setTimerState(prev => prev ? { ...prev, seconds: prev.seconds + 1 } : null)
      }, 1000)
    } else {
      if (timerInterval.current) clearInterval(timerInterval.current)
    }
    return () => { if (timerInterval.current) clearInterval(timerInterval.current) }
  }, [timerState?.running])

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  function reorder(from: number, to: number) {
    updateToday(day => {
      const arr = [...day.blocks]
      const [moved] = arr.splice(from, 1)
      arr.splice(to, 0, moved)
      arr.forEach((b, i) => { b.order = i })
      day.blocks = arr
    })
  }

  const filledCount = today.blocks.filter(b => b.title.trim() || b.purpose).length
  const carryCandidates = useMemo(() => incompleteTasks(previousDay).filter(({ blockOrder, task }) =>
    !today.blocks[blockOrder]?.tasks.some(existing => existing.text.trim() === task.text.trim())), [previousDay, today.blocks])

  useEffect(() => {
    setCarrySelection(Object.fromEntries(carryCandidates.map(({ task }) => [task.id, true])))
    setTemplateSaved(false)
  }, [selectedDate, carryCandidates])

  function carrySelectedTasks() {
    const chosen = carryCandidates.filter(({ task }) => carrySelection[task.id])
    updateToday(day => {
      chosen.forEach(({ blockOrder, task }) => {
        const target = day.blocks[blockOrder]
        if (target) target.tasks.push({ ...task, id: uid(), done: false })
      })
    })
    setCarrySelection({})
  }

  return (
    <div>
      {carryCandidates.length > 0 && (
        <div className="rollover-card">
          <div className="review-title">어제 못 끝낸 일 가져오기</div>
          <div className="rollover-list">
            {carryCandidates.map(({ task }) => (
              <label key={task.id}>
                <input
                  type="checkbox"
                  checked={Boolean(carrySelection[task.id])}
                  onChange={event => setCarrySelection(current => ({ ...current, [task.id]: event.target.checked }))}
                />
                <span>{task.text}</span>
              </label>
            ))}
          </div>
          <button className="small-cta-btn" disabled={!Object.values(carrySelection).some(Boolean)} onClick={carrySelectedTasks}>
            선택한 작업 가져오기
          </button>
        </div>
      )}
      {/* Morning/Evening prompts */}
      {selectedDate === dateKey() && !today.morningDone && (
        <div className="question-card" style={{ cursor: 'pointer' }} onClick={onMorning}>
          <div className="question-label">MORNING INTENTION</div>
          <div className="question-text">오늘 나는 무슨 선을 행할 것인가?</div>
          <div className="question-text-en">What good shall I do this day?</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>탭해서 아침 질문 작성 →</div>
        </div>
      )}

      {selectedDate === dateKey() && today.morningDone && !today.eveningDone && (
        <button className="link-btn" onClick={onEvening}>🌙 저녁 반성 질문 작성하기</button>
      )}

      <div className="section-heading-row">
        <div className="section-title">6가지 중요한 일 <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>({filledCount}/6)</span></div>
        <button className="small-link-btn" onClick={() => { onSaveTemplate(); setTemplateSaved(true) }}>
          {templateSaved ? '기본값 저장됨 ✓' : '이 구성을 기본값으로'}
        </button>
      </div>

      {today.blocks.map((block, i) => {
        const isNow = selectedDate === dateKey() && (isCurrentBlock(block) || (timerState?.blockId === block.id && timerState.running))
        const isSleep = block.purpose === 'sleep'
        const purposeColor = block.purpose ? PURPOSE_COLORS[block.purpose] : '#CCC'
        const hasTime = block.startTime && block.endTime
        const circled = ['①', '②', '③', '④', '⑤', '⑥']

        return (
          <div
            key={block.id}
            className={`block-card ${isNow ? 'now' : ''} ${isSleep ? 'sleep' : ''} ${dragIndex === i ? 'dragging' : ''}`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIndex !== null && dragIndex !== i) reorder(dragIndex, i); setDragIndex(null) }}
            onDragEnd={() => setDragIndex(null)}
            style={{ ['--purpose-color' as string]: purposeColor }}
          >
            <div className="block-rail" style={{ background: purposeColor }} />
            <div className="block-body">
              <div className="block-top">
                {hasTime ? (
                  <span className="block-time tabular">{block.startTime}–{block.endTime}</span>
                ) : (
                  <span className="block-number">{circled[i]}</span>
                )}
                {block.purpose && <span className="block-tag" style={{ color: purposeColor }}>{PURPOSE_LABELS[block.purpose]}</span>}
                {isNow && <span className="now-badge">NOW</span>}
                <span className="drag-handle" style={{ marginLeft: 'auto' }} title="드래그로 순서 변경">⠿</span>
              </div>

              <input
                className="onboard-block-input"
                style={{ fontWeight: 700, fontSize: 15 }}
                placeholder={`${i + 1}번째 일`}
                value={block.title}
                onChange={e => updateToday(day => { day.blocks[i].title = e.target.value })}
              />
              <input
                className="onboard-block-input"
                style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}
                placeholder="한 줄 의도"
                value={block.intention}
                onChange={e => updateToday(day => { day.blocks[i].intention = e.target.value })}
              />

              {/* Tag selector */}
              <div className="tag-selector" style={{ marginBottom: 8 }}>
                {PURPOSES.map(p => (
                  <div
                    key={p}
                    className={`tag-chip ${block.purpose === p ? 'selected' : ''}`}
                    style={block.purpose === p
                      ? { background: `${PURPOSE_COLORS[p]}22`, borderColor: PURPOSE_COLORS[p], color: PURPOSE_COLORS[p] }
                      : { background: 'rgba(0,0,0,0.04)', color: 'var(--muted)' }
                    }
                    onClick={() => updateToday(day => { day.blocks[i].purpose = day.blocks[i].purpose === p ? '' : p })}
                  >
                    {PURPOSE_LABELS[p]}
                  </div>
                ))}
              </div>

              {/* Time toggle */}
              {editingTime === i ? (
                <div className="time-sheet" style={{ marginBottom: 8 }}>
                  <div className="time-row">
                    <label>시작</label>
                    <input className="time-input" type="time" value={block.startTime || ''} onChange={e => updateToday(day => { day.blocks[i].startTime = e.target.value })} />
                  </div>
                  <div className="time-row">
                    <label>종료</label>
                    <input className="time-input" type="time" value={block.endTime || ''} onChange={e => updateToday(day => { day.blocks[i].endTime = e.target.value })} />
                  </div>
                  <button className="small-link-btn" onClick={() => { updateToday(day => { day.blocks[i].startTime = undefined; day.blocks[i].endTime = undefined }); setEditingTime(null) }}>시간 제거</button>
                  <button className="small-link-btn" style={{ marginLeft: 12 }} onClick={() => setEditingTime(null)}>닫기</button>
                </div>
              ) : (
                <button className="small-link-btn" onClick={() => setEditingTime(i)}>
                  {hasTime ? '시간 수정' : '+ 시간 추가'}
                </button>
              )}

              {/* Tasks */}
              <ul className="block-tasks">
                {block.tasks.map((task, ti) => (
                  <li key={task.id} className="task-item">
                    <div
                      className={`task-check ${task.done ? 'done' : ''}`}
                      style={{ ['--purpose-color' as string]: purposeColor }}
                      onClick={() => updateToday(day => { day.blocks[i].tasks[ti].done = !day.blocks[i].tasks[ti].done })}
                    />
                    <input
                      className={`task-text-input ${task.done ? 'done' : ''}`}
                      placeholder="작업 입력"
                      value={task.text}
                      onChange={e => updateToday(day => { day.blocks[i].tasks[ti].text = e.target.value })}
                    />
                    <span
                      className="task-remove"
                      onClick={() => updateToday(day => { day.blocks[i].tasks.splice(ti, 1) })}
                      title="작업 삭제"
                    >×</span>
                  </li>
                ))}
                <li className="block-add-task" onClick={() => updateToday(day => { day.blocks[i].tasks.push({ id: uid(), text: '', done: false }) })}>
                  + 작업 추가
                </li>
              </ul>

              {/* F5 Focus Timer */}
              <div className="timer-section">
                {timerState?.blockId === block.id ? (
                  <>
                    <div className="timer-display tabular" style={{ ['--purpose-color' as string]: purposeColor }}>
                      {formatTime(timerState.seconds)}
                    </div>
                    <div className="timer-controls">
                      {timerState.running ? (
                        <button className="timer-btn pause" onClick={() => setTimerState(prev => prev ? { ...prev, running: false } : null)}>일시정지</button>
                      ) : (
                        <button className="timer-btn start" onClick={() => setTimerState(prev => prev ? { ...prev, running: true } : null)}>계속</button>
                      )}
                      <button className="timer-btn stop" onClick={() => setTimerState(null)}>종료</button>
                    </div>
                  </>
                ) : (
                  <button className="timer-btn start" onClick={() => setTimerState({ blockId: block.id, seconds: 0, running: true })}>
                    포커스 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ==================== MORNING QUESTION ====================
function MorningQuestion({ today, updateToday, onDone }: {
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
  onDone: () => void
}) {
  const [answer, setAnswer] = useState(today.morningAnswer)
  const [resolution, setResolution] = useState(today.morningResolution)

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <div className="app-title">SixBlocks</div>
          <div className="app-date">아침 의도</div>
        </div>
      </div>
      <div className="content">
        <div className="question-card">
          <div className="question-label">MORNING INTENTION</div>
          <div className="question-text">오늘 나는 무슨 선을 행할 것인가?</div>
          <div className="question-text-en">What good shall I do this day?</div>

          <div className="question-label-sm">오늘의 의도</div>
          <textarea
            className="question-input"
            placeholder="1-3줄로 오늘의 의도를 적어보세요"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />

          <div className="question-label-sm">오늘의 결의 (Resolution)</div>
          <textarea
            className="question-input"
            placeholder="오늘의 결의를 한 줄로 적어보세요"
            value={resolution}
            onChange={e => setResolution(e.target.value)}
            style={{ minHeight: 50 }}
          />

          <button className="cta-btn" onClick={() => {
            updateToday(day => {
              day.morningAnswer = answer
              day.morningResolution = resolution
              day.morningDone = true
            })
            onDone()
          }}>
            하루 시작하기 →
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== EVENING QUESTION ====================
function EveningQuestion({ today, updateToday, selectedDate, onDone }: {
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
  selectedDate: string
  onDone: () => void
}) {
  const [answer, setAnswer] = useState(today.eveningAnswer)

  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <div className="app-title">SixBlocks</div>
          <div className="app-date">저녁 반성</div>
        </div>
      </div>
      <div className="content">
        <div className="question-card">
          <div className="question-label">EVENING REFLECTION</div>
          <div className="question-text">오늘 나는 무슨 선을 행했는가?</div>
          <div className="question-text-en">What good have I done to day?</div>

          <div className="question-label-sm">오늘의 회고</div>
          <textarea
            className="question-input"
            placeholder="오늘 하루를 회고해 보세요"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />

          <div className="section-title" style={{ fontSize: 16 }}>블록별 회고</div>
          {today.blocks.map((block, i) => {
            const purposeColor = block.purpose ? PURPOSE_COLORS[block.purpose] : '#CCC'
            return (
              <div key={block.id} className="reflect-block-card">
                <div className="reflect-block-rail" style={{ background: purposeColor }} />
                <div className="reflect-block-body">
                  <div className="reflect-block-title">{block.title || `${i + 1}번째 일`}</div>
                  <input
                    className="reflect-input"
                    placeholder="어떻게 보냈나요?"
                    value={block.reflection || ''}
                    onChange={e => updateToday(day => { day.blocks[i].reflection = e.target.value })}
                  />
                  <div className="emoji-rating">
                    <span
                      className={`emoji-btn ${block.rating === 'good' ? 'selected' : ''}`}
                      onClick={() => updateToday(day => { day.blocks[i].rating = 'good' })}
                    >😊</span>
                    <span
                      className={`emoji-btn ${block.rating === 'ok' ? 'selected' : ''}`}
                      onClick={() => updateToday(day => { day.blocks[i].rating = 'ok' })}
                    >😐</span>
                    <span
                      className={`emoji-btn ${block.rating === 'bad' ? 'selected' : ''}`}
                      onClick={() => updateToday(day => { day.blocks[i].rating = 'bad' })}
                    >😕</span>
                  </div>
                </div>
              </div>
            )
          })}

          <div className="question-label-sm" style={{ marginTop: 12 }}>오늘 덕목 도트 기록</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <button
              className="stamp"
              style={{
                background: today.virtueDots[selectedDate] ? 'var(--stamp-accent)' : 'var(--stamp-bg)',
                border: today.virtueDots[selectedDate] ? 'none' : '2px dashed rgba(0,0,0,0.15)',
                color: '#fff',
              }}
              onClick={() => updateToday(day => {
                day.virtueDots[selectedDate] = !day.virtueDots[selectedDate]
              })}
            >
              {today.virtueDots[selectedDate] ? '✓' : ''}
            </button>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{VIRTUES[0].ko} ({VIRTUES[0].en})</span>
          </div>

          <button className="cta-btn" onClick={() => {
            updateToday(day => {
              day.eveningAnswer = answer
              day.eveningDone = true
            })
            onDone()
          }}>
            하루 마무리 →
          </button>
        </div>
      </div>
    </div>
  )
}

// ==================== VIRTUE TAB ====================
function VirtueTab({ data, update, selectedDate }: {
  data: AppData
  update: (fn: (d: AppData) => void) => void
  selectedDate: string
}) {
  const position = cyclePosition(data, selectedDate, VIRTUE_CYCLE_LENGTH)
  const virtue = VIRTUES[position.virtue]
  const progress = (position.week / VIRTUE_CYCLE_LENGTH) * 100
  const selectedEarned = Boolean(data.virtueHistory[selectedDate])
  const weekKeys = weekDateKeys(selectedDate)

  function toggleVirtue(key: string) {
    update(d => {
      const earned = !d.virtueHistory[key]
      d.virtueHistory = { ...d.virtueHistory, [key]: earned }
      d.virtueUpdatedAt = { ...d.virtueUpdatedAt, [key]: Date.now() }
      const existing = d.days[key] || dayFromTemplate(d.blockTemplate)
      d.days = {
        ...d.days,
        [key]: {
          ...existing,
          virtueDots: { ...existing.virtueDots, [key]: earned },
          updatedAt: Date.now(),
        },
      }
    })
  }

  return (
    <div>
      {/* Cycle card */}
      <div className="virtue-cycle-card">
        <div className="cycle-header">
          <div>
            <div className="cycle-week">WEEK {position.week} / {VIRTUE_CYCLE_LENGTH}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>이번 주 덕목: {virtue.ko}</div>
          </div>
          <div className="cycle-number tabular">{position.week}<span style={{ fontSize: 20, opacity: 0.5 }}>/{VIRTUE_CYCLE_LENGTH}</span></div>
        </div>
        <div className="cycle-progress">
          <div className="cycle-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Weekly stamps */}
      <div className="section-title" style={{ fontSize: 16 }}>이번 주 인장</div>
      <div className="stamp-row">
        {['월', '화', '수', '목', '금', '토', '일'].map((label, index) => (
          <button key={weekKeys[index]} className={`stamp ${data.virtueHistory[weekKeys[index]] ? 'earned' : weekKeys[index] === dateKey() ? 'today' : 'empty'}`}
            aria-label={`${weekKeys[index]} 덕목 기록`}
            onClick={() => toggleVirtue(weekKeys[index])}>
            {data.virtueHistory[weekKeys[index]] ? '✓' : <span style={{ fontSize: 10, color: 'var(--muted)' }}>{label}</span>}
          </button>
        ))}
      </div>

      {/* Today's virtue dot */}
      <div className="review-card">
        <div className="review-title">선택한 날의 덕목: {virtue.ko} ({virtue.en})</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>"{virtue.precept}"</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            className="stamp"
            style={{
              background: selectedEarned ? 'var(--stamp-accent)' : 'var(--stamp-bg)',
              border: selectedEarned ? 'none' : '2px dashed rgba(0,0,0,0.15)',
              color: '#fff',
              width: 48, height: 48, fontSize: 22,
            }}
            aria-label={`${selectedDate} 덕목 기록`}
            onClick={() => toggleVirtue(selectedDate)}
          >
            {selectedEarned ? '✓' : ''}
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{selectedEarned ? '덕목을 지켰어요! 🎉' : '탭해서 기록'}</span>
        </div>
      </div>

      {/* All virtues list */}
      <div className="section-title" style={{ fontSize: 16 }}>{VIRTUE_CYCLE_LENGTH}덕목</div>
      {VIRTUES.map((v, i) => (
        <div key={i} className="virtue-item">
          <div className={`virtue-dot ${i === position.virtue ? 'active' : ''}`} />
          <div>
            <div className="virtue-name">{v.ko} <span className="virtue-name-en">({v.en})</span></div>
            <div className="virtue-precept">"{v.precept}"</div>
          </div>
          {i === position.virtue && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--study)' }}>이번 주</span>}
        </div>
      ))}

      <div className="cycle-auto-note">덕목은 매주 월요일 자동으로 다음 항목으로 전환됩니다.</div>
    </div>
  )
}

// ==================== REVIEW TAB ====================
function ReviewTab({ today, data, selectedDate }: { today: DayData; data: AppData; selectedDate: string }) {
  const filledBlocks = today.blocks.filter(b => b.title.trim() || b.purpose).length
  const fillRate = Math.round((filledBlocks / 6) * 100)
  const doneTasks = today.blocks.reduce((acc, b) => acc + b.tasks.filter(t => t.done).length, 0)
  const totalTasks = today.blocks.reduce((acc, b) => acc + b.tasks.length, 0)
  const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const virtueEarned = Boolean(data.virtueHistory[selectedDate])
  const position = cyclePosition(data, selectedDate, VIRTUE_CYCLE_LENGTH)
  const weekDays = weekDateKeys(selectedDate).map(key => data.days[key]).filter(Boolean)
  const weeklyCompletedBlocks = weekDays.reduce((sum, day) => sum + day.blocks.filter(block => block.title.trim() || block.purpose).length, 0)
  const weeklyReflections = weekDays.filter(day => day.eveningDone).length

  return (
    <div>
      <div className="section-title">{dateFromKey(selectedDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 리뷰</div>

      <div className="review-card review-card--highlight">
        <div className="review-title">이번 주 한눈에 보기</div>
        <div className="review-stat">
          <span className="review-stat-label">작성한 블록</span>
          <span className="review-stat-value">{weeklyCompletedBlocks}개</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">저녁 회고</span>
          <span className="review-stat-value">{weeklyReflections} / 7일</span>
        </div>
      </div>

      <div className="review-card">
        <div className="review-title">📊 블록 채움률</div>
        <div className="review-stat">
          <span className="review-stat-label">채운 블록</span>
          <span className="review-stat-value">{filledBlocks} / 6</span>
        </div>
        <div className="fill-bar">
          <div className="fill-bar-inner" style={{ width: `${fillRate}%`, background: 'var(--study)' }} />
        </div>
      </div>

      <div className="review-card">
        <div className="review-title">✅ 작업 완료율</div>
        <div className="review-stat">
          <span className="review-stat-label">완료한 작업</span>
          <span className="review-stat-value">{doneTasks} / {totalTasks}</span>
        </div>
        <div className="fill-bar">
          <div className="fill-bar-inner" style={{ width: `${taskRate}%`, background: 'var(--rest)' }} />
        </div>
      </div>

      <div className="review-card">
        <div className="review-title">📝 질문 의식</div>
        <div className="review-stat">
          <span className="review-stat-label">아침 의도</span>
          <span className="review-stat-value">{today.morningDone ? '✅ 완료' : '⬜ 미완료'}</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">저녁 반성</span>
          <span className="review-stat-value">{today.eveningDone ? '✅ 완료' : '⬜ 미완료'}</span>
        </div>
        {today.morningAnswer && (
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
            <strong>아침:</strong> {today.morningAnswer}
          </div>
        )}
        {today.eveningAnswer && (
          <div style={{ marginTop: 4, fontSize: 13, color: 'var(--muted)' }}>
            <strong>저녁:</strong> {today.eveningAnswer}
          </div>
        )}
      </div>

      <div className="review-card">
        <div className="review-title">🎯 덕목 진행</div>
        <div className="review-stat">
          <span className="review-stat-label">이번 주 덕목</span>
          <span className="review-stat-value">{VIRTUES[position.virtue].ko}</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">사이클</span>
          <span className="review-stat-value">{position.week} / {VIRTUE_CYCLE_LENGTH}</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">선택한 날의 도트</span>
          <span className="review-stat-value">{virtueEarned ? '● 기록됨' : '○ 미기록'}</span>
        </div>
      </div>

      <div className="review-card">
        <div className="review-title">🎨 목적별 채움</div>
        {PURPOSES.map(p => {
          const count = today.blocks.filter(b => b.purpose === p && (b.title.trim() || b.tasks.length)).length
          const pct = (count / 6) * 100
          return (
            <div key={p} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span>{PURPOSE_LABELS[p]}</span>
                <span style={{ color: 'var(--muted)' }}>{count}</span>
              </div>
              <div className="fill-bar">
                <div className="fill-bar-inner" style={{ width: `${pct}%`, background: PURPOSE_COLORS[p] }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
