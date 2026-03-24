// tests/load/scenarios/01-homepage.js
// Cenário: Landing page pública — GET /
// SLO: p95 < 3000ms | p99 < 5000ms | erros < 1%
// Auth: não requerida

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const errorRate = new Rate('errors')
const pageDuration = new Trend('homepage_duration', true)

const SLO_P95 = 3000
const SLO_P99 = 5000

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
        { duration: '2m', target: 30 },
        { duration: '5m', target: 30 },
        { duration: '2m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },
        { duration: '5m', target: 100 },
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
    scenario: __ENV.SCENARIO || 'homepage',
    project: 'corgly',
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/`, {
    headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
  })

  pageDuration.add(res.timings.duration)

  const ok = check(res, {
    'homepage: status 200': (r) => r.status === 200,
    'homepage: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'homepage: body não vazio': (r) => r.body && r.body.length > 0,
  })

  errorRate.add(!ok)
  sleep(1)
}

export function handleSummary(data) {
  return {
    'tests/load/results/01-homepage-summary.json': JSON.stringify(data, null, 2),
  }
}
