"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { guardarNotaSupervisorAction } from "../actions";

interface Props {
  supervisorId: string;
  initial: string;
  ultimaActualizacion: { fecha: string | null; autor: string | null };
}

export function NotasEditor({ supervisorId, initial, ultimaActualizacion }: Props) {
  const router = useRouter();
  const [valor, setValor] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = valor !== initial;

  function guardar() {
    setMsg(null);
    start(async () => {
      const r = await guardarNotaSupervisorAction(supervisorId, valor);
      if (r.ok) { setMsg("✓ Nota guardada"); router.refresh(); }
      else setMsg(`Error: ${r.error}`);
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        rows={6}
        placeholder="Notas internas — solo RH las ve. Ej: rotación de turno, observaciones del CEO, eventos relevantes, etc."
        className="w-full rounded-md border border-white/10 bg-[color:var(--surface)] p-3 text-sm"
        disabled={pending}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] text-muted-2">
          {ultimaActualizacion.fecha
            ? <>Última edición: {new Date(ultimaActualizacion.fecha).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}{ultimaActualizacion.autor && <> · por <span className="font-mono">@{ultimaActualizacion.autor}</span></>}</>
            : "Sin notas todavía."}
        </p>
        <div className="flex items-center gap-2">
          {msg && <span className="text-[10px] text-muted">{msg}</span>}
          <button
            type="button"
            onClick={guardar}
            disabled={!dirty || pending}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-500/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
          >
            <Icon name="check" size={12} />
            {pending ? "Guardando..." : "Guardar nota"}
          </button>
        </div>
      </div>
    </div>
  );
}
