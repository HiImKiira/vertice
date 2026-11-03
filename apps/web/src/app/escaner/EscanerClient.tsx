"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { marcarPorQRAction, type GeoScan, type ScanResult } from "./actions";

interface Registro {
  ts: number;
  resultado: ScanResult;
}

type GeoEstado = "pidiendo" | "ok" | "denegado" | "no_disponible";

/** Beep corto de feedback (sin depender del catálogo de sonidos). */
function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(); osc.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  } catch { /* sin audio */ }
}

export function EscanerClient({ esTester = false }: { esTester?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausadoRef = useRef(false);
  const recientesRef = useRef<Map<string, number>>(new Map());
  const geoRef = useRef<GeoScan | null>(null);
  const pruebaRef = useRef(false);
  const [modoPrueba, setModoPrueba] = useState(false);
  const [estado, setEstado] = useState<"inicial" | "activo" | "sin_camara">("inicial");
  const [geoEstado, setGeoEstado] = useState<GeoEstado>("pidiendo");
  const [geoAcc, setGeoAcc] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<Registro | null>(null);
  const [flash, setFlash] = useState<Registro | null>(null);
  const flashTimer = useRef<number | null>(null);
  const [historial, setHistorial] = useState<Registro[]>([]);
  const [marcados, setMarcados] = useState(0);

  // Ubicación en vivo: las sedes con geocerca exigen estar físicamente ahí.
  useEffect(() => {
    if (!("geolocation" in navigator)) { setGeoEstado("no_disponible"); return; }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        geoRef.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
        };
        setGeoEstado("ok");
        setGeoAcc(geoRef.current.acc ?? null);
      },
      (err) => {
        geoRef.current = null;
        setGeoEstado(err.code === err.PERMISSION_DENIED ? "denegado" : "no_disponible");
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    let vivo = true;
    let raf = 0;
    let detector: { detect: (v: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } | null = null;
    let jsqrFn: ((d: Uint8ClampedArray, w: number, h: number) => { data: string } | null) | null = null;

    async function onToken(raw: string) {
      const token = raw.trim();
      // Anti-rebote: el mismo QR frente a la cámara no se re-procesa en 8s
      const ahora = Date.now();
      const visto = recientesRef.current.get(token);
      if (visto && ahora - visto < 8000) return;
      recientesRef.current.set(token, ahora);
      pausadoRef.current = true;

      let r: ScanResult;
      try {
        r = await marcarPorQRAction(token, geoRef.current, pruebaRef.current);
      } catch {
        // Falla de red o del servidor antes de responder: que se pueda reintentar ya
        recientesRef.current.delete(token);
        r = { ok: false, error: "Sin conexión con el servidor — revisa tu internet y vuelve a escanear" };
      }
      const reg: Registro = { ts: ahora, resultado: r };
      setUltimo(reg);
      setFlash(reg);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 2200);
      setHistorial((h) => [reg, ...h].slice(0, 20));
      if (r.ok && r.estado === "marcado") setMarcados((n) => n + 1);
      beep(r.ok && (r.estado === "marcado" || r.estado === "prueba"));
      if (navigator.vibrate) navigator.vibrate(r.ok ? 80 : [60, 60, 60]);

      setTimeout(() => { pausadoRef.current = false; }, 1200);
    }

    async function loop() {
      if (!vivo) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !pausadoRef.current) {
        try {
          if (detector) {
            const codes = await detector.detect(video);
            const hit = codes.find((c) => c.rawValue?.startsWith("VTX1."));
            if (hit) await onToken(hit.rawValue);
          } else if (jsqrFn) {
            const canvas = canvasRef.current!;
            const w = Math.min(640, video.videoWidth);
            const h = Math.round(w * (video.videoHeight / video.videoWidth));
            if (w > 0 && h > 0) {
              canvas.width = w; canvas.height = h;
              const g = canvas.getContext("2d", { willReadFrequently: true })!;
              g.drawImage(video, 0, 0, w, h);
              const img = g.getImageData(0, 0, w, h);
              const code = jsqrFn(img.data, w, h);
              if (code?.data?.startsWith("VTX1.")) await onToken(code.data);
            }
          }
        } catch { /* frame fallido, seguimos */ }
      }
      raf = window.setTimeout(loop, 220) as unknown as number;
    }

    async function iniciar() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!vivo) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        // Detector nativo (Android Chrome) o fallback jsQR (iPhone y otros)
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => typeof detector }).BarcodeDetector;
        if (BD) {
          try { detector = new BD({ formats: ["qr_code"] }); } catch { detector = null; }
        }
        if (!detector) {
          const mod = await import("jsqr");
          const jsQR = mod.default;
          jsqrFn = (d, w, h) => jsQR(d, w, h, { inversionAttempts: "dontInvert" });
        }
        setEstado("activo");
        loop();
      } catch {
        setEstado("sin_camara");
      }
    }

    iniciar();
    return () => {
      vivo = false;
      window.clearTimeout(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const r = ultimo?.resultado;

  function toggleModoPrueba() {
    setModoPrueba((v) => {
      pruebaRef.current = !v;
      return !v;
    });
  }

  return (
    <div className="space-y-4">
      {/* Modo prueba (solo SUPERADMIN/SOPORTE): valida todo sin marcar */}
      {esTester && (
        <button
          type="button"
          onClick={toggleModoPrueba}
          className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition ${
            modoPrueba
              ? "border-violet-400/50 bg-violet-500/[0.14] text-violet-100"
              : "border-white/10 bg-[color:var(--card)] text-muted"
          }`}
        >
          <span>
            <span className="font-bold">🧪 Modo prueba</span>{" "}
            {modoPrueba
              ? "— ACTIVO: valida credencial, sede y geocerca, pero NO marca asistencia"
              : "— toca para probar el flujo sin marcar asistencia"}
          </span>
          <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${modoPrueba ? "bg-violet-400 text-black" : "bg-white/10"}`}>
            {modoPrueba ? "ON" : "OFF"}
          </span>
        </button>
      )}
      {/* Cámara */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black">
        <video ref={videoRef} playsInline muted className="h-[46vh] w-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        {/* Marco guía */}
        {estado === "activo" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-52 w-52 rounded-2xl border-4 border-emerald-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {estado === "inicial" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-muted">
            Encendiendo cámara…
          </div>
        )}
        {estado === "sin_camara" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center">
            <p className="text-sm font-semibold text-red-300">No se pudo abrir la cámara</p>
            <p className="text-xs text-muted">
              Dale permiso de cámara a Vortex en tu navegador (candado de la barra de dirección → Permisos → Cámara) y recarga.
            </p>
          </div>
        )}
        {/* Contador flotante */}
        <div className="absolute right-3 top-3 rounded-full bg-emerald-500/90 px-3 py-1 font-mono text-sm font-bold text-black">
          ✓ {marcados}
        </div>
        {/* Banner grande por escaneo: se ve sin quitar la vista de la cámara */}
        {flash && (() => {
          const f = flash.resultado;
          const estilo = !f.ok
            ? "bg-red-600/95 text-white"
            : f.estado === "marcado"
              ? "bg-emerald-500/95 text-black"
              : f.estado === "prueba"
                ? "bg-violet-500/95 text-white"
                : "bg-amber-400/95 text-black";
          return (
            <div className="pointer-events-none absolute inset-x-2 bottom-2 animate-slide-up">
              <div className={`rounded-xl px-4 py-3 text-center shadow-2xl ${estilo}`}>
                {f.ok ? (
                  <>
                    <p className="text-lg font-black leading-tight">
                      {f.estado === "marcado" ? "✓ ASISTENCIA PUESTA" : f.estado === "prueba" ? "🧪 PRUEBA OK (no se marcó)" : "⚠ YA TENÍA ASISTENCIA"}
                    </p>
                    <p className="truncate text-sm font-semibold">#{f.numero} · {f.nombre}</p>
                    {f.estado === "ya_marcado" && (
                      <p className="text-xs font-medium">código {f.codigo}{f.hora ? ` · desde las ${f.hora}` : ""} — no se pisó</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-black leading-tight">✕ NO SE MARCÓ</p>
                    <p className="text-sm font-semibold leading-snug">{f.error}</p>
                  </>
                )}
              </div>
            </div>
          );
        })()}
        {/* Estado de ubicación (geocerca) */}
        <div
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-bold ${
            geoEstado === "ok"
              ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
              : geoEstado === "pidiendo"
                ? "bg-white/10 text-white/70 ring-1 ring-white/20"
                : "bg-red-500/25 text-red-200 ring-1 ring-red-400/50"
          }`}
        >
          {geoEstado === "ok"
            ? `📍 Ubicación activa${geoAcc != null ? ` ±${geoAcc} m` : ""}`
            : geoEstado === "pidiendo"
              ? "📍 Obteniendo ubicación…"
              : geoEstado === "denegado"
                ? "📍 Ubicación DENEGADA"
                : "📍 Sin GPS"}
        </div>
      </div>

      {geoEstado === "denegado" && (
        <p className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-[11px] text-red-200">
          Negaste el permiso de ubicación. En sedes con geocerca <strong>no podrás marcar</strong> hasta activarlo:
          candado de la barra de dirección → Permisos → Ubicación → Permitir, y recarga.
        </p>
      )}

      {/* Resultado del último escaneo */}
      {r && (
        <div
          className={`rounded-xl border p-4 ${
            !r.ok
              ? "border-red-400/50 bg-red-500/[0.12]"
              : r.estado === "marcado"
                ? "border-emerald-400/50 bg-emerald-500/[0.12]"
                : r.estado === "prueba"
                  ? "border-violet-400/50 bg-violet-500/[0.12]"
                  : "border-amber-400/50 bg-amber-500/[0.12]"
          }`}
        >
          {!r.ok ? (
            <p className="text-sm font-semibold text-red-200">✕ {r.error}</p>
          ) : (
            <>
              <p className={`text-base font-bold ${
                r.estado === "marcado" ? "text-emerald-200" : r.estado === "prueba" ? "text-violet-200" : "text-amber-200"
              }`}>
                {r.estado === "marcado"
                  ? "✓ Asistencia registrada"
                  : r.estado === "prueba"
                    ? "🧪 Prueba OK — credencial válida (NO se marcó)"
                    : "⚠ Ya estaba marcado"}
              </p>
              <p className="mt-1 text-sm text-text">
                #{r.numero} · {r.nombre}
              </p>
              <p className="text-xs text-muted">
                {r.sede} · {r.jornada} · código <span className="font-mono font-bold">{r.codigo}</span>
                {r.estado === "ya_marcado" && r.hora && <> · desde las {r.hora}</>}
              </p>
            </>
          )}
        </div>
      )}

      {/* Historial de la sesión */}
      {historial.length > 0 && (
        <section>
          <div className="section-label mb-2">Escaneados ahora ({historial.length})</div>
          <ul className="space-y-1">
            {historial.map((h) => {
              const x = h.resultado;
              return (
                <li key={h.ts} className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--card)] px-2.5 py-1.5 text-xs">
                  <span>{!x.ok ? "✕" : x.estado === "marcado" ? "✅" : x.estado === "prueba" ? "🧪" : "⚠️"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {x.ok ? `#${x.numero} ${x.nombre}` : x.error}
                  </span>
                  <span className="font-mono text-[10px] text-muted-2">
                    {new Date(h.ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-2">
        <Icon name="alert-triangle" size={12} className="mt-0.5 shrink-0" />
        Apunta la cámara al QR de la credencial. Marca A automáticamente; si ya estaba marcado no lo pisa.
        Solo funciona con trabajadores de sedes designadas que tengas asignadas.
      </p>
    </div>
  );
}
