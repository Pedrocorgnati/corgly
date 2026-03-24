// tests/load/scenarios/12-profile.js
// Cenario: Atualizar perfil — PATCH /api/v1/profile
// SLO: p95 < 800ms | p99 < 2000ms | erros < 1%
// Auth: Bearer token requerida
//
// Contexto: aluno atualiza timezone, country ou preferredLanguage.
// Operacao de escrita com validacao Zod (UpdateProfileSchema).
// Erros esperados: 400 (validacao), 401 (sem auth)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const profileDuration = new Trend('profile_update_duration', true)
const validationErrors = new Counter('profile_validation_errors')

const SLO_P95 = 800
const SLO_P99 = 2000

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

export function setup() {
  const token = getToken()
  return { token }
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
    scenario: __ENV.SCENARIO || 'profile',
    project: 'corgly',
  },
}

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/New_York',
  'Europe/Rome',
  'Europe/Madrid',
  'America/Los_Angeles',
]

export default function (data) {
  const { token } = data
  if (!token) {
    const res = http.patch(
      `${BASE_URL}/api/v1/profile`,
      JSON.stringify({ timezone: 'America/Sao_Paulo' }),
      { headers: { 'Content-Type': 'application/json' } }
    )
    profileDuration.add(res.timings.duration)
    const ok = check(res, {
      'profile (sem token): NUNCA retorna 500': (r) =>
        r.status !== 500 && r.status !== 503,
    })
    errorRate.add(!ok)
    sleep(2)
    return
  }

  // Alterna timezone para simular update real (idempotente, nao altera dados criticos)
  const tz = TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)]
  const payload = JSON.stringify({ timezone: tz })

  const res = http.patch(`${BASE_URL}/api/v1/profile`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  profileDuration.add(res.timings.duration)

  if (res.status === 400) {
    validationErrors.add(1)
  }

  const ok = check(res, {
    'profile: status 200 ou erro esperado': (r) =>
      [200, 400, 401].includes(r.status),
    'profile: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'profile: latencia < SLO p95': (r) => r.timings.duration < SLO_P95,
    'profile: response e JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(2)
}

export function handleSummary(data) {
  return {
    'tests/load/results/12-profile-summary.json': JSON.stringify(data, null, 2),
  }
}
