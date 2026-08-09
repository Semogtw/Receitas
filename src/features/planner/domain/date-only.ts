const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY.exec(value)
  if (!match) throw new Error('Date-only value must use YYYY-MM-DD')
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error('Date-only value is invalid')
  }
  return date
}

export function formatDateOnlyValue(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysDateOnly(value: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new Error('Date-only day offset must be an integer')
  const date = parseDateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return formatDateOnlyValue(date)
}

export function startOfWeekDateOnly(value: string): string {
  const date = parseDateOnly(value)
  const weekday = date.getUTCDay()
  const daysSinceMonday = (weekday + 6) % 7
  return addDaysDateOnly(value, -daysSinceMonday)
}

export function weekDates(value: string): string[] {
  const start = startOfWeekDateOnly(value)
  return Array.from({ length: 7 }, (_, index) => addDaysDateOnly(start, index))
}

export function todayDateOnly(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatPlannerDate(
  value: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: 'short' },
): string {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone: 'UTC' }).format(parseDateOnly(value))
}
