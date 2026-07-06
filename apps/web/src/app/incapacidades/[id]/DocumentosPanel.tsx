"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import {
  subirDocumentoAction,
  getDocumentoUrlAction,
  eliminarDocumentoAction,
} from "../documentos-actions";

interface Doc {
  id: string;
  tipo: string;
  archivo_nombre: string | null;
  mime: string | null;
  tamano_bytes: number | null;
  subido_en: string;
  subido_por_nombre: string | null;
  subido_por_username: string | null;
}

const TIPO_LABELS: Record<string, string> = {
  ST7_INICIAL: "ST-7 inicial (médico familiar)",
  ST7_DICTAMEN: "ST-7 con dictamen IMSS",
  ST2_ALTA: "ST-2 (hoja de alta)",
  INCAPACIDAD_MEDICO: "Incapacidad médica",
  MAPA_TRAYECTO: "Mapa de trayecto",
  ST9: "ST-9 (riesgo biológico)",
  OTRO: "Otro documento",
};

function bytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconForMime(mime: string | null) {
  if (!mime) return "file-text" as const;
  if (mime.startsWith("image/")) return "camera" as const;
  return "file-text" as const;
}

interface Props {
  incapacidadId: string;
  documentos: Doc[];
  tiposRequeridos: { tipo: string; label: string; etapa: string }[];
  isAdmin: boolean;
}

export function DocumentosPanel({ incapacidadId, documentos, tiposRequeridos, isAdmin }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [tipo, setTipo] = useState<string>(tiposRequeridos[0]?.tipo ?? "OTRO");
  const [msg, setMsg] = useState<string | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setMsg(null);
  }

  async function upload() {
    if (!file) { setMsg("Selecciona un archivo"); return; }
    setMsg("Subiendo...");
    start(async () => {
      const fd = new FormData();
      fd.append("incapacidad_id", incapacidadId);
      fd.append("tipo", tipo);
      fd.append("archivo", file);
      const r = await subirDocumentoAction(fd);
      if (!r.ok) {
        setMsg(`Error: ${r.error}`);
        return;
      }
      setMsg(`✓ Subido como ${tipo}`);
      setFile(null);
      // Limpia el input file (es semicontrolado)
      const input = document.getElementById("incap-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
      router.refresh();
    });
  }

  async function descargar(docId: string) {
    setMsg(null);
    start(async () => {
      const r = await getDocumentoUrlAction(docId);
      if (!r.ok) { setMsg(`Error: ${r.error}`); return; }
      window.open(r.url, "_blank", "noopener");
    });
  }

  async function eliminar(docId: string, nombre: string | null) {
    if (!confirm(`¿Eliminar "${nombre ?? "este documento"}"? Esta acción no se puede deshacer.`)) return;
    setMsg(null);
    start(async () => {
      const r = await eliminarDocumentoAction(docId);
      if (!r.ok) { setMsg(`Error: ${r.error}`); return; }
      router.refresh();
    });
  }

  // ¿Qué tipos ya están cubiertos?
  const cubiertos = new Set(documentos.map((d) => d.tipo));

  // Selector con TODOS los tipos de documento: primero los requeridos del flujo
  // de este tipo, luego cualquier otro. Así se puede subir el documento que se
  // necesite, no solo los del flujo (ST-7, ST-2, ST-9, mapa, incapacidad, otro).
  const requeridosSet = new Set(tiposRequeridos.map((t) => t.tipo));
  const tiposParaSelect: { tipo: string; label: string; requerido: boolean }[] = [
    ...tiposRequeridos.map((t) => ({ tipo: t.tipo, label: t.label, requerido: true })),
    ...Object.keys(TIPO_LABELS)
      .filter((t) => !requeridosSet.has(t))
      .map((t) => ({ tipo: t, label: TIPO_LABELS[t] ?? t, requerido: false })),
  ];

  return (
    <section className="surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm">Documentos del expediente ({documentos.length})</h2>
      </div>

      {/* Upload */}
      <div className="mb-4 rounded-xl border border-blue-400/25 bg-blue-500/[0.04] p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon name="upload" size={14} className="text-blue-300" />
          <p className="text-xs font-semibold text-blue-200">Subir documento</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className="rounded-md border border-white/10 bg-[color:var(--surface)] px-2 py-2 text-xs"
            disabled={pending}
          >
            {tiposParaSelect.map((t) => (
              <option key={t.tipo} value={t.tipo}>
                {t.label}{t.requerido ? " · requerido" : ""}{cubiertos.has(t.tipo) ? " (ya subido)" : ""}
              </option>
            ))}
          </select>
          <input
            id="incap-file-input"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={onPickFile}
            disabled={pending}
            className="text-xs text-muted file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-xs file:text-text hover:file:bg-white/20"
          />
          <button
            type="button"
            onClick={upload}
            disabled={pending || !file}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/80 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            <Icon name="upload" size={12} />
            {pending ? "..." : "Subir"}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-2">
          Puedes subir cualquier documento del expediente (ST-7, ST-2, ST-9, mapa, incapacidad médica u otro).
          PDF / JPG / PNG / WEBP / HEIC. Máx 6 MB por archivo.
        </p>
        {msg && (
          <p className="mt-2 break-words rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[10px] text-muted">
            {msg}
          </p>
        )}
      </div>

      {/* Lista de documentos */}
      {documentos.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/10 bg-white/[0.02] p-4 text-center text-xs text-muted-2">
          Sin documentos subidos todavía.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {documentos.map((d) => {
            const tipoLabel = TIPO_LABELS[d.tipo] ?? d.tipo;
            return (
              <li
                key={d.id}
                className="flex items-center gap-2 rounded-md border border-white/5 bg-[color:var(--surface)]/40 p-2 text-xs"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-300">
                  <Icon name={iconForMime(d.mime)} size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">{tipoLabel}</p>
                  <p className="truncate text-[10px] text-muted-2">
                    {d.archivo_nombre ?? "—"} · {bytes(d.tamano_bytes)} ·{" "}
                    {new Date(d.subido_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                    {d.subido_por_username && <> · <span className="font-mono">@{d.subido_por_username}</span></>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => descargar(d.id)}
                  disabled={pending}
                  className="shrink-0 rounded-md border border-blue-400/30 bg-blue-500/15 px-2 py-1 text-[10px] font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
                  title="Descargar"
                >
                  Ver
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => eliminar(d.id, d.archivo_nombre)}
                    disabled={pending}
                    className="shrink-0 rounded-md border border-red-400/30 bg-red-500/15 px-1.5 py-1 text-[10px] text-red-300 hover:bg-red-500/30 disabled:opacity-40"
                    title="Eliminar"
                  >
                    <Icon name="trash" size={10} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
