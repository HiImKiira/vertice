"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/Icon";
import { avisarRHQuincenaAction } from "./actions";

export function AvisarRH() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function avisar() {
    setMsg(null);
    start(async () => {
      const r = await avisarRHQuincenaAction();
      setMsg({ ok: r.ok, text: r.ok ? r.mensaje : r.error });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={avisar}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-blue-400/40 bg-blue-500/15 px-3 py-1.5 text-xs font-semibold text-blue-200 transition hover:bg-blue-500/30 disabled:opacity-40"
      >
        <Icon name="send" size={12} /> {pending ? "Avisando…" : "Avisar a RH mi avance"}
      </button>
      {msg && (
        <span className={`text-[11px] ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</span>
      )}
    </div>
  );
}
