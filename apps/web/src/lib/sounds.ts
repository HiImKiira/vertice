/**
 * Biblioteca de sonidos sintetizados con Web Audio API.
 *
 * No requiere descargar archivos — los tonos se generan en vivo con
 * oscillators y envelopes. Funciona offline y es liviano.
 *
 * IMPORTANTE: los browsers exigen una interacción del usuario antes de
 * poder reproducir audio. Por eso el primer play puede requerir un tap.
 */

export type SoundId =
  | "ninguno"
  | "campana"
  | "beep"
  | "pulso-doble"
  | "triple-ding"
  | "glissando"
  | "acorde"
  | "discreto"
  | "urgente";

export interface SoundPreset {
  id: SoundId;
  label: string;
  description: string;
}

export const SOUND_PRESETS: SoundPreset[] = [
  { id: "ninguno",      label: "Silencio",       description: "No reproducir sonido" },
  { id: "campana",      label: "Campana",        description: "Tono cálido con decaimiento — neutral" },
  { id: "beep",         label: "Beep",           description: "Pitido único corto — discreto" },
  { id: "pulso-doble",  label: "Pulso doble",    description: "Dos pulsos rápidos — atención sin alarmar" },
  { id: "triple-ding",  label: "Triple ding",    description: "3 notas ascendentes — positivo" },
  { id: "glissando",    label: "Glissando",      description: "Barrido suave de grave a agudo" },
  { id: "acorde",       label: "Acorde",         description: "3 notas simultáneas — confirmación" },
  { id: "discreto",     label: "Discreto",       description: "Pulso bajo muy corto — apenas audible" },
  { id: "urgente",      label: "Urgente",        description: "Patrón de alerta repetido — usar con moderación" },
];

// Tipos de evento que Vortex puede notificar
export type EventoTipo =
  | "ticket_nuevo"
  | "ticket_respuesta_rh"
  | "ticket_respuesta_user"
  | "ticket_cerrado"
  | "fecha_liberada"
  | "recordatorio_captura"
  | "announcement"
  | "solicitud_compra_nueva"
  | "solicitud_compra_estado"
  | "acceso_facturacion"
  | "cambio_descanso_fijo"
  | "test";

export interface EventoSpec {
  id: EventoTipo;
  label: string;
  description: string;
  default: SoundId;
}

export const EVENTOS: EventoSpec[] = [
  { id: "ticket_nuevo",         label: "Ticket nuevo (RH/Soporte)",         description: "Un supervisor abre un ticket — necesita atención del equipo de RH",       default: "triple-ding" },
  { id: "ticket_respuesta_user", label: "Respuesta del supervisor",          description: "Supervisor responde en un ticket — vuelve la pelota a RH",                default: "pulso-doble" },
  { id: "ticket_respuesta_rh",  label: "Respuesta de RH",                   description: "RH te responde tu ticket — para el supervisor que lo abrió",              default: "campana" },
  { id: "ticket_cerrado",       label: "Ticket cerrado",                    description: "Tu ticket fue cerrado por RH",                                            default: "discreto" },
  { id: "fecha_liberada",       label: "Fecha liberada",                    description: "RH te liberó una fecha — apúrate a capturar antes de que expire",         default: "urgente" },
  { id: "recordatorio_captura", label: "Recordatorio de captura",           description: "El cron automático te recuerda capturar tu pase de lista",                 default: "beep" },
  { id: "announcement",         label: "Anuncio general",                   description: "RH manda un anuncio a todos los suscritos",                                default: "acorde" },
  { id: "solicitud_compra_nueva", label: "Solicitud de compra nueva",        description: "Un supervisor levanta una solicitud — para el equipo de facturación",   default: "triple-ding" },
  { id: "solicitud_compra_estado", label: "Cambio en tu solicitud de compra", description: "Tu solicitud fue aprobada, comprada o entregada",                       default: "campana" },
  { id: "acceso_facturacion",   label: "Acceso a Facturación",              description: "Te habilitaron / quitaron acceso al módulo de facturación",                default: "acorde" },
  { id: "cambio_descanso_fijo", label: "Cambio de descanso fijo",           description: "RH cambió el día de descanso permanente de un trabajador de tu sede",      default: "pulso-doble" },
  { id: "test",                 label: "Push de prueba",                    description: "Disparo manual desde el panel de soporte",                                 default: "glissando" },
];

const STORAGE_KEY = "vortex-sound-prefs";

export interface SoundPrefs {
  habilitado: boolean;
  porEvento: Partial<Record<EventoTipo, SoundId>>;
  volumen: number; // 0..1
}

