import Link from "next/link";
import { requireUser, requireAdminLike } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";
import { LiberacionesEditor, type LiberacionRow } from "./LiberacionesEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Liberación de fechas · RH Pro" };

interface LibRowRaw {
  id: string;
  fecha: string;
  motivo: string | null;
  activo: boolean;
  expira_en: string | null;
  creado_en: string;
  liberado_por: string;
  usuarios: { nombre: string } | { nombre: string }[] | null;
}

export default async function LiberacionesPage() {
  const { profile } = await requireUser();
  requireAdminLike(profile.rol);
  const supabase = await createSupabaseServerClient();

  const { data: raw } = await supabase
    .from("fechas_liberadas")
    .select("id, fecha, motivo, activo, expira_en, creado_en, liberado_por, usuarios:liberado_por ( nombre )")
    .order("creado_en", { ascending: false })
    .limit(100);

  const now = Date.now();
  const liberaciones: LiberacionRow[] = ((raw ?? []) as LibRowRaw[]).map((r) => {
    const usr = Array.isArray(r.usuarios) ? r.usuarios[0] : r.usuarios;
    let estado_calc: "activa" | "expirada" | "revocada";
    if (!r.activo) estado_calc = "revocada";
    else if (r.expira_en && new Date(r.expira_en).getTime() < now) estado_calc = "expirada";
    else estado_calc = "activa";
    return {
      id: r.id,
      fecha: r.fecha,
      motivo: r.motivo,
      activo: r.activo,
      expira_en: r.expira_en,
      creado_en: r.creado_en,
      liberado_por_nombre: usr?.nombre ?? null,
      estado_calc,
    };
  });

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-8 sm:px-6 sm:py-10">
        <header className="mb-8 animate-fade-up">
          <Link href="/rh-pro" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
            <Icon name="arrow-left" size={12} /> RH Pro
          </Link>
          <p className="role-badge role-ADMIN mt-2 mb-2">Liberaciones · ADMIN/SUPERADMIN/SOPORTE</p>
          <h1 className="font-display text-3xl sm:text-4xl">Liberación de fechas globales</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Abre fechas fuera de la ventana de gracia para que todos los supervisores
            puedan capturar pase de lista. Las liberaciones tienen expiración automática
            (por defecto 6h) y se pueden extender o revocar en cualquier momento.
          </p>
        </header>

        <LiberacionesEditor liberaciones={liberaciones} />

        <footer className="mt-16 border-t border-[color:var(--border)] pt-6 text-xs text-muted-2">
          <Link href="/rh-pro" className="hover:text-text">← RH Pro</Link>
        </footer>
      </div>
    </main>
  );
}
