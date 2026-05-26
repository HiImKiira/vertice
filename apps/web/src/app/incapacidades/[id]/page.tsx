import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import {
  TIPO_SPECS,
  ESTADO_SPECS,
  type IncapacidadEstado,
  type IncapacidadTipo,
} from "@/lib/incapacidades";
import { EstadoActions } from "./EstadoActions";
import { DocumentosPanel } from "./DocumentosPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Incapacidad · Vortex" };

interface PageProps { params: Promise<{ id: string }> }

interface Raw {
  id: string;
  tipo: IncapacidadTipo;
  estado: IncapacidadEstado;
  fecha_accidente: string | null;
  hora_accidente: string | null;
  descripcion: string | null;
  lugar_accidente: string | null;
  testigos: string | null;
  folio_st7: string | null;
  diagnostico_nosologico: string | null;
  unidad_medica: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  dias_autorizados: number | null;
  calificada: boolean | null;
  dictamen_fecha: string | null;
  dictamen_notas: string | null;
  observaciones: string | null;
  creado_en: string;
  reportada_por: string | null;
  empleados: { id: string; nombre: string; numero_empleado: string; jornada: string; sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null } | { id: string; nombre: string; numero_empleado: string; jornada: string; sedes: { abrev: string; nombre: string } | { abrev: string; nombre: string }[] | null }[] | null;
  reporter: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
}

interface RawEvento {
  id: number;
  tipo: string;
  estado_anterior: IncapacidadEstado | null;
  estado_nuevo: IncapacidadEstado | null;
  detalle: string | null;
  creado_en: string;
  usuarios: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
}

