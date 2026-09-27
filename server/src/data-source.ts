import { DataSource, DataSourceOptions } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { env } from './config';

export function dataSourceOptions(sync = env().dbSync): DataSourceOptions {
  return {
    type: 'mysql',
    host: env().dbHost,
    port: env().dbPort,
    username: env().dbUser,
    password: env().dbPassword,
    database: env().dbName,
    entities: ALL_ENTITIES,
    synchronize: sync,
    charset: 'utf8mb4',
    timezone: '+08:00',
    logging: false,
  };
}

// 供 seed / e2e 独立脚本使用
export const standaloneSource = new DataSource(dataSourceOptions());
