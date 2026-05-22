import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contratos · RH Pro" };

interface SedeRow { id: string; abrev: string; nombre: string }
interface ContratoRow {
  id: string;
  contrato_id: string;
  nombre_trabajador: string;
  sexo: string;
  sede_id: string;
  rfc: string | null;
  sueldo_mensual: number;
  fecha_captura: string;
  status_pdf: string;
  pdf_storage_path: string | null;
  empleado_id: string | null;
}

interface PageProps {
  searchParams: Promise<{ q?: string; sede?: string; status?: string; page?: string }>;
}

const PAGE_SIZE = 25;

export default async function ContratosListPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sedeFilter = params.sede ?? "";
  const statusFilter = params.status ?? "";
  const page = Math.max(1, Number(params.page ?? "1"));
  const offset = (page - 1) * PAGE_SIZE;

  // Filters
  let qb = supabase
    .from("contratos")
    .select(
      "id, contrato_id, nombre_trabajador, sexo, sede_id, rfc, sueldo_mensual, fecha_captura, status_pdf, pdf_storage_path, empleado_id",
      { count: "exact" },
    );
  if (q) qb = qb.or(`nombre_trabajador.ilike.%${q}%,contrato_id.ilike.%${q}%`);
  if (sedeFilter) qb = qb.eq("sede_id", sedeFilter);
  if (statusFilter) qb = qb.eq("status_pdf", statusFilter);

  const { data: rows, count } = await qb
    .order("fecha_captura", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  const contratos = (rows ?? []) as ContratoRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: sedes } = await supabase.from("sedes").select("id, abrev, nombre").order("nombre");
  const sedesMap = new Map(((sedes ?? []) as SedeRow[]).map((s) => [s.id, s]));

  function urlFor(next: Partial<{ q: string; sede: string; status: string; page: string }>): string {
    const usp = new URLSearchParams();
    const merged = { q, sede: sedeFilter, status: statusFilter, page: String(page), ...next };
    if (merged.q) usp.set("q", merged.q);
    if (merged.sede) usp.set("sede", merged.sede);
    if (merged.status) usp.set("status", merged.status);
    if (Number(merged.page) > 1) usp.set("page", String(merged.page));
    return `/rh-pro/contratos${usp.toString() ? "?" + usp.toString() : ""}`;
  }

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
            <p className="role-badge role-ADMIN mt-2 mb-2">Contratos · ADMIN+</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              Lista de <span className="text-gradient-blue serif-italic">contratos</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {total} contrato{total === 1 ? "" : "s"} · página {page} de {totalPages}
            </p>
          </div>
          <Link href="/rh-pro/alta" className="btn btn-primary">+ Nueva alta</Link>
        </header>

        {/* Filtros */}
        <form className="mb-5 grid gap-3 surface-glow p-4 sm:grid-cols-[2fr_1fr_1fr_auto]" action="/rh-pro/contratos" method="GET">
          <div className="field">
            <label>Buscar (nombre o folio)</label>
            <input type="text" name="q" defaultValue={q} placeholder="AKE CANUL... o MHS/SHO058/2026" />
          </div>
          <div className="field">
            <label>Sede</label>
            <select name="sede" defaultValue={sedeFilter}>
              <option value="">Todas</option>
              {(sedes ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.abrev}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Status PDF</label>
            <select name="status" defaultValue={statusFilter}>
              <option value="">Todos</option>
              <option value="GENERADO">Generado</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="ERROR">Error</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn btn-primary">Filtrar</button>
            {(q || sedeFilter || statusFilter) && (
              <Link href="/rh-pro/contratos" className="btn btn-ghost">Limpiar</Link>
            )}
          </div>
        </form>

        {/* Tabla */}
        {contratos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            Sin resultados con esos filtros.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--border)] bg-[color:var(--card)]">
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--surface)] text-[10px] uppercase tracking-tagline text-muted">
                <tr>
                  <th className="px-3 py-2 text-left">Folio</th>
                  <th className="px-3 py-2 text-left">Trabajador</th>
                  <th className="px-3 py-2 text-center">Sexo</th>
                  <th className="px-3 py-2 text-left">Sede</th>
                  <th className="px-3 py-2 text-right">Sueldo</th>
                  <th className="px-3 py-2 text-center">Fecha</th>
                  <th className="px-3 py-2 text-center">PDF</th>
                  <th className="px-3 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {contratos.map((c) => {
                  const sede = sedesMap.get(c.sede_id);
                  return (
                    <tr key={c.id} className="border-t border-[color:var(--border)] hover:bg-white/[0.02]">
                      <td className="px-3 py-2 font-mono text-xs text-[#93C5FD]">{c.contrato_id}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{c.nombre_trabajador}</p>
                        {c.rfc && <p className="font-mono text-[10px] text-muted-2">{c.rfc}</p>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`pill ${c.sexo === "MUJER" ? "pill-violet" : "pill-blue"}`} style={{ padding: "1px 6px", fontSize: 9 }}>{c.sexo}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="font-mono text-muted">{sede?.abrev ?? "—"}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">
                        ${Number(c.sueldo_mensual).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2 text-center text-xs text-muted">
                        {new Date(c.fecha_captura).toLocaleDateString("es-MX", { dateStyle: "short" })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {c.status_pdf === "GENERADO" && c.pdf_storage_path ? (
                          <a
                            href={`/api/contratos/${c.id}/pdf`}
                            target="_blank"
                            rel="noopener"
                            className="inline-flex items-center gap-1 rounded-md bg-[rgba(16,185,129,0.18)] px-2 py-1 text-[10px] font-bold text-[#6EE7B7] hover:bg-[rgba(16,185,129,0.35)]"
                          >
                            📄 Descargar
                          </a>
                        ) : c.status_pdf === "ERROR" ? (
                          <span className="pill pill-red" style={{ padding: "1px 6px", fontSize: 9 }}>ERROR</span>
                        ) : (
                          <span className="pill pill-amber" style={{ padding: "1px 6px", fontSize: 9 }}>PEND.</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Link
                          href={`/rh-pro/contratos/${c.id}`}
                          className="rounded-md border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-[10px] font-bold text-muted hover:text-text hover:border-[color:var(--blue)]"
                        >
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between text-xs text-muted">
            <div>
              Página {page} de {totalPages} · {total} total
            </div>
            <div className="flex gap-2">
              {page > 1 && <Link href={urlFor({ page: String(page - 1) })} className="btn btn-ghost btn-sm">← Anterior</Link>}
              {page < totalPages && <Link href={urlFor({ page: String(page + 1) })} className="btn btn-primary btn-sm">Siguiente →</Link>}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