export default async function IncapacidadDetailPage({ params }: PageProps) {
  const { profile } = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const isAdmin = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  const { data: raw } = await supabase
    .from("incapacidades")
    .select(`
      id, tipo, estado, fecha_accidente, hora_accidente, descripcion, lugar_accidente,
      testigos, folio_st7, diagnostico_nosologico, unidad_medica, fecha_inicio, fecha_fin,
      dias_autorizados, calificada, dictamen_fecha, dictamen_notas, observaciones, creado_en,
      reportada_por,
      empleados(id, nombre, numero_empleado, jornada, sedes(abrev, nombre)),
      reporter:reportada_por(nombre, username)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!raw) notFound();
  const incap = raw as unknown as Raw;
  const emp = Array.isArray(incap.empleados) ? incap.empleados[0] : incap.empleados;
  const sede = emp && (Array.isArray(emp.sedes) ? emp.sedes[0] : emp.sedes);
  const reporter = Array.isArray(incap.reporter) ? incap.reporter[0] : incap.reporter;

  // Timeline
  const { data: evRaw } = await supabase
    .from("incapacidad_eventos")
    .select("id, tipo, estado_anterior, estado_nuevo, detalle, creado_en, usuarios:usuario_id(nombre, username)")
    .eq("incapacidad_id", id)
    .order("creado_en", { ascending: false });
  const eventos = (evRaw ?? []) as unknown as RawEvento[];

  // Documentos
  const { data: docsRaw } = await supabase
    .from("incapacidad_documentos")
    .select(`
      id, tipo, archivo_nombre, mime, "tamaño_bytes", subido_en,
      usuarios:subido_por(nombre, username)
    `)
    .eq("incapacidad_id", id)
    .order("subido_en", { ascending: false });
  const documentos = ((docsRaw ?? []) as Array<{
    id: string;
    tipo: string;
    archivo_nombre: string | null;
    mime: string | null;
    "tamaño_bytes": number | null;
    subido_en: string;
    usuarios: { nombre: string; username: string } | { nombre: string; username: string }[] | null;
  }>).map((d) => {
    const u = Array.isArray(d.usuarios) ? d.usuarios[0] : d.usuarios;
    return {
      id: d.id,
      tipo: d.tipo,
      archivo_nombre: d.archivo_nombre,
      mime: d.mime,
      tamano_bytes: d["tamaño_bytes"],
      subido_en: d.subido_en,
      subido_por_nombre: u?.nombre ?? null,
      subido_por_username: u?.username ?? null,
    };
  });

  const tipoSpec = TIPO_SPECS[incap.tipo];
  const estadoSpec = ESTADO_SPECS[incap.estado];
  const cerrada = ["CERRADA", "RECHAZADA", "CANCELADA"].includes(incap.estado);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/incapacidades" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Incapacidades
        </Link>

        <header className="mt-2 mb-6 animate-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded px-2 py-0.5 font-mono text-[10px] font-bold text-white" style={{ background: tipoSpec.color }}>
              {tipoSpec.short} · {tipoSpec.label}
            </span>
            <span
              className="rounded px-2 py-0.5 font-mono text-[10px] font-bold"
              style={{ background: `${estadoSpec.color}22`, color: estadoSpec.color, border: `1px solid ${estadoSpec.color}55` }}
            >
              {estadoSpec.label}
            </span>
            {incap.calificada === true && <span className="pill pill-green">CALIFICADA RT</span>}
            {incap.calificada === false && <span className="pill pill-red">NO RT</span>}
          </div>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">{emp?.nombre ?? "—"}</h1>
          <p className="mt-1 text-xs text-muted">
            #{emp?.numero_empleado ?? "—"} ·{" "}
            {sede && <><span className="font-mono">{sede.abrev}</span> · {sede.nombre} · </>}
            {emp?.jornada} · reportada {new Date(incap.creado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
            {reporter && <> por <span className="font-mono">@{reporter.username}</span></>}
          </p>
        </header>

        {tipoSpec.id === "RIESGO_BIOLOGICO" && (
          <div className="mb-4 rounded-xl border border-red-400/40 bg-red-500/[0.08] p-3 text-xs text-red-200">
            <p className="flex items-start gap-2">
              <Icon name="alert-triangle" size={14} className="mt-0.5 shrink-0" />
              <span>
                <strong>ALERTA ST-9:</strong> Este tipo de incapacidad puede activar auditoría IMSS sin aviso previo
                a las instalaciones. Verifica que EPP y protocolos estén documentados. Multas superiores a $100,000 pesos.
              </span>
            </p>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          {/* Columna izquierda: info */}
          <div className="space-y-4">
            <section className="surface-card p-4">
              <h2 className="mb-3 font-display text-sm">Datos del caso</h2>
              <dl className="space-y-2 text-xs">
                {incap.fecha_accidente && (
                  <Row label="Fecha accidente" value={`${incap.fecha_accidente}${incap.hora_accidente ? ` ${incap.hora_accidente.slice(0,5)}` : ""}`} />
                )}
                {incap.lugar_accidente && <Row label="Lugar" value={incap.lugar_accidente} />}
                {incap.descripcion && <Row label="Descripción" value={incap.descripcion} block />}
                {incap.testigos && <Row label="Testigos" value={incap.testigos} />}
                {incap.fecha_inicio && <Row label="Inicio incapacidad" value={incap.fecha_inicio} />}
                {incap.dias_autorizados !== null && <Row label="Días autorizados" value={String(incap.dias_autorizados)} />}
                {incap.unidad_medica && <Row label="UMF" value={incap.unidad_medica} />}
                {incap.folio_st7 && <Row label="Folio ST-7" value={incap.folio_st7} />}
                {incap.diagnostico_nosologico && <Row label="Diagnóstico" value={incap.diagnostico_nosologico} block />}
                {incap.dictamen_fecha && <Row label="Dictamen IMSS" value={`${incap.dictamen_fecha}${incap.dictamen_notas ? ` — ${incap.dictamen_notas}` : ""}`} block />}
                {incap.observaciones && <Row label="Obs. internas" value={incap.observaciones} block />}
              </dl>
            </section>

            {/* Documentos del expediente */}
            <DocumentosPanel
              incapacidadId={incap.id}
              documentos={documentos}
              tiposRequeridos={tipoSpec.documentosRequeridos.map((d) => ({
                tipo: d.tipo,
                label: d.label,
                etapa: ESTADO_SPECS[d.etapa].label,
              }))}
              isAdmin={isAdmin}
            />

            {/* Documentos requeridos por tipo — guía */}
            <section className="surface-card p-4">
              <h2 className="mb-3 font-display text-sm">Documentos requeridos del flujo</h2>
              <ul className="space-y-1.5 text-[11px]">
                {tipoSpec.documentosRequeridos.map((d) => {
                  const yaSubido = documentos.some((doc) => doc.tipo === d.tipo);
                  return (
                    <li key={d.tipo} className="flex items-start gap-2">
                      <Icon
                        name={yaSubido ? "check" : "file-text"}
                        size={11}
                        className={`mt-0.5 shrink-0 ${yaSubido ? "text-emerald-300" : "text-muted"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={yaSubido ? "text-emerald-200" : ""}>
                          {d.label} {yaSubido && <span className="text-emerald-400">· ✓ ya subido</span>}
                        </p>
                        <p className="text-[10px] text-muted-2">Etapa: {ESTADO_SPECS[d.etapa].label}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Flujo de etapas */}
            <section className="surface-card p-4">
              <h2 className="mb-3 font-display text-sm">Flujo del tipo</h2>
              <ol className="space-y-1.5 text-[11px]">
                {tipoSpec.flujoEstados.map((e, i) => {
                  const es = ESTADO_SPECS[e];
                  const isActive = e === incap.estado;
                  const pasada = ESTADO_SPECS[e].orden < ESTADO_SPECS[incap.estado].orden;
                  return (
                    <li
                      key={e}
                      className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${
                        isActive ? "border-blue-400/50 bg-blue-500/15" : pasada ? "border-emerald-400/20 bg-emerald-500/5" : "border-white/5 bg-white/[0.02]"
                      }`}
                    >
                      <span className="font-mono text-[10px] text-muted-2">{i + 1}.</span>
                      <div className="min-w-0 flex-1">
                        <p className={`font-semibold ${isActive ? "text-blue-200" : pasada ? "text-emerald-300" : "text-muted"}`}>
                          {es.label} {isActive && "← actual"}
                        </p>
                        <p className="text-[10px] text-muted-2">{es.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          {/* Columna derecha: acciones + timeline */}
          <div className="space-y-4">
            {!cerrada && (
              <EstadoActions
                incapacidadId={incap.id}
                estadoActual={incap.estado}
                tipo={incap.tipo}
                isAdmin={isAdmin}
              />
            )}

            <section>
              <div className="section-label mb-3">Timeline ({eventos.length})</div>
              {eventos.length === 0 ? (
                <p className="rounded-md border border-dashed border-white/10 bg-[color:var(--card)] p-4 text-center text-xs text-muted">
                  Sin eventos todavía.
                </p>
              ) : (
                <ol className="space-y-2">
                  {eventos.map((ev) => {
                    const u = Array.isArray(ev.usuarios) ? ev.usuarios[0] : ev.usuarios;
                    const esEstado = ev.tipo === "estado_cambio";
                    const colorN = ev.estado_nuevo ? ESTADO_SPECS[ev.estado_nuevo].color : "#94a3b8";
                    return (
                      <li
                        key={ev.id}
                        className="rounded-md border border-white/5 bg-[color:var(--card)] p-3 text-xs"
                        style={esEstado ? { borderLeft: `3px solid ${colorN}` } : undefined}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {ev.tipo === "creada" && <Icon name="plus" size={11} className="text-blue-300" />}
                            {ev.tipo === "estado_cambio" && <span style={{ color: colorN }}><Icon name="arrow-right" size={11} /></span>}
                            {ev.tipo === "comentario" && <Icon name="message-circle" size={11} className="text-muted" />}
                            <span className="font-semibold">
                              {ev.tipo === "creada" && "Reportada"}
                              {ev.tipo === "estado_cambio" && (
                                <>
                                  {ev.estado_anterior ? ESTADO_SPECS[ev.estado_anterior].label : "—"}
                                  {" → "}
                                  <span style={{ color: colorN }}>{ev.estado_nuevo ? ESTADO_SPECS[ev.estado_nuevo].label : "—"}</span>
                                </>
                              )}
                              {ev.tipo === "comentario" && "Comentario"}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-muted-2">
                            {new Date(ev.creado_en).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                          </span>
                        </div>
                        {ev.detalle && <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-muted">{ev.detalle}</p>}
                        {u && (
                          <p className="mt-1 text-[10px] text-muted-2">
                            por <span className="font-mono">@{u.username}</span>
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value, block }: { label: string; value: string; block?: boolean }) {
  return (
    <div className={block ? "" : "flex items-baseline gap-2"}>
      <dt className="text-[10px] uppercase tracking-tagline text-muted-2">{label}</dt>
      <dd className={`${block ? "mt-0.5" : "flex-1"} whitespace-pre-wrap text-text`}>{value}</dd>
    </div>
  );
}
