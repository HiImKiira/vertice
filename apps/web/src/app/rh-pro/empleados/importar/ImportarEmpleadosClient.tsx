"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  previewImportarEmpleadosAction,
  confirmarImportarEmpleadosAction,
  type PreviewResult,
  type FilaPreview,
  type ConfirmResult,
} from "../import-actions";

type Step = "subir" | "preview" | "completado";

export function ImportarEmpleadosClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<Step>("subir");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmacion, setConfirmacion] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actualizarExistentes, setActualizarExistentes] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState<"all" | "ok" | "warn" | "error">("all");

  function reset() {
    setStep("subir");
    setArchivo(null);
    setPreview(null);
    setConfirmacion(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFile(f: File | null) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("El archivo debe ser .xlsx");
      return;
    }
    setError(null);
    setArchivo(f);
    procesar(f);
  }

  function procesar(f: File) {
    const fd = new FormData();
    fd.append("file", f);
    start(async () => {
      setError(null);
      const r = await previewImportarEmpleadosAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setPreview(r);
      setStep("preview");
    });
  }

  function confirmar() {
    if (!preview) return;
    const filasValidas = preview.filas.filter((f) => f.status !== "error");
    const msg = `¿Confirmar importación de ${filasValidas.length} filas? (${preview.nuevosEmpleados} nuevos, ${preview.actualizaciones} actualizaciones${!actualizarExistentes ? " — pero NO se actualizarán existentes" : ""})`;
    if (!confirm(msg)) return;

    start(async () => {
      setError(null);
      const r = await confirmarImportarEmpleadosAction(filasValidas, { actualizarExistentes });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setConfirmacion({ creados: r.creados, actualizados: r.actualizados, saltados: r.saltados, errores: r.errores });
      setStep("completado");
      router.refresh();
    });
  }

  // ─────────────── STEP 1: SUBIR ───────────────
  if (step === "subir") {
    return (
      <section className="space-y-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          onClick={() => fileRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragOver
              ? "border-blue-400 bg-blue-500/10"
              : "border-white/15 bg-[color:var(--card)] hover:border-blue-400/40"
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-200">
            <Icon name="upload" size={26} />
          </div>
          <p className="font-display text-lg">{pending ? "Procesando archivo..." : "Arrastra tu archivo aquí o haz click"}</p>
          <p className="mt-1 text-xs text-muted">
            Formato esperado: .xlsx con columnas <code className="font-mono">numero_empleado, nombre, sede, jornada, dia_descanso, salario_diario, fecha_alta</code>
          </p>
          <p className="mt-3 text-[10px] text-muted-2">Máximo 10 MB.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/25 bg-amber-500/[0.04] p-4">
          <Icon name="file-text" size={18} className="text-amber-300" />
          <div className="flex-1">
            <p className="text-sm font-semibold">¿No tienes un archivo aún?</p>
            <p className="text-xs text-muted">Descarga el template oficial con headers, ejemplos y la lista de sedes válidas.</p>
          </div>
          <a
            href="/api/empleados/import-template"
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/30"
          >
            <Icon name="upload" size={12} className="rotate-180" />
            Descargar template
          </a>
        </div>

        {error && (
          <p className="rounded-md border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">{error}</p>
        )}
      </section>
    );
  }

  // ─────────────── STEP 2: PREVIEW ───────────────
  if (step === "preview" && preview) {
    const filasFiltradas = preview.filas.filter((f) => filtroStatus === "all" ? true : f.status === filtroStatus);
    const filasValidas = preview.filas.filter((f) => f.status !== "error").length;

    return (
      <section className="space-y-4">
        {/* Resumen */}
        <div className="grid gap-3 sm:grid-cols-5">
          <Stat label="Total filas" value={preview.totalFilas} color="blue" />
          <Stat label="Válidas" value={preview.validas} color="emerald" />
          <Stat label="Con advertencias" value={preview.conWarnings} color="amber" />
          <Stat label="Con errores" value={preview.conErrores} color="red" />
          <Stat label="Nuevos / Actualizan" value={`${preview.nuevosEmpleados} / ${preview.actualizaciones}`} color="violet" />
        </div>

        {/* Filtros y opciones */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/5 bg-[color:var(--card)] p-3">
          <div className="flex gap-1 text-xs">
            {(["all", "ok", "warn", "error"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`rounded px-2.5 py-1 transition ${
                  filtroStatus === s ? "bg-blue-500/30 text-blue-100" : "bg-white/5 text-muted hover:text-text"
                }`}
              >
                {s === "all" ? "Todas" : s === "ok" ? "✓ Válidas" : s === "warn" ? "⚠ Advertencias" : "✗ Errores"}
              </button>
            ))}
          </div>
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={actualizarExistentes}
              onChange={(e) => setActualizarExistentes(e.target.checked)}
            />
            <span>Actualizar empleados ya existentes ({preview.actualizaciones})</span>
          </label>
        </div>

        {/* Tabla preview */}
        <div className="overflow-x-auto rounded-xl border border-white/5">
          <table className="w-full text-xs">
            <thead className="bg-white/[0.03] text-left">
              <tr>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Fila</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Estado</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">#</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Nombre</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Sede</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Jornada</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Desc.</th>
                <th className="px-2 py-2 text-right font-mono text-[10px] uppercase">Salario</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">RFC/NSS</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Banco · CLABE</th>
                <th className="px-2 py-2 font-mono text-[10px] uppercase">Notas</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr><td colSpan={11} className="px-3 py-6 text-center text-muted">Sin filas con este filtro.</td></tr>
              ) : filasFiltradas.slice(0, 200).map((f) => (
                <FilaRow key={f.rowNumber} f={f} />
              ))}
            </tbody>
          </table>
          {filasFiltradas.length > 200 && (
            <p className="border-t border-white/5 bg-white/[0.02] px-3 py-2 text-center text-[10px] text-muted-2">
              Mostrando primeras 200 filas de {filasFiltradas.length}. Al confirmar se procesan todas.
            </p>
          )}
        </div>

        {/* Acciones */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={confirmar}
            disabled={pending || filasValidas === 0}
            className="btn btn-primary"
          >
            {pending ? "Importando..." : `Importar ${filasValidas} fila${filasValidas === 1 ? "" : "s"} válida${filasValidas === 1 ? "" : "s"}`}
          </button>
          <button onClick={reset} disabled={pending} className="btn btn-ghost">
            ← Subir otro archivo
          </button>
        </div>

        {error && (
          <p className="rounded-md border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">{error}</p>
        )}
      </section>
    );
  }

  // ─────────────── STEP 3: COMPLETADO ───────────────
  if (step === "completado" && confirmacion) {
    const exito = confirmacion.creados + confirmacion.actualizados;
    return (
      <section className="space-y-4">
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.08] p-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-200">
            <Icon name="check" size={32} />
          </div>
          <h2 className="font-display text-2xl text-emerald-200">Importación completada</h2>
          <p className="mt-1 text-sm text-muted">{exito} empleados procesados con éxito.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Creados" value={confirmacion.creados} color="emerald" />
          <Stat label="Actualizados" value={confirmacion.actualizados} color="blue" />
          <Stat label="Saltados" value={confirmacion.saltados} color="violet" />
          <Stat label="Errores" value={confirmacion.errores.length} color={confirmacion.errores.length > 0 ? "red" : "violet"} />
        </div>

        {confirmacion.errores.length > 0 && (
          <div className="rounded-xl border border-red-400/30 bg-red-500/[0.04] p-4">
            <p className="mb-2 text-sm font-semibold text-red-200">Errores durante la importación:</p>
            <ul className="space-y-1 text-xs text-red-200/90">
              {confirmacion.errores.slice(0, 50).map((e, i) => (
                <li key={i}>· Fila {e.rowNumber}: {e.error}</li>
              ))}
              {confirmacion.errores.length > 50 && (
                <li className="text-muted-2">… y {confirmacion.errores.length - 50} más</li>
              )}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={reset} className="btn btn-primary">Importar otro archivo</button>
          <a href="/rh-pro/empleados" className="btn btn-ghost">Ver empleados →</a>
        </div>
      </section>
    );
  }

  return null;
}

