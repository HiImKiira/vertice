/**
 * Storage offline para batches de marcas de pase de lista.
 *
 * Usa IndexedDB directo (sin dependencia). Cuando no hay red, guardamos
 * los batches aquí. Al volver online, hookSync los procesa uno por uno.
 *
 * Schema:
 *   DB: vortex-offline (version 1)
 *   Store: pending_saves
 *     keyPath: id (uuid generado en cliente)
 *     index: createdAt
 */

export type PendingStatus = "pending" | "syncing" | "synced" | "error";

export interface PendingMarca {
  empleado_id: string;
  codigo: string;
}

export interface PendingSave {
  id: string;                     // uuid generado local
  fecha: string;                  // YYYY-MM-DD
  sedeId: string;
  jornada: string;
  marcas: PendingMarca[];
  createdAt: number;              // ms epoch
  status: PendingStatus;
  errorMsg?: string | undefined;
  attempts: number;
  lastTriedAt?: number | undefined;
}

const DB_NAME = "vortex-offline";
const DB_VERSION = 1;
const STORE = "pending_saves";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB no disponible en server"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
        store.createIndex("status", "status", { unique: false });
      }
    };
  });
  return dbPromise;
}

function newId(): string {
  // simple uuid v4-ish (no necesitamos criptográfico)
  return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export async function guardarPendiente(input: {
  fecha: string;
  sedeId: string;
  jornada: string;
  marcas: PendingMarca[];
}): Promise<PendingSave> {
  const db = await openDB();
  const save: PendingSave = {
    id: newId(),
    fecha: input.fecha,
    sedeId: input.sedeId,
    jornada: input.jornada,
    marcas: input.marcas,
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(save);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return save;
}

export async function listarPendientes(): Promise<PendingSave[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingSave[]) ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function actualizarPendiente(id: string, patch: Partial<PendingSave>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const actual = getReq.result as PendingSave | undefined;
      if (!actual) return resolve();
      const next: PendingSave = { ...actual, ...patch };
      store.put(next);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function eliminarPendiente(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function eliminarSincronizados(): Promise<number> {
  const pendientes = await listarPendientes();
  const sincronizados = pendientes.filter((p) => p.status === "synced");
  await Promise.all(sincronizados.map((p) => eliminarPendiente(p.id)));
  return sincronizados.length;
}

export async function contarPorEstado(): Promise<Record<PendingStatus, number>> {
  const all = await listarPendientes();
  const out: Record<PendingStatus, number> = { pending: 0, syncing: 0, synced: 0, error: 0 };
  for (const p of all) out[p.status]++;
  return out;
}
