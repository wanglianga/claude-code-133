-- Docker 初始化：仅创建数据库；业务表由 TypeORM（synchronize）自动创建。
CREATE DATABASE IF NOT EXISTS shuttle CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
