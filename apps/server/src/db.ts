import pg from "pg";
import { poolConfigFromDatabaseUrl } from "./pg.js";

const { Pool } = pg;

export type Db = {
  pool: pg.Pool;
};

export const createDb = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const config = await poolConfigFromDatabaseUrl(databaseUrl);
  const pool = new Pool(config);

  return { pool } satisfies Db;
};
