#!/usr/bin/env node
/**
 * Repara el mojibake heredado en contratos y config_contratos.
 *
 * Origen: una importación legacy guardó texto UTF-8 interpretado como CP850
 * (DOS), produciendo "n├║mero" (número), "s├íbado" (sábado), "Yucat├ín"
 * (Yucatán), etc. Es 100% reversible: re-codificar el texto corrupto a sus
 * bytes CP850 y decodificarlos como UTF-8.
 *
 * Uso:
 *   node scripts/fix-mojibake-contratos.mjs            (dry-run, solo muestra)
 *   node scripts/fix-mojibake-contratos.mjs --apply    (aplica los cambios)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const iconv = require("../apps/web/node_modules/iconv-lite");

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, "..", "apps/web/.env.local"), "utf8")
    .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes("--apply");

// ¿El texto tiene mojibake? (presencia de caracteres de dibujo de caja U+2500..U+257F)
function tieneMojibake(s) {
  return typeof s === "string" && /[─-╿]/.test(s);
}
// Reparar: texto corrupto (CP850) → bytes → UTF-8
function reparar(s) {
  if (!tieneMojibake(s)) return s;
  try {
    const fixed = iconv.decode(iconv.encode(s, "cp850"), "utf8");
    // Verificación: si la reparación introduce el carácter de reemplazo (), abortar
    if (fixed.includes("�")) return s;
    return fixed;
  } catch {
    return s;
  }
}

const CAMPOS_CONTRATO = [
  "nombre_trabajador", "domicilio_completo", "acta_referencia", "proyecto_texto",
  "jornada_descripcion", "sueldo_mensual_letra", "fecha_inicio_texto",
  "fecha_fin_texto", "fecha_firma_texto", "representante_legal", "observaciones",
  "puesto", "dia_descanso_texto", "segmento_original",
];

async function main() {
  console.log(APPLY ? "═══ MODO APPLY (escribe a BD) ═══" : "═══ DRY-RUN (solo muestra) ═══\n");

  // 1) config_contratos
  const { data: cfg } = await sb.from("config_contratos").select("clave, valor");
  let cfgFix = 0;
  for (const c of cfg ?? []) {
    if (tieneMojibake(c.valor)) {
      const fixed = reparar(c.valor);
      if (fixed !== c.valor) {
        cfgFix++;
        console.log(`[config:${c.clave}]\n  ANTES: ${c.valor.slice(0, 70)}\n  DESPU: ${fixed.slice(0, 70)}`);
        if (APPLY) await sb.from("config_contratos").update({ valor: fixed }).eq("clave", c.clave);
      }
    }
  }

  // 2) contratos
  const { data: cts } = await sb.from("contratos").select(["id", ...CAMPOS_CONTRATO].join(", "));
  let ctFix = 0, campoFix = 0;
  for (const c of cts ?? []) {
    const patch = {};
    for (const k of CAMPOS_CONTRATO) {
      if (tieneMojibake(c[k])) {
        const fixed = reparar(c[k]);
        if (fixed !== c[k]) { patch[k] = fixed; campoFix++; }
      }
    }
    if (Object.keys(patch).length) {
      ctFix++;
      console.log(`\n[contrato ${c.id.slice(0, 8)} · ${(patch.nombre_trabajador ?? c.nombre_trabajador ?? "").slice(0, 30)}] campos: ${Object.keys(patch).join(", ")}`);
      if (APPLY) {
        const { error } = await sb.from("contratos").update(patch).eq("id", c.id);
        if (error) console.log("  ERROR:", error.message);
      }
    }
  }

  console.log(`\n═══ RESUMEN ═══`);
  console.log(`config_contratos reparados: ${cfgFix}`);
  console.log(`contratos reparados: ${ctFix} (${campoFix} campos)`);
  console.log(APPLY ? "✓ Cambios aplicados a la BD." : "Dry-run. Corre con --apply para escribir.");
}

main();
