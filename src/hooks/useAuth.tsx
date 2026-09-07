'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '@/lib/api-client';
import type { User } from '@/lib/types';
import type { UserRole } from '@/types/enums';
import { API, ROUTES } from '@/lib/constants/routes';

// ── Types ──

interface AuthState {
  user: User | null;
  isLoading: boolean;
}

/**
 * Envelope de TODA rota /api/v1/* (apiResponse em src/lib/auth.ts).
 * O apiClient devolve o corpo cru — nao desembrulha. Guardar a resposta inteira
 * em `state.user` fazia `user.id`, `user.name` e `user.role` sairem `undefined`
 * em todo consumidor cliente do hook.
 */
interface ApiEnvelope<T> {
  data: T | null;
  error: string | null;
  message?: string | null;
}

export interface UseAuthReturn {
  user: User | null;
  role: UserRole | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

// ── Context ──

const AuthContext = createContext<UseAuthReturn | null>(null);

// ── Provider ──

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
  });

  const fetchUser = useCallback(async () => {
    try {
      // Sondagem de sessao: 401 aqui e resposta valida ("ninguem logado"),
      // nao expiracao. Sem skipAuthRedirect, o AuthProvider (montado no root
      // layout) jogava todo visitante anonimo de qualquer pagina publica em
      // /auth/login, e la o proprio login entrava em loop de redirect.
      const envelope = await apiClient.get<ApiEnvelope<User>>(API.AUTH.ME, {
        skipAuthRedirect: true,
      });

      // 200 com `error` preenchido (ou `data` nulo) e sessao invalida, nao usuario.
      if (!envelope || envelope.error || !envelope.data) {
        setState({ user: null, isLoading: false });
        return;
      }

      setState({ user: envelope.data, isLoading: false });
    } catch {
      setState({ user: null, isLoading: false });
    }
  }, []);

  // Fetch user on mount (SSR safe — useEffect only runs on client)
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Listen for auth:expired events from api-client
  useEffect(() => {
    function handleAuthExpired() {
      setState({ user: null, isLoading: false });
      window.location.href = ROUTES.LOGIN;
    }

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const envelope = await apiClient.post<
        ApiEnvelope<{ user: { id: string }; token: string }>
      >(API.AUTH.LOGIN, { email, password });

      if (!envelope?.data?.user) {
        setState({ user: null, isLoading: false });
        throw new Error(envelope?.error ?? 'Nao foi possivel entrar. Tente novamente.');
      }

      // A rota de login devolve um SUBCONJUNTO do usuario (id, name, role,
      // onboardingCompletedAt, isFirstPurchase). Recarregamos por /auth/me para
      // o estado guardar o shape canonico de `User` em vez de um parcial
      // disfarcado de completo.
      await fetchUser();
    },
    [fetchUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiClient.post(API.AUTH.LOGOUT, {});
    } finally {
      setState({ user: null, isLoading: false });
      window.location.href = '/';
    }
  }, []);

  const value = useMemo<UseAuthReturn>(
    () => ({
      user: state.user,
      role: state.user?.role ?? null,
      isAuthenticated: state.user !== null,
      isLoading: state.isLoading,
      login,
      logout,
      refetch: fetchUser,
    }),
    [state.user, state.isLoading, login, logout, fetchUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

// ── Hook ──

export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  }
  return context;
}
