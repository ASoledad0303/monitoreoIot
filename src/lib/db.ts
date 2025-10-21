import { Pool, type QueryResultRow, type QueryResult } from 'pg';

// Singleton del pool de PostgreSQL
let pool: Pool | null = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  pool = new Pool(
    connectionString
      ? { connectionString }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          database: process.env.PGDATABASE || 'tesis_iot_db',
          user: process.env.PGUSER || 'postgres',
          password: process.env.PGPASSWORD || 'postgres',
        }
  );

  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = getPool();
  const res = await client.query<T>(text, params as any);
  return res;
}