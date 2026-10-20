/**
 * TURNOS DE PRODUCCIÓN: quién prepara y cuándo, solo para estimar los tiempos
 * de entrega. Funciones puras (sin BD), en hora de Colombia (UTC-5, sin
 * horario de verano).
 *
 * Cada turno dice qué días, de qué hora a qué hora y cuántas personas
 * preparan. Las personas de turnos que se cruzan se suman. Con turnos:
 * - Las tandas de un pedido se reparten entre las personas del turno (la
 *   que se desocupe primero toma la siguiente tanda), en vez de sumarse.
 * - Fuera de turno no se prepara: lo que llega después del cierre empieza en
 *   el siguiente turno. Una tanda que empezó se termina aunque el turno cierre.
 * Sin turnos todo sigue como antes (capacidad de pedidos en paralelo).
 */

export interface ProductionShift {
  /** Nombre opcional ("Mañana", "Tarde"). */
  name?: string;
  /** Días: 0 = domingo … 6 = sábado. */
  days: number[];
  /** 'HH:MM' en hora de Colombia; end > start (sin turnos que pasen la medianoche). */
  start: string;
  end: string;
  /** Personas que preparan en el turno. */
  people: number;
}

const OFFSET_MS = -5 * 60 * 60000; // Colombia
const DAY_MS = 24 * 60 * 60000;
const MAX_SHIFTS = 20;
const MAX_PEOPLE = 50;

const toMinutes = (hhmm: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 24 * 60 && Number(m[2]) < 60 ? v : null;
};
const pad = (n: number) => String(n).padStart(2, '0');
const toHHMM = (v: number) => `${pad(Math.floor(v / 60))}:${pad(v % 60)}`;

/** Turnos válidos (descarta los incompletos). */
export function resolveShifts(raw: unknown): ProductionShift[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductionShift[] = [];
  for (const s of raw.slice(0, MAX_SHIFTS)) {
    const start = toMinutes(s?.start);
    const end = toMinutes(s?.end);
    const days = Array.from(new Set((Array.isArray(s?.days) ? s.days : []).map(Number)))
      .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort() as number[];
    const people = Math.round(Number(s?.people));
    if (start === null || end === null || end <= start || !days.length || !(people >= 1)) continue;
    out.push({
      ...(s?.name ? { name: String(s.name).trim().slice(0, 40) } : {}),
      days,
      start: toHHMM(start),
      end: toHHMM(end),
      people: Math.min(people, MAX_PEOPLE),
    });
  }
  return out;
}

/** Tramos de un día local con las personas que hay en cada uno. */
function daySegments(shifts: ProductionShift[], weekday: number): { from: number; to: number; people: number }[] {
  const today = shifts.filter((s) => s.days.includes(weekday));
  const cuts = Array.from(new Set(today.flatMap((s) => [toMinutes(s.start)!, toMinutes(s.end)!]))).sort((a, b) => a - b);
  const segs: { from: number; to: number; people: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i], to = cuts[i + 1];
    const people = today
      .filter((s) => toMinutes(s.start)! <= from && toMinutes(s.end)! >= to)
      .reduce((n, s) => n + s.people, 0);
    if (people > 0) segs.push({ from, to, people });
  }
  return segs;
}

/** Máximo de personas preparando a la vez en la semana. */
export function maxPeople(shifts: ProductionShift[]): number {
  let max = 0;
  for (let d = 0; d < 7; d++) for (const s of daySegments(shifts, d)) max = Math.max(max, s.people);
  return max;
}

/** Personas preparando en un instante. */
export function peopleAt(shifts: ProductionShift[], at: number): number {
  const local = at + OFFSET_MS;
  const weekday = new Date(local).getUTCDay();
  const minute = Math.floor((((local % DAY_MS) + DAY_MS) % DAY_MS) / 60000);
  const seg = daySegments(shifts, weekday).find((s) => s.from <= minute && minute < s.to);
  return seg ? seg.people : 0;
}

/**
 * Primer instante >= `from` en que la persona número `worker` (0 = la
 * primera) está en turno. null si nunca lo está en las próximas dos semanas.
 */
export function nextWorkStart(shifts: ProductionShift[], worker: number, from: number): number | null {
  const local0 = from + OFFSET_MS;
  const dayStart0 = local0 - (((local0 % DAY_MS) + DAY_MS) % DAY_MS);
  for (let d = 0; d < 15; d++) {
    const dayStart = dayStart0 + d * DAY_MS; // medianoche local (en "hora local" como UTC)
    const weekday = new Date(dayStart).getUTCDay();
    for (const s of daySegments(shifts, weekday)) {
      if (s.people <= worker) continue;
      const segFrom = dayStart + s.from * 60000;
      const segTo = dayStart + s.to * 60000;
      if (segTo <= local0) continue;
      return Math.max(local0, segFrom) - OFFSET_MS;
    }
  }
  return null;
}

/**
 * Reparte tandas (minutos) entre personas: cada tanda, de la más larga a la
 * más corta, la toma quien la termine primero. `free` = cuándo se desocupa
 * cada persona (se actualiza). Devuelve inicio y fin del conjunto.
 */
export function scheduleBatches(
  shifts: ProductionShift[],
  free: number[],
  batches: number[],
  earliest: number,
): { start: number; end: number } {
  let start = Infinity;
  let end = earliest;
  const sorted = [...batches].filter((b) => b > 0).sort((a, b) => b - a);
  for (const minutes of sorted) {
    let best = -1, bestStart = 0, bestEnd = Infinity;
    for (let w = 0; w < free.length; w++) {
      const s = nextWorkStart(shifts, w, Math.max(free[w], earliest));
      if (s === null) continue;
      const e = s + minutes * 60000;
      if (e < bestEnd) { best = w; bestStart = s; bestEnd = e; }
    }
    if (best < 0) { bestStart = earliest; bestEnd = earliest + minutes * 60000; }
    else free[best] = bestEnd;
    start = Math.min(start, bestStart);
    end = Math.max(end, bestEnd);
  }
  return { start: Number.isFinite(start) ? start : earliest, end };
}
