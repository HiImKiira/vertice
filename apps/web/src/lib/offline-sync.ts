"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  actualizarPendiente,
  eliminarPendiente,
  guardarPendiente,
  listarPendientes,
  type PendingSave,
} from "./offline-store";
import { guardarPaseListaAction, type GuardarResult } from "@/app/pase-lista/actions";

export interface SyncStatus {
  online: boolean;
  pendientes: number;
  errores: number;
  syncing: boolean;
  ultimaSync: Date | null;
}

const MAX_REINTENTOS = 5;
const PING_URL = "/api/ping";
const PING_TIMEOUT_MS = 4000;

/**
 * Verifica si realmente hay conexión haciendo un ping al servidor.
 *
 * `navigator.onLine` es notoriamente poco fiable en móviles: en 4G/5G puede
 * reportar `false` durante captive portals, cambios de torre, transiciones
 * wifi↔móvil o caídas de DNS. Solo damos por offline si EL PING TAMBIÉN
 * falla. Una respuesta de cualquier código HTTP cuenta como "hay red" —
 * incluso 401/403 — porque significa que la conexión TCP se estableció.
 */
async function pingServer(): Promise<boolean> {
  if (typeof window === "undefined") return true;
  try {
    const ctl = new AbortController();
    const timeoutId = setTimeout(() => ctl.abort(), PING_TIMEOUT_MS);
    const res = await fetch(`${PING_URL}?t=${Date.now()}`, {
      method: "HEAD",
      cache: "no-store",
      signal: ctl.signal,
      credentials: "omit",
    }).catch(() => null);
    clearTimeout(timeoutId);
    return !!res; // cualquier respuesta = hay red
  } catch {
    return false;
  }
}

/**
 * Sincroniza UN batch pendiente. Devuelve el resultado o false si lo
 * dejamos en estado de error.
 */
async function syncOne(p: PendingSave): Promise<GuardarResult | false> {
  await actualizarPendiente(p.id, {
    status: "syncing",
    attempts: p.attempts + 1,
    lastTriedAt: Date.now(),
  });

  try {
    const r = await guardarPaseListaAction({
      fecha: p.fecha,
      sede_id: p.sedeId,
      jornada: p.jornada,
      marcas: p.marcas as Array<{ empleado_id: string; codigo: string }> as never,
    });

    if (r.ok) {
      // Si llegó al server con éxito, marcamos como synced (para que el panel
      // muestre el ✓) y después de mostrar feedback al usuario, eliminamos.
      await actualizarPendiente(p.id, { status: "synced" });
      return r;
    }

    // El server respondió con error funcional (ej. fuera de gracia).
    // Lo marcamos como error con el mensaje y NO reintentamos.
    await actualizarPendiente(p.id, {
      status: "error",
      errorMsg: r.error,
    });
    return r;
  } catch (e) {
    // Probablemente sin red — dejamos en pending para que el próximo intento
    // lo retome. Después de MAX_REINTENTOS lo marcamos como error.
    const next = p.attempts + 1;
    if (next >= MAX_REINTENTOS) {
      await actualizarPendiente(p.id, {
        status: "error",
        errorMsg: `Sin red tras ${next} intentos. ${(e as Error).message ?? ""}`,
      });
    } else {
      await actualizarPendiente(p.id, {
        status: "pending",
        errorMsg: (e as Error).message ?? "Sin red",
      });
    }
    return false;
  }
}

/**
 * Sincroniza todos los pendientes (pending + error que pueda reintentarse).
 */
export async function syncAll(): Promise<{ ok: number; fail: number }> {
  const todos = await listarPendientes();
  const reintentables = todos.filter(
    (p) => (p.status === "pending" || (p.status === "error" && p.attempts < MAX_REINTENTOS)),
  );
  let ok = 0;
  let fail = 0;
  for (const p of reintentables) {
    const r = await syncOne(p);
    if (r && r.ok) ok++;
    else fail++;
  }
  return { ok, fail };
}

/**
 * Hook React para usar en componentes. Maneja:
 *  - estado online/offline
 *  - guardado con fallback offline
 *  - sync automática al volver online
 *  - polling de estado para UI
 */
