import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/", "/login", "/favicon.svg"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  // Las rutas /api/* traen su propia autenticación (rol en reportes/contratos,
  // CRON_SECRET en crons, etc. — todas nacieron sin middleware). Redirigirlas
  // a /login rompería pg_cron y los fetch de la app.
  if (pathname.startsWith("/api/")) return true;
  // Archivos estáticos de /public (sw.js, manifest, iconos, sonidos,
  // reset-sw.html…). Un service worker NO acepta redirects al registrarse.
  if (/\.[a-z0-9]+$/i.test(pathname)) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { response, user, dejarPasar } = await updateSession(req);
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    // Si ya está logueado y entra a /login, mándalo al dashboard.
    if (pathname === "/login" && user) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return response;
  }

  if (!user) {
    // Sesión presente pero Auth server inaccesible (blip de red): no expulsar.
    if (dejarPasar) return response;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.svg$|.*\\.png$|.*\\.jpg$).*)"],
};
