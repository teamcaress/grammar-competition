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
    let lookupError: unknown = null;
    try {
      // Prefer OS resolver with an explicit IPv4 family.
      const result = await dns.lookup(hostname, { family: 4 });
      host = result.address;
    } catch (error) {
      lookupError = error;
      try {
        // Fallback to direct A record query.
        const ipv4 = await dns.resolve4(hostname);
        if (ipv4.length > 0) host = ipv4[0];
      } catch {
        // Keep hostname; caller may still succeed in IPv4-capable environments.
      }
    }

    // Optional debug logging (never print credentials).
    if (process.env.DEBUG_PG_DNS === "1") {
      const looksLikeIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
      console.log(
        `[pg] supabase host=${hostname} resolved=${host} ipv4=${looksLikeIp ? "yes" : "no"}${lookupError ? " lookup_error=yes" : ""}`
      );
    }
  }

  return { host, port, user, password, database, ssl };
};
