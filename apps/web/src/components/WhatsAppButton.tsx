"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

interface Props {
  mensaje: string;
  label?: string;
  compact?: boolean;
}

/**
 * Botón de WhatsApp: copia el mensaje al portapapeles y ofrece abrirlo en
 * WhatsApp (elige el contacto ahí) o compartirlo con el menú nativo del
 * dispositivo. No guarda números — sirve para cualquier supervisor.
 */
export function WhatsAppButton({ mensaje, label = "WhatsApp", compact }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [puedeCompartir, setPuedeCompartir] = useState(false);

  useEffect(() => {
    setPuedeCompartir(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Fallback si el navegador bloquea el portapapeles
      window.prompt("Copia el mensaje:", mensaje);
    }
  }

  async function abrirWhatsApp(): Promise<void> {
    await copiar();
    window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, "_blank", "noopener");
  }

  async function compartir(): Promise<void> {
    try {
      await navigator.share({ text: mensaje });
    } catch {
      /* el usuario canceló */
    }
  }

  return (
    <div className={`inline-flex items-center gap-1 ${compact ? "" : "flex-wrap"}`}>
      <button
        type="button"
        onClick={abrirWhatsApp}
        title="Copia el mensaje y abre WhatsApp para elegir el contacto"
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/30"
      >
        <Icon name="message-circle" size={12} /> {label}
      </button>
      <button
        type="button"
        onClick={copiar}
        title="Solo copiar el mensaje"
        className="rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-muted transition hover:border-white/30 hover:text-text"
      >
        {copiado ? "✓ Copiado" : "Copiar"}
      </button>
      {puedeCompartir && (
        <button
          type="button"
          onClick={compartir}
          title="Compartir con otra app"
          className="rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-muted transition hover:border-white/30 hover:text-text"
        >
          Compartir
        </button>
      )}
    </div>
  );
}
