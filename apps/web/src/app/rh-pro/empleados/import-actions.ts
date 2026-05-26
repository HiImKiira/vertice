"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ─────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────

const JORNADAS_VALIDAS = ["MATUTINO", "VESPERTINO", "NOCTURNO", "TURNO_ROTATIVO", "CUBRETURNOS", "DIURNO"] as const;
type JornadaValida = (typeof JORNADAS_VALIDAS)[number];

const DIAS_VALIDOS = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"] as const;
type DiaValido = (typeof DIAS_VALIDOS)[number];

export interface FilaPreview {
  rowNumber: number;
  // Datos finales (post-validación)
  numero_empleado: string | null; // null = auto-asignar
  nombre: string;
  sede_id: string | null;
  sede_abrev: string | null;
  jornada: JornadaValida | null;
  dia_descanso: DiaValido[];
  salario_diario: number;
  fecha_alta: string; // YYYY-MM-DD
  // Datos personales / fiscales / bancarios (todos opcionales)
  rfc: string | null;
  nss: string | null;
  curp: string | null;
  telefono: string | null;
  email_personal: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  clabe: string | null;
  direccion: string | null;
  // Estado
  status: "ok" | "warn" | "error";
  warnings: string[];
  errors: string[];
  // Si existe ya en BD por numero_empleado
  matchedEmpleadoId: string | null;
}

export interface PreviewResult {
  ok: true;
  totalFilas: number;
  validas: number;
  conWarnings: number;
  conErrores: number;
  nuevosEmpleados: number;
  actualizaciones: number;
  filas: FilaPreview[];
  sedesDisponibles: Array<{ id: string; abrev: string; nombre: string }>;
}

export type PreviewActionResult =
  | PreviewResult
  | { ok: false; error: string };

export interface ConfirmResult {
  creados: number;
  actualizados: number;
  saltados: number;
  errores: Array<{ rowNumber: number; error: string }>;
}

export type ConfirmActionResult =
  | ({ ok: true } & ConfirmResult)
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────

async function requireAdminLike() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { sb: null, userId: null, error: "Sin sesión" as const };
  const { data: perfil } = await supabase
    .from("usuarios").select("rol").eq("id", user.id).single<{ rol: string }>();
  if (!perfil || !["ADMIN", "SUPERADMIN", "SOPORTE", "CEO"].includes(perfil.rol)) {
    return { sb: null, userId: null, error: "Solo admin / superadmin / soporte." };
  }
  return { sb: supabase, userId: user.id, error: null };
}

function normalizar(s: unknown): string {
  return String(s ?? "").trim();
}

function parseDiaDescanso(raw: unknown): DiaValido[] {
  if (!raw) return ["DOM"];
  const txt = String(raw).toUpperCase().trim();
  const map: Record<string, DiaValido> = {
    LUNES: "LUN", LUN: "LUN", L: "LUN",
    MARTES: "MAR", MAR: "MAR", MA: "MAR",
    MIERCOLES: "MIE", "MIÉRCOLES": "MIE", MIE: "MIE", MI: "MIE", X: "MIE",
    JUEVES: "JUE", JUE: "JUE", J: "JUE",
    VIERNES: "VIE", VIE: "VIE", V: "VIE",
    SABADO: "SAB", "SÁBADO": "SAB", SAB: "SAB", S: "SAB",
    DOMINGO: "DOM", DOM: "DOM", D: "DOM",
  };
  const partes = txt.split(/\s*(?:Y|,|\+|\/|-|·)\s*/i).map((p) => p.trim()).filter(Boolean);
  const dias: DiaValido[] = [];
  for (const p of partes) {
    const d = map[p];
    if (d && !dias.includes(d)) dias.push(d);
  }
  return dias.length ? dias : ["DOM"];
}

