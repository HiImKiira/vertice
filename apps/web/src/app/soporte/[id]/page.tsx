import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { TicketThread, type Mensaje, type TicketDetail } from "./TicketThread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket · Soporte" };

interface PageProps { params: Promise<{ id: string }> }

export default async function TicketPage({ params }: PageProps) {
  const { id: userId, profile } = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  const { data: t, error: tErr } = await supabase
    .from("tickets_soporte")
    .select(`
      id, folio, tipo, prioridad, estado, fecha_solicitada, sede_id, jornada,
      ultimo_ts, apertura_ts, cierre_ts, supervisor_id,
      usuarios:supervisor_id ( nombre, username, rol ),
      sedes ( id, abrev, nombre )
    `)
    .eq("id", id)
    .maybeSingle();
  if (tErr) {
    console.error("[soporte/[id]] ticket query error:", tErr);
    notFound();
  }
  if (!t) notFound();
  const ticket = t as unknown as TicketDetail;

  // Authz: USER solo puede ver los propios
  if (!esSoporte && ticket.supervisor_id !== userId) notFound();

  // Mensajes del thread
  const { data: msgsRaw, error: mErr } = await supabase
    .from("mensajes_soporte")
    .select("id, ticket_id, remitente_id, origen, mensaje, creado_en, usuarios:remitente_id ( nombre, username )")
    .eq("ticket_id", id)
    .order("creado_en", { ascending: true });
  if (mErr) console.error("[soporte/[id]] mensajes query error:", mErr);
  const mensajes = (msgsRaw ?? []) as unknown as Mensaje[];

  // Marcar como leído (inline, sin server action — evita revalidatePath durante render)
  {
    const patch = esSoporte ? { unread_soporte: 0 } : { unread_user: 0 };
    await supabase.from("tickets_soporte").update(patch).eq("id", id);
  }

  const sup = Array.isArray(ticket.usuarios) ? ticket.usuarios[0] : ticket.usuarios;
  const sede = Array.isArray(ticket.sedes) ? ticket.sedes[0] : ticket.sedes;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/soporte" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <Icon name="arrow-left" size={12} /> Tickets
        </Link>

        <header className="mt-2 mb-6 animate-fade-up">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-[#93C5FD]">{ticket.folio}</span>
            <span className={`pill ${ticket.prioridad === "URGENTE" ? "pill-red" : "pill-blue"}`}>{ticket.tipo}</span>
            {ticket.estado === "PENDIENTE" && <span className="pill pill-amber">PENDIENTE</span>}
            {ticket.estado === "RESPONDIDO" && <span className="pill pill-green">RESPONDIDO</span>}
            {ticket.estado === "CERRADO" && <span className="pill">CERRADO</span>}
            {ticket.prioridad === "URGENTE" && ticket.estado !== "CERRADO" && (
              <span className="pill pill-red animate-glow">URGENTE</span>
            )}
          </div>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl">
            {mensajes[0]?.mensaje.split("\n")[0] ?? "—"}
          </h1>
          <p className="mt-1 text-xs text-muted">
            {sup?.nombre} (@{sup?.username}) ·{" "}
            {sede?.abrev && <span className="font-mono">{sede.abrev}</span>}{" "}
            · abierto {new Date(ticket.apertura_ts).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
            {ticket.fecha_solicitada && (
              <> · fecha solicitada: <span className="font-mono text-[#FCD34D]">{ticket.fecha_solicitada}</span></>
            )}
          </p>

          {/* Botón "Ir a capturar" — visible cuando el ticket apunta a fecha+sede */}
          {ticket.fecha_solicitada && ticket.sede_id && ticket.estado !== "CERRADO" && (
            <div className="mt-4 flex items-stretch gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3 sm:items-center">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Icon name="calendar" size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-200">
                  {ticket.supervisor_id === userId ? "Captura tu pase ahora" : "Acceso rápido a captura"}
                </p>
                <p className="text-[10px] text-emerald-200/70">
                  Sede <span className="font-mono">{sede?.abrev ?? "—"}</span>
                  {ticket.jornada && <> · jornada <span className="font-mono">{ticket.jornada}</span></>}
                  {" · "}fecha <span className="font-mono">{ticket.fecha_solicitada}</span>
                </p>
              </div>
              <Link
                href={`/pase-lista?fecha=${ticket.fecha_solicitada}&sede=${ticket.sede_id}${ticket.jornada ? `&jornada=${ticket.jornada}` : ""}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-500/30 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/50"
              >
                Ir a capturar <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          )}
        </header>

        <TicketThread
          ticket={ticket}
          mensajes={mensajes}
          currentUserId={userId}
          esSoporte={esSoporte}
        />
      </div>
    </main>
  );
}
