import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Test la query directamente con admin (bypassa RLS)
const { data, error } = await sb
  .from("tickets_soporte")
  .select(`
    id, folio,
    usuarios!tickets_soporte_supervisor_id_fkey ( nombre, username, rol ),
    sedes ( abrev, nombre )
  `)
  .limit(1);
console.log("Query 1 (FK by name):", error?.message ?? "OK", "rows:", data?.length);

const { data: d2, error: e2 } = await sb
  .from("tickets_soporte")
  .select(`
    id, folio,
    usuarios:supervisor_id ( nombre, username, rol ),
    sedes ( abrev, nombre )
  `)
  .limit(1);
console.log("Query 2 (alias:col):", e2?.message ?? "OK", "rows:", d2?.length);

const { data: d3, error: e3 } = await sb
  .from("tickets_soporte")
  .select(`id, folio, usuarios!supervisor_id ( nombre )`)
  .limit(1);
console.log("Query 3 (bang col):", e3?.message ?? "OK", "rows:", d3?.length);
