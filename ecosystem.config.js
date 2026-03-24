module.exports = {
  apps: [
    // ── Next.js App ──────────────────────────────────────────────────────────
    {
      name: 'corgly-next',
      script: 'node_modules/.bin/next',
      args: 'start',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/next-error.log',
      out_file: 'logs/next-out.log',
    },

    // ── Hocuspocus Collaborative Editor ──────────────────────────────────────
    {
      name: 'corgly-hocuspocus',
      script: 'hocuspocus/server.ts',
      interpreter: 'node',
      interpreter_args: '--import tsx/esm',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 1234,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/hocuspocus-error.log',
      out_file: 'logs/hocuspocus-out.log',
    },

    // ── Cron: Credit Expiration (diário às 03:00 UTC) ────────────────────────
    {
      name: 'corgly-cron-credit-expiration',
      script: 'scripts/trigger-cron.js',
      cron_restart: '0 3 * * *',
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: 'production',
        JOB: 'credit-expiration',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/cron-credit-error.log',
      out_file: 'logs/cron-credit-out.log',
    },

    // ── Cron: Reminders (a cada hora) ────────────────────────────────────────
    {
      name: 'corgly-cron-reminders',
      script: 'scripts/trigger-cron.js',
      cron_restart: '0 * * * *',
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: 'production',
        JOB: 'reminders',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/cron-reminders-error.log',
      out_file: 'logs/cron-reminders-out.log',
    },

    // ── Cron: Auto-confirmation (a cada 15 minutos) ──────────────────────────
    {
      name: 'corgly-cron-auto-confirm',
      script: 'scripts/trigger-cron.js',
      cron_restart: '*/15 * * * *',
      watch: false,
      autorestart: false,
      env: {
        NODE_ENV: 'production',
        JOB: 'auto-confirmation',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: 'logs/cron-autoconfirm-error.log',
      out_file: 'logs/cron-autoconfirm-out.log',
    },
  ],
}
