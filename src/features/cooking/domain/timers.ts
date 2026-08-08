export interface CookingTimer {
  id: string
  label: string
  durationSeconds: number
  targetAt: string | null
  pausedRemainingSeconds: number | null
}

function assertDuration(seconds: number): void {
  if (!Number.isSafeInteger(seconds) || seconds <= 0) {
    throw new Error('Cooking timer duration must be a positive integer number of seconds')
  }
}

function cleanLabel(value: string): string {
  const label = value.trim()
  if (!label) throw new Error('Cooking timer label is required')
  return label
}

export function createCookingTimer(label: string, durationSeconds: number, id = crypto.randomUUID()): CookingTimer {
  assertDuration(durationSeconds)
  return {
    id,
    label: cleanLabel(label),
    durationSeconds,
    targetAt: null,
    pausedRemainingSeconds: durationSeconds,
  }
}

export function remainingTimerSeconds(timer: CookingTimer, nowMs = Date.now()): number {
  if (timer.targetAt === null) {
    return Math.max(0, timer.pausedRemainingSeconds ?? timer.durationSeconds)
  }

  const targetMs = Date.parse(timer.targetAt)
  if (!Number.isFinite(targetMs)) throw new Error('Cooking timer targetAt must be a valid ISO timestamp')
  return Math.max(0, Math.ceil((targetMs - nowMs) / 1000))
}

export function startCookingTimer(timer: CookingTimer, nowMs = Date.now()): CookingTimer {
  const remaining = timer.pausedRemainingSeconds ?? timer.durationSeconds
  return {
    ...timer,
    targetAt: new Date(nowMs + Math.max(0, remaining) * 1000).toISOString(),
    pausedRemainingSeconds: null,
  }
}

export function pauseCookingTimer(timer: CookingTimer, nowMs = Date.now()): CookingTimer {
  return {
    ...timer,
    targetAt: null,
    pausedRemainingSeconds: remainingTimerSeconds(timer, nowMs),
  }
}

export function resumeCookingTimer(timer: CookingTimer, nowMs = Date.now()): CookingTimer {
  if (timer.targetAt !== null) return timer
  const remaining = Math.max(0, timer.pausedRemainingSeconds ?? timer.durationSeconds)
  return {
    ...timer,
    targetAt: new Date(nowMs + remaining * 1000).toISOString(),
    pausedRemainingSeconds: null,
  }
}
