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
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
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

  // Listeners online/offline
  useEffect(() => {
    if (typeof window === "undefined") return;
    function onOnline() {
      setStatus((s) => ({ ...s, online: true }));
      // Auto-sync al volver online (timeout para permitir reconexión)
      setTimeout(() => { syncNow().catch(() => {}); }, 1500);
    }
    function onOffline() {
      setStatus((s) => ({ ...s, online: false }));
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    // Initial load + initial sync attempt
    reloadList();
    if (navigator.onLine) {
      setTimeout(() => { syncNow().catch(() => {}); }, 2000);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reloadList, syncNow]);

  // Poll periódico cada 30s para retry de errores (si vuelve la red rápido)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = setInterval(() => {
      if (navigator.onLine && !syncingRef.current) {
        listarPendientes().then((lst) => {
          const tienePendientes = lst.some(
            (p) => p.status === "pending" || (p.status === "error" && p.attempts < MAX_REINTENTOS),
          );
          if (tienePendientes) syncNow().catch(() => {});
        }).catch(() => {});
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
    const online = typeof navigator === "undefined" ? true : navigator.onLine;

    if (online) {
      // Intentar guardar directo. Si falla por red, caer a offline.
      try {
        const r = await guardarPaseListaAction({
          fecha: input.fecha,
          sede_id: input.sedeId,
          jornada: input.jornada,
          marcas: input.marcas as never,
        });
        return r;
      } catch (e) {
        console.warn("[offline-sync] guardar fallback a offline:", e);
        // cae a guardado offline ↓
      }
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
