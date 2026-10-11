# 安装说明

1. 将仓库部署到 PHP Web 根目录。
2. 访问 `/install.php`。
3. 安装器会校验 PHP 扩展、目录权限、`docker/init.sql`，并写入 `.env`。
4. 勾选“导入/修复基础表结构”后会执行 `docker/init.sql`。
5. 提交后会创建或重置管理员账号，并生成 `install.lock`。
6. 生成 `install.lock` 后安装器会锁定；如需重新安装，请在服务器手动删除 `install.lock`。

本仓库不提交 `.env`、`install.lock`、运行日志、用户上传数据、数据库文件和私钥文件。
