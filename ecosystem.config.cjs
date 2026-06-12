/**
 * PM2 Ecosystem Config — Expatur Backoffice
 * Usar: pm2 start ecosystem.config.cjs
 */
module.exports = {
  apps: [
    {
      name: 'expatur-backoffice',
      script: 'serve',
      args: '-s /var/www/expatur-backoffice -l 4100',
      env: {
        NODE_ENV: 'production',
        PM2_SERVE_PATH: '/var/www/expatur-backoffice',
        PM2_SERVE_PORT: 4100,
        PM2_SERVE_SPA: 'true',       // SPA mode: 404 → index.html
        PM2_SERVE_HOMEPAGE: '/index.html'
      },
      watch: false,
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
