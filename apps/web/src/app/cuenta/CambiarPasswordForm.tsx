"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function CambiarPasswordForm() {
  const [pending, start] = useTransition();
  const [nueva, setNueva] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function guardar() {
    setMsg(null);
    if (nueva.length < 8) { setMsg({ ok: false, text: "Mínimo 8 caracteres." }); return; }
    if (nueva !== confirma) { setMsg({ ok: false, text: "Las contraseñas no coinciden." }); return; }
    start(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: nueva });
      if (error) { setMsg({ ok: false, text: `No se pudo cambiar: ${error.message}` }); return; }
      setNueva(""); setConfirma("");
      setMsg({ ok: true, text: "✓ Contraseña actualizada. Úsala la próxima vez que inicies sesión." });
    });
  }

  return (
    <section className="surface-glow max-w-md p-5">
      <div className="section-label mb-1">Cambiar mi contraseña</div>
      <p className="mb-4 text-[11px] text-muted">
        Tu sesión actual no se cierra. La nueva contraseña aplica desde tu próximo inicio de sesión.
      </p>
      <div className="space-y-3">
        <div className="field">
          <label>Nueva contraseña — mínimo 8 caracteres</label>
          <div className="flex gap-2">
            <input
              type={ver ? "text" : "password"}
              value={nueva}
              onChange={(e) => { setNueva(e.target.value); setMsg(null); }}
              disabled={pending}
              autoComplete="new-password"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => setVer(!ver)}
              className="rounded-md border border-white/10 px-2.5 text-xs text-muted hover:border-white/30 hover:text-text"
              title={ver ? "Ocultar" : "Mostrar"}
            >
              {ver ? "🙈" : "👁"}
            </button>
          </div>
        </div>
        <div className="field">
          <label>Repite la nueva contraseña</label>
          <input
            type={ver ? "text" : "password"}
            value={confirma}
            onChange={(e) => { setConfirma(e.target.value); setMsg(null); }}
            disabled={pending}
            autoComplete="new-password"
          />
        </div>
        {msg && (
          <p className={`rounded-md border px-3 py-2 text-xs ${
            msg.ok ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200" : "border-red-400/30 bg-red-500/[0.08] text-red-200"
          }`}>{msg.text}</p>
        )}
        <button
          type="button"
          onClick={guardar}
          disabled={pending || !nueva || !confirma}
          className="btn btn-primary inline-flex items-center gap-1.5"
        >
          <Icon name="check" size={13} /> {pending ? "Guardando…" : "Guardar nueva contraseña"}
        </button>
      </div>
    </section>
  );
}
