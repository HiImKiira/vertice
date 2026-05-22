"use client";

import { useEffect, useState, useTransition, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LoadingOverlay } from "./VortexLoader";

/**
 * Loader global que se dispara durante navegación entre páginas.
 *
 * Estrategia híbrida:
 *  - Detecta cambios de pathname + searchParams (App Router)
 *  - Detecta clicks en <a> internos y muestra overlay inmediato
 *  - Detecta submit de <form> y muestra overlay
 *  - Se quita cuando la nueva ruta hidrata (effect)
 */
export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();
  const lastUrl = useRef<string>("");
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUrl = `${pathname}?${searchParams.toString()}`;

  // Cuando cambia la URL, asumimos que la navegación terminó → ocultar
  useEffect(() => {
    if (lastUrl.current !== currentUrl) {
      lastUrl.current = currentUrl;
      if (hideTimer.current) clearTimeout(hideTimer.current);
      // Delay corto para que el usuario vea el loader al menos brevemente
      hideTimer.current = setTimeout(() => setLoading(false), 250);
    }
  }, [currentUrl]);

  // Listener global de clicks en links internos
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Ignorar si tiene modificadores (cmd/ctrl/shift = nueva tab)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const target = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      // Externo o ancla → ignorar
      if (href.startsWith("http") || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      // Mismo URL → no loader (botón refresh accidental)
      if (href === currentUrl || href === pathname) return;
      // target=_blank → no loader
      if (target.target === "_blank") return;
      // Mostrar loader
      startTransition(() => setLoading(true));
    }
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [currentUrl, pathname]);

  // Listener global de submits de form
  useEffect(() => {
    function onSubmit(e: SubmitEvent) {
      const form = e.target as HTMLFormElement | null;
      if (!form) return;
      // Si el form usa GET y es interno (sin action o action relativo) → loader
      const action = form.getAttribute("action");
      if (action && action.startsWith("http")) return; // externo
      startTransition(() => setLoading(true));
    }
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, []);

  if (!loading) return null;
  return <LoadingOverlay message="Cargando..." />;
}
