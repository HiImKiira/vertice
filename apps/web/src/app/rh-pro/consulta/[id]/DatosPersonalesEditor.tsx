"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { actualizarDatosEmpleadoAction, type DatosPatch } from "./actions";

interface Props {
  empleadoId: string;
  initial: {
    rfc: string | null;
    nss: string | null;
    curp: string | null;
    telefono: string | null;
    email_personal: string | null;
    direccion: string | null;
    banco: string | null;
    cuenta_bancaria: string | null;
    clabe: string | null;
  };
}

const BANCOS_COMUNES = [
  "BBVA", "Banamex", "Santander", "Banorte", "HSBC", "Scotiabank",
  "Inbursa", "Banco Azteca", "BanCoppel", "Banregio", "Banjército",
  "Banco del Bajío", "Mifel", "Multiva", "BanBajío", "Compartamos",
];

export function DatosPersonalesEditor({ empleadoId, initial }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [form, setForm] = useState({
    rfc: initial.rfc ?? "",
    nss: initial.nss ?? "",
    curp: initial.curp ?? "",
    telefono: initial.telefono ?? "",
    email_personal: initial.email_personal ?? "",
    direccion: initial.direccion ?? "",
    banco: initial.banco ?? "",
    cuenta_bancaria: initial.cuenta_bancaria ?? "",
    clabe: initial.clabe ?? "",
  });

  // Score de completitud
  const camposLlenos = Object.values(initial).filter((v) => v && String(v).trim()).length;
  const totalCampos = 9;
  const pct = Math.round((camposLlenos / totalCampos) * 100);
  const tieneBancarios = !!(initial.banco && initial.cuenta_bancaria && initial.clabe);

  function cancelar() {
    setEditing(false);
    setMsg(null);
    setForm({
      rfc: initial.rfc ?? "",
      nss: initial.nss ?? "",
      curp: initial.curp ?? "",
      telefono: initial.telefono ?? "",
      email_personal: initial.email_personal ?? "",
      direccion: initial.direccion ?? "",
      banco: initial.banco ?? "",
      cuenta_bancaria: initial.cuenta_bancaria ?? "",
      clabe: initial.clabe ?? "",
    });
  }

  function guardar() {
    setMsg(null);
    const patch: DatosPatch = {};
    // Diff vs initial
    if ((form.rfc.trim() || null) !== initial.rfc) patch.rfc = form.rfc.trim() || null;
    if ((form.nss.trim() || null) !== initial.nss) patch.nss = form.nss.trim() || null;
    if ((form.curp.trim() || null) !== initial.curp) patch.curp = form.curp.trim() || null;
    if ((form.telefono.trim() || null) !== initial.telefono) patch.telefono = form.telefono.trim() || null;
    if ((form.email_personal.trim() || null) !== initial.email_personal) patch.email_personal = form.email_personal.trim() || null;
    if ((form.direccion.trim() || null) !== initial.direccion) patch.direccion = form.direccion.trim() || null;
    if ((form.banco.trim() || null) !== initial.banco) patch.banco = form.banco.trim() || null;
    if ((form.cuenta_bancaria.trim() || null) !== initial.cuenta_bancaria) patch.cuenta_bancaria = form.cuenta_bancaria.trim() || null;
    if ((form.clabe.trim() || null) !== initial.clabe) patch.clabe = form.clabe.trim() || null;

    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }

    start(async () => {
      const r = await actualizarDatosEmpleadoAction(empleadoId, patch);
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({ kind: "ok", text: "✓ Datos actualizados" });
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <section className="surface-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-4 hover:bg-white/[0.02]"
      >
        <div className="flex items-center gap-3">
          <Icon name="lock" size={14} className="text-amber-300" />
          <div className="text-left">
            <p className="text-sm font-semibold">Datos personales y bancarios</p>
            <p className="text-[10px] text-muted">
              {camposLlenos}/{totalCampos} campos · {tieneBancarios ? "✓ Listo para depósitos" : "Sin datos bancarios completos"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-white/5 sm:block">
            <div
              className="h-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct === 100 ? "#10B981" : pct >= 50 ? "#F59E0B" : "#EF4444",
              }}
            />
          </div>
          <span className="font-mono text-xs text-muted">{pct}%</span>
          <Icon name={open ? "x" : "edit"} size={12} className="text-muted" />
        </div>
      </button>

      {open && (
        <div className="border-t border-white/5 p-4">
          {!editing ? (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <Display label="RFC" value={initial.rfc} mono />
                <Display label="NSS" value={initial.nss} mono />
                <Display label="CURP" value={initial.curp} mono />
                <Display label="Teléfono" value={initial.telefono} mono />
                <Display label="Email personal" value={initial.email_personal} />
                <Display label="Dirección" value={initial.direccion} fullSpan />
                <Display label="Banco" value={initial.banco} highlight={initial.banco ? "emerald" : undefined} />
                <Display label="Cuenta bancaria" value={initial.cuenta_bancaria} mono />
                <Display label="CLABE" value={initial.clabe} mono highlight={initial.clabe ? "emerald" : undefined} />
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={() => setEditing(true)} className="btn btn-primary btn-sm">
                  <Icon name="edit" size={12} /> Editar datos
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-2 text-[10px] uppercase tracking-tagline text-muted-2">Fiscales / IMSS</div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="RFC" value={form.rfc} onChange={(v) => setForm({ ...form, rfc: v.toUpperCase() })} placeholder="PEGJ900101AB1" disabled={pending} />
                <Field label="NSS (11 dígitos)" value={form.nss} onChange={(v) => setForm({ ...form, nss: v.replace(/\D/g, "") })} placeholder="12345678901" disabled={pending} maxLength={11} />
                <Field label="CURP (18 chars)" value={form.curp} onChange={(v) => setForm({ ...form, curp: v.toUpperCase() })} placeholder="PEGJ900101HYNJRN05" disabled={pending} maxLength={18} />
              </div>

              <div className="mb-2 mt-4 text-[10px] uppercase tracking-tagline text-muted-2">Contacto</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Teléfono" value={form.telefono} onChange={(v) => setForm({ ...form, telefono: v })} placeholder="9991234567" disabled={pending} />
                <Field label="Email personal" value={form.email_personal} onChange={(v) => setForm({ ...form, email_personal: v.toLowerCase() })} placeholder="empleado@gmail.com" disabled={pending} type="email" />
                <div className="sm:col-span-2">
                  <Field label="Dirección" value={form.direccion} onChange={(v) => setForm({ ...form, direccion: v })} placeholder="Calle, número, colonia, ciudad, estado" disabled={pending} />
                </div>
              </div>

              <div className="mb-2 mt-4 text-[10px] uppercase tracking-tagline text-emerald-300/80">
                Datos bancarios para depósito de nómina
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="field">
                  <label>Banco</label>
                  <input
                    list="bancos-list"
                    value={form.banco}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })}
                    placeholder="BBVA"
                    disabled={pending}
                  />
                  <datalist id="bancos-list">
                    {BANCOS_COMUNES.map((b) => <option key={b} value={b} />)}
                  </datalist>
                </div>
                <Field label="Cuenta bancaria" value={form.cuenta_bancaria} onChange={(v) => setForm({ ...form, cuenta_bancaria: v.replace(/\s+/g, "") })} placeholder="0123456789" disabled={pending} mono />
                <Field label="CLABE (18 dígitos)" value={form.clabe} onChange={(v) => setForm({ ...form, clabe: v.replace(/\D/g, "") })} placeholder="012914002012345678" disabled={pending} maxLength={18} mono />
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <button onClick={cancelar} disabled={pending} className="btn btn-ghost btn-sm">Cancelar</button>
                <button onClick={guardar} disabled={pending} className="btn btn-primary btn-sm">
                  {pending ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </>
          )}

          {msg && (
            <p className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
              msg.kind === "ok"
                ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
                : "border-red-400/30 bg-red-500/[0.08] text-red-200"
            }`}>{msg.text}</p>
          )}
        </div>
      )}
    </section>
  );
}

function Display({ label, value, mono, fullSpan, highlight }: { label: string; value: string | null; mono?: boolean | undefined; fullSpan?: boolean | undefined; highlight?: "emerald" | undefined }) {
  const cls = highlight === "emerald" ? "text-emerald-200" : value ? "" : "text-muted-2";
  return (
    <div className={fullSpan ? "sm:col-span-2 lg:col-span-3" : ""}>
      <p className="text-[9px] uppercase tracking-tagline text-muted-2">{label}</p>
      <p className={`mt-0.5 text-xs ${mono ? "font-mono" : ""} ${cls}`}>
        {value || <span className="italic text-muted-2">vacío</span>}
      </p>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, disabled, type = "text", maxLength, mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: string;
  maxLength?: number;
  mono?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        maxLength={maxLength}
        className={mono ? "font-mono" : ""}
      />
    </div>
  );
}
