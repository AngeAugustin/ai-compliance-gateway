/**
 * Écriture du journal chaîné (analytics.security_event).
 *
 * Chaque événement porte le hachage de celui qui le précède. Lire « le dernier hachage » puis
 * insérer, sans verrou, laisse deux requêtes simultanées lire le même prédécesseur : la chaîne
 * bifurque et la vérification casse (mesuré : dès 5 agents simultanés, la majorité des
 * événements avaient un mauvais prédécesseur). La lecture et l'insertion se font donc dans une
 * transaction qui tient un verrou consultatif propre à la chaîne : les écritures passent une à
 * une, et l'ordre des séquences est celui des hachages.
 */

/** Clé du verrou consultatif de la chaîne (« ACG » + 1). */
export const EVENT_CHAIN_LOCK_KEY = 0x41434701;

export interface ChainClient {
  query<R extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * À appeler dans une transaction : prend le verrou (libéré au COMMIT ou au ROLLBACK), lit le
 * dernier hachage, puis laisse `insert` calculer le hachage du nouvel événement et l'écrire.
 */
export async function appendToChain<T>(
  client: ChainClient,
  insert: (prevEventHash: string | null) => Promise<T>,
): Promise<T> {
  await client.query(`SELECT pg_advisory_xact_lock($1)`, [EVENT_CHAIN_LOCK_KEY]);
  const prev = await client.query<{ event_hash: string }>(
    `SELECT event_hash FROM analytics.security_event ORDER BY sequence DESC LIMIT 1`,
  );
  return insert(prev.rows[0]?.event_hash ?? null);
}
