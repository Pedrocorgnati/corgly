import { http, HttpResponse } from 'msw'

export const handlers = [
  // Health check mock
  http.get('/api/v1/health', () => {
    return HttpResponse.json({ status: 'ok', db: 'connected', version: '0.1.0' })
  }),
]
