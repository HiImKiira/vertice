import Link from "next/link";
import { requireUser } from "@/lib/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/**
 * Layout del módulo de Facturación.
 *
 * IMPORTANTE: aquí NO bloqueamos por `acceso_facturacion` porque cualquier
 * supervisor puede entrar a `/facturacion/compras/nueva` y `/facturacion/compras/[id]`
 * (para sus propias solicitudes). El gate vive en cada sub-page que lo necesita
 * (dashboard, cotizaciones, productos, clientes).
 *
 * En la barra de navegación mostramos solo lo que el usuario puede ver según su flag.
 */
export default async function FacturacionLayout({ children }: { children: React.ReactNode }) {
  const { profile, id } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data: u } = await supabase
    .from("usuarios")
    .select("acceso_facturacion")
    .eq("id", id)
    .maybeSingle<{ acceso_facturacion: boolean }>();
  const esAdmin = ["SUPERADMIN", "SOPORTE", "CEO"].includes(profile.rol);
  const tieneAcceso = esAdmin || u?.acceso_facturacion === true;

  return (
    <main className="min-h-screen overflow-x-hidden text-text">
      <Topbar user={profile} />
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-xs">
          {tieneAcceso && (
            <>
              <Link href="/facturacion" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:border-amber-400/40 hover:text-amber-200">
                <Icon name="chart" size={12} /> Dashboard
              </Link>
              <Link href="/facturacion/cotizaciones" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:border-amber-400/40 hover:text-amber-200">
                <Icon name="receipt" size={12} /> Cotizaciones
              </Link>
              <Link href="/facturacion/productos" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:border-amber-400/40 hover:text-amber-200">
                <Icon name="package" size={12} /> Productos
              </Link>
              <Link href="/facturacion/clientes" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:border-amber-400/40 hover:text-amber-200">
                <Icon name="users" size={12} /> Clientes
              </Link>
            </>
          )}
          <Link href="/facturacion/compras" className="inline-flex items-center gap-1 rounded-md border border-white/10 px-3 py-1.5 hover:border-violet-400/40 hover:text-violet-200">
            <Icon name="shopping-cart" size={12} /> Compras
          </Link>
          <span className="ml-auto text-[10px] text-muted-2">MHS Integradora · by Vortex</span>
        </nav>
        {children}
      </div>
    </main>
  );
}
