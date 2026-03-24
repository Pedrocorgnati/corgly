// tests/load/run-all.js
// Orquestrador de testes de carga — Corgly
//
// USO:
//   Smoke (1 VU, 1min):  k6 run --env SCENARIO=smoke tests/load/run-all.js
//   Carga normal:        k6 run tests/load/run-all.js
//   Stress:              k6 run --env SCENARIO=stress tests/load/run-all.js
//   Individual:          k6 run tests/load/scenarios/03-availability.js
//
// ENV VARS REQUERIDAS:
//   BASE_URL          URL base (padrão: https://corgly.app)
//   LOAD_TEST_USER    Email do usuário de carga (padrão: loadtest@corgly.app)
//   LOAD_TEST_PASS    Senha do usuário de carga (padrão: LoadTest@123)
//   AUTH_TOKEN        Token JWT pré-obtido (evita login a cada setup)
//   COMMIT_SHA        SHA do commit para rastreabilidade (opcional)
//
// NOTAS:
//   INTERNAL_TOKEN    Token interno para health check detalhado (opcional)
//
//   - Cenário 08 (checkout) desabilitado no orquestrador — executar individualmente
//     apenas com Stripe em modo test e priceIds de teste configurados
//   - Cenários 12 (profile PATCH) e 13 (admin dashboard) também apenas individuais
//   - k6 retorna exit code != 0 se thresholds forem violados (integra com CI/CD)

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js'

// Para executar individualmente com setup() compartilhado,
// cada cenário importa e faz seu próprio setup.
// Este arquivo define os stages globais para execução sequencial.

const SCENARIO = __ENV.SCENARIO || 'load'

export const options = {
  scenarios: {
    homepage: {
      executor: 'constant-vus',
      exec: 'homepage',
      vus: SCENARIO === 'smoke' ? 1 : SCENARIO === 'stress' ? 20 : 10,
      duration: SCENARIO === 'smoke' ? '1m' : SCENARIO === 'stress' ? '5m' : '5m',
    },
    content: {
      executor: 'constant-vus',
      exec: 'content',
      vus: SCENARIO === 'smoke' ? 1 : SCENARIO === 'stress' ? 30 : 15,
      duration: SCENARIO === 'smoke' ? '1m' : SCENARIO === 'stress' ? '5m' : '5m',
      startTime: SCENARIO === 'smoke' ? '0s' : '30s',
    },
    health_check: {
      executor: 'constant-vus',
      exec: 'healthCheck',
      vus: SCENARIO === 'smoke' ? 1 : SCENARIO === 'stress' ? 10 : 5,
      duration: SCENARIO === 'smoke' ? '1m' : SCENARIO === 'stress' ? '5m' : '5m',
      startTime: SCENARIO === 'smoke' ? '0s' : '15s',
    },
    feedback: {
      executor: 'constant-vus',
      exec: 'feedback',
      vus: SCENARIO === 'smoke' ? 1 : SCENARIO === 'stress' ? 20 : 10,
      duration: SCENARIO === 'smoke' ? '1m' : SCENARIO === 'stress' ? '5m' : '5m',
      startTime: SCENARIO === 'smoke' ? '0s' : '45s',
    },
    subscriptions: {
      executor: 'constant-vus',
      exec: 'subscriptions',
      vus: SCENARIO === 'smoke' ? 1 : SCENARIO === 'stress' ? 20 : 10,
      duration: SCENARIO === 'smoke' ? '1m' : SCENARIO === 'stress' ? '5m' : '5m',
      startTime: SCENARIO === 'smoke' ? '0s' : '1m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<4000'],
    http_req_failed: ['rate<0.05'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    run_mode: SCENARIO,
    project: 'corgly',
  },
}

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'

import http from 'k6/http'
import { check, sleep } from 'k6'

export function homepage() {
  const res = http.get(`${BASE_URL}/`, { headers: { 'Accept-Language': 'pt-BR' } })
  check(res, {
    'homepage: 200': (r) => r.status === 200,
    'homepage: < 3s': (r) => r.timings.duration < 3000,
  })
  sleep(1)
}

export function content() {
  const res = http.get(`${BASE_URL}/api/v1/content?page=1&limit=12`)
  check(res, {
    'content: 200': (r) => r.status === 200,
    'content: < 400ms': (r) => r.timings.duration < 400,
  })
  sleep(0.5)
}

export function healthCheck() {
  const headers = {}
  if (__ENV.INTERNAL_TOKEN) headers['x-internal-token'] = __ENV.INTERNAL_TOKEN
  const res = http.get(`${BASE_URL}/api/health/detail`, { headers })
  check(res, {
    'health: 200 ou 401': (r) => r.status === 200 || r.status === 401,
    'health: < 200ms': (r) => r.timings.duration < 200,
  })
  sleep(0.5)
}

export function feedback() {
  const headers = __ENV.AUTH_TOKEN ? { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` } : {}
  const res = http.get(`${BASE_URL}/api/v1/feedback?page=1&limit=10`, { headers })
  check(res, {
    'feedback: 200 ou 401': (r) => r.status === 200 || r.status === 401,
    'feedback: < 400ms': (r) => r.timings.duration < 400,
  })
  sleep(1)
}

export function subscriptions() {
  const headers = __ENV.AUTH_TOKEN ? { Authorization: `Bearer ${__ENV.AUTH_TOKEN}` } : {}
  const res = http.get(`${BASE_URL}/api/v1/subscriptions`, { headers })
  check(res, {
    'subscriptions: 200 ou 401': (r) => r.status === 200 || r.status === 401,
    'subscriptions: < 400ms': (r) => r.timings.duration < 400,
  })
  sleep(1)
}

export function handleSummary(data) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    [`tests/load/results/summary-${timestamp}.json`]: JSON.stringify(data, null, 2),
  }
}
