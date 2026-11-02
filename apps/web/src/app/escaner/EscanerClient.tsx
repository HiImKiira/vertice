"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { marcarPorQRAction, type ScanResult } from "./actions";

interface Registro {
  ts: number;
  resultado: ScanResult;
}

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

export function EscanerClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pausadoRef = useRef(false);
  const recientesRef = useRef<Map<string, number>>(new Map());
  const [estado, setEstado] = useState<"inicial" | "activo" | "sin_camara">("inicial");
  const [ultimo, setUltimo] = useState<Registro | null>(null);
  const [historial, setHistorial] = useState<Registro[]>([]);
  const [marcados, setMarcados] = useState(0);

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

      const r = await marcarPorQRAction(token);
      const reg: Registro = { ts: ahora, resultado: r };
      setUltimo(reg);
      setHistorial((h) => [reg, ...h].slice(0, 20));
      if (r.ok && r.estado === "marcado") setMarcados((n) => n + 1);
      beep(r.ok && r.estado === "marcado");
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

  return (
    <div className="space-y-4">
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
      </div>

      {/* Resultado del último escaneo */}
      {r && (
        <div
          className={`rounded-xl border p-4 ${
            !r.ok
              ? "border-red-400/50 bg-red-500/[0.12]"
              : r.estado === "marcado"
                ? "border-emerald-400/50 bg-emerald-500/[0.12]"
                : "border-amber-400/50 bg-amber-500/[0.12]"
          }`}
        >
          {!r.ok ? (
            <p className="text-sm font-semibold text-red-200">✕ {r.error}</p>
          ) : (
            <>
              <p className={`text-base font-bold ${r.estado === "marcado" ? "text-emerald-200" : "text-amber-200"}`}>
                {r.estado === "marcado" ? "✓ Asistencia registrada" : "⚠ Ya estaba marcado"}
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
                  <span>{!x.ok ? "✕" : x.estado === "marcado" ? "✅" : "⚠️"}</span>
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
