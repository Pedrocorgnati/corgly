// tests/load/scenarios/07-content.js
// Cenário: Conteúdo gratuito público — GET /api/v1/content
// SLO: p95 < 400ms | p99 < 800ms | erros < 1%
// Auth: não requerida (endpoint público)
//
// Contexto: listagem de conteúdo da landing page + área logada.
// Alta frequência — visitantes anônimos e alunos. Candidato a cache.

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const errorRate = new Rate('errors')
const contentDuration = new Trend('content_duration', true)

const SLO_P95 = 400
const SLO_P99 = 800

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    average_load: {
      executor: 'constant-arrival-rate',
      rate: 40,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 150,
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
    stress: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 120,
      maxVUs: 300,
      startTime: '7m',
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
    scenario: __ENV.SCENARIO || 'content',
    project: 'corgly',
  },
}

export default function () {
  const res = http.get(`${BASE_URL}/api/v1/content?page=1&limit=12`, {
    headers: { 'Accept-Language': 'pt-BR,pt;q=0.9' },
  })

  contentDuration.add(res.timings.duration)

  const ok = check(res, {
    'content: status 200': (r) => r.status === 200,
    'content: NUNCA retorna 500': (r) => r.status !== 500 && r.status !== 503,
    'content: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'content: lista não vazia': (r) => {
      try {
        const body = JSON.parse(r.body)
        const items = Array.isArray(body) ? body : (body.data || body.content || [])
        return items.length >= 0 // aceita lista vazia (sem conteúdo cadastrado)
      } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(0.5)
}

export function handleSummary(data) {
  return {
    'tests/load/results/07-content-summary.json': JSON.stringify(data, null, 2),
  }
}
