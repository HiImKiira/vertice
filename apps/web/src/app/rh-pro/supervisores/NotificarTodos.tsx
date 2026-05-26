"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { notificarTodosIncompletosAction } from "./actions";

export function NotificarTodos({ incompletosN }: { incompletosN: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  function notificar() {
    if (incompletosN === 0) return;
    if (!confirm(`Mandar push a los ${incompletosN} supervisores con cobertura incompleta hoy?`)) return;
    setMsg(null);
    start(async () => {
      const r = await notificarTodosIncompletosAction();
      if (!r.ok) { setMsg({ kind: "err", text: r.error }); return; }
      setMsg({
        kind: "ok",
        text: `Notificados: ${r.supervisoresNotificados} supervisor${r.supervisoresNotificados === 1 ? "" : "es"} (${r.dispositivos} dispositivo${r.dispositivos === 1 ? "" : "s"})${r.saltados ? ` · ${r.saltados} sin push activo` : ""}`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={notificar}
        disabled={pending || incompletosN === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/30 disabled:opacity-40"
      >
        <Icon name="send" size={14} />
        {pending
          ? "Enviando..."
          : incompletosN === 0
            ? "Sin incompletos"
            : `Notificar a los ${incompletosN} incompleto${incompletosN === 1 ? "" : "s"}`}
      </button>
      {msg && (
        <p className={`rounded-md border px-2.5 py-1.5 text-[10px] ${
          msg.kind === "ok"
            ? "border-emerald-400/30 bg-emerald-500/[0.08] text-emerald-200"
            : "border-red-400/30 bg-red-500/[0.08] text-red-200"
        }`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
