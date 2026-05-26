"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/Icon";

interface Props {
  fecha: string;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function meridaToday(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return ymd(d);
}

function meridaYesterday(): string {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  d.setDate(d.getDate() - 1);
  return ymd(d);
}

export function DateNav({ fecha }: Props) {
  const router = useRouter();
  const params = useSearchParams();

  function go(nuevaFecha: string) {
    const usp = new URLSearchParams(params.toString());
    usp.set("fecha", nuevaFecha);
    router.push(`/live/cobertura?${usp.toString()}`);
  }

  const hoy = meridaToday();
  const ayer = meridaYesterday();
  const esHoy = fecha === hoy;
  const esAyer = fecha === ayer;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[color:var(--card)] p-3">
      <Icon name="calendar" size={14} className="text-muted" />
      <span className="text-xs font-semibold text-text">Fecha:</span>
      <input
        type="date"
        value={fecha}
        onChange={(e) => go(e.target.value)}
        className="rounded-md border border-white/10 bg-[color:var(--surface)] px-3 py-1.5 text-xs"
      />
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => go(hoy)}
          className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${
            esHoy
              ? "bg-blue-500/80 text-white"
              : "border border-white/10 text-muted hover:text-text"
          }`}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => go(ayer)}
          className={`rounded-md px-2.5 py-1 text-[10px] font-semibold ${
            esAyer
              ? "bg-amber-500/80 text-white"
              : "border border-amber-400/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/25"
          }`}
          title="Útil para cierre de nómina"
        >
          Ayer (nómina)
        </button>
      </div>
    </div>
  );
}
