// tests/load/scenarios/04-book-session.js
// Cenário: Agendar aula — POST /api/v1/sessions
// SLO: p95 < 2000ms | p99 < 4000ms | erros < 1%
// Auth: Bearer token requerida
//
// Contexto: operação de escrita com verificação de saldo, slot disponível
// e criação de registro. Criticamente importante — falha aqui = perda de receita.
// Erros esperados: 409 (slot já ocupado), 402 (sem créditos), 400 (slot inválido)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'
const TEST_SLOT_ID = __ENV.TEST_SLOT_ID || ''

const errorRate = new Rate('errors')
const bookingDuration = new Trend('book_session_duration', true)
const businessErrors = new Counter('booking_business_errors')

const SLO_P95 = 2000
const SLO_P99 = 4000

function getToken() {
  if (AUTH_TOKEN) return AUTH_TOKEN
  const res = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({ email: LOAD_TEST_USER, password: LOAD_TEST_PASS }),
    { headers: { 'Content-Type': 'application/json' } }
  )
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body)
      return body.token || body.accessToken || body.access_token || ''
    } catch { return '' }
  }
  return ''
}

function getAvailableSlot(token) {
  if (TEST_SLOT_ID) return TEST_SLOT_ID
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const res = http.get(
    `${BASE_URL}/api/v1/availability?from=${now.toISOString().split('T')[0]}&to=${nextWeek.toISOString().split('T')[0]}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (res.status === 200) {
    try {
      const body = JSON.parse(res.body)
      const slots = Array.isArray(body) ? body : (body.data || body.slots || [])
      const available = slots.find((s) => s.status === 'AVAILABLE' || s.available === true)
      return available ? (available.id || available.slotId || '') : ''
    } catch { return '' }
  }
  return ''
}

export function setup() {
  const token = getToken()
  const slotId = token ? getAvailableSlot(token) : ''
  return { token, slotId }
}

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 30 },
        { duration: '5m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      startTime: '10m',
      tags: { scenario: 'stress' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'book-session',
    project: 'corgly',
  },
}

export default function (data) {
  const { token, slotId } = data

  if (!token || !slotId) {
    // Sem token/slot válido: validar apenas que o endpoint responde (não 500)
    const res = http.post(
      `${BASE_URL}/api/v1/sessions`,
      JSON.stringify({ availabilityId: 'invalid-slot-test' }),
      { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || 'invalid'}` } }
    )
    bookingDuration.add(res.timings.duration)
    const ok = check(res, {
      'book-session (sem token/slot): NUNCA retorna 500': (r) =>
        r.status !== 500 && r.status !== 503,
      'book-session (sem token/slot): latência < SLO p95': (r) =>
        r.timings.duration < SLO_P95,
    })
    errorRate.add(!ok)
    sleep(3)
    return
  }

  const payload = JSON.stringify({ availabilityId: slotId })
  const res = http.post(`${BASE_URL}/api/v1/sessions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  bookingDuration.add(res.timings.duration)

  // 201 = sucesso | 409 = slot ocupado (esperado sob concorrência) | 402 = sem créditos
  if (res.status === 409 || res.status === 402 || res.status === 400) {
    businessErrors.add(1)
  }

  const ok = check(res, {
    'book-session: status 201 ou erro de negócio esperado': (r) =>
      [201, 400, 402, 409].includes(r.status),
    'book-session: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'book-session: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'book-session: response é JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(3)
}

export function handleSummary(data) {
  return {
    'tests/load/results/04-book-session-summary.json': JSON.stringify(data, null, 2),
  }
}
