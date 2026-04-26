import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Contexto por request — usado para propagar metadados como correlationId
 * do middleware ate services, sem passar por argumentos em toda camada.
 *
 * Leitura: getRequestContext() retorna {} se fora de request.
 * Escrita: runWithContext(ctx, fn) para setar o escopo.
 */
export interface RequestContext {
  correlationId?: string;
  userId?: string;
  route?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext {
  return storage.getStore() ?? {};
}
