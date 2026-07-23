import { useState, useEffect, useRef, useCallback } from 'react'

// ==================== TYPES ====================
type Purpose = 'deepwork' | 'study' | 'rest' | 'organize' | 'evening' | 'sleep' | ''
type Screen = 'onboarding' | 'canvas' | 'morning' | 'evening' | 'virtue' | 'review'
type Tab = 'canvas' | 'virtue' | 'review'

interface Task {
  id: string
  text: string
  done: boolean
}

interface Block {
  id: string
  order: number
  title: string
  intention: string
  purpose: Purpose
  startTime?: string
  endTime?: string
  tasks: Task[]
  reflection?: string
  rating?: string
}

interface DayData {
  blocks: Block[]
  morningAnswer: string
  morningResolution: string
  morningDone: boolean
  eveningAnswer: string
  eveningDone: boolean
  virtueDots: Record<string, boolean>  // virtueIndex -> earned
  stamps: boolean[]  // 7 days
}

interface AppData {
  onboarded: boolean
  dayStartTime: string
  currentVirtue: number
  cycleWeek: number
  theme: 'light' | 'dark'
  days: Record<string, DayData>  // dateKey -> data
}

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
  { ko: '순결', en: 'Chastity', precept: 'Rarely use venery but for health or offspring.' },
  { ko: '겸손', en: 'Humility', precept: 'Imitate Jesus and Socrates.' },
]

const FRANKLIN_PRESET = [
  { title: '기상·계획', purpose: 'organize' as Purpose, startTime: '05:00', endTime: '08:00' },
  { title: '딥워크', purpose: 'deepwork' as Purpose, startTime: '08:00', endTime: '12:00' },
  { title: '독서·식사', purpose: 'study' as Purpose, startTime: '12:00', endTime: '14:00' },
  { title: '딥워크 II', purpose: 'deepwork' as Purpose, startTime: '14:00', endTime: '18:00' },
  { title: '정리·반성', purpose: 'evening' as Purpose, startTime: '18:00', endTime: '22:00' },
  { title: '수면', purpose: 'sleep' as Purpose, startTime: '22:00', endTime: '05:00' },
]

const STORAGE_KEY = 'sixblocks-data'

// ==================== HELPERS ====================
function dateKey(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function emptyBlocks(): Block[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: uid(),
    order: i,
    title: '',
    intention: '',
    purpose: '',
    tasks: [],
  }))
}

function emptyDay(): DayData {
  return {
    blocks: emptyBlocks(),
    morningAnswer: '',
    morningResolution: '',
    morningDone: false,
    eveningAnswer: '',
    eveningDone: false,
    virtueDots: {},
    stamps: [false, false, false, false, false, false, false],
  }
}

function defaultData(): AppData {
  return {
    onboarded: false,
    dayStartTime: '00:00',
    currentVirtue: 0,
    cycleWeek: 1,
    theme: 'light',
    days: {},
  }
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultData(), ...JSON.parse(raw) }
  } catch {}
  return defaultData()
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

