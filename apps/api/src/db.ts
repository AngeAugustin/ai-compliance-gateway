import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env } from "./env.js";

export const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

export async function query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
