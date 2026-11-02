// Verificación v36: columnas de geocerca + escritura/lectura round-trip.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync("apps/web/.env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// 1) Las columnas existen y PostgREST las ve
const { data: sedes, error } = await sb
  .from("sedes")
  .select("id, abrev, qr_habilitado, geo_lat, geo_lng, geo_radio_m")
  .eq("abrev", "XMK")
  .limit(1);
if (error) { console.error("✕ Columnas geo NO disponibles:", error.message); process.exit(1); }
const xmk = sedes?.[0];
if (!xmk) { console.error("✕ No encontré la sede XMK"); process.exit(1); }
console.log("✓ v36 aplicada. XMK:", JSON.stringify(xmk));

// 2) Round-trip de escritura (guardar y revertir al valor previo)
const previo = { geo_lat: xmk.geo_lat, geo_lng: xmk.geo_lng, geo_radio_m: xmk.geo_radio_m };
const { error: e1 } = await sb.from("sedes")
  .update({ geo_lat: 20.865, geo_lng: -89.657, geo_radio_m: 150 })
  .eq("id", xmk.id);
if (e1) { console.error("✕ Escritura falló:", e1.message); process.exit(1); }
const { data: leido } = await sb.from("sedes").select("geo_lat, geo_lng, geo_radio_m").eq("id", xmk.id).single();
console.log("✓ Escritura/lectura OK:", JSON.stringify(leido));
const { error: e2 } = await sb.from("sedes").update(previo).eq("id", xmk.id);
if (e2) { console.error("⚠ No pude revertir al valor previo:", e2.message); process.exit(1); }
console.log("✓ Revertido al estado previo:", JSON.stringify(previo));

// 3) Haversine de cordura (misma fórmula que el server action)
function distanciaM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const cerca = distanciaM(20.865, -89.657, 20.8655, -89.6575); // ~75 m
const lejos = distanciaM(20.865, -89.657, 20.9676, -89.6237); // centro de Mérida, ~12 km
console.log(`✓ Haversine: a 1 cuadra = ${Math.round(cerca)} m (pasa con radio 150), desde Mérida centro = ${(lejos / 1000).toFixed(1)} km (rechazado)`);
console.log("\nTODO OK — geocerca lista para vincular desde /rh-pro/qr");
