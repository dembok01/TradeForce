import "server-only";
import { z } from "zod";

// Fail fast with a readable message instead of a cryptic runtime null-deref
// deep in a Supabase call. NEXT_PUBLIC_* are inlined at build time, so they
// must be referenced by their full literal name (not via a computed key) for
// Next to replace them — hence the explicit object below.
const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
});

let cached: z.infer<typeof serverEnvSchema> | null = null;

/**
 * Validated server environment. Called lazily (not at module load) so a
 * missing var surfaces where it's used, with a clear message, rather than
 * crashing every import during build.
 */
export function serverEnv() {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Invalid server environment: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}

/** Public site origin, with the deployed default. Safe on client and server. */
export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "https://trade-force-rouge.vercel.app";
}
