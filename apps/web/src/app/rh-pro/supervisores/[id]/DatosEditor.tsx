"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { actualizarSupervisorAction, eliminarSupervisorAction } from "../actions";

type Rol = "USER" | "ADMIN" | "SUPERADMIN" | "CEO" | "SOPORTE" | "FACTURACION";

const ROLES: Rol[] = ["USER", "FACTURACION", "ADMIN", "SUPERADMIN", "CEO", "SOPORTE"];

interface Props {
  supervisorId: string;
  nombre: string;
  username: string;
  email: string;
  rol: string;
  activo: boolean;
  callerRol: string;
}

export function DatosEditor({ supervisorId, nombre, username, email, rol, activo, callerRol }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [nombreV, setNombreV] = useState(nombre);
  const [usernameV, setUsernameV] = useState(username);
  const [emailV, setEmailV] = useState(email);
  const [rolV, setRolV] = useState<Rol>(rol as Rol);
  const [activoV, setActivoV] = useState(activo);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const esSuperOrSoporte = ["SUPERADMIN", "SOPORTE"].includes(callerRol);
  const esAdminLike = ["ADMIN", "SUPERADMIN", "CEO", "SOPORTE"].includes(callerRol);

  if (!esAdminLike) return null;

  function cancelar() {
    setEditing(false); setMsg(null);
    setNombreV(nombre); setUsernameV(username); setEmailV(email); setRolV(rol as Rol); setActivoV(activo);
  }

  function guardar() {
    setMsg(null);
    const patch: Parameters<typeof actualizarSupervisorAction>[1] = {};
    if (nombreV !== nombre) patch.nombre = nombreV;
    if (usernameV !== username) patch.username = usernameV;
    if (emailV !== email) patch.email = emailV;
    if (rolV !== rol) patch.rol = rolV;
    if (activoV !== activo) patch.activo = activoV;
    if (Object.keys(patch).length === 0) { setEditing(false); return; }

    start(async () => {
      const r = await actualizarSupervisorAction(supervisorId, patch);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: "✓ Datos actualizados" });
      setEditing(false);
      router.refresh();
    });
  }

  function eliminar() {
    const confirmText = `¿Eliminar a ${nombre}? Si tiene capturas o asignaciones, se DESACTIVARÁ. Si no, se BORRARÁ por completo.`;
    if (!confirm(confirmText)) return;
    if (!confirm("Última confirmación. Esta acción NO se puede deshacer si elimina por completo.")) return;
    setMsg(null);
    start(async () => {
      const r = await eliminarSupervisorAction(supervisorId);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      if (r.modo === "soft") {
        setMsg({ kind: "ok", text: `✓ Usuario desactivado. ${r.razon ?? ""}` });
        router.refresh();
      } else {
        router.push("/rh-pro/supervisores");
      }
    });
  }

  return (
    <div className="surface-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="section-label flex items-center gap-2">
          <Icon name="user" size={12} className="text-muted" />
          Datos del usuario
        </div>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-[10px] text-blue-300 hover:underline">
            Editar
          </button>
        ) : (
          <button onClick={cancelar} disabled={pending} className="text-[10px] text-muted hover:text-text">
            Cancelar
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="space-y-1.5 text-xs">
          <Field label="Nombre" value={nombre} />
          <Field label="Username" value={`@${username}`} mono />
          <Field label="Email" value={email} mono />
          <Field label="Rol" value={rol} mono />
          <Field label="Estado" value={activo ? "Activo" : "Inactivo"} highlight={!activo ? "red" : undefined} />
        </dl>
      ) : (
        <div className="space-y-2.5">
          <div className="field">
            <label>Nombre</label>
            <input value={nombreV} onChange={(e) => setNombreV(e.target.value)} disabled={pending} />
          </div>
          <div className="field">
            <label>Username</label>
            <input value={usernameV} onChange={(e) => setUsernameV(e.target.value.toLowerCase())} disabled={pending} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={emailV} onChange={(e) => setEmailV(e.target.value)} disabled={pending} />
            <p className="mt-1 text-[9px] text-muted-2">Cambiar el email también lo actualiza en login.</p>
          </div>
          <div className="field">
            <label>Rol {!esSuperOrSoporte && <span className="text-muted-2">(solo SUPERADMIN/SOPORTE)</span>}</label>
            <select value={rolV} onChange={(e) => setRolV(e.target.value as Rol)} disabled={pending || !esSuperOrSoporte}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <label className={`flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.02] p-2 text-xs ${!esSuperOrSoporte ? "opacity-50" : ""}`}>
            <input type="checkbox" checked={activoV} onChange={(e) => setActivoV(e.target.checked)} disabled={pending || !esSuperOrSoporte} />
            <span>Usuario activo</span>
          </label>
          <button onClick={guardar} disabled={pending} className="btn btn-primary btn-sm w-full">
            {pending ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      )}

      {esSuperOrSoporte && !editing && (
        <div className="mt-4 border-t border-red-400/15 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-tagline text-red-300/80">Zona peligrosa</p>
          <button
            type="button"
            onClick={eliminar}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-40"
          >
            <Icon name="trash" size={12} />
            {pending ? "Eliminando..." : "Eliminar / desactivar supervisor"}
          </button>
          <p className="mt-1.5 text-[10px] text-muted-2">
            Si tiene capturas, asignaciones o tickets, será desactivado para preservar auditoría.
            Sin historial, se borra por completo.
          </p>
        </div>
      )}

      {msg && (
        <p className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>{msg.text}</p>
      )}
    </div>
  );
}

function Field({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean | undefined; highlight?: "red" | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[10px] uppercase tracking-tagline text-muted-2">{label}</dt>
      <dd className={`${mono ? "font-mono" : ""} ${highlight === "red" ? "text-red-300" : ""}`}>{value}</dd>
    </div>
  );
}
