import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request y la propaga a Next.
 * Llamar desde el middleware raíz (`/middleware.ts`). Devuelve el response
 * con las cookies de sesión actualizadas (importante para SSR).
 */
export async function updateSession(req: NextRequest): Promise<{ response: NextResponse; user: { id: string; email: string | undefined } | null; dejarPasar?: boolean }> {
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) => {
          for (const { name, value } of cookiesToSet) {
            req.cookies.set(name, value);
          }
          response = NextResponse.next({ request: req });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set({ name, value, ...(options ?? {}) });
          }
        },
      },
    },
  );

  // Blindaje de sesión: un blip de red hacia el Auth server NO debe expulsar
  // a un usuario con sesión válida. Si getUser falla (excepción/red) pero SÍ
  // hay cookie de sesión, dejamos pasar la request y la página decide.
  let user: { id: string; email?: string } | null = null;
  let fallaRed = false;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    fallaRed = true;
  }

  const tieneCookieSesion = req.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));

  return {
    response,
    user: user ? { id: user.id, email: user.email } : null,
    dejarPasar: !user && fallaRed && tieneCookieSesion,
  };
}
