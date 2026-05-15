import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { AltaForm } from "./AltaForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alta de empleado · RH Pro" };

interface SedeRow { id: string; codigo: string; abrev: string; nombre: string; ultimo_folio: number }
interface ConfigRow { clave: string; valor: string }
interface ContratoRow {
  id: string;
  contrato_id: string;
  nombre_trabajador: string;
  sexo: string;
  sede_id: string;
  fecha_captura: string;
  status_pdf: string;
}

export default async function AltaPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  // Sedes con su ultimo_folio para preview
  const { data: sedesRaw } = await supabase
    .from("sedes")
    .select("id, codigo, abrev, nombre, ultimo_folio")
    .order("nombre");
  const sedes = (sedesRaw ?? []) as SedeRow[];

  // Constantes
  const { data: cfgRaw } = await supabase.from("config_contratos").select("clave, valor");
  const cfg: Record<string, string> = {};
  for (const c of (cfgRaw ?? []) as ConfigRow[]) cfg[c.clave] = c.valor;

  // Últimos contratos (lista)
  const { data: ultRaw } = await supabase
    .from("contratos")
    .select("id, contrato_id, nombre_trabajador, sexo, sede_id, fecha_captura, status_pdf")
    .order("fecha_captura", { ascending: false })
    .limit(20);
  const ultimos = (ultRaw ?? []) as ContratoRow[];
  const sedesMap = new Map(sedes.map((s) => [s.id, s]));

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/rh-pro" className="text-xs text-muted hover:text-text">← RH Pro</Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Alta · Solo ADMIN/SUPERADMIN</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Nueva <span className="text-gradient-blue serif-italic">contratación</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Captura los datos del trabajador. Vortex genera el folio del contrato automáticamente
            (formato <span className="font-mono">MHS/&lt;ABREV&gt;/NNN/2026</span>), crea el registro en
            <span className="font-mono"> empleados</span> y lo deja listo para pase de lista.
            La generación del PDF del contrato firmado viene en el siguiente release.
          </p>
        </header>

        <AltaForm sedes={sedes} config={cfg} />

        <section className="mt-12 animate-fade-up delay-100">
          <div className="section-label">Últimos contratos generados</div>
          {ultimos.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-8 text-center text-sm text-muted">
              Aún no hay contratos. Crea el primero arriba.
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
                    <th className="px-3 py-2 text-center">Fecha</th>
                    <th className="px-3 py-2 text-center">Estado PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimos.map((c) => {
                    const sede = sedesMap.get(c.sede_id);
                    return (
                      <tr key={c.id} className="border-t border-[color:var(--border)] hover:bg-white/[0.02]">
                        <td className="px-3 py-2 font-mono text-xs text-[#93C5FD]">{c.contrato_id}</td>
                        <td className="px-3 py-2 font-medium">{c.nombre_trabajador}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`pill ${c.sexo === "MUJER" ? "pill-violet" : "pill-blue"}`}>{c.sexo}</span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {sede ? (
                            <>
                              <span className="font-mono text-muted">{sede.abrev}</span> · {sede.nombre}
                            </>
                          ) : (
                            <span className="text-muted-2">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-muted">
                          {new Date(c.fecha_captura).toLocaleDateString("es-MX", { dateStyle: "medium" })}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={`pill ${c.status_pdf === "GENERADO" ? "pill-green" : "pill-amber"}`}>{c.status_pdf}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
