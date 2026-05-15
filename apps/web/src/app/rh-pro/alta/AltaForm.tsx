"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearContratoAction, type ContratoInput } from "./actions";

interface Sede { id: string; codigo: string; abrev: string; nombre: string; ultimo_folio: number }

const DIAS = [
  { v: "LUN", l: "Lunes" },
  { v: "MAR", l: "Martes" },
  { v: "MIE", l: "Miércoles" },
  { v: "JUE", l: "Jueves" },
  { v: "VIE", l: "Viernes" },
  { v: "SAB", l: "Sábado" },
  { v: "DOM", l: "Domingo" },
];

const JORNADAS_DB = ["MATUTINO", "VESPERTINO", "NOCTURNO", "TURNO_ROTATIVO", "CUBRETURNOS", "DIURNO"] as const;

export function AltaForm({ sedes, config }: { sedes: Sede[]; config: Record<string, string> }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ folio: string; empleadoId: string; pdfUrl: string | null; pdfError?: string | undefined } | null>(null);

  // Estado del form (con defaults de config)
  const [f, setF] = useState({
    sexo: "HOMBRE" as "HOMBRE" | "MUJER",
    nombre_trabajador: "",
    rfc: "",
    domicilio_completo: "",
    cp: "",
    sede_id: sedes[0]?.id ?? "",
    jornada_legacy: "MATUTINO" as ContratoInput["jornada_legacy"],
    dia_descanso: ["DOM"] as string[],
    puesto: config.PUESTO_DEFAULT ?? "PERSONAL DE LIMPIEZA",
    segmento_original: "",
    sueldo_mensual: 9451.20,
    sueldo_mensual_letra: "NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS 20/100 MONEDA NACIONAL",
    salario_diario: 315.04,
    fecha_inicio_texto: config.FECHA_INICIO_DEFAULT ?? "primero de abril de dos mil veintiseis",
    fecha_fin_texto: config.FECHA_FIN_DEFAULT ?? "treinta y uno de diciembre de dos mil veintiseis",
    fecha_firma_texto: "Mérida, Yucatán, al día primero de abril de dos mil veintiseis.",
    hora_inicio: config.HORA_INICIO_DEFAULT ?? "06:00",
    hora_fin: config.HORA_FIN_DEFAULT ?? "14:00",
    jornada_descripcion: config.JORNADA_DESCRIPCION_DEFAULT ?? "Lunes a sábado",
    jornada_horas: Number(config.JORNADA_HORAS_DEFAULT ?? "8"),
    dia_descanso_texto: config.DIA_DESCANSO_DEFAULT ?? "Domingo",
    observaciones: "",
  });

  const sedeActual = useMemo(() => sedes.find((s) => s.id === f.sede_id), [sedes, f.sede_id]);
  const folioPreview = sedeActual
    ? `MHS/${sedeActual.abrev}${String(sedeActual.ultimo_folio + 1).padStart(3, "0")}/2026`
    : "—";

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  function toggleDescanso(v: string) {
    setF((prev) => ({
      ...prev,
      dia_descanso: prev.dia_descanso.includes(v)
        ? prev.dia_descanso.filter((d) => d !== v)
        : [...prev.dia_descanso, v],
    }));
  }

  function submit() {
    setError(null);
    setSuccess(null);
    if (!f.nombre_trabajador.trim() || !f.sede_id || !f.domicilio_completo.trim()) {
      setError("Faltan campos obligatorios (nombre, sede, domicilio).");
      return;
    }
    startTransition(async () => {
      const r = await crearContratoAction(f);
      if (!r.ok) {
        setError(r.error);
      } else {
        setSuccess({ folio: r.folio, empleadoId: r.empleadoId, pdfUrl: r.pdfUrl, pdfError: r.pdfError });
        // limpiar nombre + rfc + domicilio (lo demás queda como defaults)
        setF((prev) => ({
          ...prev,
          nombre_trabajador: "",
          rfc: "",
          domicilio_completo: "",
          cp: "",
          observaciones: "",
        }));
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5 animate-fade-up delay-100">
      {/* Folio preview */}
      <div className="surface-glow flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-[10px] uppercase tracking-tagline text-muted">Folio siguiente</p>
          <p className="font-mono text-2xl text-[#93C5FD]">{folioPreview}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-tagline text-muted">Plantilla a usar</p>
          <p className={`pill ${f.sexo === "MUJER" ? "pill-violet" : "pill-blue"} text-sm`}>{f.sexo}</p>
        </div>
      </div>

      {/* Sección 1: Identidad */}
      <section className="surface-glow p-5">
        <div className="section-label">Identidad del trabajador</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label>Nombre completo *</label>
            <input
              type="text"
              value={f.nombre_trabajador}
              onChange={(e) => set("nombre_trabajador", e.target.value)}
              placeholder="APELLIDO PATERNO APELLIDO MATERNO NOMBRE(S)"
              autoFocus
            />
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
            <input
              type="text"
              value={f.rfc}
              onChange={(e) => set("rfc", e.target.value.toUpperCase())}
              placeholder="AAAA000000XXX"
              maxLength={13}
            />
          </div>
          <div className="field sm:col-span-2">
            <label>Domicilio completo *</label>
            <input
              type="text"
              value={f.domicilio_completo}
              onChange={(e) => set("domicilio_completo", e.target.value.toUpperCase())}
              placeholder="CALLE 00 000 INT. 00 ENTRE 00 Y 00 COL. ..., MÉRIDA, YUCATÁN"
            />
          </div>
          <div className="field">
            <label>Código postal</label>
            <input
              type="text"
              value={f.cp}
              onChange={(e) => set("cp", e.target.value)}
              placeholder="97000"
              maxLength={5}
            />
          </div>
        </div>
      </section>

      {/* Sección 2: Asignación */}
      <section className="surface-glow p-5">
        <div className="section-label">Asignación operativa</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label>Sede *</label>
            <select value={f.sede_id} onChange={(e) => set("sede_id", e.target.value)}>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.abrev} · {s.nombre} (último folio: {s.ultimo_folio})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Puesto</label>
            <input type="text" value={f.puesto} onChange={(e) => set("puesto", e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label>Segmento (opcional)</label>
            <input
              type="text"
              value={f.segmento_original}
              onChange={(e) => set("segmento_original", e.target.value)}
              placeholder="igual a Sede si no aplica"
            />
          </div>
          <div className="field">
            <label>Jornada (DB)</label>
            <select value={f.jornada_legacy} onChange={(e) => set("jornada_legacy", e.target.value as typeof f.jornada_legacy)}>
              {JORNADAS_DB.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
          </div>
          <div className="field sm:col-span-2">
            <label>Días de descanso semanal *</label>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const active = f.dia_descanso.includes(d.v);
                return (
                  <button
                    key={d.v}
                    type="button"
                    onClick={() => toggleDescanso(d.v)}
                    className={`chip-code ${active ? "chip-code-active" : ""}`}
                    style={active ? { background: "var(--blue)" } : undefined}
                  >
                    {d.l}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-2">Por default DOM. Algunos empleados (limpieza) tienen SAB + DOM.</p>
          </div>
        </div>
      </section>

      {/* Sección 3: Sueldo */}
      <section className="surface-glow p-5">
        <div className="section-label">Sueldo y compensación</div>
        <div className="grid gap-4 sm:grid-cols-3">
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
            <label>Salario diario base</label>
            <input
              type="number"
              step="0.01"
              value={f.salario_diario}
              onChange={(e) => set("salario_diario", Number(e.target.value))}
            />
          </div>
          <div className="field sm:col-span-3">
            <label>Sueldo mensual en letra (para el contrato) *</label>
            <input
              type="text"
              value={f.sueldo_mensual_letra}
              onChange={(e) => set("sueldo_mensual_letra", e.target.value.toUpperCase())}
              placeholder="NUEVE MIL CUATROCIENTOS CINCUENTA Y UN PESOS 20/100 MONEDA NACIONAL"
            />
          </div>
        </div>
      </section>

      {/* Sección 4: Jornada operativa */}
      <section className="surface-glow p-5">
        <div className="section-label">Jornada operativa (texto contrato)</div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="field">
            <label>Hora inicio</label>
            <input type="text" value={f.hora_inicio} onChange={(e) => set("hora_inicio", e.target.value)} placeholder="06:00" />
          </div>
          <div className="field">
            <label>Hora fin</label>
            <input type="text" value={f.hora_fin} onChange={(e) => set("hora_fin", e.target.value)} placeholder="14:00" />
          </div>
          <div className="field">
            <label>Horas jornada</label>
            <input
              type="number"
              value={f.jornada_horas}
              onChange={(e) => set("jornada_horas", Number(e.target.value))}
              min={1} max={12}
            />
          </div>
          <div className="field">
            <label>Día descanso (texto)</label>
            <input type="text" value={f.dia_descanso_texto} onChange={(e) => set("dia_descanso_texto", e.target.value)} placeholder="Domingo" />
          </div>
          <div className="field sm:col-span-4">
            <label>Descripción de jornada</label>
            <input type="text" value={f.jornada_descripcion} onChange={(e) => set("jornada_descripcion", e.target.value)} placeholder="Lunes a sábado" />
          </div>
        </div>
      </section>

      {/* Sección 5: Período */}
      <section className="surface-glow p-5">
        <div className="section-label">Período del contrato (texto en letra)</div>
        <div className="grid gap-4">
          <div className="field">
            <label>Fecha de inicio *</label>
            <input type="text" value={f.fecha_inicio_texto} onChange={(e) => set("fecha_inicio_texto", e.target.value)} />
          </div>
          <div className="field">
            <label>Fecha de fin *</label>
            <input type="text" value={f.fecha_fin_texto} onChange={(e) => set("fecha_fin_texto", e.target.value)} />
          </div>
          <div className="field">
            <label>Fecha de firma *</label>
            <input type="text" value={f.fecha_firma_texto} onChange={(e) => set("fecha_firma_texto", e.target.value)} />
          </div>
          <div className="field">
            <label>Observaciones (opcional)</label>
            <textarea
              rows={2}
              value={f.observaciones}
              onChange={(e) => set("observaciones", e.target.value)}
              placeholder="Notas internas para RH"
            />
          </div>
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
          <p>
            ✓ Contrato <span className="font-mono">{success.folio}</span> creado y empleado dado de alta.
          </p>
          {success.pdfUrl && (
            <p className="mt-2">
              📄 <a href={success.pdfUrl} target="_blank" rel="noopener" className="underline font-semibold">
                Descargar PDF del contrato
              </a>
              <span className="text-muted-2 ml-2">(URL válida por 1 hora)</span>
            </p>
          )}
          {success.pdfError && (
            <p className="mt-2 text-[#FCD34D]">
              ⚠ El empleado se creó pero hubo error generando el PDF: {success.pdfError}.
              Puedes regenerarlo desde la lista de contratos.
            </p>
          )}
        </div>
      )}

      {/* Submit */}
      <div className="sticky bottom-0 -mx-4 border-t border-[color:var(--border)] bg-[color:var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <span className="text-xs text-muted">
            Folio: <span className="font-mono text-[#93C5FD]">{folioPreview}</span> · Plantilla: {f.sexo}
          </span>
          <button type="button" onClick={submit} disabled={isPending} className="btn btn-primary">
            {isPending ? (
              <>
                <span className="loader-vortex-sm" />
                Creando...
              </>
            ) : (
              <>💾 Dar de alta</>
            )}
          </button>
        </div>
      </div>

      {/* Overlay loader */}
      {isPending && (
        <div className="overlay-loader">
          <div className="loader-vortex-lg" />
          <p className="overlay-loader-text">Generando folio y creando empleado...</p>
        </div>
      )}
    </div>
  );
}
