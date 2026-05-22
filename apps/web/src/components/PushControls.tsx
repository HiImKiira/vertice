"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "./Icon";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64Padded);
  const out = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) out[i] = rawData.charCodeAt(i);
  return out;
}

async function subscribeThisDevice(): Promise<{ ok: boolean; error?: string }> {
  if (!("serviceWorker" in navigator)) return { ok: false, error: "El navegador no soporta service workers." };
  if (!("PushManager" in window)) return { ok: false, error: "El navegador no soporta push notifications." };
  if (!("Notification" in window)) return { ok: false, error: "El navegador no soporta notificaciones." };

  // Pedir permiso (debe venir de un user gesture)
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, error: perm === "denied"
      ? "Permiso denegado. Ve a configuración del navegador → notificaciones → vertice-rosy.vercel.app → permitir."
      : "Permiso no concedido." };
  }

  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const applicationServerKey = keyBytes.buffer.slice(
      keyBytes.byteOffset,
      keyBytes.byteOffset + keyBytes.byteLength,
    ) as ArrayBuffer;
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
  }

  const j = sub.toJSON();
  if (!j.endpoint || !j.keys) return { ok: false, error: "Subscription incompleta del navegador." };

  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, userAgent: navigator.userAgent }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Servidor falló" }));
    return { ok: false, error: err.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

interface StatusResp {
  ok: boolean;
  misSuscripciones?: number;
  total?: number | null;
  usuariosUnicos?: number | null;
  esSoporte?: boolean;
}

/**
 * Bloque que muestra el estado de las notificaciones del dispositivo
 * actual y permite suscribir + mandar push de prueba.
 *
 * Modo "compact" → para incrustar en otras pantallas (dashboard).
 * Modo "full"    → tarjeta completa con stats (panel RH).
 */
export function PushControls({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [browserPerm, setBrowserPerm] = useState<NotificationPermission | "unsupported">("default");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  async function loadStatus() {
    const res = await fetch("/api/push/status").catch(() => null);
    if (!res || !res.ok) return;
    const j = (await res.json().catch(() => null)) as StatusResp | null;
    if (j) setStatus(j);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setBrowserPerm("unsupported");
      return;
    }
    setBrowserPerm(Notification.permission);
    loadStatus();
  }, []);

  const yaSuscrito = (status?.misSuscripciones ?? 0) > 0 && browserPerm === "granted";

  function handleSuscribir() {
    setMsg(null);
    start(async () => {
      const r = await subscribeThisDevice();
      if (r.ok) {
        setBrowserPerm("granted");
        setMsg("✓ Dispositivo suscrito. Ya puedes recibir notificaciones.");
        loadStatus();
      } else {
        setMsg(r.error ?? "Error al suscribir.");
      }
    });
  }

  async function handleTest() {
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/push/test", { method: "POST" });
      const j = await res.json().catch(() => ({ error: "Respuesta inválida" }));
      if (res.ok) {
        setMsg(`Push de prueba enviado a ${j.enviados ?? 0}/${(j.enviados ?? 0) + (j.fallidos ?? 0)} dispositivo${j.enviados === 1 ? "" : "s"}. Revisa la barra de notificaciones.`);
      } else {
        setMsg(`Error: ${j.error}`);
      }
    });
  }

  if (browserPerm === "unsupported") {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/[0.06] p-3 text-xs text-red-200">
        Tu navegador no soporta notificaciones push. Usa Chrome, Edge, Safari 16+ o Firefox.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[color:var(--card)] p-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          yaSuscrito ? "bg-emerald-500/20 text-emerald-200" : "bg-blue-500/20 text-blue-200"
        }`}>
          <Icon name={yaSuscrito ? "check" : "alert-triangle"} size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text">
            {yaSuscrito ? "Notificaciones activas" : "Notificaciones inactivas"}
          </p>
          <p className="text-[10px] text-muted">
            {yaSuscrito ? "Recibirás recordatorios y anuncios de RH." : "Suscríbete para recibir avisos importantes."}
          </p>
        </div>
        {yaSuscrito ? (
          <button
            type="button"
            onClick={handleTest}
            disabled={pending}
            className="shrink-0 rounded-md border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-[10px] font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
          >
            Probar
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSuscribir}
            disabled={pending}
            className="shrink-0 rounded-md bg-blue-500/80 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            {pending ? "..." : "Activar"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-blue-400/25 bg-blue-500/[0.04] p-4">
      <div className="mb-3 flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          yaSuscrito ? "bg-emerald-500/20 text-emerald-200" : "bg-blue-500/20 text-blue-200"
        }`}>
          <Icon name={yaSuscrito ? "check" : "alert-triangle"} size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-sm">
            {yaSuscrito ? "Este dispositivo recibe notificaciones" : "Activa las notificaciones"}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted">
            {yaSuscrito
              ? "Permiso concedido y subscription registrada en el servidor."
              : "Pulsa 'Suscribir este dispositivo' para activar push. iOS solo lo permite si abriste la app desde el ícono de inicio."}
          </p>
        </div>
      </div>

      {/* Stats */}
      {status?.esSoporte && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
            <div className="font-display text-sm text-text">{status.usuariosUnicos ?? 0}</div>
            <div className="text-[9px] uppercase tracking-tagline text-muted">Usuarios</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
            <div className="font-display text-sm text-text">{status.total ?? 0}</div>
            <div className="text-[9px] uppercase tracking-tagline text-muted">Dispositivos</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
            <div className="font-display text-sm text-text">{status.misSuscripciones ?? 0}</div>
            <div className="text-[9px] uppercase tracking-tagline text-muted">Tuyos</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!yaSuscrito && (
          <button
            type="button"
            onClick={handleSuscribir}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            <Icon name="check" size={14} />
            {pending ? "Suscribiendo..." : "Suscribir este dispositivo"}
          </button>
        )}
        {yaSuscrito && (
          <button
            type="button"
            onClick={handleTest}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
          >
            <Icon name="send" size={14} />
            Mandar push de prueba (a mí)
          </button>
        )}
        <button
          type="button"
          onClick={() => { loadStatus(); setMsg("Estado actualizado."); }}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-xs text-muted hover:text-text disabled:opacity-40"
        >
          <Icon name="refresh" size={12} /> Refrescar
        </button>
      </div>

      {msg && (
        <p className="mt-3 break-words rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs text-muted">
          {msg}
        </p>
      )}

      {browserPerm === "denied" && (
        <p className="mt-2 rounded-md border border-amber-400/30 bg-amber-400/[0.05] px-3 py-2 text-[11px] text-amber-200">
          ⚠ El permiso de notificaciones está bloqueado en este navegador.
          Ábrelo en la barra de URL (candado) → permisos → notificaciones → permitir.
        </p>
      )}
    </div>
  );
}
