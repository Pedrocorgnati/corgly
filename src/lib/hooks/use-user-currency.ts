'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import { apiClient, ApiError } from '@/lib/api-client';
import { API } from '@/lib/constants/routes';
import { isSupportedCurrency, type Currency } from '@/lib/currency';
import { resolveChargeCurrency } from '@/lib/billing/currency-policy';

const STORAGE_KEY = 'corgly.preferredCurrency';

/** Origem da falha, para a UI escolher a mensagem TRADUZIDA correspondente. */
export type CurrencyErrorKind = 'load' | 'save';

interface CurrencyState {
  /**
   * `null` = ainda nao resolvida. O hook nunca devolve null para fora: cai no
   * fallback por locale de `resolveChargeCurrency` enquanto nao ha resposta.
   */
  currency: Currency | null;
  status: 'idle' | 'loading' | 'ready';
  saving: boolean;
  error: CurrencyErrorKind | null;
}

/**
 * Store de modulo (compartilhado entre TODOS os consumidores do hook).
 *
 * Motivo: vitrine de precos, seletor de moeda e banner de desconto vivem na
 * mesma pagina. Com estado local por componente, trocar a moeda no seletor NAO
 * atualizaria os precos nem o banner, e cada componente faria um GET proprio.
 *
 * MUDANCA DE PRECEDENCIA (explicita, Zero Assumido): a preferencia PERSISTIDA
 * no servidor passa a vencer o localStorage. Quem escolheu uma moeda a mao
 * neste navegador e depois salvou outra em outro dispositivo passa a ver a do
 * servidor. Toda escolha feita aqui grava nos dois lugares, entao a divergencia
 * so existe para escolhas anteriores a este work package.
 *
 * Ordem de resolucao: servidor (`persisted`) > localStorage > locale > USD.
 */
const INITIAL_STATE: CurrencyState = {
  currency: null,
  status: 'idle',
  saving: false,
  error: null,
};

let state: CurrencyState = INITIAL_STATE;
const listeners = new Set<() => void>();
let inFlightHydration: Promise<void> | null = null;

function emit(patch: Partial<CurrencyState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CurrencyState {
  return state;
}

/**
 * Snapshot de servidor/hidratacao: sempre o estado inicial, para o primeiro
 * render do cliente bater com o HTML do servidor. localStorage so e lido em
 * efeito, nunca durante o render (evita mismatch de hidratacao).
 */
function getServerSnapshot(): CurrencyState {
  return INITIAL_STATE;
}

function readStoredCurrency(): Currency | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isSupportedCurrency(raw) ? raw : null;
  } catch {
    // storage bloqueado (modo privado) — segue sem preferencia local
    return null;
  }
}

function writeStoredCurrency(currency: Currency): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, currency);
  } catch {
    // storage bloqueado — a escolha ainda vale nesta sessao e no servidor
  }
}

interface ChargeCurrencyPayload {
  currency: Currency;
  persisted: string | null;
  supported: Currency[];
}

/**
 * Carrega a preferencia do servidor uma unica vez por sessao de pagina.
 * `force` (usado por `reload`) refaz a chamada apos uma falha.
 */
async function hydrate(force = false): Promise<void> {
  if (inFlightHydration) return inFlightHydration;
  if (!force && state.status === 'ready') return;

  const stored = readStoredCurrency();
  emit({ status: 'loading', error: null, currency: state.currency ?? stored });

  inFlightHydration = (async () => {
    try {
      const response = await apiClient.get<{ data: ChargeCurrencyPayload }>(
        API.BILLING_CHARGE_CURRENCY,
        // 401 aqui e visitante sem sessao, nao expiracao: nao dispara o
        // redirect global de autenticacao.
        { skipAuthRedirect: true },
      );
      const persisted = response.data?.persisted;
      emit({
        currency: isSupportedCurrency(persisted) ? persisted : stored,
        status: 'ready',
        error: null,
      });
    } catch (error) {
      const isUnauthenticated = error instanceof ApiError && error.status === 401;
      emit({
        currency: stored,
        status: 'ready',
        // Sem sessao nao e falha: a escolha local (ou o locale) governa.
        error: isUnauthenticated ? null : 'load',
      });
    } finally {
      inFlightHydration = null;
    }
  })();

  return inFlightHydration;
}

async function persistCurrency(next: Currency): Promise<void> {
  // Otimista: o preco troca na hora; a falha de persistencia e sinalizada
  // depois, sem desfazer a escolha (ela continua valendo neste navegador).
  emit({ currency: next, saving: true, error: null, status: 'ready' });
  writeStoredCurrency(next);

  try {
    await apiClient.patch(
      API.BILLING_CHARGE_CURRENCY,
      { currency: next },
      { skipAuthRedirect: true },
    );
    emit({ saving: false, error: null });
  } catch (error) {
    const isUnauthenticated = error instanceof ApiError && error.status === 401;
    emit({ saving: false, error: isUnauthenticated ? null : 'save' });
  }
}

export interface UseUserCurrencyResult {
  /** Moeda efetiva de exibicao. Nunca null: cai no locale enquanto carrega. */
  currency: Currency;
  /** Verdadeiro enquanto a preferencia do servidor ainda nao chegou. */
  isLoading: boolean;
  /** Verdadeiro enquanto o PATCH de persistencia esta em voo. */
  isSaving: boolean;
  /** `'load'` (GET falhou) ou `'save'` (PATCH falhou); null quando tudo ok. */
  error: CurrencyErrorKind | null;
  setCurrency: (currency: Currency) => void;
  /** Refaz a leitura da preferencia apos falha (botao "tentar novamente"). */
  reload: () => void;
}

/**
 * Moeda de exibicao/cobranca do usuario, compartilhada por toda a pagina.
 *
 * A politica de resolucao vive em `resolveChargeCurrency` (ADR-0006 §2); este
 * hook so decide a PRECEDENCIA das fontes e cuida de carga, persistencia e
 * estados de falha. Nenhum cambio acontece aqui.
 */
export function useUserCurrency(): UseUserCurrencyResult {
  const locale = useLocale();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    void hydrate();
  }, []);

  const setCurrency = useCallback((next: Currency) => {
    void persistCurrency(next);
  }, []);

  const reload = useCallback(() => {
    void hydrate(true);
  }, []);

  return {
    currency: snapshot.currency ?? resolveChargeCurrency({ locale }),
    isLoading: snapshot.status !== 'ready',
    isSaving: snapshot.saving,
    error: snapshot.error,
    setCurrency,
    reload,
  };
}