function getToday(data: AppData): DayData {
  const key = dateKey()
  if (!data.days[key]) {
    data.days[key] = emptyDay()
  }
  return data.days[key]
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
  const [tab, setTab] = useState<Tab>('canvas')
  const [screen, setScreen] = useState<Screen>(() => {
    const d = loadData()
    return d.onboarded ? 'canvas' : 'onboarding'
  })
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const timerRef = useRef<number | null>(null)

  // Save on every data change
  useEffect(() => { saveData(data) }, [data])

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', data.theme)
  }, [data.theme])

  const today = getToday(data)
  const todayKey = dateKey()

  // Update data helper
  const update = useCallback((updater: (d: AppData) => AppData) => {
    setData(prev => {
      const next = { ...prev }
      updater(next)
      return next
    })
  }, [])

  // Update today's data helper
  const updateToday = useCallback((updater: (day: DayData) => void) => {
    setData(prev => {
      const next = { ...prev, days: { ...prev.days } }
      const key = dateKey()
      if (!next.days[key]) next.days[key] = emptyDay()
      next.days[key] = { ...next.days[key] }
      updater(next.days[key])
      return next
    })
  }, [])

  // ==================== ONBOARDING ====================
  if (screen === 'onboarding') {
    return <Onboarding data={data} update={update} onComplete={() => {
      update(d => { d.onboarded = true })
      setScreen('canvas')
    }} />
  }

  // ==================== MORNING QUESTION ====================
  if (screen === 'morning') {
    return <MorningQuestion today={today} updateToday={updateToday} onDone={() => setScreen('canvas')} />
  }

  // ==================== EVENING QUESTION ====================
  if (screen === 'evening') {
    return <EveningQuestion today={today} updateToday={updateToday} onDone={() => setScreen('canvas')} />
  }

  // ==================== MAIN APP ====================
  return (
    <div className="app-shell">
      <div className="app-header">
        <div>
          <div className="app-title">SixBlocks</div>
          <div className="app-date">{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
        </div>
        <div className="header-right">
          <button className="theme-toggle" onClick={() => update(d => { d.theme = d.theme === 'light' ? 'dark' : 'light' })}>
            {data.theme === 'light' ? '🌙' : '☀️'}
          </button>
        </div>
      </div>

      <div className="tab-bar">
        <div className={`tab ${tab === 'canvas' ? 'active' : ''}`} onClick={() => setTab('canvas')}>캔버스</div>
        <div className={`tab ${tab === 'virtue' ? 'active' : ''}`} onClick={() => setTab('virtue')}>덕목</div>
        <div className={`tab ${tab === 'review' ? 'active' : ''}`} onClick={() => setTab('review')}>리뷰</div>
      </div>

      <div className="content page-enter" key={tab}>
        {tab === 'canvas' && (
          <CanvasTab
            today={today}
            updateToday={updateToday}
            data={data}
            update={update}
            dragIndex={dragIndex}
            setDragIndex={setDragIndex}
            onMorning={() => setScreen('morning')}
            onEvening={() => setScreen('evening')}
          />
        )}
        {tab === 'virtue' && <VirtueTab data={data} update={update} today={today} updateToday={updateToday} />}
        {tab === 'review' && <ReviewTab today={today} data={data} />}
      </div>
    </div>
  )
}

