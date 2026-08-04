export type Purpose = 'deepwork' | 'study' | 'rest' | 'organize' | 'evening' | 'sleep' | ''

export interface Task {
  id: string
  text: string
  done: boolean
}

export interface Block {
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

export interface DayData {
  blocks: Block[]
  morningAnswer: string
  morningResolution: string
  morningDone: boolean
  eveningAnswer: string
  eveningDone: boolean
  virtueDots: Record<string, boolean>
  stamps: boolean[]
  updatedAt: number
}

export interface BlockTemplate {
  title: string
  purpose: Purpose
  startTime?: string
  endTime?: string
}

export interface AppData {
  schemaVersion: 2
  onboarded: boolean
  dayStartTime: string
  currentVirtue: number
  cycleWeek: number
  cycleStartedOn: string
  cycleStartVirtue: number
  theme: 'light' | 'dark'
  blockTemplate: BlockTemplate[]
  virtueHistory: Record<string, boolean>
  virtueUpdatedAt: Record<string, number>
  days: Record<string, DayData>
  resetAt: number
  updatedAt: number
}

export const FRANKLIN_PRESET: BlockTemplate[] = [
  { title: '기상·계획', purpose: 'organize', startTime: '05:00', endTime: '08:00' },
  { title: '딥워크', purpose: 'deepwork', startTime: '08:00', endTime: '12:00' },
  { title: '독서·식사', purpose: 'study', startTime: '12:00', endTime: '14:00' },
  { title: '딥워크 II', purpose: 'deepwork', startTime: '14:00', endTime: '18:00' },
  { title: '정리·반성', purpose: 'evening', startTime: '18:00', endTime: '22:00' },
  { title: '수면', purpose: 'sleep', startTime: '22:00', endTime: '05:00' },
]

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function dateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function shiftDateKey(key: string, days: number): string {
  const date = dateFromKey(key)
  date.setDate(date.getDate() + days)
  return dateKey(date)
}

export function startOfWeekKey(key: string): string {
  const date = dateFromKey(key)
  const mondayOffset = date.getDay() === 0 ? -6 : 1 - date.getDay()
  date.setDate(date.getDate() + mondayOffset)
  return dateKey(date)
}

export function weekDateKeys(key: string): string[] {
  const monday = startOfWeekKey(key)
  return Array.from({ length: 7 }, (_, index) => shiftDateKey(monday, index))
}

export function emptyBlocks(): Block[] {
  return Array.from({ length: 6 }, (_, order) => ({
    id: uid(),
    order,
    title: '',
    intention: '',
    purpose: '',
    tasks: [],
  }))
}

export function templateFromBlocks(blocks: Block[]): BlockTemplate[] {
  return blocks.slice(0, 6).map(block => ({
    title: block.title,
    purpose: block.purpose,
    startTime: block.startTime,
    endTime: block.endTime,
  }))
}

export function dayFromTemplate(template: BlockTemplate[]): DayData {
  const blocks: Block[] = template.length > 0
    ? template.slice(0, 6).map((block, order) => ({
        id: uid(),
        order,
        title: block.title,
        intention: '',
        purpose: block.purpose,
        startTime: block.startTime,
        endTime: block.endTime,
        tasks: [],
      }))
    : emptyBlocks()

  while (blocks.length < 6) {
    blocks.push({ id: uid(), order: blocks.length, title: '', intention: '', purpose: '', tasks: [] })
  }

  return {
    blocks,
    morningAnswer: '',
    morningResolution: '',
    morningDone: false,
    eveningAnswer: '',
    eveningDone: false,
    virtueDots: {},
    stamps: [false, false, false, false, false, false, false],
    updatedAt: Date.now(),
  }
}

export function defaultData(): AppData {
  return {
    schemaVersion: 2,
    onboarded: false,
    dayStartTime: '00:00',
    currentVirtue: 0,
    cycleWeek: 1,
    cycleStartedOn: startOfWeekKey(dateKey()),
    cycleStartVirtue: 0,
    theme: 'light',
    blockTemplate: FRANKLIN_PRESET.map(block => ({ ...block })),
    virtueHistory: {},
    virtueUpdatedAt: {},
    days: {},
    resetAt: 0,
    updatedAt: Date.now(),
  }
}

export function migrateData(value: unknown): AppData {
  const defaults = defaultData()
  if (!value || typeof value !== 'object') return defaults

  const legacy = value as Partial<AppData>
  const days = legacy.days && typeof legacy.days === 'object' ? legacy.days : {}
  const latestKey = Object.keys(days).sort().at(-1)
  const latestBlocks = latestKey ? days[latestKey]?.blocks : undefined
  const blockTemplate = Array.isArray(legacy.blockTemplate) && legacy.blockTemplate.length > 0
    ? legacy.blockTemplate
    : latestBlocks?.length
      ? templateFromBlocks(latestBlocks)
      : defaults.blockTemplate

  const virtueHistory = { ...(legacy.virtueHistory || {}) }
  const virtueUpdatedAt = { ...(legacy.virtueUpdatedAt || {}) }
  Object.entries(days).forEach(([key, day]) => {
    if (day?.virtueDots?.[key]) {
      virtueHistory[key] = true
      virtueUpdatedAt[key] ||= day.updatedAt || 0
    }
    if (Array.isArray(day?.stamps)) {
      weekDateKeys(key).forEach((stampKey, index) => {
        if (day.stamps[index]) {
          virtueHistory[stampKey] = true
          virtueUpdatedAt[stampKey] ||= day.updatedAt || 0
        }
      })
    }
  })

  return {
    ...defaults,
    ...legacy,
    schemaVersion: 2,
    cycleStartVirtue: typeof legacy.cycleStartVirtue === 'number'
      ? legacy.cycleStartVirtue
      : ((((legacy.currentVirtue || 0) - ((legacy.cycleWeek || 1) - 1)) % 12) + 12) % 12,
    blockTemplate: blockTemplate.map(block => ({ ...block })),
    virtueHistory,
    virtueUpdatedAt,
    days,
  }
}

export function cyclePosition(data: AppData, key: string, cycleLength: number): { week: number; virtue: number } {
  const start = dateFromKey(startOfWeekKey(data.cycleStartedOn))
  const target = dateFromKey(startOfWeekKey(key))
  const elapsedWeeks = Math.max(0, Math.round((target.getTime() - start.getTime()) / (7 * 86_400_000)))
  return {
    week: (elapsedWeeks % cycleLength) + 1,
    virtue: (data.cycleStartVirtue + elapsedWeeks) % cycleLength,
  }
}

export function ensureDay(data: AppData, key: string): AppData {
  if (data.days[key]) return data
  return {
    ...data,
    days: { ...data.days, [key]: dayFromTemplate(data.blockTemplate) },
    updatedAt: Date.now(),
  }
}

export function mergeAppData(localValue: AppData, remoteValue: AppData): AppData {
  const local = migrateData(localValue)
  const remote = migrateData(remoteValue)
  if (local.resetAt > remote.updatedAt) return { ...local, updatedAt: Date.now() }
  if (remote.resetAt > local.updatedAt) return { ...remote, updatedAt: Date.now() }
  const merged: AppData = local.updatedAt >= remote.updatedAt ? { ...local } : { ...remote }
  const allDayKeys = new Set([...Object.keys(local.days), ...Object.keys(remote.days)])
  const days: Record<string, DayData> = {}

  allDayKeys.forEach(key => {
    const localDay = local.days[key]
    const remoteDay = remote.days[key]
    if (localDay && remoteDay) {
      days[key] = (localDay.updatedAt || 0) >= (remoteDay.updatedAt || 0) ? localDay : remoteDay
    } else if (localDay || remoteDay) {
      days[key] = (localDay || remoteDay)!
    }
  })

  merged.days = days
  merged.virtueHistory = {}
  merged.virtueUpdatedAt = {}
  const virtueKeys = new Set([...Object.keys(local.virtueHistory), ...Object.keys(remote.virtueHistory)])
  virtueKeys.forEach(key => {
    const localTime = local.virtueUpdatedAt[key] || 0
    const remoteTime = remote.virtueUpdatedAt[key] || 0
    const useLocal = localTime >= remoteTime
    merged.virtueHistory[key] = Boolean(useLocal ? local.virtueHistory[key] : remote.virtueHistory[key])
    merged.virtueUpdatedAt[key] = Math.max(localTime, remoteTime)
  })
  merged.updatedAt = Date.now()
  return merged
}

export function incompleteTasks(day?: DayData): Array<{ blockOrder: number; task: Task }> {
  if (!day) return []
  return day.blocks.flatMap((block, blockOrder) => block.tasks
    .filter(task => task.text.trim() && !task.done)
    .map(task => ({ blockOrder, task })))
}
