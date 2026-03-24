/**
 * Script para disparar cron jobs via PM2 cron_restart.
 * PM2 executa este script no horário configurado em ecosystem.config.js.
 * A env var JOB define qual job executar.
 */
const https = require('https')
const http = require('http')

const JOB = process.env.JOB
const CRON_SECRET = process.env.CRON_SECRET
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

if (!JOB) {
  console.error('[trigger-cron] JOB env var not set')
  process.exit(1)
}

if (!CRON_SECRET) {
  console.error('[trigger-cron] CRON_SECRET env var not set')
  process.exit(1)
}

const url = new URL(`${APP_URL}/api/cron`)
const isHttps = url.protocol === 'https:'
const lib = isHttps ? https : http

const body = JSON.stringify({ job: JOB })

const options = {
  hostname: url.hostname,
  port: url.port || (isHttps ? 443 : 80),
  path: url.pathname,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    Authorization: `Bearer ${CRON_SECRET}`,
  },
}

const req = lib.request(options, (res) => {
  let data = ''
  res.on('data', (chunk) => (data += chunk))
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log(`[trigger-cron] Job "${JOB}" completed:`, data)
    } else {
      console.error(`[trigger-cron] Job "${JOB}" failed (${res.statusCode}):`, data)
      process.exit(1)
    }
  })
})

req.on('error', (err) => {
  console.error(`[trigger-cron] Request error for job "${JOB}":`, err.message)
  process.exit(1)
})

req.write(body)
req.end()
