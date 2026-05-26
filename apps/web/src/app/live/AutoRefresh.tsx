"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";

interface Props {
  intervalSeconds?: number;
  generadoEn: string; // ISO del server
}

export function AutoRefresh({ intervalSeconds = 30, generadoEn }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(true);
  const [segundosRestantes, setSegundosRestantes] = useState(intervalSeconds);
  const [refreshing, setRefreshing] = useState(false);
  const intRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSegundosRestantes(intervalSeconds);
    if (intRef.current) clearInterval(intRef.current);
    if (!enabled) return;
    intRef.current = setInterval(() => {
      setSegundosRestantes((s) => {
        if (s <= 1) {
          setRefreshing(true);
          router.refresh();
          // Damos 800ms para que el server termine y luego paramos el flash
          setTimeout(() => setRefreshing(false), 1200);
          return intervalSeconds;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intRef.current) clearInterval(intRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalSeconds, generadoEn]);

  function refreshNow() {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 1200);
    setSegundosRestantes(intervalSeconds);
  }

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-2">
      <span className={refreshing ? "text-emerald-300" : ""}>
        {refreshing ? "Actualizando..." : `Actualiza en ${segundosRestantes}s`}
      </span>
      <button
        type="button"
        onClick={refreshNow}
        className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 hover:border-white/30 hover:text-text"
        title="Actualizar ahora"
      >
        <Icon name="refresh" size={10} />
      </button>
      <label className="inline-flex items-center gap-1 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-3 w-3 accent-blue-500"
        />
        Auto
      </label>
    </div>
  );
}
