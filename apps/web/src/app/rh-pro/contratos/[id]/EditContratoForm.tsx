"use client";

import { useEffect, useState, useTransition } from "react";
import { VortexLoader } from "@/components/VortexLoader";
import { useRouter } from "next/navigation";
import { sueldoEnLetra } from "@vertice/shared/numbers";
import { actualizarContratoAction } from "./actions";

export interface ContratoFullRow {
  id: string;
  contrato_id: string;
  empleado_id: string | null;
  sexo: "HOMBRE" | "MUJER";
  nombre_trabajador: string;
  rfc: string | null;
  domicilio_completo: string;
  cp: string | null;
  sede_id: string;
  puesto: string;
  sueldo_mensual: number;
  sueldo_mensual_letra: string;
  fecha_inicio_texto: string;
  fecha_fin_texto: string;
  fecha_firma_texto: string;
  hora_inicio: string;
  hora_fin: string;
  jornada_descripcion: string;
  jornada_horas: number;
  dia_descanso_texto: string;
  observaciones: string | null;
  status_pdf: string;
  pdf_storage_path: string | null;
  fecha_captura: string;
  plantilla_usada: string | null;
  sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null;
}

export function EditContratoForm({ contrato }: { contrato: ContratoFullRow }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [autoLetra, setAutoLetra] = useState(false);
  const [regenerarPdf, setRegenerarPdf] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ pdfUrl: string | null; pdfError?: string | undefined } | null>(null);

  const [f, setF] = useState({
    sexo: contrato.sexo,
    nombre_trabajador: contrato.nombre_trabajador,
    rfc: contrato.rfc ?? "",
    domicilio_completo: contrato.domicilio_completo,
    cp: contrato.cp ?? "",
    puesto: contrato.puesto,
    sueldo_mensual: Number(contrato.sueldo_mensual),
    sueldo_mensual_letra: contrato.sueldo_mensual_letra,
    fecha_inicio_texto: contrato.fecha_inicio_texto,
    fecha_fin_texto: contrato.fecha_fin_texto,
    fecha_firma_texto: contrato.fecha_firma_texto,
    hora_inicio: contrato.hora_inicio,
    hora_fin: contrato.hora_fin,
    jornada_descripcion: contrato.jornada_descripcion,
    jornada_horas: contrato.jornada_horas,
    dia_descanso_texto: contrato.dia_descanso_texto,
    observaciones: contrato.observaciones ?? "",
  });

  useEffect(() => {
    if (!autoLetra) return;
    if (!f.sueldo_mensual || f.sueldo_mensual <= 0) return;
    const letra = sueldoEnLetra(f.sueldo_mensual);
    setF((prev) => (prev.sueldo_mensual_letra === letra ? prev : { ...prev, sueldo_mensual_letra: letra }));
  }, [f.sueldo_mensual, autoLetra]);

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function submit() {
    setError(null);
    setSuccess(null);
    if (!f.nombre_trabajador.trim() || !f.domicilio_completo.trim()) {
      setError("Faltan campos obligatorios.");
      return;
    }
    startTransition(async () => {
      const r = await actualizarContratoAction({
        id: contrato.id,
        sexo: f.sexo,
        nombre_trabajador: f.nombre_trabajador,
        rfc: f.rfc || null,
        domicilio_completo: f.domicilio_completo,
        cp: f.cp || null,
        puesto: f.puesto,
        sueldo_mensual: f.sueldo_mensual,
        sueldo_mensual_letra: f.sueldo_mensual_letra,
        fecha_inicio_texto: f.fecha_inicio_texto,
        fecha_fin_texto: f.fecha_fin_texto,
        fecha_firma_texto: f.fecha_firma_texto,
        hora_inicio: f.hora_inicio,
        hora_fin: f.hora_fin,
        jornada_descripcion: f.jornada_descripcion,
        jornada_horas: f.jornada_horas,
        dia_descanso_texto: f.dia_descanso_texto,
        observaciones: f.observaciones || null,
        regenerar_pdf: regenerarPdf,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        setSuccess({ pdfUrl: r.pdfUrl, pdfError: r.pdfError });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5 animate-fade-up delay-100">
      {/* Sección 1: Identidad */}
      <section className="surface-glow p-5">
        <div className="section-label">Identidad del trabajador</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label>Nombre completo *</label>
            <input type="text" value={f.nombre_trabajador} onChange={(e) => set("nombre_trabajador", e.target.value)} />
          </div>
          <div className="field">
            <label>Sexo *</label>
            <div className="flex gap-2">
              {(["HOMBRE", "MUJER"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("sexo", s)}
                  className={`btn flex-1 ${f.sexo === s ? (s === "MUJER" ? "btn-violet" : "btn-primary") : "btn-ghost"}`}
                >
                  {s === "HOMBRE" ? "♂ Hombre" : "♀ Mujer"}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>RFC</label>
            <input type="text" value={f.rfc} onChange={(e) => set("rfc", e.target.value.toUpperCase())} maxLength={13} />
          </div>
          <div className="field sm:col-span-2">
            <label>Domicilio completo *</label>
            <input type="text" value={f.domicilio_completo} onChange={(e) => set("domicilio_completo", e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label>Código postal</label>
            <input type="text" value={f.cp} onChange={(e) => set("cp", e.target.value)} maxLength={5} />
          </div>
          <div className="field">
            <label>Puesto</label>
            <input type="text" value={f.puesto} onChange={(e) => set("puesto", e.target.value.toUpperCase())} />
          </div>
        </div>
      </section>

      {/* Sección 2: Sueldo */}
      <section className="surface-glow p-5">
        <div className="section-label">Sueldo</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field">
            <label>Sueldo mensual *</label>
            <input
              type="number"
              step="0.01"
              value={f.sueldo_mensual}
              onChange={(e) => set("sueldo_mensual", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <div className="flex items-baseline justify-between">
              <label>Sueldo en letra *</label>
              <label className="flex items-center gap-1.5 text-[10px] uppercase tracking-tagline text-muted">
                <input type="checkbox" checked={autoLetra} onChange={(e) => setAutoLetra(e.target.checked)} className="accent-[color:var(--blue)]" />
                Auto
              </label>
            </div>
            <input
              type="text"
              value={f.sueldo_mensual_letra}
              onChange={(e) => { set("sueldo_mensual_letra", e.target.value.toUpperCase()); setAutoLetra(false); }}
            />
          </div>
        </div>
      </section>

      {/* Sección 3: Jornada */}
      <section className="surface-glow p-5">
        <div className="section-label">Jornada operativa</div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="field">
            <label>Hora inicio</label>
            <input type="text" value={f.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} />
          </div>
          <div className="field">
            <label>Hora fin</label>
            <input type="text" value={f.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} />
          </div>
          <div className="field">
            <label>Horas</label>
            <input type="number" min={1} max={12} value={f.jornada_horas} onChange={(e) => set("jornada_horas", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Día descanso</label>
            <input type="text" value={f.dia_descanso_texto} onChange={(e) => set("dia_descanso_texto", e.target.value)} />
          </div>
          <div className="field sm:col-span-4">
            <label>Descripción de jornada</label>
            <input type="text" value={f.jornada_descripcion} onChange={(e) => set("jornada_descripcion", e.target.value)} />
          </div>
        </div>
      </section>

      {/* Sección 4: Período */}
      <section className="surface-glow p-5">
        <div className="section-label">Período del contrato (texto)</div>
        <div className="grid gap-4">
          <div className="field"><label>Fecha de inicio *</label>
            <input type="text" value={f.fecha_inicio_texto} onChange={(e) => set("fecha_inicio_texto", e.target.value)} /></div>
          <div className="field"><label>Fecha de fin *</label>
            <input type="text" value={f.fecha_fin_texto} onChange={(e) => set("fecha_fin_texto", e.target.value)} /></div>
          <div className="field"><label>Fecha de firma *</label>
            <input type="text" value={f.fecha_firma_texto} onChange={(e) => set("fecha_firma_texto", e.target.value)} /></div>
          <div className="field"><label>Observaciones</label>
            <textarea rows={2} value={f.observaciones} onChange={(e) => set("observaciones", e.target.value)} /></div>
        </div>
      </section>

      {/* Feedback */}
      {error && (
        <div className="rounded-xl border border-[rgba(239,68,68,0.4)] bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-[#FCA5A5]">
          ⚠ {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-[rgba(16,185,129,0.4)] bg-[rgba(16,185,129,0.1)] px-4 py-3 text-sm text-[#6EE7B7]">
          <p>✓ Contrato actualizado.</p>
          {success.pdfUrl && (
            <p className="mt-2">
              📄 <a href={success.pdfUrl} target="_blank" rel="noopener" className="underline font-semibold">
                Descargar PDF actualizado
              </a> <span className="text-muted-2 ml-2">(válida 1h)</span>
            </p>
          )}
          {success.pdfError && (
            <p className="mt-2 text-[#FCD34D]">⚠ Datos guardados pero error regenerando PDF: {success.pdfError}</p>
          )}
        </div>
      )}

      {/* Submit bar */}
      <div className="sticky bottom-0 -mx-4 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={regenerarPdf}
              onChange={(e) => setRegenerarPdf(e.target.checked)}
              className="accent-[color:var(--blue)]"
            />
            Regenerar PDF al guardar
          </label>
          <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary">
            {isPending ? (
              <>
                <span className="loader-vortex-sm" />
                Guardando...
              </>
            ) : (
              <>💾 Guardar cambios</>
            )}
          </button>
        </div>
      </div>

      {isPending && (
        <div className="overlay-loader">
          <VortexLoader size={64} />
          <p className="overlay-loader-text">Actualizando contrato{regenerarPdf ? " y regenerando PDF" : ""}...</p>
        </div>
      )}
    </div>
  );
}
