import { createConnection } from 'mysql2/promise';
import { env } from './config';

// 数据库不存在时自动创建（utf8mb4）
export async function ensureDatabase() {
  const conn = await createConnection({
    host: env().dbHost,
    port: env().dbPort,
    user: env().dbUser,
    password: env().dbPassword,
  });
  await conn.query(
    `CREATE DATABASE IF NOT EXISTS \`${env().dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  await conn.end();
}
