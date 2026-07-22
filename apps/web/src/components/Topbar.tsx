"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import { Logo } from "@/components/Logo";
import { logoutAction } from "@/app/login/actions";

export interface TopbarUser {
  username: string;
  nombre: string;
  rol: "USER" | "ADMIN" | "SUPERADMIN" | "CEO" | "SOPORTE" | "FACTURACION" | "COORDINACION";
}

interface NavItem {
  href: string;
  icon: string;
  label: string;
  /** Roles que pueden ver este tab. Si no se especifica, todos EXCEPTO FACTURACION (que es restringido). */
  roles?: TopbarUser["rol"][];
  /** Si true, se muestra también a FACTURACION. */
  facturacion?: boolean;
}

const NAV: NavItem[] = [
  { href: "/pase-lista",   icon: "📋", label: "Pase de lista" },
  { href: "/incidencias",  icon: "🧾", label: "Incidencias" },
  { href: "/eventuales",   icon: "🔄", label: "Eventuales" },
  { href: "/descansos",    icon: "🛌", label: "Descansos" },
  { href: "/rh-pro",       icon: "👥", label: "RH Pro",       roles: ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"] },
  { href: "/facturacion",  icon: "🏦", label: "Facturación",  roles: ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE", "FACTURACION"], facturacion: true },
  { href: "/soporte",      icon: "💬", label: "Soporte", facturacion: true },
  { href: "/reportes",     icon: "📄", label: "Reportes PDF", roles: ["ADMIN", "SUPERADMIN", "CEO"] },
];

interface SignOutButtonProps { compact?: boolean }

function SignOutBtn({ compact }: SignOutButtonProps) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => logoutAction())}
      disabled={pending}
      className={`btn btn-ghost ${compact ? "btn-sm" : ""}`}
      title="Cerrar sesión"
    >
      {pending ? "..." : "⏏"}
    </button>
  );
}

export function Topbar({ user }: { user: TopbarUser }) {
  const pathname = usePathname();
  // FACTURACION solo ve items con .facturacion=true. Para los demás, regla normal.
  const visible = user.rol === "FACTURACION"
    ? NAV.filter((n) => n.facturacion === true && (!n.roles || n.roles.includes(user.rol)))
    : NAV.filter((n) => !n.roles || n.roles.includes(user.rol));

  return (
    <header className="topbar">
      <div className="mx-auto flex h-[60px] max-w-[1280px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <Logo className="h-8 w-auto" withWordmark={false} />
          <span className="font-display text-[15px] tracking-tight text-text">
            Vor<span className="text-gradient-blue">tex</span>
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden items-center gap-1 lg:flex">
          {visible.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className={`nav-btn ${active ? "nav-btn-active" : ""}`}>
                <span className="text-[15px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User chip + logout */}
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-1.5 text-xs text-muted sm:flex">
            <span>👤</span>
            <b className="text-text">{user.username}</b>
            <span className={`role-badge role-${user.rol}`}>{user.rol}</span>
          </div>
          <SignOutBtn />
        </div>
      </div>

      {/* Nav mobile (scroll horizontal) */}
      <div className="overflow-x-auto border-t border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-2 lg:hidden">
        <div className="flex gap-1.5">
          {visible.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-btn whitespace-nowrap ${active ? "nav-btn-active" : ""}`}
              >
                <span>{item.icon}</span>
                <span className="text-[12px]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