export function useOfflineSync(): {
  status: SyncStatus;
  guardar: (input: { fecha: string; sedeId: string; jornada: string; marcas: { empleado_id: string; codigo: string }[] }) => Promise<GuardarResult & { offline?: boolean }>;
  syncNow: () => Promise<{ ok: number; fail: number }>;
  limpiarSincronizados: () => Promise<void>;
  pendientesList: PendingSave[];
  reloadList: () => Promise<void>;
} {
  const [status, setStatus] = useState<SyncStatus>({
    // Por default asumimos online; el primer ping al montar lo confirma o desmiente.
    // No nos basamos en navigator.onLine porque es notoriamente poco fiable en móviles 4G/5G.
    online: true,
    pendientes: 0,
    errores: 0,
    syncing: false,
    ultimaSync: null,
  });
  const [pendientesList, setPendientesList] = useState<PendingSave[]>([]);
  const syncingRef = useRef(false);

  const reloadList = useCallback(async () => {
    try {
      const lst = await listarPendientes();
      setPendientesList(lst);
      const pending = lst.filter((p) => p.status === "pending" || p.status === "syncing").length;
      const errores = lst.filter((p) => p.status === "error").length;
      setStatus((s) => ({ ...s, pendientes: pending, errores }));
    } catch {
      // ignore (IndexedDB no disponible)
    }
  }, []);

  const syncNow = useCallback(async (): Promise<{ ok: number; fail: number }> => {
    if (syncingRef.current) return { ok: 0, fail: 0 };
    syncingRef.current = true;
    setStatus((s) => ({ ...s, syncing: true }));
    try {
      const r = await syncAll();
      setStatus((s) => ({ ...s, syncing: false, ultimaSync: new Date() }));
      await reloadList();
      return r;
    } catch {
      setStatus((s) => ({ ...s, syncing: false }));
      return { ok: 0, fail: 0 };
    } finally {
      syncingRef.current = false;
    }
  }, [reloadList]);

  // Listeners online/offline + verificación real con ping al servidor
  useEffect(() => {
    if (typeof window === "undefined") return;

    let pingInFlight = false;

    async function verificarConPing() {
      if (pingInFlight) return;
      pingInFlight = true;
      const hayRed = await pingServer();
      pingInFlight = false;
      setStatus((s) => (s.online === hayRed ? s : { ...s, online: hayRed }));
      if (hayRed) {
        // Hay red real → intentar sync de lo que esté pendiente
        setTimeout(() => { syncNow().catch(() => {}); }, 800);
      }
    }

    function onOnline() {
      // navigator dice online → confirmamos (en algunos móviles el "online"
      // dispara antes de que la red esté realmente lista, así que verificamos).
      verificarConPing();
    }
    function onOffline() {
      // navigator dice offline → NO marcamos offline inmediatamente.
      // Hacemos un ping rápido: si responde, era falso positivo del browser
      // (común en 4G/5G/Wi-Fi inestable). Solo si falla el ping → offline real.
      verificarConPing();
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Initial: cargar pendientes y verificar conexión real al montar
    reloadList();
    verificarConPing();

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reloadList, syncNow]);

  // Poll periódico cada 30s:
  //  - verificar conexión con ping real (re-sincroniza estado online si cambió)
  //  - reintentar pendientes si hay red
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setInterval(async () => {
      const hayRed = await pingServer();
      setStatus((s) => (s.online === hayRed ? s : { ...s, online: hayRed }));
      if (hayRed && !syncingRef.current) {
        try {
          const lst = await listarPendientes();
          const tienePendientes = lst.some(
            (p) => p.status === "pending" || (p.status === "error" && p.attempts < MAX_REINTENTOS),
          );
          if (tienePendientes) syncNow().catch(() => {});
        } catch { /* ignore */ }
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [syncNow]);

  const guardar = useCallback(async (input: {
    fecha: string;
    sedeId: string;
    jornada: string;
    marcas: { empleado_id: string; codigo: string }[];
  }): Promise<GuardarResult & { offline?: boolean }> => {
    // SIEMPRE intentamos primero el server (no confiamos en navigator.onLine,
    // que en 4G/5G da falsos positivos). Solo si el fetch falla por red,
    // caemos a guardado offline en IndexedDB.
    try {
      const r = await guardarPaseListaAction({
        fecha: input.fecha,
        sede_id: input.sedeId,
        jornada: input.jornada,
        marcas: input.marcas as never,
      });
      // Si llegamos aquí con respuesta del server, marcamos online (por si
      // el badge decía offline por un blip previo).
      setStatus((s) => (s.online ? s : { ...s, online: true }));
      return r;
    } catch (e) {
      console.warn("[offline-sync] server inalcanzable, cae a offline:", e);
      // Marcar offline en el badge para feedback inmediato
      setStatus((s) => (!s.online ? s : { ...s, online: false }));
      // cae a guardado offline ↓
    }

    // Sin red o falló → guardar en IndexedDB
    try {
      await guardarPendiente({
        fecha: input.fecha,
        sedeId: input.sedeId,
        jornada: input.jornada,
        marcas: input.marcas,
      });
      await reloadList();
      return {
        ok: true,
        saved: input.marcas.length,
        skipped: 0,
        offline: true,
      } as GuardarResult & { offline?: boolean };
    } catch (e) {
      return {
        ok: false,
        error: `No se pudo guardar offline: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }, [reloadList]);

  const limpiarSincronizados = useCallback(async () => {
    const todos = await listarPendientes();
    const synced = todos.filter((p) => p.status === "synced");
    await Promise.all(synced.map((p) => eliminarPendiente(p.id)));
    await reloadList();
  }, [reloadList]);

  return { status, guardar, syncNow, limpiarSincronizados, pendientesList, reloadList };
}
