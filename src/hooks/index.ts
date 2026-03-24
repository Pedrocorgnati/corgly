/**
 * @module hooks
 * Barrel export de hooks — Module 2: Shared Foundations
 */

export { useDebounce } from './useDebounce';
export { usePagination } from './usePagination';
export { useAuth, AuthProvider } from './useAuth';
export { useCredits } from './useCredits';
export { useTimezone } from './useTimezone';
export { useLocalStorage } from './useLocalStorage';
export { useMediaQuery } from './useMediaQuery';
export { useDisclosure } from './useDisclosure';

export { useWebRTC } from './useWebRTC';
export { useSessionAccess } from './useSessionAccess';
export { useReconnect } from './useReconnect';

// Re-export types for convenience
export type { UseAuthReturn } from './useAuth';
export type { UseCreditsReturn } from './useCredits';
export type { UseTimezoneReturn } from './useTimezone';
export type { UseMediaQueryReturn } from './useMediaQuery';
export type { UseDisclosureReturn } from './useDisclosure';
export type { UsePaginationParams, UsePaginationReturn } from './usePagination';
export type { UseWebRTCReturn, RTCConnectionState } from './useWebRTC';
export type { UseSessionAccessReturn } from './useSessionAccess';
export type { UseReconnectReturn, UseReconnectOptions } from './useReconnect';

export { useYjsProvider } from './useYjsProvider';
export { useYjsDoc } from './useYjsDoc';
export type { UseYjsProviderReturn, UseYjsProviderOptions } from './useYjsProvider';
export type { UseYjsDocReturn, SyncStatus } from './useYjsDoc';

export { useSessionTimer } from './useSessionTimer';
export type { UseSessionTimerReturn } from './useSessionTimer';

export { useSubscription } from './useSubscription';
export type { Subscription } from './useSubscription';
