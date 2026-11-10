# 后端改动与部署规则（强制）

## 1. 核心红线

**一切后端改动，必须先写在本地，再 git push，最后在服务器上执行部署命令。**

适用于（不限于）：

- `backend/` 下任意代码、脚本、迁移
- `constants/`、`utils/`、`backend/vendor/shared/` 等与后端共用的文件
- `admin-web/` 运营后台
- `prisma/` 迁移与 schema
- PM2 / Nginx / `.env` 等运行时配置

## 2. 禁止事项

- ❌ 禁止通过 SSH 直接修改服务器上 `/var/www/zhejian-staging` 或 `/var/www/zhejian` 目录下的任何被 git 跟踪的文件
- ❌ 禁止在服务器上直接 `git commit`、`git merge`、`git checkout -b` 等改动仓库状态的操作
- ❌ 禁止在服务器工作区留下未提交改动（会导致后续 `git push` 被拒）
- ❌ 禁止绕过 git 用 `scp` / `rsync` 直接覆盖服务器代码文件

**唯一例外**：数据库运维与应急排障（如 `scripts/prod-fix-migration-history.sql`、`prisma migrate resolve`、查库改数据）。这类操作不涉及代码文件，但必须在执行后向用户说明做了什么、为什么做。

## 3. 标准流程

### 3.1 本地改动

```powershell
# 在本地工作区改代码
git status --short
git diff
git add <具体文件>
git commit -m "..."
```

### 3.2 推送到预发

```powershell
git push staging main
```

### 3.3 预发部署（服务器上执行）

```bash
cd /var/www/zhejian-staging
git pull

cd backend
npm install
npm run sync:shared-utils
npm run db:setup:prod
pm2 restart zhejian-api-staging

# 若改了运营后台
cd ../admin-web && npm install && npm run build

curl -s https://staging.zhejian.simplewin.cn/api/v1/health
```

### 3.4 生产（预发验收通过后才做）

```bash
cd /var/www/zhejian
git pull

cd backend
npm install
npm run sync:shared-utils
npm run db:setup:prod
pm2 restart zhejian-api

cd ../admin-web && npm install && npm run build

curl -s https://zhejian.simplewin.cn/api/v1/health
```

## 4. push 被拒的标准处理

报错形如：

```
! [remote rejected] main -> main (Working directory has unstaged changes)
```

处理步骤：

1. 先看清远端改了什么，**不要直接丢弃**：

```powershell
ssh zhejian "cd /var/www/zhejian-staging && git status --short && git diff -w --stat"
```

2. 判断这些改动是否已包含在待推送的提交里。可对比 blob 哈希（注意服务器文件可能是 CRLF，需先去掉 `\r`）：

```powershell
ssh zhejian "cd /var/www/zhejian-staging && tr -d '\r' < <文件> | git hash-object --stdin"
git rev-parse "<commit>:<文件>"
```

3. 仅当哈希一致（内容等价）时，才可丢弃后重推：

```powershell
ssh zhejian "cd /var/www/zhejian-staging && git checkout -- <文件...>"
git push staging main
```

4. 哈希不一致说明服务器上有**本地不存在**的改动，必须先备份或搬回本地提交，禁止直接丢弃。

## 5. 参考资料

- 部署细节：[docs/部署上手指南.md](../../docs/部署上手指南.md)
- 预发环境：`/var/www/zhejian-staging`，PM2 `zhejian-api-staging`（`:3101`）
- 生产环境：`/var/www/zhejian`，PM2 `zhejian-api`（`:3100`）