export function getSoundPrefs(): SoundPrefs {
  if (typeof window === "undefined") return { habilitado: true, porEvento: {}, volumen: 0.6 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { habilitado: true, porEvento: {}, volumen: 0.6 };
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      habilitado: parsed.habilitado ?? true,
      porEvento: parsed.porEvento ?? {},
      volumen: typeof parsed.volumen === "number" ? Math.min(1, Math.max(0, parsed.volumen)) : 0.6,
    };
  } catch {
    return { habilitado: true, porEvento: {}, volumen: 0.6 };
  }
}

export function saveSoundPrefs(p: SoundPrefs): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch {}
}

export function getSoundForEvent(tipo: EventoTipo): SoundId {
  const prefs = getSoundPrefs();
  if (!prefs.habilitado) return "ninguno";
  const elegido = prefs.porEvento[tipo];
  if (elegido) return elegido;
  // Default del catálogo
  return EVENTOS.find((e) => e.id === tipo)?.default ?? "campana";
}

// ─────────────────────────────────────────────────────────────────────
// Web Audio synth — genera cada preset al vuelo
// ─────────────────────────────────────────────────────────────────────

let ctxSingleton: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctxSingleton) return ctxSingleton;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctxSingleton = new Ctx();
  return ctxSingleton;
}

interface Tone {
  freq: number;
  start: number;   // segundos relativos
  duration: number;
  gain?: number;
  type?: OscillatorType;
}

function playTones(tones: Tone[], volumen: number) {
  const ctx = getCtx();
  if (!ctx) return;
  // En iOS el contexto puede estar suspended hasta que haya gesture
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = t.type ?? "sine";
    osc.frequency.setValueAtTime(t.freq, now + t.start);
    const peak = (t.gain ?? 0.4) * volumen;
    // Envelope ADSR simplificado
    gainNode.gain.setValueAtTime(0, now + t.start);
    gainNode.gain.linearRampToValueAtTime(peak, now + t.start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.duration);
    osc.connect(gainNode).connect(ctx.destination);
    osc.start(now + t.start);
    osc.stop(now + t.start + t.duration + 0.05);
  }
}

function playGlissando(volumen: number) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.45 * volumen, now + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.45);
}

/**
 * Reproduce un sonido del catálogo. Si el browser bloquea (no hubo
 * interacción del usuario aún), el audio simplemente no se oye sin tirar
 * error.
 */
export function playSound(id: SoundId, volumenOverride?: number): void {
  if (id === "ninguno") return;
  const prefs = getSoundPrefs();
  const v = volumenOverride ?? prefs.volumen;

  switch (id) {
    case "campana":
      playTones([
        { freq: 880, start: 0,    duration: 0.6, gain: 0.4, type: "sine" },
        { freq: 1320, start: 0,   duration: 0.6, gain: 0.15, type: "sine" },
      ], v);
      break;
    case "beep":
      playTones([{ freq: 880, start: 0, duration: 0.15, gain: 0.4, type: "sine" }], v);
      break;
    case "pulso-doble":
      playTones([
        { freq: 660, start: 0,    duration: 0.12, gain: 0.4, type: "sine" },
        { freq: 660, start: 0.15, duration: 0.12, gain: 0.4, type: "sine" },
      ], v);
      break;
    case "triple-ding":
      playTones([
        { freq: 660, start: 0,    duration: 0.15, gain: 0.35, type: "sine" },
        { freq: 880, start: 0.13, duration: 0.15, gain: 0.35, type: "sine" },
        { freq: 1320, start: 0.26, duration: 0.25, gain: 0.4, type: "sine" },
      ], v);
      break;
    case "glissando":
      playGlissando(v);
      break;
    case "acorde":
      playTones([
        { freq: 523, start: 0, duration: 0.45, gain: 0.3, type: "sine" },  // Do
        { freq: 659, start: 0, duration: 0.45, gain: 0.3, type: "sine" },  // Mi
        { freq: 784, start: 0, duration: 0.45, gain: 0.3, type: "sine" },  // Sol
      ], v);
      break;
    case "discreto":
      playTones([{ freq: 440, start: 0, duration: 0.08, gain: 0.2, type: "sine" }], v);
      break;
    case "urgente":
      playTones([
        { freq: 1100, start: 0,    duration: 0.1, gain: 0.5, type: "square" },
        { freq: 1100, start: 0.18, duration: 0.1, gain: 0.5, type: "square" },
        { freq: 1100, start: 0.36, duration: 0.1, gain: 0.5, type: "square" },
      ], v);
      break;
  }
}

/**
 * Reproduce el sonido configurado para un evento dado.
 * Lo llamamos desde el listener del SW message.
 */
export function playEventSound(tipo: EventoTipo): void {
  const id = getSoundForEvent(tipo);
  playSound(id);
}