function FilaRow({ f }: { f: FilaPreview }) {
  const bg = f.status === "error" ? "bg-red-500/[0.04]" : f.status === "warn" ? "bg-amber-500/[0.04]" : "";
  const badge = f.status === "error" ? (
    <span className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-300">ERR</span>
  ) : f.status === "warn" ? (
    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300">⚠</span>
  ) : f.matchedEmpleadoId ? (
    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-300">UPD</span>
  ) : (
    <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300">NEW</span>
  );

  return (
    <tr className={`border-t border-white/5 ${bg}`}>
      <td className="px-2 py-1.5 font-mono text-muted-2">{f.rowNumber}</td>
      <td className="px-2 py-1.5">{badge}</td>
      <td className="px-2 py-1.5 font-mono text-amber-200">{f.numero_empleado ?? "—"}</td>
      <td className="px-2 py-1.5">{f.nombre || <em className="text-red-300">(vacío)</em>}</td>
      <td className="px-2 py-1.5 font-mono">
        {f.sede_abrev ?? <em className="text-red-300">?</em>}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{f.jornada ?? <em className="text-red-300">?</em>}</td>
      <td className="px-2 py-1.5 font-mono text-[10px]">{f.dia_descanso.join(",")}</td>
      <td className="px-2 py-1.5 text-right font-mono">${f.salario_diario.toFixed(2)}</td>
      <td className="px-2 py-1.5 font-mono text-[10px] text-muted">
        {f.rfc && <div className="text-amber-200">{f.rfc}</div>}
        {f.nss && <div className="text-muted-2">{f.nss}</div>}
        {!f.rfc && !f.nss && <span className="text-muted-2">—</span>}
      </td>
      <td className="px-2 py-1.5 font-mono text-[10px]">
        {f.banco && <div className="text-emerald-200">{f.banco}</div>}
        {f.clabe && <div className="text-muted-2">{f.clabe}</div>}
        {!f.banco && !f.clabe && <span className="text-muted-2">—</span>}
      </td>
      <td className="px-2 py-1.5 text-[10px]">
        {f.errors.length > 0 && (
          <p className="text-red-300">{f.errors.join(" · ")}</p>
        )}
        {f.warnings.length > 0 && (
          <p className="text-amber-200/80">{f.warnings.join(" · ")}</p>
        )}
      </td>
    </tr>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: "blue" | "emerald" | "amber" | "red" | "violet" }) {
  const cls = {
    blue: "border-blue-400/30 bg-blue-500/[0.06] text-blue-200",
    emerald: "border-emerald-400/30 bg-emerald-500/[0.06] text-emerald-200",
    amber: "border-amber-400/30 bg-amber-500/[0.06] text-amber-200",
    red: "border-red-400/30 bg-red-500/[0.06] text-red-200",
    violet: "border-violet-400/30 bg-violet-500/[0.06] text-violet-200",
  }[color];
  return (
    <div className={`rounded-xl border px-3 py-2 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-80">{label}</div>
    </div>
  );
}
