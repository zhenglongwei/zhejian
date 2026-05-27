# 阿里云部署指南（B-INF）

目标：**geo.simplewin.cn** 提供 `/api/v1/`（Node）、`/admin/`、`/case/` 静态 H5。

| 路径 | 说明 |
| --- | --- |
| `/api/v1/` | 本 backend（systemd `zhejian-api`） |
| `/admin/` | `admin-web/placeholder/` |
| `/case/` | `h5/case/` |

**完整步骤**：`docs/12_测试验收部署与安全合规/B-INF_生产与真机联调.md`  
**用户向**：`docs/部署上手指南.md`

## 快速命令

```bash
cd /var/www/zhejian
sudo bash scripts/server-install.sh --init
# 编辑 backend/.env 后：
sudo bash scripts/server-install.sh
curl -s https://geo.simplewin.cn/api/v1/health
```

## 小程序

`services/config.js` → `ACTIVE_ENV = 'prod'`

## 验证脚本

```bash
cd backend
npm run deploy:verify -- https://geo.simplewin.cn
```

## 安全清单

- [ ] 修改 `DEV_*_TOKEN` 默认值
- [ ] MySQL 仅 127.0.0.1
- [ ] 防火墙 80/443/22
- [ ] 定期备份 `zhejian` 库
- [ ] 真实微信登录上线后 `DEV_AUTH_ENABLED=false`
