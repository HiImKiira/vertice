#!/usr/bin/env node
/**
 * Resetea contraseñas de usuarios demo a una pwd memorable.
 * Uso: node scripts/reset-demo-passwords.mjs <username1> <username2> ...
 * Default: super admin edy → todos a "Vertice2026!"
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../apps/web/.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);

const PWD = "Vertice2026!";
const USERS = process.argv.slice(2).length ? process.argv.slice(2) : ["super", "admin", "edy"];

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log(`Reseteando ${USERS.length} usuarios a "${PWD}":\n`);

for (const username of USERS) {
  const { data: profile, error: pErr } = await sb
    .from("usuarios")
    .select("id, email, nombre, rol")
    .ilike("username", username)
    .single();
  if (pErr || !profile) {
    console.log(`  ❌ ${username.padEnd(15)} → no existe`);
    continue;
  }
  const { error: uErr } = await sb.auth.admin.updateUserById(profile.id, { password: PWD });
  if (uErr) {
    console.log(`  ❌ ${username.padEnd(15)} → ${uErr.message}`);
  } else {
    console.log(`  ✅ ${username.padEnd(15)} (${profile.rol.padEnd(11)}) email: ${profile.email}`);
  }
}

console.log(`\nPwd común: ${PWD}`);
console.log("Login en https://vertice-rosy.vercel.app/login con cualquiera de los usernames de arriba.");
