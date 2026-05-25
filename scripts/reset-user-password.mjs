import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = process.argv[2];
const customPwd = process.argv[3];
if (!email) {
  console.error("Uso: node scripts/reset-user-password.mjs <email> [password-opcional]");
  process.exit(1);
}

// Generar password legible si no se pasó uno: 4 grupos de 4 chars sin ambigüedades
function genPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I
  const blocks = [];
  for (let b = 0; b < 3; b++) {
    const raw = randomBytes(4);
    let blk = "";
    for (let i = 0; i < 4; i++) blk += alphabet[raw[i] % alphabet.length];
    blocks.push(blk);
  }
  return blocks.join("-");
}

const newPwd = customPwd ?? genPassword();

// Buscar usuario por email
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const user = (list?.users ?? []).find(u => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`✗ No existe usuario con email ${email}`);
  process.exit(1);
}

const { error } = await sb.auth.admin.updateUserById(user.id, { password: newPwd });
if (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

console.log(`✓ Password reseteado para ${email}`);
console.log(`\n  Usuario:  ${email}`);
console.log(`  Password: ${newPwd}`);
console.log(`\n  Login en: https://vertice-rosy.vercel.app/login`);
console.log(`\n  Ella puede cambiar el password después en su perfil / settings.`);
