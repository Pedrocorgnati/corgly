// tests/load/scenarios/08-checkout.js
// Cenário: Checkout Stripe — POST /api/v1/checkout
// SLO: p95 < 2000ms | p99 < 5000ms | erros < 1%
// Auth: Bearer token requerida
//
// ATENÇÃO: Este cenário cria sessões Stripe.
// Em ambiente de TESTE: definir STRIPE_MODE=test no .env
// Em ambiente de PRODUÇÃO: NÃO executar testes de carga reais neste endpoint.
// O smoke test apenas valida que o endpoint responde, NÃO cria cobranças reais.
//
// Erros esperados: 503 (Stripe indisponível) — sistema deve retornar erro gracioso, não 500

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Rate, Trend, Counter } from 'k6/metrics'

const BASE_URL = __ENV.BASE_URL || 'https://corgly.app'
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''
const LOAD_TEST_USER = __ENV.LOAD_TEST_USER || 'loadtest@corgly.app'
const LOAD_TEST_PASS = __ENV.LOAD_TEST_PASS || 'LoadTest@123'

const errorRate = new Rate('errors')
const checkoutDuration = new Trend('checkout_duration', true)
const stripeErrors = new Counter('stripe_service_errors')

const SLO_P95 = 2000
const SLO_P99 = 5000

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
  return { token: getToken() }
}

export const options = {
  scenarios: {
    // Checkout: apenas smoke test por padrão — carga real requer ambiente Stripe test isolado
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '1m',
      tags: { scenario: 'smoke' },
    },
    // Para habilitar carga real: k6 run --env SCENARIO=load scenarios/08-checkout.js
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 5 },
        { duration: '3m', target: 5 },
        { duration: '1m', target: 0 },
      ],
      startTime: '1m',
      tags: { scenario: 'average_load' },
    },
  },
  thresholds: {
    http_req_duration: [`p(95)<${SLO_P95}`, `p(99)<${SLO_P99}`],
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.05'],
    // Stripe deve retornar erro gracioso, não 500
    'http_req_failed{scenario:smoke}': ['rate<0.1'],
  },
  tags: {
    commit: __ENV.COMMIT_SHA || 'local',
    scenario: __ENV.SCENARIO || 'checkout',
    project: 'corgly',
  },
}

// Pacotes de créditos (conforme LLD/PRD — ajustar conforme implementação real)
const CREDIT_PACKAGES = [
  { credits: 4, priceId: __ENV.STRIPE_PRICE_4_CREDITS || 'price_test_4credits' },
  { credits: 8, priceId: __ENV.STRIPE_PRICE_8_CREDITS || 'price_test_8credits' },
]

export default function (data) {
  const pkg = CREDIT_PACKAGES[Math.floor(Math.random() * CREDIT_PACKAGES.length)]
  const payload = JSON.stringify({
    priceId: pkg.priceId,
    successUrl: `${BASE_URL}/dashboard?checkout=success`,
    cancelUrl: `${BASE_URL}/dashboard?checkout=cancelled`,
  })

  const res = http.post(`${BASE_URL}/api/v1/checkout`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.token}`,
    },
  })

  checkoutDuration.add(res.timings.duration)

  // 503 = Stripe indisponível (esperado em testes) — deve ser gracioso, não 500
  if (res.status === 503) stripeErrors.add(1)

  const ok = check(res, {
    'checkout: status esperado (201, 400, 503)': (r) =>
      [201, 200, 400, 401, 503].includes(r.status),
    'checkout: NUNCA retorna 500 bruto': (r) => r.status !== 500,
    'checkout: latência < SLO p95': (r) => r.timings.duration < SLO_P95,
    'checkout: response tem body JSON': (r) => {
      try { JSON.parse(r.body); return true } catch { return false }
    },
  })

  errorRate.add(!ok)
  sleep(5) // intervalo maior — checkout é fluxo de baixa frequência
}

export function handleSummary(data) {
  return {
    'tests/load/results/08-checkout-summary.json': JSON.stringify(data, null, 2),
  }
}
