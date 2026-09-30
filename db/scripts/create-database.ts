import { Client } from "pg";
import { DATABASE_ADMIN_URL, DATABASE_URL, databaseNameFromUrl } from "./env.js";

async function main() {
  const drop = process.argv.includes("--drop");
  const dbName = databaseNameFromUrl(DATABASE_URL);

  if (!/^[a-z_][a-z0-9_]*$/i.test(dbName)) {
    throw new Error(`Nom de base invalide: ${dbName}`);
  }

  const client = new Client({ connectionString: DATABASE_ADMIN_URL });
  await client.connect();
  try {
    if (drop) {
      await client.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      );
      await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      console.log(`Base ${dbName} supprimée`);
    }
    const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE DATABASE "${dbName}" ENCODING 'UTF8'`);
      console.log(`Base ${dbName} créée`);
    } else {
      console.log(`Base ${dbName} déjà présente`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
