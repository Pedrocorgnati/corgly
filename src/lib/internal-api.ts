import 'server-only';
import { headers } from 'next/headers';

/**
 * @module lib/internal-api
 * Origem usada quando um Server Component chama de volta a PROPRIA API.
 */

const LAST_RESORT_ORIGIN = 'http://127.0.0.1:3000';

function isLoopback(host: string): boolean {
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    host.startsWith('[::1]')
  );
}

/**
 * Resolve a origem (`http://host:porta`) para chamadas server-side a `/api/v1/*`.
 *
 * Em PRODUCAO vale `NEXT_PUBLIC_APP_URL`, nunca o header `Host`: o Host chega do
 * cliente e seguir por ele mandaria o cookie de sessao para o host que o
 * atacante escolher.
 *
 * FORA de producao a porta e volatil (`next dev -p 3007`, preview local, E2E em
 * porta livre) e `NEXT_PUBLIC_APP_URL` fica cravado em :3000. Quando as duas
 * divergem, o layout do aluno buscava `/auth/me` em OUTRO servidor (ou em porta
 * morta), recebia falha, concluia "ninguem logado" e mandava todo mundo para
 * `/auth/login` — com o login funcionando e o cookie valido. Por isso, em dev, o
 * `Host` da requisicao (o proprio servidor que esta renderizando) tem prioridade.
 */
export async function internalApiOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL;

  if (process.env.NODE_ENV === 'production') {
    return configured ?? LAST_RESORT_ORIGIN;
  }

  const host = (await headers()).get('host');
  if (!host) return configured ?? LAST_RESORT_ORIGIN;

  return `${isLoopback(host) ? 'http' : 'https'}://${host}`;
}
