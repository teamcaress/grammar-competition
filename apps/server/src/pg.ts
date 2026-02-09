import dns from "node:dns/promises";
import type { PoolConfig } from "pg";

export const poolConfigFromDatabaseUrl = async (databaseUrl: string): Promise<PoolConfig> => {
  // If it's not a URL (e.g., pg can accept keyword/value strings), fall back to passing through.
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { connectionString: databaseUrl };
  }

  const hostname = url.hostname;
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeURIComponent(url.username ?? "");
  const password = decodeURIComponent(url.password ?? "");
  const database = url.pathname.replace(/^\//, "") || "postgres";

  // Supabase typically requires SSL and frequently returns AAAA first. Render may lack IPv6 egress.
  // Connect via IPv4 address but keep SNI set to the original hostname.
  const isSupabase = hostname.endsWith(".supabase.co");
  const ssl = isSupabase ? { rejectUnauthorized: false, servername: hostname } : undefined;

  let host = hostname;
  if (isSupabase) {
    try {
      const ipv4 = await dns.resolve4(hostname);
      if (ipv4.length > 0) host = ipv4[0];
    } catch {
      // Fall back to hostname resolution at connect-time.
    }
  }

  return { host, port, user, password, database, ssl };
};
