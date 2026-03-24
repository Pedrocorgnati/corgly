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
      const user = await apiClient.get<User>(API.AUTH.ME);
      setState({ user, isLoading: false });
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

  const login = useCallback(async (email: string, password: string) => {
    const user = await apiClient.post<User>(API.AUTH.LOGIN, { email, password });
    setState({ user, isLoading: false });
  }, []);

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
