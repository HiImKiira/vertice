import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const PUBLIC_PATHS = new Set(["/", "/login", "/favicon.svg"]);

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/api/public")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { response, user } = await updateSession(req);
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