// ==================== ONBOARDING COMPONENT ====================
function Onboarding({ data, update, onComplete }: {
  data: AppData
  update: (fn: (d: AppData) => void) => void
  onComplete: () => void
}) {
  const [step, setStep] = useState(0)
  const [blockTitles, setBlockTitles] = useState<string[]>(['', '', '', '', '', ''])
  const [blockPurposes, setBlockPurposes] = useState<Purpose[]>(['', '', '', '', '', ''])
  const [usePreset, setUsePreset] = useState(false)
  const [selectedVirtue, setSelectedVirtue] = useState(0)

  if (step === 0) {
    return (
      <div className="onboarding">
        <div className="onboard-title">SixBlocks</div>
        <div className="onboard-subtitle">
          벤저민 프랭클린의 "하루 6블록" 철학에서 출발했어요.<br/>
          하루에 6가지 중요한 일을 정하고, 의도와 회고로 감싸며,<br/>
          13덕목으로 성장을 추적합니다.
        </div>
        <div className="rail-preview">
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.deepwork }} />
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.study }} />
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.rest }} />
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.organize }} />
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.evening }} />
          <div className="rail-preview-bar" style={{ background: PURPOSE_COLORS.sleep }} />
        </div>
        <button className="cta-btn" onClick={() => setStep(1)}>시작하기 →</button>
      </div>
    )
  }

  if (step === 1) {
    return (
      <div className="onboarding">
        <div className="onboard-title">오늘 하루 6가지 중요한 일을 적어보세요</div>
        <div className="onboard-subtitle">시간은 설정하지 않아도 괜찮아요. 순서대로 채우면 됩니다.</div>

        {blockTitles.map((title, i) => (
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

        <button className="link-btn" onClick={() => setUsePreset(true)}>📖 프랭클린 원형으로 시작할래요</button>

        {usePreset && (
          <div className="preset-card">
            <div className="preset-title">📖 프랭클린 원형 6블록</div>
            {FRANKLIN_PRESET.map((b, i) => (
              <div key={i} className="preset-block">
                <div className="preset-rail" style={{ background: PURPOSE_COLORS[b.purpose] }} />
                <div className="preset-name">{b.title}</div>
                <div className="preset-time">{b.startTime}–{b.endTime}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0' }}>시간은 내 리듬에 맞게 조정 가능</div>
            <button className="cta-btn" onClick={() => {
              FRANKLIN_PRESET.forEach((b, i) => {
                blockTitles[i] = b.title
                blockPurposes[i] = b.purpose
              })
              setBlockTitles([...blockTitles])
              setBlockPurposes([...blockPurposes])
              setUsePreset(false)
            }}>이 프리셋으로 시작</button>
          </div>
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
        <div className="onboard-subtitle">13주 동안 매주 하나의 덕목에 집중합니다. 추천: 절제(Temperance)</div>
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
              const key = dateKey()
              if (!d.days[key]) d.days[key] = emptyDay()
              d.days[key].blocks = blockTitles.map((title, i) => ({
                id: uid(),
                order: i,
                title: title || '',
                intention: '',
                purpose: blockPurposes[i] || '',
                startTime: usePreset ? FRANKLIN_PRESET[i].startTime : undefined,
                endTime: usePreset ? FRANKLIN_PRESET[i].endTime : undefined,
                tasks: [],
              }))
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
function CanvasTab({ today, updateToday, data, update, dragIndex, setDragIndex, onMorning, onEvening }: {
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
  data: AppData
  update: (fn: (d: AppData) => void) => void
  dragIndex: number | null
  setDragIndex: (i: number | null) => void
  onMorning: () => void
  onEvening: () => void
}) {
  const [editingTime, setEditingTime] = useState<number | null>(null)
  const [timerState, setTimerState] = useState<{ blockId: string; seconds: number; running: boolean } | null>(null)
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

  return (
    <div>
      {/* Morning/Evening prompts */}
      {!today.morningDone && (
        <div className="question-card" style={{ cursor: 'pointer' }} onClick={onMorning}>
          <div className="question-label">MORNING INTENTION</div>
          <div className="question-text">오늘 나는 무슨 선을 행할 것인가?</div>
          <div className="question-text-en">What good shall I do this day?</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>탭해서 아침 질문 작성 →</div>
        </div>
      )}

      {today.morningDone && !today.eveningDone && (
        <button className="link-btn" onClick={onEvening}>🌙 저녁 반성 질문 작성하기</button>
      )}

      <div className="section-title">6가지 중요한 일 <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>({filledCount}/6)</span></div>

      {today.blocks.map((block, i) => {
        const isNow = isCurrentBlock(block) || (timerState?.blockId === block.id && timerState.running)
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
                    <span className={`task-text ${task.done ? 'done' : ''}`}>{task.text}</span>
                  </li>
                ))}
                <li className="block-add-task" onClick={() => updateToday(day => { day.blocks[i].tasks.push({ id: uid(), text: '새 작업', done: false }) })}>
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
function EveningQuestion({ today, updateToday, onDone }: {
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
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
                background: today.virtueDots[String(dateKey())] ? 'var(--stamp-accent)' : 'var(--stamp-bg)',
                border: today.virtueDots[String(dateKey())] ? 'none' : '2px dashed rgba(0,0,0,0.15)',
                color: '#fff',
              }}
              onClick={() => updateToday(day => {
                const key = String(dateKey())
                day.virtueDots[key] = !day.virtueDots[key]
              })}
            >
              {today.virtueDots[String(dateKey())] ? '✓' : ''}
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
function VirtueTab({ data, update, today, updateToday }: {
  data: AppData
  update: (fn: (d: AppData) => void) => void
  today: DayData
  updateToday: (fn: (day: DayData) => void) => void
}) {
  const virtue = VIRTUES[data.currentVirtue]
  const progress = (data.cycleWeek / 13) * 100
  const dayKey = dateKey()
  const todayEarned = !!today.virtueDots[dayKey]

  // Weekly stamps (simplified - use current week's days)
  const stamps = today.stamps || [false, false, false, false, false, false, false]
  const todayDay = new Date().getDay() // 0=Sun
  const stampIndex = todayDay === 0 ? 6 : todayDay - 1

  return (
    <div>
      {/* Cycle card */}
      <div className="virtue-cycle-card">
        <div className="cycle-header">
          <div>
            <div className="cycle-week">WEEK {data.cycleWeek} / 13</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>이번 주 덕목: {virtue.ko}</div>
          </div>
          <div className="cycle-number tabular">{data.cycleWeek}<span style={{ fontSize: 20, opacity: 0.5 }}>/13</span></div>
        </div>
        <div className="cycle-progress">
          <div className="cycle-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Weekly stamps */}
      <div className="section-title" style={{ fontSize: 16 }}>이번 주 인장</div>
      <div className="stamp-row">
        {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
          <div key={i} className={`stamp ${stamps[i] ? 'earned' : i === stampIndex ? 'today' : 'empty'}`}
            onClick={() => updateToday(day => { day.stamps[i] = !day.stamps[i] })}>
            {stamps[i] ? '✓' : <span style={{ fontSize: 10, color: 'var(--muted)' }}>{d}</span>}
          </div>
        ))}
      </div>

      {/* Today's virtue dot */}
      <div className="review-card">
        <div className="review-title">오늘 덕목: {virtue.ko} ({virtue.en})</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 12 }}>"{virtue.precept}"</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            className="stamp"
            style={{
              background: todayEarned ? 'var(--stamp-accent)' : 'var(--stamp-bg)',
              border: todayEarned ? 'none' : '2px dashed rgba(0,0,0,0.15)',
              color: '#fff',
              width: 48, height: 48, fontSize: 22,
            }}
            onClick={() => updateToday(day => { day.virtueDots[dayKey] = !day.virtueDots[dayKey] })}
          >
            {todayEarned ? '✓' : ''}
          </button>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{todayEarned ? '오늘 덕목 달성! 🎉' : '탭해서 기록'}</span>
        </div>
      </div>

      {/* All virtues list */}
      <div className="section-title" style={{ fontSize: 16 }}>13덕목</div>
      {VIRTUES.map((v, i) => (
        <div key={i} className="virtue-item">
          <div className={`virtue-dot ${i === data.currentVirtue ? 'active' : ''}`} />
          <div>
            <div className="virtue-name">{v.ko} <span className="virtue-name-en">({v.en})</span></div>
            <div className="virtue-precept">"{v.precept}"</div>
          </div>
          {i === data.currentVirtue && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--study)' }}>이번 주</span>}
        </div>
      ))}

      {/* Next virtue button */}
      <div style={{ marginTop: 16 }}>
        <button className="cta-btn" onClick={() => update(d => {
          if (d.cycleWeek < 13) {
            d.cycleWeek++
            d.currentVirtue = (d.currentVirtue + 1) % 13
          } else {
            d.cycleWeek = 1
            d.currentVirtue = 0
          }
        })}>
          {data.cycleWeek < 13 ? '다음 주 덕목으로 →' : '새 사이클 시작 🏆'}
        </button>
      </div>
    </div>
  )
}

// ==================== REVIEW TAB ====================
function ReviewTab({ today, data }: { today: DayData; data: AppData }) {
  const filledBlocks = today.blocks.filter(b => b.title.trim() || b.purpose).length
  const fillRate = Math.round((filledBlocks / 6) * 100)
  const doneTasks = today.blocks.reduce((acc, b) => acc + b.tasks.filter(t => t.done).length, 0)
  const totalTasks = today.blocks.reduce((acc, b) => acc + b.tasks.length, 0)
  const taskRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  const virtueEarned = Object.values(today.virtueDots).filter(Boolean).length
  const purposeColors = PURPOSES

  return (
    <div>
      <div className="section-title">오늘 리뷰</div>

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
          <span className="review-stat-value">{VIRTUES[data.currentVirtue].ko}</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">사이클</span>
          <span className="review-stat-value">{data.cycleWeek} / 13</span>
        </div>
        <div className="review-stat">
          <span className="review-stat-label">오늘 도트</span>
          <span className="review-stat-value">{virtueEarned > 0 ? '● 기록됨' : '○ 미기록'}</span>
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
