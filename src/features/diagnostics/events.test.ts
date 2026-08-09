import { describe, expect, it } from 'vitest'
import { createDiagnosticEvent, isDiagnosticEvent, sanitizeDiagnosticContext } from './events'

describe('diagnostic event sanitization', () => {
  it('keeps only allowlisted primitive technical fields', () => {
    expect(sanitizeDiagnosticContext({
      queueCount: 3,
      online: false,
      errorCode: 'storage_timeout',
      arbitrary: 'must disappear',
      nested: { anything: true },
    })).toEqual({
      queueCount: 3,
      online: false,
      errorCode: 'storage_timeout',
    })
  })

  it('drops private-content keys even when a caller tries to log them', () => {
    const sanitized = sanitizeDiagnosticContext({
      token: 'abc',
      Authorization: 'Bearer secret',
      password: 'secret',
      bootstrapSecret: 'secret',
      email: 'person@example.com',
      recipeText: 'bolo privado',
      ingredient: 'farinha',
      title: 'receita de família',
      body: 'request body',
      payload: '{ private: true }',
      imageData: 'data:image/png;base64,AAAA',
      userId: '10000000-0000-4000-8000-000000000001',
      pairId: '20000000-0000-4000-8000-000000000002',
      queueCount: 1,
    })

    expect(sanitized).toEqual({ queueCount: 1 })
    expect(JSON.stringify(sanitized)).not.toContain('example.com')
    expect(JSON.stringify(sanitized)).not.toContain('bolo privado')
  })

  it('redacts sensitive strings that arrive through an otherwise technical key', () => {
    expect(sanitizeDiagnosticContext({
      errorCode: 'Bearer eyJverylongsensitivetokenvalue123456789',
      operation: 'person@example.com',
      phase: 'safe_phase',
    })).toEqual({
      errorCode: '[redacted]',
      operation: '[redacted]',
      phase: 'safe_phase',
    })
  })

  it('normalizes code and creates only validated event shapes', () => {
    const event = createDiagnosticEvent({
      area: 'sync',
      severity: 'warning',
      code: ' Upload_Retry ',
      timestamp: '2026-08-09T10:00:00.000Z',
      technicalContext: { retryCount: 2 },
    })

    expect(event.code).toBe('upload_retry')
    expect(event.technicalContext).toEqual({ retryCount: 2 })
    expect(isDiagnosticEvent(event)).toBe(true)
  })

  it('rejects malformed historical records during store reload', () => {
    expect(isDiagnosticEvent({
      id: 'x',
      timestamp: 'not-a-date',
      area: 'sync',
      code: 'ok',
      severity: 'info',
      technicalContext: {},
    })).toBe(false)
    expect(isDiagnosticEvent({
      id: 'x',
      timestamp: '2026-08-09T10:00:00.000Z',
      area: 'sync',
      code: 'ok',
      severity: 'info',
      technicalContext: { payload: 'private' },
    })).toBe(false)
  })
})
