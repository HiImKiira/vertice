"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { gafeteEmpleadoAction } from "@/app/rh-pro/qr/actions";

interface Gafete {
  numero: string; nombre: string; jornada: string;
  sede_abrev: string; qr_habilitado: boolean; qrUrl: string;
}

/**
 * Botón "Generar gafete": crea el token QR del empleado (si no tiene),
 * muestra el gafete en pantalla y lo imprime en formato mica 8×11.5 cm
 * con espacio para foto. Reutilizable: alta de empleado y ficha de consulta.
 */
export function GafeteEmpleado({ empleadoId }: { empleadoId: string }) {
  const [pending, start] = useTransition();
  const [gafete, setGafete] = useState<Gafete | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function generar() {
    setErr(null);
    start(async () => {
      const r = await gafeteEmpleadoAction(empleadoId);
      if (!r.ok) { setErr(r.error); return; }
      const qrUrl = await QRCode.toDataURL(r.gafete.token, { width: 220, margin: 1, errorCorrectionLevel: "M" });
      setGafete({
        numero: r.gafete.numero, nombre: r.gafete.nombre, jornada: r.gafete.jornada,
        sede_abrev: r.gafete.sede_abrev, qr_habilitado: r.gafete.qr_habilitado, qrUrl,
      });
    });
  }

  return (
    <div className="print:contents">
      {!gafete ? (
        <button type="button" onClick={generar} disabled={pending} className="btn btn-violet btn-sm print:hidden">
          {pending ? "Generando…" : "🪪 Generar gafete QR"}
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button type="button" onClick={() => window.print()} className="btn btn-primary btn-sm">
              🖨 Imprimir gafete (mica 8×11.5)
            </button>
            {!gafete.qr_habilitado && (
              <span className="text-[11px] text-amber-300">
                ⚠ La sede {gafete.sede_abrev} no tiene asistencia por QR habilitada — el gafete servirá
                cuando se designe la sede en Eventos Extraordinarios.
              </span>
            )}
          </div>
          {/* Vista previa + hoja de impresión */}
          <div id="gafete-print">
            <div className="gafete-card inline-flex flex-col items-center justify-center rounded-xl border border-white/20 bg-white p-4 text-center text-black">
              <p className="gaf-marca text-[10px] font-bold tracking-widest text-neutral-500">MHS INTEGRADORA</p>
              <div className="gaf-foto my-1.5 flex h-20 w-16 items-center justify-center rounded-md border-2 border-dashed border-neutral-300 text-[9px] font-bold tracking-widest text-neutral-400">
                FOTO
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={gafete.qrUrl} alt={`QR ${gafete.numero}`} className="my-1 h-32 w-32" />
              <p className="gaf-nombre w-full max-w-[220px] truncate text-xs font-bold leading-tight">{gafete.nombre}</p>
              <p className="gaf-numero font-mono text-[11px] text-neutral-700">#{gafete.numero}</p>
              <p className="gaf-sede text-[10px] font-semibold text-neutral-500">{gafete.sede_abrev} · {gafete.jornada}</p>
            </div>
          </div>
        </div>
      )}
      {err && <p className="mt-1 text-xs text-red-300 print:hidden">✕ {err}</p>}

      {gafete && (
        <style>{`
          @media print {
            @page { size: letter portrait; margin: 7mm; }
            html, body { background: #fff !important; }
            body::before, body::after { display: none !important; }
            /* Un solo gafete = una sola página: aquí sí sirve el truco de
               visibility+absolute (no hay paginación que romper). */
            body * { visibility: hidden; }
            #gafete-print, #gafete-print * { visibility: visible; }
            #gafete-print { position: absolute; left: 0; top: 0; margin: 0; padding: 0; }
            .gafete-card {
              display: inline-flex !important;
              flex-direction: column;
              align-items: center;
              justify-content: space-evenly;
              width: 80mm !important;
              height: 115mm !important;
              padding: 4mm !important;
              border: 1.2px solid #000 !important;
              border-radius: 3mm !important;
              overflow: hidden;
              box-shadow: none !important;
            }
            .gaf-foto {
              width: 26mm !important; height: 32mm !important; margin: 1mm 0 !important;
              border: 0.4mm dashed #999 !important; border-radius: 2mm !important; font-size: 7pt !important;
            }
            .gafete-card img { width: 46mm !important; height: 46mm !important; margin: 1mm 0 !important; }
            .gaf-marca { font-size: 8pt !important; }
            .gaf-nombre { font-size: 10pt !important; max-width: 72mm !important; }
            .gaf-numero { font-size: 11pt !important; }
            .gaf-sede { font-size: 8.5pt !important; }
          }
        `}</style>
      )}
    </div>
  );
}
