import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soporte" };

interface TicketRow {
  id: string;
  folio: string;
  tipo: string;
  prioridad: string;
  estado: string;
  asunto: string;
  ultimo_mensaje: string | null;
  ultimo_ts: string;
  apertura_ts: string;
  unread_soporte: number;
  unread_user: number;
  supervisor_id: string;
  usuarios: { nombre: string; username: string; rol: string } | { nombre: string; username: string; rol: string }[] | null;
  sedes: { abrev: string } | { abrev: string }[] | null;
}

export default async function SoportePage() {
  const { id: userId, profile } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  // Tickets: soporte ve TODOS; user solo los propios
  let q = supabase
    .from("tickets_soporte")
    .select(`
      id, folio, tipo, prioridad, estado, ultimo_mensaje, ultimo_ts, apertura_ts,
      unread_soporte, unread_user, supervisor_id,
      usuarios:supervisor_id ( nombre, username, rol ),
      sedes ( abrev )
    `)
    .order("ultimo_ts", { ascending: false });
  if (!esSoporte) q = q.eq("supervisor_id", userId);
  const { data: ticketsRaw } = await q.limit(50);
  const tickets = (ticketsRaw ?? []) as unknown as TicketRow[];

  // Stats
  const abiertos = tickets.filter((t) => t.estado !== "CERRADO");
  const urgentes = abiertos.filter((t) => t.prioridad === "URGENTE");
  const sinResponder = abiertos.filter((t) => esSoporte ? t.unread_soporte > 0 : t.unread_user > 0);

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
          <div>
            <Link href="/dashboard" className="text-xs text-muted hover:text-text">← Dashboard</Link>
            <p className={`role-badge role-${profile.rol} mt-2 mb-2`}>{profile.rol}</p>
            <h1 className="font-display text-3xl sm:text-4xl">
              {esSoporte ? "Inbox de" : "Mis"} <span className="text-gradient-blue serif-italic">tickets</span>
            </h1>
            <p className="mt-1 text-sm text-muted">
              {esSoporte
                ? "Responde dudas, urgencias, desbloqueos y sugerencias de supervisores."
                : "Manda tickets a RH para desbloquear fechas, reportar dudas o urgencias."}
            </p>
          </div>
          <Link href="/soporte/nuevo" className="btn btn-primary">
            + Nuevo ticket
          </Link>
        </header>

        {/* KPIs */}
        <div className="mb-6 grid gap-2 sm:grid-cols-3 animate-fade-up delay-100">
          <KPI label="Abiertos" value={String(abiertos.length)} color="blue" />
          <KPI label="Urgentes" value={String(urgentes.length)} color="red" />
          <KPI label={esSoporte ? "Sin responder" : "Con respuesta nueva"} value={String(sinResponder.length)} color="amber" />
        </div>

        {/* Lista */}
        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--border)] bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            {esSoporte ? "Sin tickets todavía." : "No has enviado tickets. Crea uno arriba si necesitas soporte."}
          </div>
        ) : (
          <ul className="space-y-2 animate-fade-up delay-200">
            {tickets.map((t) => {
              const u = Array.isArray(t.usuarios) ? t.usuarios[0] : t.usuarios;
              const sede = Array.isArray(t.sedes) ? t.sedes[0] : t.sedes;
              const unread = esSoporte ? t.unread_soporte : t.unread_user;
              const isUrgente = t.prioridad === "URGENTE" && t.estado !== "CERRADO";
              const cerrado = t.estado === "CERRADO";
              return (
                <li key={t.id}>
                  <Link
                    href={`/soporte/${t.id}`}
                    className={`block surface-card p-4 transition hover:border-[color:var(--blue)] ${cerrado ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs text-[#93C5FD]">{t.folio}</span>
                          <span className={`pill ${isUrgente ? "pill-red" : "pill-blue"}`}>{t.tipo}</span>
                          {isUrgente && <span className="pill pill-red animate-glow">URGENTE</span>}
                          {cerrado && <span className="pill">CERRADO</span>}
                          {!cerrado && t.estado === "RESPONDIDO" && <span className="pill pill-green">RESPONDIDO</span>}
                          {unread > 0 && (
                            <span className="rounded-full bg-[color:var(--blue)] px-2 py-0.5 text-[10px] font-bold text-white">
                              {unread}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-text">{t.ultimo_mensaje ?? "—"}</p>
                        <p className="mt-1 text-[10px] text-muted">
                          {esSoporte ? (
                            <>
                              {u?.nombre ?? "—"} (@{u?.username ?? "—"}) ·{" "}
                              {sede?.abrev && <span className="font-mono">{sede.abrev}</span>} ·{" "}
                              {new Date(t.ultimo_ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                            </>
                          ) : (
                            new Date(t.ultimo_ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })
                          )}
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}

function KPI({ label, value, color }: { label: string; value: string; color: "blue" | "red" | "amber" }) {
  const cls = {
    blue: "border-[rgba(59,130,246,0.35)] bg-[rgba(59,130,246,0.08)] text-[#93C5FD]",
    red: "border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-[#FCA5A5]",
    amber: "border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] text-[#FCD34D]",
  }[color];
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="font-display text-2xl leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-tagline opacity-70">{label}</div>
    </div>
  );
}
