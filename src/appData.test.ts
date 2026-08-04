import { describe, expect, it } from 'vitest'
import {
  cyclePosition,
  dateKey,
  dayFromTemplate,
  defaultData,
  ensureDay,
  FRANKLIN_PRESET,
  mergeAppData,
  migrateData,
  shiftDateKey,
  startOfWeekKey,
  weekDateKeys,
} from './appData'

describe('local calendar dates', () => {
  it('uses the local calendar day instead of UTC', () => {
    expect(dateKey(new Date(2026, 7, 4, 1, 30))).toBe('2026-08-04')
  })

  it('moves safely across month and year boundaries', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDateKey('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('builds a Monday-to-Sunday week', () => {
    expect(startOfWeekKey('2026-08-09')).toBe('2026-08-03')
    expect(weekDateKeys('2026-08-09')).toEqual([
      '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06',
      '2026-08-07', '2026-08-08', '2026-08-09',
    ])
  })
})

describe('daily templates and migration', () => {
  it('creates a fresh day from the saved six-block template', () => {
    const day = dayFromTemplate(FRANKLIN_PRESET)
    expect(day.blocks).toHaveLength(6)
    expect(day.blocks[0]).toMatchObject({ title: '기상·계획', startTime: '05:00', tasks: [] })
    expect(day.blocks[0].id).toBeTruthy()
  })

  it('creates a missing date without changing an existing date', () => {
    const data = defaultData()
    const first = ensureDay(data, '2026-08-04')
    const second = ensureDay(first, '2026-08-05')
    expect(Object.keys(second.days).sort()).toEqual(['2026-08-04', '2026-08-05'])
    expect(second.days['2026-08-04']).toBe(first.days['2026-08-04'])
  })

  it('migrates legacy stamp data into date-based virtue history', () => {
    const legacyDay = dayFromTemplate(FRANKLIN_PRESET)
    legacyDay.stamps = [true, false, false, false, false, false, false]
    const migrated = migrateData({ ...defaultData(), schemaVersion: undefined, days: { '2026-08-04': legacyDay } })
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.virtueHistory['2026-08-03']).toBe(true)
  })
})

describe('cycle and cloud merge', () => {
  it('advances the virtue once per calendar week and restarts after week 12', () => {
    const data = { ...defaultData(), cycleStartedOn: '2026-08-03', cycleStartVirtue: 2 }
    expect(cyclePosition(data, '2026-08-03', 12)).toEqual({ week: 1, virtue: 2 })
    expect(cyclePosition(data, '2026-08-10', 12)).toEqual({ week: 2, virtue: 3 })
    expect(cyclePosition(data, '2026-10-26', 12)).toEqual({ week: 1, virtue: 2 })
  })

  it('keeps unique dates from both devices and the newer version of a shared date', () => {
    const local = ensureDay(defaultData(), '2026-08-04')
    local.days['2026-08-04'].updatedAt = 200
    const remote = ensureDay(defaultData(), '2026-08-05')
    remote.days['2026-08-04'] = { ...local.days['2026-08-04'], morningAnswer: 'remote old', updatedAt: 100 }
    remote.days['2026-08-05'].morningAnswer = 'remote only'

    const merged = mergeAppData(local, remote)
    expect(merged.days['2026-08-04'].morningAnswer).toBe('')
    expect(merged.days['2026-08-05'].morningAnswer).toBe('remote only')
  })

  it('respects an intentional reset instead of restoring old cloud days', () => {
    const oldRemote = ensureDay(defaultData(), '2026-08-01')
    oldRemote.updatedAt = 100
    const resetLocal = defaultData()
    resetLocal.resetAt = 200
    resetLocal.updatedAt = 200
    const merged = mergeAppData(resetLocal, oldRemote)
    expect(merged.days).toEqual({})
  })

  it('uses the newest virtue edit, including removing a mark', () => {
    const local = defaultData()
    local.virtueHistory['2026-08-04'] = false
    local.virtueUpdatedAt['2026-08-04'] = 200
    const remote = defaultData()
    remote.virtueHistory['2026-08-04'] = true
    remote.virtueUpdatedAt['2026-08-04'] = 100
    expect(mergeAppData(local, remote).virtueHistory['2026-08-04']).toBe(false)
  })
})
