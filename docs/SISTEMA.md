# Vértice — Especificación funcional

Documento de referencia sobre **qué hace** el sistema. Cuando un módulo se implemente, este documento debe estar al día con sus reglas, no con sus pantallas.

---

## 1. Rol `USER` — Supervisor de sede

### 1.1 Pase de lista
- Captura asistencia diaria por **sede** y **jornada** (matutino / vespertino / nocturno).
- Búsqueda rápida por **ID** o **nombre** del empleado.
- **Ventana de gracia**: el supervisor puede capturar hoy y el día anterior hasta las 12:00 pm. Después, la fecha queda bloqueada.
- Si nómina está cerrada, las fechas dentro de ese período no se pueden editar; solo el `SUPERADMIN` puede liberar una fecha específica (con expiración).
- Indicador visual de empleados pendientes de marcar.

### 1.2 Incidencias formales
- Registro detallado por empleado con uno de los códigos: `F`, `DS`, `DT`, `PCG`, `PSG`, `I`, `INH`, `FER`.
- Calendario visual de incidencias por mes.
- Vista de empleados sin marcar en el período.
- **Compensación de descanso**: cuando un empleado trabaja en su día de descanso, queda registrado para pagarse o compensarse.

### 1.3 Turnos eventuales (CDT)
- Cambio de día de descanso **temporal** para un empleado en una fecha específica.
- Listar y cancelar CDTs activos por sede.
- Verificar si una fecha ya tiene un CDT asignado antes de crear uno nuevo.
- Calendario visual de turnos eventuales por sede.

### 1.4 Soporte
- Enviar ticket al equipo de RH: tipos = desbloqueo de fecha, urgencia, duda, sugerencia.
- Ver historial de tickets propios con estado (pendiente / respondido / cerrado).
- Recibir respuestas de RH en tiempo real (Supabase Realtime).

---

## 2. Rol `ADMIN` — RH

### 2.1 Exportación quincenal
- Hoja de cálculo con matriz completa de asistencias por quincena y sede.
- Columnas de resumen: **Días lab.**, **Turnos extra**, **Valor extra**, **Días falta**, **Doms. trab.**, **Prima dom.**, **Desc. faltas**, **Pago estim.**.
- Domingos resaltados en naranja, celdas `DT` en verde, fórmula de pago automática.
- Exportar también a PDF con formato operativo listo para revisión.

### 2.2 Gestión de personal
- **Alta de empleado**: datos completos, sede, jornada, día de descanso semanal.
- **Baja de empleado**: motivo y fecha; queda registrado en hoja `BAJAS`.
- Cambio de día de descanso permanente por empleado.
- Diagnóstico de contratos: detecta filas con errores de formato o datos faltantes.

### 2.3 Inbox de soporte
- Todos los tickets entrantes de supervisores con prioridad (urgente / normal).
- Responder tickets directamente desde el panel.
- Marcar mensajes como leídos; badge de pendientes.
- Liberar fecha bloqueada para un supervisor específico (escala a Superadmin si es fuera de su sede).

### 2.4 Reportes y nómina
- PDF por sede o empleado individual con historial de asistencias.
- Export de incidencias formales a Sheets por período.
- Export de turnos eventuales (CDTs) a Sheets.
- Vista previa de métricas del período antes de exportar nómina.

---

## 3. Rol `CEO` — Dirección

### 3.1 Dashboard ejecutivo
- Vista **mensual**, **semanal** o **diaria** con indicadores globales de todas las sedes.
- % de asistencia, faltas, incidencias y empleados activos por sede en tiempo real.
- Mapa de calor de asistencia por día del período.
- Exportar resumen ejecutivo a PDF con gráficas e indicadores.

### 3.2 Monitor en vivo
- Eventos en tiempo real: qué supervisores están capturando y en qué sede (lee tabla `eventos`).
- Log de actividad: altas, bajas, incidencias y cambios de descanso recientes.
- Faltas por sede del día: lista de empleados ausentes en cada jornada.

---

## 4. Rol `SUPERADMIN`

### 4.1 Control de nómina
- Abrir y cerrar períodos de nómina.
- Fecha de cierre bloquea edición a todos excepto Superadmin.
- Liberar fechas específicas (con caducidad de 24 h por defecto) para que supervisores capturen fuera de la ventana de gracia.

### 4.2 Configuración
- Administrar usuarios del sistema (alta, baja, rol, sede asignada).
- Asignaciones supervisor ↔ sede / jornada.
- Diagnóstico de contratos.
- Acceso total a todas las funciones de `ADMIN` + `USER`.

### 4.3 Análisis con IA
- Analizar foto de credencial para sugerir datos del empleado (Claude Vision).
- Geocodificación inversa de coordenadas para validar sede.

---

## 5. Códigos de asistencia

Fuente de verdad: [`packages/shared/src/codes.ts`](../packages/shared/src/codes.ts).

| Código | Nombre | Día laborado | Prima dom. | Descuento | Extra |
|--------|--------|:---:|:---:|---:|:---:|
| `A`   | Asistencia          | ✅ | ✅ | $0      | — |
| `AF`  | Asistencia forzada  | ✅ | ✅ | $0      | — |
| `DS`  | Descanso pagado     | ✅ | ❌ | $0      | — |
| `DT`  | Doble turno         | ✅ | ✅ | $0      | ✅ |
| `INH` | Inhábil             | ✅ | ❌ | $0      | — |
| `FER` | Feriado             | ✅ | ❌ | $0      | — |
| `PCG` | Permiso c/goce      | ✅ | ❌ | $0      | — |
| `PSG` | Permiso s/goce      | ❌ | ❌ | $0      | — |
| `I`   | Incapacidad         | ❌ | ❌ | $0      | — |
| `F`   | Falta               | ❌ | ❌ | $393.80 | — |
| `SN`  | Sin marcar          | ❌ | ❌ | $0      | — |

**Prima dominical**: solo `A`, `AF`, `DT` en domingo la generan. `DS` en domingo = descanso programado, sin prima.

---

## 6. Interfaz móvil

### 6.1 App supervisor
- Pase de lista optimizado para pantalla chica con botones grandes por código.
- **Bootstrap en un solo request**: login + empleados + marcas del día.
- Selector de sede y jornada; filtro de empleados pendientes.
- Envío de tickets de soporte desde móvil.

### 6.2 App CEO
- Dashboard ejecutivo adaptado a móvil con tarjetas de métricas por sede.
- Calendario de asistencia individual con chips de código por día.
- Indicadores de faltas, turnos extra y prima dominical por empleado.

---

## 7. Reglas de Row Level Security

Implementadas en [`supabase/migrations/20260515000000_init.sql`](../supabase/migrations/20260515000000_init.sql). Resumen:

- **`sedes`**: lectura para todos los autenticados; escritura solo `SUPERADMIN`.
- **`usuarios`**: lectura del propio perfil o todos si es admin; escritura solo admin+.
- **`empleados`**: supervisor ve solo su sede; admin+ ve y gestiona todo.
- **`asistencias`**: supervisor lee/escribe en su sede dentro de la ventana de gracia (hoy + ayer) o en fecha liberada; admin+ sin restricción.
- **`tickets_soporte`**: supervisor ve los propios; admin+ ve todos y responde.
- **`periodos_nomina`** y **`fechas_liberadas`**: solo `SUPERADMIN` modifica.
- **`eventos`**: solo admin+ lee; cualquier sesión autenticada inserta (vía trigger).