function parseFecha(raw: unknown): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // Excel date (number)
  if (typeof raw === "number") {
    // Excel epoch: 1899-12-30
    const ms = (raw - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  // Date instance (exceljs a veces lo devuelve así)
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY o DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const dd = m[1]!.padStart(2, "0");
    const mm = m[2]!.padStart(2, "0");
    let yy = m[3]!;
    if (yy.length === 2) yy = `20${yy}`;
    return `${yy}-${mm}-${dd}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function parseSalario(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 315.04;
  if (typeof raw === "number") return raw;
  const s = String(raw).replace(/[$,\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 315.04 : n;
}

function parseJornada(raw: unknown): JornadaValida | null {
  if (!raw) return null;
  const s = String(raw).toUpperCase().trim().replace(/\s+/g, "_");
  if ((JORNADAS_VALIDAS as readonly string[]).includes(s)) return s as JornadaValida;
  // Aliases comunes
  const aliases: Record<string, JornadaValida> = {
    MATUTINA: "MATUTINO", MAT: "MATUTINO", MAÑANA: "MATUTINO",
    VESPERTINA: "VESPERTINO", VES: "VESPERTINO", TARDE: "VESPERTINO", "VESPERTNO": "VESPERTINO",
    NOC: "NOCTURNO", NOCTURNA: "NOCTURNO", NOCHE: "NOCTURNO",
    "TURNO_ROTATIVO": "TURNO_ROTATIVO", ROTATIVO: "TURNO_ROTATIVO", ROT: "TURNO_ROTATIVO",
    CUBRE: "CUBRETURNOS", CUBRETURNO: "CUBRETURNOS",
    DIURNA: "DIURNO", DIA: "DIURNO", DÍA: "DIURNO",
  };
  return aliases[s] ?? null;
}

// ─────────────────────────────────────────────────────────────────────
// PREVIEW — parsea xlsx y valida sin tocar BD
// ─────────────────────────────────────────────────────────────────────

export async function previewImportarEmpleadosAction(formData: FormData): Promise<PreviewActionResult> {
  const auth = await requireAdminLike();
  if (!auth.sb) return { ok: false, error: auth.error ?? "Sin permisos" };

  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "Sin archivo" };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Máximo 10 MB" };

  // Cargar sedes activas + empleados existentes (para matching)
  const admin = supabaseAdmin();
  const [{ data: sedesRaw }, { data: empleadosRaw }] = await Promise.all([
    admin.from("sedes").select("id, abrev, nombre").or("activa.is.null,activa.eq.true").order("abrev"),
    admin.from("empleados").select("id, numero_empleado, nombre"),
  ]);

  const sedes = (sedesRaw ?? []) as Array<{ id: string; abrev: string; nombre: string }>;
  const empleadosExistentes = (empleadosRaw ?? []) as Array<{ id: string; numero_empleado: string; nombre: string }>;

  const sedePorAbrev = new Map<string, { id: string; abrev: string; nombre: string }>();
  const sedePorNombre = new Map<string, { id: string; abrev: string; nombre: string }>();
  for (const s of sedes) {
    sedePorAbrev.set(s.abrev.toLowerCase().trim(), s);
    sedePorNombre.set(s.nombre.toLowerCase().trim(), s);
  }

  const empleadoPorNum = new Map<string, { id: string; nombre: string }>();
  for (const e of empleadosExistentes) empleadoPorNum.set(String(e.numero_empleado).trim(), { id: e.id, nombre: e.nombre });

  // Parsear archivo
  const wb = new ExcelJS.Workbook();
  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
    await wb.xlsx.load(buffer);
  } catch (e) {
    return { ok: false, error: `No se pudo leer el archivo: ${e instanceof Error ? e.message : "formato inválido"}` };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "El archivo no tiene hojas" };

  // Detectar header row (primera fila con valores)
  const headerRowIdx = 1;
  const headerRow = ws.getRow(headerRowIdx);
  const colByHeader = new Map<string, number>();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = normalizar(cell.value).toLowerCase().replace(/\s+/g, "_");
    if (key) colByHeader.set(key, colNumber);
  });

  // Aliases de columnas — el usuario puede usar nombres variados
  function findCol(...alts: string[]): number | null {
    for (const a of alts) {
      const c = colByHeader.get(a.toLowerCase());
      if (c) return c;
    }
    return null;
  }

  const colNumero = findCol("numero_empleado", "id", "no_empleado", "numero", "nº", "n°", "no");
  const colNombre = findCol("nombre", "nombre_trabajador", "empleado");
  const colSede = findCol("sede", "abrev", "sede_abrev", "sede_nombre", "centro");
  const colJornada = findCol("jornada", "turno");
  const colDiaDesc = findCol("dia_descanso", "descanso", "día_descanso");
  const colSalario = findCol("salario_diario", "salario", "sueldo_diario", "sueldo");
  const colFechaAlta = findCol("fecha_alta", "alta", "ingreso", "fecha_ingreso");
  // Datos personales / bancarios (todos opcionales)
  const colRFC = findCol("rfc");
  const colNSS = findCol("nss", "imss", "seguro_social");
  const colCURP = findCol("curp");
  const colTelefono = findCol("telefono", "teléfono", "tel", "celular", "movil", "móvil");
  const colEmail = findCol("email_personal", "email", "correo", "correo_personal");
  const colBanco = findCol("banco", "banco_nombre");
  const colCuenta = findCol("cuenta_bancaria", "cuenta", "no_cuenta", "numero_cuenta", "número_cuenta");
  const colClabe = findCol("clabe", "clabe_interbancaria", "clabe_spei");
  const colDireccion = findCol("direccion", "dirección", "domicilio");

  if (!colNombre) return { ok: false, error: "Falta la columna 'nombre' (o 'nombre_trabajador') en el archivo" };
  if (!colSede) return { ok: false, error: "Falta la columna 'sede' (o 'sede_abrev') en el archivo" };
  if (!colJornada) return { ok: false, error: "Falta la columna 'jornada' en el archivo" };

  const filas: FilaPreview[] = [];
  const totalRows = ws.rowCount;

  // Numeros nuevos a auto-asignar — partimos del max actual + 1, garantizando ≥400
  let nextAuto = Math.max(
    400,
    ...empleadosExistentes
      .map((e) => parseInt(e.numero_empleado, 10))
      .filter((n) => !isNaN(n)),
  ) + 1;

  const numerosUsadosEnArchivo = new Set<string>();

  for (let r = headerRowIdx + 1; r <= totalRows; r++) {
    const row = ws.getRow(r);

    // Si toda la fila está vacía, salta
    const vacia = !row.values || (Array.isArray(row.values) && row.values.every((v) => v === null || v === undefined || v === ""));
    if (vacia) continue;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Nombre
    const nombre = normalizar(row.getCell(colNombre).value);
    if (!nombre) errors.push("Nombre vacío");

    // Sede
    const sedeRaw = normalizar(row.getCell(colSede).value);
    let sede: { id: string; abrev: string; nombre: string } | undefined =
      sedePorAbrev.get(sedeRaw.toLowerCase());
    if (!sede) sede = sedePorNombre.get(sedeRaw.toLowerCase());
    // Fuzzy: empieza con o contiene
    if (!sede) {
      const lower = sedeRaw.toLowerCase();
      sede = sedes.find((s) => s.abrev.toLowerCase().startsWith(lower) || s.nombre.toLowerCase().includes(lower));
      if (sede) warnings.push(`Sede "${sedeRaw}" coincidió por fuzzy con ${sede.abrev}`);
    }
    if (!sede) errors.push(`Sede no encontrada: "${sedeRaw}"`);

    // Jornada
    const jornada = parseJornada(row.getCell(colJornada).value);
    if (!jornada) errors.push(`Jornada inválida: "${normalizar(row.getCell(colJornada).value)}"`);

    // Numero empleado
    let numero_empleado: string | null = null;
    if (colNumero) {
      const numRaw = normalizar(row.getCell(colNumero).value);
      if (numRaw) {
        numero_empleado = numRaw.replace(/^0+/, "") || "0"; // sin ceros líderes pero conserva "0" si solo era ceros
        if (numerosUsadosEnArchivo.has(numero_empleado)) {
          errors.push(`Número ${numero_empleado} repetido en el archivo`);
        }
        numerosUsadosEnArchivo.add(numero_empleado);
      }
    }

    // ¿Existe ya?
    let matchedEmpleadoId: string | null = null;
    if (numero_empleado && empleadoPorNum.has(numero_empleado)) {
      matchedEmpleadoId = empleadoPorNum.get(numero_empleado)!.id;
      warnings.push(`Ya existe (#${numero_empleado} — ${empleadoPorNum.get(numero_empleado)!.nombre}) — se actualizará`);
    }

    // Auto-asignar si no se proporcionó
    if (!numero_empleado) {
      while (empleadoPorNum.has(String(nextAuto)) || numerosUsadosEnArchivo.has(String(nextAuto))) nextAuto++;
      numero_empleado = String(nextAuto);
      numerosUsadosEnArchivo.add(numero_empleado);
      warnings.push(`Sin número proporcionado, se auto-asignó ${numero_empleado}`);
      nextAuto++;
    }

    // Día descanso
    const dia_descanso = colDiaDesc ? parseDiaDescanso(row.getCell(colDiaDesc).value) : ["DOM"];

    // Salario
    const salario_diario = colSalario ? parseSalario(row.getCell(colSalario).value) : 315.04;
    if (salario_diario <= 0) warnings.push("Salario en 0 o negativo, usando default 315.04");

    // Fecha alta
    const fecha_alta = colFechaAlta ? parseFecha(row.getCell(colFechaAlta).value) : new Date().toISOString().slice(0, 10);

    // ─── Datos personales / fiscales / bancarios (opcionales) ───
    const cellText = (col: number | null): string | null => {
      if (!col) return null;
      const v = normalizar(row.getCell(col).value);
      return v ? v : null;
    };
    const rfc = cellText(colRFC)?.toUpperCase().replace(/\s+/g, "") ?? null;
    const nss = cellText(colNSS)?.replace(/\D/g, "") ?? null;
    const curp = cellText(colCURP)?.toUpperCase().replace(/\s+/g, "") ?? null;
    const telefono = cellText(colTelefono);
    const email_personal = cellText(colEmail)?.toLowerCase() ?? null;
    const banco = cellText(colBanco);
    const cuenta_bancaria = cellText(colCuenta)?.replace(/\s+/g, "") ?? null;
    const clabe = cellText(colClabe)?.replace(/\D/g, "") ?? null;
    const direccion = cellText(colDireccion);

    // Validaciones suaves (warnings, no errores) para formato
    if (rfc && !/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{0,3}$/.test(rfc)) {
      warnings.push(`RFC "${rfc}" no tiene formato estándar`);
    }
    if (nss && nss.length !== 11) {
      warnings.push(`NSS debe ser 11 dígitos (tiene ${nss.length})`);
    }
    if (curp && curp.length !== 18) {
      warnings.push(`CURP debe ser 18 caracteres (tiene ${curp.length})`);
    }
    if (clabe && clabe.length !== 18) {
      warnings.push(`CLABE debe ser 18 dígitos (tiene ${clabe.length})`);
    }
    if (email_personal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email_personal)) {
      warnings.push(`Email "${email_personal}" no tiene formato válido`);
    }

    filas.push({
      rowNumber: r,
      numero_empleado,
      nombre,
      sede_id: sede?.id ?? null,
      sede_abrev: sede?.abrev ?? sedeRaw,
      jornada,
      dia_descanso: dia_descanso as DiaValido[],
      salario_diario: salario_diario > 0 ? salario_diario : 315.04,
      fecha_alta,
      rfc,
      nss,
      curp,
      telefono,
      email_personal,
      banco,
      cuenta_bancaria,
      clabe,
      direccion,
      status: errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "ok",
      warnings,
      errors,
      matchedEmpleadoId,
    });
  }

  const validas = filas.filter((f) => f.status !== "error").length;
  const conWarnings = filas.filter((f) => f.status === "warn").length;
  const conErrores = filas.filter((f) => f.status === "error").length;
  const nuevosEmpleados = filas.filter((f) => f.status !== "error" && !f.matchedEmpleadoId).length;
  const actualizaciones = filas.filter((f) => f.status !== "error" && f.matchedEmpleadoId).length;

  return {
    ok: true,
    totalFilas: filas.length,
    validas,
    conWarnings,
    conErrores,
    nuevosEmpleados,
    actualizaciones,
    filas,
    sedesDisponibles: sedes,
  };
}

