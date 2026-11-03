"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import QRCode from "qrcode";
import { Icon } from "@/components/Icon";
import {
  generarCredencialesSedeAction,
  vincularUbicacionAction,
  desvincularUbicacionAction,
  type CredencialRow,
} from "./actions";

export interface SedeOpt {
  id: string; abrev: string; nombre: string; qr_habilitado: boolean; activos: number;
  geo_lat: number | null; geo_lng: number | null; geo_radio_m: number | null;
}

const JORNADAS = ["TODAS", "MATUTINO", "VESPERTINO", "NOCTURNO", "EVENTUAL"] as const;
const RADIOS = [50, 100, 150, 250, 500, 1000] as const;

export function QRAdminClient({ sedes, rol }: { sedes: SedeOpt[]; rol: string }) {
  const [pending, start] = useTransition();
  const [sedeId, setSedeId] = useState("");
  const [sedeAbrev, setSedeAbrev] = useState("");
  const [creds, setCreds] = useState<CredencialRow[] | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [filtro, setFiltro] = useState<(typeof JORNADAS)[number]>("TODAS");
  const [msg, setMsg] = useState<string | null>(null);

  // ── Geocerca (solo SUPERADMIN y ADMIN la cambian) ──
  const puedeGeo = rol === "SUPERADMIN" || rol === "ADMIN";
  const [geoPending, geoStart] = useTransition();
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [geoLat, setGeoLat] = useState("");
  const [geoLng, setGeoLng] = useState("");
  const [geoRadio, setGeoRadio] = useState<number>(150);
  const [geoAcc, setGeoAcc] = useState<number | null>(null);
  const [geoLocalizando, setGeoLocalizando] = useState(false);
  const sedeSel = sedes.find((s) => s.id === sedeId) ?? null;

  function usarMiUbicacion() {
    if (!("geolocation" in navigator)) { setGeoMsg("✕ Este dispositivo no tiene GPS disponible"); return; }
    setGeoLocalizando(true); setGeoMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(pos.coords.latitude.toFixed(6));
        setGeoLng(pos.coords.longitude.toFixed(6));
        setGeoAcc(Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null);
        setGeoLocalizando(false);
      },
      (err) => {
        setGeoLocalizando(false);
        setGeoMsg(err.code === err.PERMISSION_DENIED
          ? "✕ Permiso de ubicación denegado — actívalo en el navegador"
          : "✕ No se pudo obtener la ubicación, inténtalo de nuevo");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  function guardarGeo() {
    const lat = Number(geoLat), lng = Number(geoLng);
    if (!sedeId || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setGeoMsg("✕ Faltan coordenadas — usa «Mi ubicación actual» o escríbelas");
      return;
    }
    setGeoMsg(null);
    geoStart(async () => {
      const r = await vincularUbicacionAction(sedeId, lat, lng, geoRadio);
      setGeoMsg(r.ok ? "✓ Geocerca vinculada — el escáner ya exige estar en la sede" : `✕ ${r.error}`);
    });
  }

  function quitarGeo() {
    if (!sedeId) return;
    setGeoMsg(null);
    geoStart(async () => {
      const r = await desvincularUbicacionAction(sedeId);
      setGeoMsg(r.ok ? "✓ Geocerca quitada — el escáner funciona sin candado de ubicación" : `✕ ${r.error}`);
    });
  }

  function generar() {
    if (!sedeId) return;
    setMsg(null); setCreds(null); setQrs({});
    start(async () => {
      const r = await generarCredencialesSedeAction(sedeId);
      if (!r.ok) { setMsg(`Error: ${r.error}`); return; }
      setCreds(r.credenciales);
      setSedeAbrev(r.sede_abrev);
      setMsg(`✓ Sede ${r.sede_abrev} designada · ${r.credenciales.length} credenciales (${r.nuevos} nuevas, el resto ya existían)`);
    });
  }

  // Al cambiar de sede, precargar su geocerca actual en el formulario
  useEffect(() => {
    setGeoMsg(null); setGeoAcc(null);
    if (sedeSel?.geo_lat != null && sedeSel?.geo_lng != null) {
      setGeoLat(String(sedeSel.geo_lat));
      setGeoLng(String(sedeSel.geo_lng));
      setGeoRadio(sedeSel.geo_radio_m ?? 150);
    } else {
      setGeoLat(""); setGeoLng(""); setGeoRadio(150);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  // Renderizar los QR como data-URLs (en lotes para no congelar)
  useEffect(() => {
    if (!creds) return;
    let vivo = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const c of creds) {
        if (!vivo) return;
        out[c.id] = await QRCode.toDataURL(c.token, { width: 220, margin: 1, errorCorrectionLevel: "M" });
      }
      if (vivo) setQrs(out);
    })();
    return () => { vivo = false; };
  }, [creds]);

  const visibles = useMemo(
    () => (creds ?? []).filter((c) => filtro === "TODAS" || c.jornada === filtro),
    [creds, filtro],
  );
  // Agrupadas por turno (MAT → VES → NOC → EVE): cada turno arranca en hoja nueva
  const grupos = useMemo(() => {
    const orden = ["MATUTINO", "VESPERTINO", "NOCTURNO", "EVENTUAL"];
    const m = new Map<string, CredencialRow[]>();
    for (const c of visibles) {
      if (!m.has(c.jornada)) m.set(c.jornada, []);
      m.get(c.jornada)!.push(c);
    }
    return [...m.entries()]
      .sort((a, b) => {
        const ia = orden.indexOf(a[0]); const ib = orden.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([jornada, items]) => ({ jornada, items }));
  }, [visibles]);
  const porJornada = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of creds ?? []) m.set(c.jornada, (m.get(c.jornada) ?? 0) + 1);
    return m;
  }, [creds]);
  const qrsListos = creds ? Object.keys(qrs).length >= creds.length : false;

  return (
    <div className="space-y-4">
      {/* Controles (no se imprimen) */}
      <section className="surface-glow p-5 print:hidden">
        <div className="grid gap-3 sm:grid-cols-[2fr_auto]">
          <div className="field">
            <label>Sede designada para asistencia por QR</label>
            <select value={sedeId} onChange={(e) => setSedeId(e.target.value)} disabled={pending}>
              <option value="">— elige la sede —</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.abrev} · {s.nombre} ({s.activos} activos){s.qr_habilitado ? " · QR ya habilitado" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" onClick={generar} disabled={pending || !sedeId} className="btn btn-primary">
              {pending ? "Generando…" : "Generar credenciales"}
            </button>
          </div>
        </div>
        {msg && <p className="mt-2 text-xs text-emerald-200">{msg}</p>}

        {creds && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
            {JORNADAS.map((j) => (
              <button
                key={j}
                type="button"
                onClick={() => setFiltro(j)}
                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                  filtro === j ? "border-blue-400/60 bg-blue-500/20 text-blue-100" : "border-white/10 text-muted hover:border-white/30"
                }`}
              >
                {j === "TODAS" ? `Todas (${creds.length})` : `${j} (${porJornada.get(j) ?? 0})`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!qrsListos || visibles.length === 0}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-emerald-500/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <Icon name="file-text" size={12} /> {qrsListos ? `Imprimir ${visibles.length} credencial(es)` : "Preparando QRs…"}
            </button>
          </div>
        )}
      </section>

      {/* Geocerca de la sede seleccionada */}
      {sedeSel && (
        <section className="surface-card p-5 print:hidden">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold">
              📍 Geocerca de {sedeSel.abrev}
            </p>
            {sedeSel.geo_lat != null && sedeSel.geo_lng != null ? (
              <span className="pill pill-green">Vinculada · radio {sedeSel.geo_radio_m ?? 150} m</span>
            ) : (
              <span className="pill pill-amber">Sin vincular — el escáner no exige ubicación</span>
            )}
            <span className="pill pill-violet">Solo SUPERADMIN y ADMIN</span>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Con geocerca vinculada, el escáner QR solo marca asistencia si el teléfono está físicamente
            dentro del radio de la sede: nadie puede marcar desde su casa con fotos de credenciales.
          </p>

          {puedeGeo ? (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                <div className="flex items-end">
                  <button type="button" onClick={usarMiUbicacion} disabled={geoPending || geoLocalizando} className="btn btn-violet btn-sm">
                    {geoLocalizando ? "Localizando…" : "📍 Mi ubicación actual"}
                  </button>
                </div>
                <div className="field">
                  <label>Latitud</label>
                  <input type="text" inputMode="decimal" value={geoLat} onChange={(e) => setGeoLat(e.target.value)} placeholder="20.8572" />
                </div>
                <div className="field">
                  <label>Longitud</label>
                  <input type="text" inputMode="decimal" value={geoLng} onChange={(e) => setGeoLng(e.target.value)} placeholder="-89.6500" />
                </div>
                <div className="field">
                  <label>Radio</label>
                  <select value={geoRadio} onChange={(e) => setGeoRadio(Number(e.target.value))}>
                    {RADIOS.map((r) => <option key={r} value={r}>{r} m</option>)}
                  </select>
                </div>
              </div>
              {geoAcc != null && (
                <p className="mt-1.5 text-[11px] text-muted-2">
                  Precisión del GPS al capturar: ±{geoAcc} m — párate en el acceso principal de la sede antes de guardar.
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" onClick={guardarGeo} disabled={geoPending || !geoLat || !geoLng} className="btn btn-primary btn-sm">
                  {geoPending ? "Guardando…" : "Vincular geocerca"}
                </button>
                {sedeSel.geo_lat != null && (
                  <button type="button" onClick={quitarGeo} disabled={geoPending} className="btn btn-danger btn-sm">
                    Quitar geocerca
                  </button>
                )}
                {geoMsg && (
                  <p className={`text-xs ${geoMsg.startsWith("✓") ? "text-emerald-200" : "text-red-300"}`}>{geoMsg}</p>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-amber-200/90">
              Tu rol ({rol}) puede ver el estado pero no cambiarlo. Pídele a un SUPERADMIN o ADMIN que la vincule.
            </p>
          )}
        </section>
      )}

      {/* Hoja de credenciales (lo único que se imprime), agrupada por turno */}
      {creds && (
        <section id="hoja-credenciales">
          {grupos.map((g) => (
            <div key={g.jornada} className="grupo-credenciales mb-6">
              <p className="grupo-titulo mb-2 text-[11px] font-bold uppercase tracking-widest text-muted">
                {sedeAbrev} · {g.jornada} · {g.items.length} credencial(es)
              </p>
              <div className="grid-credenciales grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((c) => (
                  <div
                    key={c.id}
                    className="credencial flex flex-col items-center justify-center rounded-xl border border-white/15 bg-white p-3 text-center text-black"
                  >
                    <p className="cred-marca text-[10px] font-bold tracking-widest text-neutral-500">MHS INTEGRADORA</p>
                    <div className="cred-foto my-1 flex h-20 w-16 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-[9px] font-bold tracking-widest text-neutral-400">
                      FOTO
                    </div>
                    {qrs[c.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qrs[c.id]} alt={`QR ${c.numero_empleado}`} className="my-1 h-32 w-32" />
                    ) : (
                      <div className="my-1 flex h-32 w-32 items-center justify-center text-[10px] text-neutral-400">…</div>
                    )}
                    <p className="cred-nombre w-full truncate text-xs font-bold leading-tight">{c.nombre}</p>
                    <p className="cred-numero font-mono text-[11px] text-neutral-700">#{c.numero_empleado}</p>
                    <p className="cred-sede text-[10px] font-semibold text-neutral-500">{sedeAbrev} · {c.jornada}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Impresión: gafetes VERTICALES de 80×115 mm (mica de 8 × 11.5 cm),
          con espacio para foto. 4 por hoja carta (2×2), sin cortes.
          OJO: no usamos CSS grid al imprimir — Chrome corta las celdas entre
          páginas. inline-flex + break-inside:avoid sí fragmenta bien. */}
      <style>{`
        @media print {
          @page { size: letter portrait; margin: 7mm; }
          html, body { background: #fff !important; }
          body::before, body::after { display: none !important; }
          body * { visibility: hidden; }
          #hoja-credenciales, #hoja-credenciales * { visibility: visible; }
          #hoja-credenciales { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
          .grupo-credenciales { margin: 0 !important; }
          .grupo-credenciales + .grupo-credenciales { break-before: page; page-break-before: always; }
          .grupo-titulo { color: #000 !important; margin: 0 0 2mm 0 !important; font-size: 9pt !important; }
          .grid-credenciales { display: block !important; }
          .credencial {
            display: inline-flex !important;
            vertical-align: top;
            flex-direction: column;
            align-items: center;
            justify-content: space-evenly;
            width: 80mm !important;
            height: 115mm !important;
            margin: 0 4mm 4mm 0 !important;
            padding: 4mm !important;
            border: 1.2px solid #000 !important;
            border-radius: 3mm !important;
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: hidden;
            box-shadow: none !important;
          }
          .cred-foto {
            width: 26mm !important;
            height: 32mm !important;
            margin: 1mm 0 !important;
            border: 0.4mm dashed #999 !important;
            border-radius: 2mm !important;
            font-size: 7pt !important;
          }
          .credencial img { width: 46mm !important; height: 46mm !important; margin: 1mm 0 !important; }
          .cred-marca { font-size: 8pt !important; }
          .cred-nombre { font-size: 10pt !important; max-width: 72mm; }
          .cred-numero { font-size: 11pt !important; }
          .cred-sede { font-size: 8.5pt !important; }
        }
      `}</style>
    </div>
  );
}
