# 推送到 GitHub

本地已完成 `git init` 与首次提交。按下列步骤创建远程仓库并推送。

## 1. 在 GitHub 创建空仓库

1. 打开 <https://github.com/new>
2. Repository name 建议：`zhejian` 或 `simplewin-zhejian`
3. **不要**勾选 “Add a README”（本地已有）
4. 创建后复制仓库 URL，例如：`https://github.com/YOUR_USERNAME/zhejian.git`

## 2. 本地推送

在项目根目录执行（将 URL 换成你的）：

```bash
cd c:\Users\longwei\WeChatProjects\zhejian
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/zhejian.git
git push -u origin main
```

若使用 SSH：

```bash
git remote add origin git@github.com:YOUR_USERNAME/zhejian.git
git push -u origin main
```

## 3. 服务器拉取部署

```bash
ssh root@8.155.0.128
cd /opt
git clone https://github.com/YOUR_USERNAME/zhejian.git
cd zhejian/backend
# 按 backend/deploy/README.md 继续
```

## 安全提醒

- `.env` 已在 `.gitignore` 中，**勿**提交数据库密码与 token
- 若误提交密钥，立即在 GitHub 轮换密码并 `git filter-repo` 清理历史
