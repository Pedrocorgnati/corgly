export const ROUTES = {
  // Public
  HOME: '/',
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  CONFIRM_EMAIL: '/auth/confirm-email',
  FORGOT_PASSWORD: '/auth/forgot-password',
  RESET_PASSWORD: '/auth/reset-password',
  TERMS: '/terms',
  PRIVACY: '/privacy',
  CONTENT: '/content',
  PRICING: '/#precos',

  // Student
  DASHBOARD: '/dashboard',
  SCHEDULE: '/schedule',
  CREDITS: '/credits',
  PROGRESS: '/progress',
  SESSION: (id: string) => `/session/${id}`,
  ACCOUNT: '/account',
  ACCOUNT_BILLING: '/account/billing',
  HISTORY: '/history',

  // Admin
  ADMIN_DASHBOARD: '/admin/dashboard',
  ADMIN_SCHEDULE: '/admin/schedule',
  ADMIN_STUDENTS: '/admin/students',
  ADMIN_SESSIONS: '/admin/sessions',
  ADMIN_CREDITS: '/admin/credits',
  ADMIN_REPORTS: '/admin/reports',
  ADMIN_CONTENT: '/admin/content',
  ADMIN_FEEDBACK: (sessionId: string) => `/admin/feedback/${sessionId}`,
} as const;

export const API = {
  V1: '/api/v1',
  AUTH: {
    REGISTER: '/api/v1/auth/register',
    LOGIN: '/api/v1/auth/login',
    LOGOUT: '/api/v1/auth/logout',
    ME: '/api/v1/auth/me',
    CONFIRM_EMAIL: '/api/v1/auth/confirm-email',
    RESEND_CONFIRMATION: '/api/v1/auth/resend-confirmation',
    FORGOT_PASSWORD: '/api/v1/auth/forgot-password',
    RESET_PASSWORD: '/api/v1/auth/reset-password',
  },
  SESSIONS: '/api/v1/sessions',
  CREDITS: '/api/v1/credits',
  FEEDBACK: '/api/v1/feedback',
  AVAILABILITY: '/api/v1/availability',
  WEBHOOKS: {
    STRIPE: '/api/v1/webhooks/stripe',
  },
} as const;
