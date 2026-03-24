/**
 * @module test/integration/helpers/auth.helper
 *
 * Helpers de autenticação para testes de integração.
 *
 * Estratégia: o middleware injeta x-user-id, x-user-role e x-token-version
 * nos headers antes de passar para os route handlers. Nos testes, injetamos
 * esses headers diretamente, simulando o comportamento do middleware.
 *
 * O requireAuth() ainda valida tokenVersion contra o banco — por isso
 * os usuários criados devem ter tokenVersion=0 (default).
 */

import { NextRequest } from 'next/server'
import { signJWT } from '@/lib/auth'

// ── Headers de autenticação ───────────────────────────────────────────────────

/**
 * Gera os headers que o middleware injetaria após validar o JWT.
 * tokenVersion deve coincidir com o campo tokenVersion do usuário no banco.
 */
export function authHeaders(userId: string, role: 'STUDENT' | 'ADMIN', tokenVersion = 0) {
  return {
    'x-user-id': userId,
    'x-user-role': role,
    'x-token-version': String(tokenVersion),
  }
}

// ── Cookie JWT ────────────────────────────────────────────────────────────────

/**
 * Gera um cookie JWT válido para endpoints que verificam o token
 * diretamente (ex: /auth/me via getTokenFromRequest).
 */
export function buildAuthCookie(userId: string, role: 'STUDENT' | 'ADMIN', tokenVersion = 0): string {
  const token = signJWT({ sub: userId, role, version: tokenVersion })
  return `corgly_token=${token}`
}

// ── NextRequest builder ───────────────────────────────────────────────────────

interface BuildRequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  searchParams?: Record<string, string>
}

/**
 * Cria um NextRequest apontando para localhost.
 * Usado para chamar route handlers diretamente nos testes.
 */
export function buildRequest(path: string, options: BuildRequestOptions = {}): NextRequest {
  const { method = 'GET', headers = {}, body, searchParams } = options

  let url = `http://localhost${path}`
  if (searchParams) {
    const qs = new URLSearchParams(searchParams).toString()
    url = `${url}?${qs}`
  }

  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }

  return new NextRequest(url, init)
}

/**
 * Cria um NextRequest autenticado (com headers de middleware injetados).
 */
export function buildAuthRequest(
  path: string,
  userId: string,
  role: 'STUDENT' | 'ADMIN',
  options: BuildRequestOptions & { tokenVersion?: number } = {},
): NextRequest {
  const { tokenVersion = 0, headers = {}, ...rest } = options
  return buildRequest(path, {
    ...rest,
    headers: {
      ...headers,
      ...authHeaders(userId, role, tokenVersion),
    },
  })
}
