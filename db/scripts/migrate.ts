import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { DATABASE_URL } from "./env.js";

async function main() {
  const migrationsDir = resolve(process.cwd(), "db/migrations");
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const applied = new Set(
      (await client.query<{ name: string }>(`SELECT name FROM schema_migration`)).rows.map((r) => r.name),
    );

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = await readFile(resolve(migrationsDir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO schema_migration(name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        console.log(`✔ ${file}`);
        count++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error(`✖ ${file}`);
        throw err;
      }
    }
    console.log(count === 0 ? "Schéma à jour" : `${count} migration(s) appliquée(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
