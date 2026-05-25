"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import {
  EVENTOS,
  SOUND_PRESETS,
  getSoundPrefs,
  saveSoundPrefs,
  playSound,
  type EventoTipo,
  type SoundId,
  type SoundPrefs,
} from "@/lib/sounds";

export function SonidosEditor() {
  const [prefs, setPrefs] = useState<SoundPrefs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(getSoundPrefs());
  }, []);

  function update(next: SoundPrefs) {
    setPrefs(next);
    saveSoundPrefs(next);
  }

  function setEvento(tipo: EventoTipo, sound: SoundId) {
    if (!prefs) return;
    update({ ...prefs, porEvento: { ...prefs.porEvento, [tipo]: sound } });
  }

  function setHabilitado(v: boolean) {
    if (!prefs) return;
    update({ ...prefs, habilitado: v });
  }

  function setVolumen(v: number) {
    if (!prefs) return;
    update({ ...prefs, volumen: v });
  }

  function probar(sound: SoundId) {
    playSound(sound, prefs?.volumen);
  }

  function restaurar() {
    if (!confirm("¿Restaurar los sonidos por defecto de cada evento?")) return;
    update({ ...prefs!, porEvento: {} });
    setMsg("✓ Sonidos restaurados a los predeterminados.");
  }

  if (!prefs) {
    return <p className="text-xs text-muted">Cargando preferencias…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Master toggle + volumen */}
      <section className="surface-card p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm">Configuración general</h2>
            <p className="text-[11px] text-muted">
              Activa o silencia globalmente. Ajusta el volumen relativo.
            </p>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={prefs.habilitado}
              onChange={(e) => setHabilitado(e.target.checked)}
              className="h-4 w-4 accent-blue-500"
            />
            <span>{prefs.habilitado ? "Activado" : "Silenciado"}</span>
          </label>
        </div>
        <div className="space-y-2">
          <label className="block">
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
              <span>Volumen</span>
              <span className="font-mono">{Math.round(prefs.volumen * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.volumen}
              onChange={(e) => setVolumen(parseFloat(e.target.value))}
              className="w-full accent-blue-500"
              disabled={!prefs.habilitado}
            />
          </label>
        </div>
      </section>

      {/* Aviso de limitación */}
      <section className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-3 text-[11px] text-amber-200">
        <p className="flex items-start gap-2">
          <Icon name="alert-triangle" size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong>Importante:</strong> los sonidos personalizados se reproducen solo cuando Vortex
            está <strong>abierto</strong> en este dispositivo. Cuando la PWA está cerrada / en background
            profundo, el sistema operativo usa su tono de notificación por defecto — no hay manera
            estándar de cambiar eso. Estas preferencias se guardan localmente en este dispositivo.
          </span>
        </p>
      </section>

      {/* Lista de eventos */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm">Sonido por tipo de evento</h2>
          <button
            type="button"
            onClick={restaurar}
            className="text-[11px] text-muted hover:text-text"
          >
            Restaurar predeterminados
          </button>
        </div>
        <ul className="space-y-2">
          {EVENTOS.map((ev) => {
            const elegido = prefs.porEvento[ev.id] ?? ev.default;
            return (
              <li key={ev.id} className="rounded-xl border border-white/5 bg-[color:var(--card)] p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{ev.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-2">{ev.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => probar(elegido)}
                    disabled={!prefs.habilitado || elegido === "ninguno"}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-blue-400/30 bg-blue-500/15 px-2.5 py-1 text-[11px] font-semibold text-blue-200 hover:bg-blue-500/30 disabled:opacity-40"
                  >
                    <Icon name="play" size={11} />
                    Probar
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SOUND_PRESETS.map((p) => {
                    const active = elegido === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setEvento(ev.id, p.id);
                          if (p.id !== "ninguno" && prefs.habilitado) playSound(p.id, prefs.volumen);
                        }}
                        disabled={!prefs.habilitado}
                        className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition disabled:opacity-40 ${
                          active
                            ? "bg-blue-500/80 text-white"
                            : "border border-white/10 text-muted hover:border-white/30 hover:text-text"
                        }`}
                        title={p.description}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {msg && (
        <p className="rounded-md border border-emerald-400/30 bg-emerald-500/[0.08] px-3 py-2 text-xs text-emerald-200">
          {msg}
        </p>
      )}
    </div>
  );
}
