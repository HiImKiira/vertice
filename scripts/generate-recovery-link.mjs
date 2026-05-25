import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/generate-recovery-link.mjs <email>");
  process.exit(1);
}

const { data, error } = await sb.auth.admin.generateLink({
  type: "recovery",
  email,
  options: {
    redirectTo: "https://vertice-rosy.vercel.app/auth/callback?next=/dashboard",
  },
});

if (error) {
  console.error("✗", error.message);
  process.exit(1);
}

console.log(`✓ Link de recovery para ${email}:\n`);
console.log(data.properties?.action_link ?? "(sin link)");
console.log("\nEste link expira en 1 hora. Al abrirlo, Brenda define su propia password.");
