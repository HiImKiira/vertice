import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TicketThread, type Mensaje, type TicketDetail } from "./TicketThread";
import { marcarLeidoAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ticket · Soporte" };

interface PageProps { params: Promise<{ id: string }> }

export default async function TicketPage({ params }: PageProps) {
  const { id: userId, profile } = await requireUser();
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const esSoporte = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(profile.rol);

  const { data: t } = await supabase
    .from("tickets_soporte")
    .select(`
      id, folio, tipo, prioridad, estado, fecha_solicitada,
      ultimo_ts, apertura_ts, cierre_ts, supervisor_id,
      usuarios:supervisor_id ( nombre, username, rol ),
      sedes ( abrev, nombre )
    `)
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();
  const ticket = t as unknown as TicketDetail;

  // Authz: USER solo puede ver los propios
  if (!esSoporte && ticket.supervisor_id !== userId) notFound();

  // Mensajes del thread
  const { data: msgsRaw } = await supabase
    .from("mensajes_soporte")
    .select("id, ticket_id, remitente_id, origen, mensaje, creado_en, usuarios:remitente_id ( nombre, username )")
    .eq("ticket_id", id)
    .order("creado_en", { ascending: true });
  const mensajes = (msgsRaw ?? []) as unknown as Mensaje[];

  // Marcar como leído al abrir
  await marcarLeidoAction(id);

  const sup = Array.isArray(ticket.usuarios) ? ticket.usuarios[0] : ticket.usuarios;
  const sede = Array.isArray(ticket.sedes) ? ticket.sedes[0] : ticket.sedes;

  return (
    <main className="min-h-screen text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/soporte" className="text-xs text-muted hover:text-text">← Tickets</Link>

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
