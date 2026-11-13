import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { meridaToday } from "@/lib/quincena";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checadas QR · RH Pro" };

interface Row {
  empleado_id: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  foto_entrada: string | null;
  foto_salida: string | null;
}

function horaMerida(ts: string | null): string | null {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Merida" });
}

export default async function ChecadasPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const admin = supabaseAdmin();

  const { fecha: fParam } = await searchParams;
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fParam ?? "") ? fParam! : meridaToday();

  const { data: sede } = await admin
    .from("sedes").select("id, abrev, nombre").eq("abrev", "XMK")
    .maybeSingle<{ id: string; abrev: string; nombre: string }>();

  let rows: Row[] = [];
  let empMap = new Map<string, { numero_empleado: string; nombre: string; jornada: string }>();
  let migracionPendiente = false;
  const signed = new Map<string, string>();

  if (sede) {
    const { data: emps } = await admin
      .from("empleados").select("id, numero_empleado, nombre, jornada").eq("sede_id", sede.id);
    empMap = new Map((emps ?? []).map((e: { id: string; numero_empleado: string; nombre: string; jornada: string }) => [e.id, e]));
    const ids = (emps ?? []).map((e: { id: string }) => e.id);

    const r = await admin
      .from("asistencias")
      .select("empleado_id, hora_entrada, hora_salida, foto_entrada, foto_salida")
      .eq("fecha", fecha)
      .in("empleado_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    if (r.error) {
      migracionPendiente = true;
    } else {
      rows = (r.data ?? []) as Row[];
      // Solo las que tienen al menos una marca de entrada/salida
      rows = rows.filter((x) => x.hora_entrada || x.hora_salida);
      rows.sort((a, b) => (a.hora_entrada ?? a.hora_salida ?? "").localeCompare(b.hora_entrada ?? b.hora_salida ?? ""));

      const paths: string[] = [];
      for (const x of rows) { if (x.foto_entrada) paths.push(x.foto_entrada); if (x.foto_salida) paths.push(x.foto_salida); }
      if (paths.length) {
        const { data: urls } = await admin.storage.from("asistencia-fotos").createSignedUrls(paths, 3600);
        for (const u of urls ?? []) if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
      }
    }
  }

  const dia = new Date(`${fecha}T12:00:00`);
  const diaTxt = dia.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });
  const prev = new Date(dia); prev.setDate(prev.getDate() - 1);
  const next = new Date(dia); next.setDate(next.getDate() + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1100px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/rh-pro/qr" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Eventos Extraordinarios
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">CHECADAS · ADMIN+</p>
          <h1 className="font-display text-3xl sm:text-4xl">
            Checadas <span className="text-gradient-blue serif-italic">con foto</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Entrada y salida de cada trabajador con la foto tomada al escanear el gafete. Es la evidencia
            de que la persona estuvo físicamente: si una foto no corresponde, la checada es dudosa.
          </p>
        </header>

        {/* Navegación de fecha */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Link href={`/rh-pro/qr/checadas?fecha=${iso(prev)}`} className="btn btn-ghost btn-sm">← Día anterior</Link>
          <span className="rounded-lg border border-white/10 bg-[color:var(--card)] px-3 py-1.5 text-sm font-semibold capitalize">{diaTxt}</span>
          <Link href={`/rh-pro/qr/checadas?fecha=${iso(next)}`} className="btn btn-ghost btn-sm">Día siguiente →</Link>
          {fecha !== meridaToday() && (
            <Link href="/rh-pro/qr/checadas" className="btn btn-ghost btn-sm">Hoy</Link>
          )}
          <span className="ml-auto text-xs text-muted">{rows.length} checada(s)</span>
        </div>

        {migracionPendiente ? (
          <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-amber-100">
            Falta aplicar la migración <span className="font-mono">v37</span> (entrada/salida + fotos) en Supabase.
            Córrela y regresa.
          </div>
        ) : rows.length === 0 ? (
          <div className="surface-card p-8 text-center text-sm text-muted">
            No hay checadas registradas {fecha === meridaToday() ? "hoy" : "ese día"} en {sede?.abrev ?? "XMK"}.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((x) => {
              const e = empMap.get(x.empleado_id);
              const fe = x.foto_entrada ? signed.get(x.foto_entrada) : null;
              const fs = x.foto_salida ? signed.get(x.foto_salida) : null;
              return (
                <div key={x.empleado_id} className="surface-card p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-bold">#{e?.numero_empleado} · {e?.nombre}</p>
                    <span className="shrink-0 pill pill-cyan">{e?.jornada}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FotoChecada etiqueta="Entrada" hora={horaMerida(x.hora_entrada)} url={fe} color="emerald" />
                    <FotoChecada etiqueta="Salida" hora={horaMerida(x.hora_salida)} url={fs} color="sky" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-[11px] text-muted-2">
          Las fotos se guardan de forma privada y solo las ve RH/Admin. Asegúrate de tener aviso de privacidad
          laboral que cubra la captura de imagen para control de asistencia.
        </p>
      </div>
    </main>
  );
}

function FotoChecada({ etiqueta, hora, url, color }: { etiqueta: string; hora: string | null; url: string | null | undefined; color: "emerald" | "sky" }) {
  const c = color === "emerald" ? "text-emerald-300" : "text-sky-300";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className={`text-[10px] font-bold uppercase tracking-wide ${c}`}>{etiqueta}</span>
        <span className="font-mono text-[11px] text-muted">{hora ?? "—"}</span>
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <a href={url} target="_blank" rel="noopener">
          <img src={url} alt={etiqueta} className="aspect-[4/3] w-full rounded-lg border border-white/10 object-cover" />
        </a>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-muted-2">
          {hora ? "sin foto" : "no marcó"}
        </div>
      )}
    </div>
  );
}
