import pg from "pg";

const { Pool } = pg;

export type Db = {
  pool: pg.Pool;
};

export const createDb = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  // Supabase requires SSL. On local dev you can still use this if DATABASE_URL is local.
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined
  });

  return { pool } satisfies Db;
};

