import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, "apps/web/.env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Alinear abrevs al sheet legacy (PASE_LISTA_V2)
const updates = [
  { match: "SVAL",  newAbrev: "SV"   },
  { match: "SHSCT", newAbrev: "SHSC" },
  { match: "ADMI",  newAbrev: "A"    },
  { match: "SCSSJ", newAbrev: "SCSS" },
  { match: "SCAL",  newAbrev: "SC"   },
  { match: "SAAL",  newAbrev: "SA"   },
  { match: "RIAD",  newAbrev: "RI"   },
  { match: "SLB3",  newAbrev: "SLB"  },
];

for (const u of updates) {
  const { error, data } = await sb
    .from("sedes")
    .update({ abrev: u.newAbrev })
    .eq("abrev", u.match)
    .select("id, abrev, nombre");
  if (error) {
    console.error(`✗ ${u.match} → ${u.newAbrev}: ${error.message}`);
  } else {
    console.log(`✓ ${u.match} → ${u.newAbrev}: ${data?.length ?? 0} sede${data?.length === 1 ? "" : "s"} actualizada${data?.length === 1 ? "" : "s"}`);
  }
}

// Desactivar sedes demo
const demoCodes = ["CEN", "NOR", "SUR"];
const { error: deactErr, data: deact } = await sb
  .from("sedes")
  .update({ activa: false, notas: "Demo seed — desactivada automáticamente" })
  .in("abrev", demoCodes)
  .select("abrev, nombre");
if (deactErr) console.error(`✗ desactivar demo: ${deactErr.message}`);
else console.log(`\n✓ ${deact?.length ?? 0} sede(s) demo desactivada(s): ${deact?.map(s => s.abrev).join(", ")}`);
