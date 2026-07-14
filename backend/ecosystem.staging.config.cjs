/**
 * PM2 · 辙见 API 预发（staging.geo.simplewin.cn）
 *
 * 服务器用法（在 /var/www/zhejian-staging/backend）：
 *   pm2 start ecosystem.staging.config.cjs
 *   pm2 restart zhejian-api-staging
 *   pm2 logs zhejian-api-staging
 *   pm2 save
 *
 * 预发 backend/.env：PORT=3101、DATABASE_URL → zhejian_staging、
 * PUBLIC_BASE_URL=https://staging.geo.simplewin.cn
 */
module.exports = {
  apps: [
    {
      name: 'zhejian-api-staging',
      cwd: __dirname,
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