// ─────────────────────────────────────────────────────────────────────
// CONFIRM — ejecuta la importación con las filas ya validadas
// ─────────────────────────────────────────────────────────────────────

export async function confirmarImportarEmpleadosAction(
  filas: FilaPreview[],
  opciones: { actualizarExistentes: boolean },
): Promise<ConfirmActionResult> {
  const auth = await requireAdminLike();
  if (!auth.sb) return { ok: false, error: auth.error ?? "Sin permisos" };

  const admin = supabaseAdmin();
  let creados = 0;
  let actualizados = 0;
  let saltados = 0;
  const errores: Array<{ rowNumber: number; error: string }> = [];

  for (const f of filas) {
    // Re-validar al server (no confiar 100% en payload del cliente)
    if (f.status === "error" || !f.sede_id || !f.jornada || !f.nombre || !f.numero_empleado) {
      saltados++;
      continue;
    }
    // Si ya existe y no se pidió actualizar → saltar
    if (f.matchedEmpleadoId && !opciones.actualizarExistentes) {
      saltados++;
      continue;
    }

    const payload: Record<string, unknown> = {
      numero_empleado: f.numero_empleado,
      nombre: f.nombre,
      sede_id: f.sede_id,
      jornada: f.jornada,
      // dia_descanso: en init es enum singular, en versiones más nuevas array — toleramos
      dia_descanso: f.dia_descanso[0] ?? "DOM",
      salario_diario: f.salario_diario,
      fecha_alta: f.fecha_alta,
    };
    // Solo asignamos los datos personales/bancarios que el archivo trajo,
    // para no sobrescribir con NULL en updates si la columna no estaba en el xlsx.
    if (f.rfc) payload.rfc = f.rfc;
    if (f.nss) payload.nss = f.nss;
    if (f.curp) payload.curp = f.curp;
    if (f.telefono) payload.telefono = f.telefono;
    if (f.email_personal) payload.email_personal = f.email_personal;
    if (f.banco) payload.banco = f.banco;
    if (f.cuenta_bancaria) payload.cuenta_bancaria = f.cuenta_bancaria;
    if (f.clabe) payload.clabe = f.clabe;
    if (f.direccion) payload.direccion = f.direccion;

    if (f.matchedEmpleadoId) {
      const { error } = await admin
        .from("empleados")
        .update(payload)
        .eq("id", f.matchedEmpleadoId);
      if (error) {
        errores.push({ rowNumber: f.rowNumber, error: `Update: ${error.message}` });
      } else {
        actualizados++;
      }
    } else {
      const { error } = await admin
        .from("empleados")
        .insert(payload);
      if (error) {
        errores.push({ rowNumber: f.rowNumber, error: `Insert: ${error.message}` });
      } else {
        creados++;
      }
    }
  }

  revalidatePath("/rh-pro/empleados");
  revalidatePath("/rh-pro");

  return { ok: true, creados, actualizados, saltados, errores };
}
