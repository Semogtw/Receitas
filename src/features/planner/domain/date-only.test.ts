import { describe, expect, it } from 'vitest'
import {
  addDaysDateOnly,
  formatPlannerDate,
  startOfWeekDateOnly,
  todayDateOnly,
  weekDates,
} from './date-only'

describe('planner date-only helpers', () => {
  it('adds calendar days without timestamp timezone conversion', () => {
    expect(addDaysDateOnly('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDaysDateOnly('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('builds a Monday-to-Sunday week from any selected date', () => {
    expect(startOfWeekDateOnly('2026-08-08')).toBe('2026-08-03')
    expect(weekDates('2026-08-08')).toEqual([
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-08',
      '2026-08-09',
    ])
  })

  it('reads today from local calendar fields instead of ISO UTC serialization', () => {
    const localLikeDate = new Date(2026, 7, 8, 23, 45)
    expect(todayDateOnly(localLikeDate)).toBe('2026-08-08')
  })

  it('formats a date-only value with a fixed UTC interpretation', () => {
    expect(formatPlannerDate('2026-08-08', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('08/08/2026')
  })

  it('rejects impossible calendar dates', () => {
    expect(() => addDaysDateOnly('2026-02-30', 1)).toThrow('Date-only value is invalid')
  })
})
