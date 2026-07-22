import Link from "next/link";
import { requireUser , blockCoordinacion } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { coberturaQuincena } from "@/lib/quincena";
import { AvisarRH } from "./AvisarRH";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi quincena · Vortex" };

const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function diaNum(iso: string): { d: number; dow: number } {
  const p = iso.split("-");
  const dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return { d: dt.getDate(), dow: dt.getDay() };
}

export default async function MiQuincenaPage() {
  const { id: userId, profile } = await requireUser();
  blockCoordinacion(profile.rol);
  const supabase = await createSupabaseServerClient();
  const cob = await coberturaQuincena(supabase, userId);

  const nombre = profile.nombre ?? profile.username;
  const faltantes = cob.diasIncompletos;
  const mensajeWA = faltantes.length === 0
    ? `Hola, soy ${nombre}. Mi pase de lista de la quincena ${cob.quincena.label} está COMPLETO: ${cob.diasCompletos}/${cob.diasTranscurridos} días al 100%.`
    : `Hola, soy ${nombre}. En la quincena ${cob.quincena.label} llevo ${cob.diasCompletos}/${cob.diasTranscurridos} días al 100% (${cob.pctGlobal}%).\nMe faltan por completar estos días: ${faltantes.join(", ")}.`;

  const colorPct = cob.pctGlobal >= 95 ? "#10B981" : cob.pctGlobal >= 50 ? "#F59E0B" : "#EF4444";

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1000px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-6 animate-fade-up">
          <Link href="/dashboard" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> Dashboard
          </Link>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">
            Mi <span className="text-gradient-blue serif-italic">quincena</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {cob.quincena.label} · qué tan completo llevas tu pase de lista, día por día.
          </p>
        </header>

        {cob.sinAsignaciones ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[color:var(--card)] p-10 text-center text-sm text-muted">
            No tienes sedes asignadas todavía. Pide a RH que te asigne una para ver tu avance.
          </div>
        ) : (
          <>
            {/* KPIs */}
            <section className="mb-5 grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-[color:var(--card)] px-4 py-3">
                <div className="font-display text-3xl leading-none" style={{ color: colorPct }}>{cob.pctGlobal}%</div>
                <div className="mt-1 text-[10px] uppercase tracking-tagline text-muted">Avance global</div>
              </div>
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.06] px-4 py-3">
                <div className="font-display text-3xl leading-none text-emerald-200">{cob.diasCompletos}</div>
                <div className="mt-1 text-[10px] uppercase tracking-tagline text-emerald-200/80">Días al 100%</div>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-4 py-3">
                <div className="font-display text-3xl leading-none text-amber-200">{faltantes.length}</div>
                <div className="mt-1 text-[10px] uppercase tracking-tagline text-amber-200/80">Días incompletos</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[color:var(--card)] px-4 py-3">
                <div className="font-display text-3xl leading-none">{cob.diasTranscurridos}</div>
                <div className="mt-1 text-[10px] uppercase tracking-tagline text-muted">Días transcurridos</div>
              </div>
            </section>

            {/* Barra global */}
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full transition-all" style={{ width: `${cob.pctGlobal}%`, background: colorPct }} />
            </div>

            {/* Grid de días */}
            <section className="mb-5">
              <div className="section-label mb-2">Día por día</div>
              <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {cob.dias.map((d) => {
                  const { d: num, dow } = diaNum(d.fecha);
                  const estilo = d.futuro
                    ? "border-white/5 bg-white/[0.02] text-muted-2"
                    : d.completo
                      ? "border-emerald-400/40 bg-emerald-500/[0.12] text-emerald-200"
                      : d.capturados === 0
                        ? "border-red-400/40 bg-red-500/[0.10] text-red-200"
                        : "border-amber-400/40 bg-amber-500/[0.10] text-amber-200";
                  return (
                    <li
                      key={d.fecha}
                      className={`rounded-lg border p-2 text-center ${estilo}`}
                      title={d.futuro ? "Aún no llega" : `${d.capturados}/${d.esperados} capturados (${d.pct}%)`}
                    >
                      <div className="text-[9px] uppercase opacity-70">{DIAS_CORTO[dow]}</div>
                      <div className="font-display text-lg leading-tight">{num}</div>
                      <div className="font-mono text-[9px]">
                        {d.futuro ? "—" : d.completo ? "100%" : `${d.pct}%`}
                      </div>
                      {!d.futuro && !d.completo && (
                        <div className="text-[8px] opacity-80">{d.capturados}/{d.esperados}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-2">
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />100% completo</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-amber-400" />Incompleto</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-400" />Sin capturar</span>
                <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-white/20" />Aún no llega</span>
              </div>
            </section>

            {/* Días faltantes + acciones */}
            <section className="rounded-xl border border-white/10 bg-[color:var(--card)] p-4">
              {faltantes.length === 0 ? (
                <p className="text-sm text-emerald-300">
                  ✓ Vas al corriente: todos los días transcurridos están capturados al 100%.
                </p>
              ) : (
                <>
                  <p className="mb-2 text-xs font-semibold text-amber-200">
                    Te faltan {faltantes.length} día(s) por completar:
                  </p>
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {faltantes.map((f) => (
                      <Link
                        key={f}
                        href={`/pase-lista?fecha=${f}`}
                        className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 font-mono text-[11px] text-amber-200 hover:border-amber-400/60"
                        title="Ir al pase de lista de ese día"
                      >
                        {f}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-3">
                <AvisarRH />
                <WhatsAppButton mensaje={mensajeWA} label="Enviar por WhatsApp" />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
