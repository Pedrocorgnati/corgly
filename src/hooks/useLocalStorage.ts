'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Hook para localStorage com SSR safety e sincronização entre abas.
 *
 * @param key - Chave do localStorage
 * @param initialValue - Valor inicial (usado se chave não existir)
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const nextValue = value instanceof Function ? value(prev) : value;
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(key, JSON.stringify(nextValue));
          } catch {
            // Quota exceeded or other storage errors — silently ignore
          }
        }
        return nextValue;
      });
    },
    [key],
  );

  // Sync across tabs via storage event
  useEffect(() => {
    function handleStorageChange(event: StorageEvent) {
      if (event.key !== key || event.storageArea !== window.localStorage) return;
      try {
        const newValue = event.newValue !== null ? (JSON.parse(event.newValue) as T) : initialValue;
        setStoredValue(newValue);
      } catch {
        setStoredValue(initialValue);
      }
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, initialValue]);

  return [storedValue, setValue];
}
