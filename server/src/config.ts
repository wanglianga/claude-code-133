export function env() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('dotenv').config();
  } catch {
    /* dotenv 可选 */
  }
  return {
    dbHost: process.env.DB_HOST || '127.0.0.1',
    dbPort: Number(process.env.DB_PORT || 3306),
    dbUser: process.env.DB_USER || 'root',
    dbPassword: process.env.DB_PASSWORD || 'shuttle',
    dbName: process.env.DB_NAME || 'shuttle',
    dbSync: (process.env.DB_SYNC || 'true') === 'true',
    jwtSecret: process.env.JWT_SECRET || 'scenic-shuttle-dev-secret',
  };
}
