#!/usr/bin/env node
/**
 * Crea un usuario completo: auth + tabla usuarios.
 * Uso: node scripts/create-user.mjs <email> <password> <rol> <nombre> [username]
 *
 * Ejemplo:
 *   node scripts/create-user.mjs dieorlando.dc@gmail.com "Diego942508" SUPERADMIN "Diego Orlando"
 */
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

const [email, password, rol, nombre, usernameArg] = process.argv.slice(2);
if (!email || !password || !rol || !nombre) {
  console.error("Uso: node scripts/create-user.mjs <email> <password> <rol> <nombre> [username]");
  process.exit(1);
}

const ROLES_VALIDOS = ["USER", "ADMIN", "SUPERADMIN", "CEO", "SOPORTE", "FACTURACION"];
if (!ROLES_VALIDOS.includes(rol)) {
  console.error(`Rol inválido: ${rol}. Válidos: ${ROLES_VALIDOS.join(", ")}`);
  process.exit(1);
}

const username = usernameArg ?? email.split("@")[0];

// 1) Verificar que no exista ya
const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const existente = (list?.users ?? []).find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (existente) {
  console.error(`✗ Ya existe un usuario auth con email ${email} (id: ${existente.id})`);
  process.exit(1);
}

// 2) Crear auth user
console.log(`→ Creando auth user ${email}…`);
const { data: created, error: authErr } = await sb.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (authErr || !created.user) {
  console.error(`✗ auth.admin.createUser: ${authErr?.message ?? "sin user"}`);
  process.exit(1);
}
const userId = created.user.id;
console.log(`  auth user creado: ${userId}`);

// 3) Insertar en usuarios
console.log(`→ Insertando en tabla usuarios…`);
const { error: insErr } = await sb.from("usuarios").insert({
  id: userId,
  email,
  username,
  nombre,
  rol,
  activo: true,
});
if (insErr) {
  console.error(`✗ usuarios insert: ${insErr.message}`);
  // Rollback del auth user para no quedar a medias
  await sb.auth.admin.deleteUser(userId).catch(() => {});
  process.exit(1);
}

console.log(`\n✓ Usuario creado correctamente:`);
console.log(`  ID:       ${userId}`);
console.log(`  Email:    ${email}`);
console.log(`  Username: ${username}`);
console.log(`  Nombre:   ${nombre}`);
console.log(`  Rol:      ${rol}`);
console.log(`  Login:    https://vertice-rosy.vercel.app/login`);
