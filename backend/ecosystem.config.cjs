/**
 * PM2 · 辙见 API（geo.simplewin.cn）
 *
 * 服务器用法（在 /var/www/zhejian/backend）：
 *   pm2 start ecosystem.config.cjs
 *   pm2 restart zhejian-api
 *   pm2 logs zhejian-api
 *   pm2 save && pm2 startup
 *
 * 与 simplewin.cn 官网共存：backend/.env 使用 PORT=3100
 */
module.exports = {
  apps: [
    {
      name: 'zhejian-api',
      cwd: __dirname,
      script: 'src/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      time: true,
      // 变量由 backend/.env 加载（server.js 内 dotenv）；此处仅作 PM2 列表展示
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
