"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { crearSupervisorAction } from "./actions";

type Rol = "USER" | "ADMIN" | "SUPERADMIN" | "CEO" | "SOPORTE" | "FACTURACION";

const ROLES_OPTS: Array<{ value: Rol; label: string; description: string }> = [
  { value: "USER",        label: "USER (supervisor de campo)", description: "Captura pase de lista en sus sedes asignadas" },
  { value: "FACTURACION", label: "FACTURACIÓN (Diego, Brenda, Alex)", description: "Solo módulo de facturación: cotizaciones, productos, solicitudes de compra y datos bancarios. NO accede a RH/asistencias." },
  { value: "ADMIN",       label: "ADMIN (RH operativo)",       description: "Gestiona empleados, contratos, ve todo" },
  { value: "SUPERADMIN",  label: "SUPERADMIN",                 description: "Acceso total, incluye finanzas/facturación" },
  { value: "CEO",         label: "CEO",                        description: "Acceso ejecutivo" },
  { value: "SOPORTE",     label: "SOPORTE (IT)",               description: "Igual que admin + reset passwords + acceso técnico" },
];

interface Props { callerRol: string }

export function NuevoSupervisorButton({ callerRol }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("USER");
  const [accesoFac, setAccesoFac] = useState(false);
  const [creado, setCreado] = useState<{ password: string; username: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const puede = ["SUPERADMIN", "SOPORTE"].includes(callerRol);

  function resetForm() {
    setEmail(""); setUsername(""); setNombre(""); setRol("USER"); setAccesoFac(false);
    setErr(null); setCreado(null);
  }

  function cerrar() { setOpen(false); resetForm(); }

  function guardar() {
    setErr(null); setCreado(null);
    if (!email.trim() || !nombre.trim()) { setErr("Email y nombre son requeridos"); return; }
    start(async () => {
      const r = await crearSupervisorAction({
        email: email.trim(),
        nombre: nombre.trim(),
        username: username.trim() || undefined,
        rol,
        acceso_facturacion: accesoFac,
      });
      if (!r.ok) { setErr(r.error); return; }
      setCreado({ password: r.password, username: r.username });
      router.refresh();
    });
  }

  function copyPwd() {
    if (creado) navigator.clipboard?.writeText(creado.password).catch(() => {});
  }

  if (!puede) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
      >
        <Icon name="plus" size={12} /> Nuevo supervisor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={cerrar}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-xl border border-white/10 bg-[color:var(--bg)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg">Nuevo supervisor</h2>
              <button onClick={cerrar} className="rounded p-1 hover:bg-white/10"><Icon name="x" size={14} /></button>
            </div>

            {!creado ? (
              <>
                <p className="mb-4 text-[11px] text-muted">
                  Se generará una <strong>password temporal</strong> que se muestra una sola vez. Entrégasela al supervisor personalmente.
                </p>
                <div className="grid gap-3">
                  <div className="field">
                    <label>Nombre completo *</label>
                    <input value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={pending} placeholder="Ej: Juan Pérez García" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="field">
                      <label>Email *</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} placeholder="usuario@dominio.com" />
                    </div>
                    <div className="field">
                      <label>Username (opcional)</label>
                      <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} disabled={pending} placeholder={email.split("@")[0] || "auto"} />
                    </div>
                  </div>
                  <div className="field">
                    <label>Rol *</label>
                    <select value={rol} onChange={(e) => setRol(e.target.value as Rol)} disabled={pending}>
                      {ROLES_OPTS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-muted-2">
                      {ROLES_OPTS.find((r) => r.value === rol)?.description}
                    </p>
                  </div>
                  {rol === "FACTURACION" ? (
                    <div className="rounded-md border border-blue-400/30 bg-blue-500/[0.08] p-2.5 text-[11px] text-blue-200">
                      <strong>Acceso a Facturación incluido automáticamente</strong> — el rol FACTURACION ya implica acceso al módulo. No verá el resto de Vortex (asistencias, RH).
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                      <input type="checkbox" checked={accesoFac} onChange={(e) => setAccesoFac(e.target.checked)} disabled={pending} />
                      <span>
                        <span className="font-semibold text-amber-200">Activar acceso a Facturación</span>
                        <span className="ml-1 text-muted">— podrá ver cotizaciones, productos, solicitudes de compra además de su rol normal</span>
                      </span>
                    </label>
                  )}
                </div>
                {err && <p className="mt-3 rounded-md border border-red-400/30 bg-red-500/[0.08] px-3 py-2 text-xs text-red-200">{err}</p>}
                <div className="mt-5 flex justify-end gap-2">
                  <button onClick={cerrar} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
                  <button onClick={guardar} disabled={pending || !email.trim() || !nombre.trim()} className="btn btn-primary btn-sm">
                    {pending ? "Creando..." : "Crear supervisor"}
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/[0.08] p-3">
                  <p className="mb-2 text-sm font-semibold text-emerald-200">✓ Usuario creado correctamente</p>
                  <p className="text-[11px] text-muted">
                    Username: <code className="font-mono text-emerald-200">@{creado.username}</code>
                  </p>
                </div>
                <div className="rounded-lg border border-amber-400/40 bg-amber-500/[0.08] p-3">
                  <p className="mb-1 text-[10px] uppercase tracking-tagline text-amber-300">Password temporal (única vez)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 select-all break-all rounded-md bg-[color:var(--bg)] px-3 py-2 font-mono text-sm font-bold text-amber-200">
                      {creado.password}
                    </code>
                    <button onClick={copyPwd} className="shrink-0 rounded-md border border-amber-400/40 bg-amber-500/15 px-2.5 py-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30">
                      Copiar
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-amber-300">
                    ⚠ Esta password NO se guarda en ningún lado. Cópiala ahora.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={cerrar} className="btn btn-primary btn-sm">Cerrar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
