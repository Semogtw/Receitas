import { describe, expect, it } from 'vitest'
import {
  createCookingTimer,
  pauseCookingTimer,
  remainingTimerSeconds,
  resumeCookingTimer,
  startCookingTimer,
} from './timers'

const now = Date.parse('2026-08-07T20:00:00.000Z')

describe('cooking timers', () => {
  it('uses an absolute deadline so elapsed time survives a suspended screen', () => {
    const timer = startCookingTimer(createCookingTimer('Forno', 300), now)

    expect(timer.targetAt).toBe('2026-08-07T20:05:00.000Z')
    expect(remainingTimerSeconds(timer, now + 120_000)).toBe(180)
    expect(remainingTimerSeconds(timer, now + 360_000)).toBe(0)
  })

  it('pauses by capturing remaining time and resumes from a new absolute deadline', () => {
    const running = startCookingTimer(createCookingTimer('Descanso', 90), now)
    const paused = pauseCookingTimer(running, now + 30_000)

    expect(paused.targetAt).toBeNull()
    expect(paused.pausedRemainingSeconds).toBe(60)
    expect(remainingTimerSeconds(paused, now + 300_000)).toBe(60)

    const resumed = resumeCookingTimer(paused, now + 300_000)
    expect(resumed.targetAt).toBe('2026-08-07T20:06:00.000Z')
    expect(resumed.pausedRemainingSeconds).toBeNull()
  })

  it('rejects zero, negative and non-integer timer durations', () => {
    expect(() => createCookingTimer('x', 0)).toThrow('positive integer')
    expect(() => createCookingTimer('x', -1)).toThrow('positive integer')
    expect(() => createCookingTimer('x', 1.5)).toThrow('positive integer')
  })
})
