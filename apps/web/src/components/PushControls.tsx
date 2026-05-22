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

function detectPWAInstalled(): boolean {
  if (typeof window === "undefined") return false;
  // Chrome/Android/desktop
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia && window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  // iOS Safari standalone
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  return false;
}

function detectPlatform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

async function subscribeThisDevice(): Promise<{ ok: boolean; error?: string }> {
  if (!("serviceWorker" in navigator)) return { ok: false, error: "El navegador no soporta service workers." };
  if (!("PushManager" in window)) return { ok: false, error: "El navegador no soporta push notifications." };
  if (!("Notification" in window)) return { ok: false, error: "El navegador no soporta notificaciones." };
  if (!VAPID_PUBLIC_KEY) return { ok: false, error: "VAPID public key no configurada." };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    return { ok: false, error: perm === "denied"
      ? "Permiso denegado. Ve a Ajustes del navegador → Notificaciones → permitir Vortex."
      : "Permiso no concedido." };
  }

  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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
  if (!j.endpoint || !j.keys) return { ok: false, error: "Subscription incompleta." };

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

type Phase =
  | "loading"
  | "unsupported"      // browser sin push API
  | "not_installed"    // no es PWA standalone
  | "needs_permission" // PWA instalada pero permission != granted
  | "denied"           // permission = denied
  | "needs_subscribe"  // granted en browser pero falta server-side sub
  | "subscribed";      // todo OK

export function PushControls({ compact = false }: { compact?: boolean }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  async function recompute() {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
      setPhase("unsupported");
      return;
    }
    setPlatform(detectPlatform());
    const installed = detectPWAInstalled();
    if (!installed) {
      setPhase("not_installed");
      // Aún así jala status para mostrarlo
      const res = await fetch("/api/push/status").catch(() => null);
      if (res?.ok) setStatus(await res.json());
      return;
    }
    const perm = Notification.permission;
    if (perm === "denied") {
      setPhase("denied");
      return;
    }
    // Status del server
    const res = await fetch("/api/push/status").catch(() => null);
    const j = res?.ok ? (await res.json()) as StatusResp : null;
    if (j) setStatus(j);

    if (perm !== "granted") {
      setPhase("needs_permission");
      return;
    }
    // Granted: verificar que el browser SI tenga subscription y esté reportada al server
    const reg = await navigator.serviceWorker.getRegistration("/");
    const browserSub = reg ? await reg.pushManager.getSubscription() : null;
    if (!browserSub || (j?.misSuscripciones ?? 0) === 0) {
      setPhase("needs_subscribe");
      return;
    }
    setPhase("subscribed");
  }

  useEffect(() => {
    recompute();
    // Re-check al cambiar visibilidad (volver a la app)
    const onVis = () => { if (document.visibilityState === "visible") recompute(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSuscribir() {
    setMsg(null);
    start(async () => {
      const r = await subscribeThisDevice();
      if (r.ok) {
        setMsg("Listo. Este dispositivo ya recibe notificaciones.");
        await recompute();
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
        setMsg(`Push de prueba enviado a ${j.enviados ?? 0} dispositivo${j.enviados === 1 ? "" : "s"}. Revisa tu barra de notificaciones.`);
      } else {
        setMsg(`Error: ${j.error}`);
      }
    });
  }

  // ────────────────────────────────────────────────────────────────────
  // Render según phase
  // ────────────────────────────────────────────────────────────────────

  // Modo compact: solo aparece si hay algo que hacer. Si está suscrito y es
  // compact, no renderiza nada (UX limpia en dashboard).
  if (compact && (phase === "subscribed" || phase === "loading" || phase === "unsupported" || phase === "denied")) {
    return null;
  }

  if (phase === "loading") {
    return compact ? null : <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs text-muted-2">Verificando notificaciones…</div>;
  }

  if (phase === "unsupported") {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/[0.06] p-3 text-xs text-red-200">
        Tu navegador no soporta notificaciones push. Usa Chrome, Edge, Safari 16.4+ o Firefox.
      </div>
    );
  }

  if (phase === "not_installed") {
    return (
      <InstallPrompt platform={platform} compact={compact} />
    );
  }

  if (phase === "denied") {
    return (
      <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.08] p-3 text-xs text-amber-200">
        Las notificaciones están <strong>bloqueadas</strong> en este navegador.
        Para activarlas: barra de URL → ícono de candado/permisos → notificaciones → permitir → recarga.
      </div>
    );
  }

  // needs_permission | needs_subscribe | subscribed (en modo full)
  const yaSuscrito = phase === "subscribed";

  if (compact) {
    // Solo mostramos invitación cuando hay algo que activar
    return (
      <div className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/[0.08] p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200">
          <Icon name="alert-triangle" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text">Activa las notificaciones</p>
          <p className="text-[10px] text-muted">
            Recibe recordatorios de captura y avisos urgentes de RH.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSuscribir}
          disabled={pending}
          className="shrink-0 rounded-md bg-blue-500/80 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
        >
          {pending ? "..." : "Activar"}
        </button>
      </div>
    );
  }

  // FULL panel (para /soporte)
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
              ? "Permiso concedido + subscription registrada en servidor."
              : "Pulsa para conceder permiso y registrar este dispositivo en el servidor."}
          </p>
        </div>
      </div>

      {status?.esSoporte && (
        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Usuarios" value={status.usuariosUnicos ?? 0} />
          <Stat label="Dispositivos" value={status.total ?? 0} />
          <Stat label="Tuyos" value={status.misSuscripciones ?? 0} />
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
          onClick={() => { recompute(); }}
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-white/5 bg-white/[0.03] px-2 py-1.5">
      <div className="font-display text-sm text-text">{value}</div>
      <div className="text-[9px] uppercase tracking-tagline text-muted">{label}</div>
    </div>
  );
}

function InstallPrompt({ platform, compact }: { platform: "ios" | "android" | "desktop"; compact: boolean }) {
  const cls = compact
    ? "flex items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/[0.08] p-3"
    : "rounded-xl border border-violet-400/30 bg-violet-500/[0.06] p-4";

  return (
    <div className={cls}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/20 text-violet-200">
        <Icon name="upload" size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={compact ? "text-xs font-semibold text-text" : "text-sm font-semibold text-text"}>
          Instala Vortex como app
        </p>
        <p className="mt-0.5 text-[10px] text-muted sm:text-[11px]">
          {platform === "ios" && (
            <>
              Toca <span className="font-mono">Compartir</span> (▢↑) en Safari → <strong>Añadir a pantalla de inicio</strong>.
              Luego abre Vortex desde el ícono y activa notificaciones.
            </>
          )}
          {platform === "android" && (
            <>
              Toca menú (⋮) en Chrome → <strong>Instalar app</strong> / <strong>Añadir a pantalla de inicio</strong>.
              Luego abre Vortex desde el ícono y activa notificaciones.
            </>
          )}
          {platform === "desktop" && (
            <>
              Click en el ícono de instalación (⊕) en la barra de direcciones → <strong>Instalar Vortex</strong>.
              Las notificaciones solo funcionan cuando la app está instalada.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
