/* Asistia · prototipo funcional (MVP)
   Toda la lógica corre en el navegador. Los mensajes de WhatsApp se simulan
   dentro de la página y los datos se guardan en el almacenamiento local. */

const KEY = "asistia-mvp-v1";
const GUIDE_KEY = "asistia-guia-cerrada";
const H = 3600e3;
const DAY = 24 * H;
const DAY_START = 7, DAY_END = 18;      // horario visible de la agenda
const SLOT_FIRST = 8, SLOT_LAST = 17;   // horario en que se ofrecen cupos
const OFFER_WINDOW = 2 * H;             // tiempo para aceptar un cupo liberado

/* ================================================================ utilidades */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fDay = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" });
const fDayShort = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric" });
const fWeekday = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
const fTime = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit" });
const fMoney = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const day = (t) => fDay.format(new Date(t));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const time = (t) => fTime.format(new Date(t));
const when = (t) => `${day(t)} a las ${time(t)}`;
const fin = (x) => (x.endsWith(".") ? x : x + ".");
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const atHour = (t, h, m = 0) => { const d = new Date(t); d.setHours(h, m, 0, 0); return d.getTime(); };
const isSunday = (t) => new Date(t).getDay() === 0;
const pct = (n) => `${(n * 100).toFixed(1).replace(".", ",")} %`;
const firstName = (n) => n.split(" ")[0];
let seq = Date.now() % 100000;
const uid = (p) => `${p}${(seq++).toString(36)}`;

/* ================================================================ estado */
let S = null;
let ui = { phonePatient: null, phonePage: null, drawer: null, modal: null, prof: "todos", weekOffset: 0, phoneOpen: false };

function load() {
  try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* sin almacenamiento: la sesión sigue en memoria */ }
}
const pat = (id) => S.patients.find((p) => p.id === id);
const prof = (id) => S.profs.find((p) => p.id === id);
const appt = (id) => S.appts.find((a) => a.id === id);
const endOf = (a) => a.start + a.dur * 60e3;
const active = (a) => !["cancelada", "reprogramada"].includes(a.status);

/* ================================================================ datos de demostración */
function seed() {
  let rnd = 7;
  const r = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
  let base = atHour(Date.now(), 8);
  if (isSunday(base)) base = addDays(base, 1);
  const wd = (n) => { let t = base, k = 0; const step = n >= 0 ? 1 : -1; while (k !== n) { t = addDays(t, step); if (!isSunday(t)) k += step; } return t; };

  const s = {
    v: 1, now: base, startedAt: wd(-20),
    practice: { name: "Consultorio Odontológico Norte", address: "Calle 95 # 14-30, consultorio 201", value: 90000, baseline: 15 },
    profs: [
      { id: "p1", name: "Dra. Laura Gómez", area: "Odontología general" },
      { id: "p2", name: "Dr. Camilo Rojas", area: "Ortodoncia" },
    ],
    patients: [], appts: [], msgs: [], waitlist: [], offers: [],
  };
  const names = ["Andrés Medina", "Valentina Ríos", "Juan Pablo Torres", "Camila Herrera", "Santiago López", "Mariana Castro", "Felipe Ramírez", "Daniela Moreno", "Sebastián Vargas", "Paula Andrea Suárez", "Nicolás Ortiz", "Isabella Pardo", "Diego Salazar", "Natalia Cárdenas", "Tomás Guerrero", "Sara Molina", "Julián Peña", "Carolina Mejía", "Esteban Ruiz", "Gabriela León", "Martín Acosta", "Lucía Fernández", "Ricardo Ospina", "Manuela Duarte"];
  names.forEach((n, i) => s.patients.push({ id: `c${i + 1}`, name: n, phone: `+57 300 555 ${String(1000 + i * 37).slice(-4)}`, consent: true, consentAt: wd(-25) }));
  const P = (name) => s.patients.find((p) => p.name === name).id;
  const services = { p1: ["Control", "Limpieza", "Valoración", "Resina"], p2: ["Control de ortodoncia", "Ajuste de brackets", "Valoración"] };

  // historial de las últimas semanas (base de los indicadores)
  let hist = 0;
  for (let n = -20; n <= -1; n++) {
    const d = wd(n);
    const hours = [8, 9, 10.5, 14, 15.5, 16.5].filter(() => r() > 0.25);
    hours.forEach((h, j) => {
      const pid = s.patients[Math.floor(r() * 18)].id;
      const pf = j % 3 === 2 ? "p2" : "p1";
      const start = atHour(d, Math.floor(h), (h % 1) * 60);
      const roll = r();
      let status = "asistio", confirmedBy = r() > 0.25 ? "paciente" : null, origin = "agenda";
      const pNo = 0.10 - (n + 20) * 0.0028;
      if (roll < pNo) { status = "no_asistio"; confirmedBy = null; }
      else if (roll < pNo + 0.09) status = "cancelada";
      if (status === "asistio" && r() < 0.09) origin = "lista_espera";
      s.appts.push({ id: `h${++hist}`, patient: pid, prof: pf, start, dur: h % 1 ? 30 : 60, service: services[pf][Math.floor(r() * services[pf].length)], status, origin, confirmedBy, r3: true, r24: status !== "cancelada", created: start - 6 * DAY, log: histLog(start, status, origin, confirmedBy) });
    });
  }

  // agenda de los próximos días
  const fut = [
    [0, 9, "Andrés Medina", "p1", "confirmada"], [0, 10, "Valentina Ríos", "p1", "confirmada"], [0, 11, "Juan Pablo Torres", "p1", "sin_respuesta"],
    [0, 14, "Camila Herrera", "p2", "confirmada"], [0, 15, "Santiago López", "p1", "sin_respuesta"], [0, 16, "Lucía Fernández", "p1", "confirmada"],
    [1, 8.5, "Mariana Castro", "p1", "confirmada"], [1, 9.5, "Felipe Ramírez", "p2", "sin_respuesta"], [1, 11, "Daniela Moreno", "p1", "sin_respuesta"], [1, 16, "Sebastián Vargas", "p1", "confirmada"],
    [2, 9, "Paula Andrea Suárez", "p1", "sin_respuesta"], [2, 10.5, "Nicolás Ortiz", "p2", "confirmada"], [2, 14, "Isabella Pardo", "p1", "sin_respuesta"],
    [3, 9, "Diego Salazar", "p1", "nuevo"], [3, 11, "Natalia Cárdenas", "p2", "nuevo"], [3, 15, "Tomás Guerrero", "p1", "nuevo"],
    [4, 10, "Sara Molina", "p1", "nuevo"], [4, 11, "Julián Peña", "p2", "nuevo"], [5, 14, "Carolina Mejía", "p1", "nuevo"], [5, 9, "Ricardo Ospina", "p1", "nuevo"],
  ];
  S = s;
  fut.forEach(([n, h, name, pf, kind], i) => {
    const start = atHour(wd(n), Math.floor(h), (h % 1) * 60);
    const created = start - (12 + (i % 5) * 3) * DAY;
    const a = { id: `a${i + 1}`, patient: P(name), prof: pf, start, dur: h % 1 ? 30 : 60, service: services[pf][i % services[pf].length], status: "programada", origin: "agenda", confirmedBy: null, r3: false, r24: false, created, log: [{ at: created, text: "Cita creada en la agenda." }] };
    s.appts.push(a);
    msgCreated(a, created);
    if (kind === "nuevo") return;
    const t3 = start - 3 * DAY;
    if (t3 < base) sendReminder(a, "r3", t3);
    if (kind === "confirmada") answer(a.id, "confirmar", t3 + 2 * H, true);
  });
  // lista de espera
  [["Esteban Ruiz", "p1", "Cualquier día en la mañana"], ["Gabriela León", "p1", "Lunes a miércoles"], ["Martín Acosta", "p2", "Después de las 2 p. m."], ["Manuela Duarte", "p1", "Cualquier horario"]]
    .forEach(([name, pf, pref], i) => s.waitlist.push({ id: `w${i + 1}`, patient: P(name), prof: pf, pref, since: wd(-6 + i), status: "esperando" }));
  process(base);
  return s;
}

function histLog(start, status, origin, confirmedBy) {
  const L = [{ at: start - 6 * DAY, text: origin === "lista_espera" ? "Cita asignada desde la lista de espera." : "Cita creada en la agenda." }];
  if (origin !== "lista_espera") L.push({ at: start - 3 * DAY, text: "Recordatorio enviado (tres días antes)." });
  if (status === "cancelada") { L.push({ at: start - 2 * DAY, text: "El paciente canceló la cita con aviso." }); return L; }
  if (confirmedBy) L.push({ at: start - 3 * DAY + 2 * H, text: "El paciente confirmó la asistencia." });
  else L.push({ at: start - DAY, text: "Recordatorio enviado (24 horas antes)." });
  L.push({ at: start + H, text: status === "asistio" ? "Asistencia registrada por el consultorio." : "Inasistencia registrada por el consultorio." });
  return L;
}

/* ================================================================ mensajes */
function msg(patient, at, text, opts = {}) {
  S.msgs.push({ id: uid("m"), patient, at, text, from: opts.from || "asistia", acts: opts.acts || null, appt: opts.appt || null, offer: opts.offer || null, used: false });
}
function logA(a, at, text) { a.log.push({ at, text }); }
function msgCreated(a, at) {
  const p = pat(a.patient), pr = prof(a.prof);
  msg(a.patient, at, `Hola, ${firstName(p.name)}. Tu cita con ${pr.name} quedó agendada para el ${when(a.start)}, en ${S.practice.name} (${S.practice.address}). Te enviaremos un recordatorio antes de la fecha.`, { appt: a.id });
}
function sendReminder(a, kind, at) {
  const p = pat(a.patient), pr = prof(a.prof);
  const text = kind === "r3"
    ? `Hola, ${firstName(p.name)}. Te recordamos tu cita con ${pr.name} el ${fin(when(a.start))} ¿Vas a asistir?`
    : `${firstName(p.name)}, tu cita con ${pr.name} es mañana a las ${fin(time(a.start))} Cuéntanos si vas a asistir.`;
  a[kind] = true;
  a[kind + "At"] = at;
  msg(a.patient, at, text, { appt: a.id, acts: [["confirmar", "Confirmar asistencia"], ["cancelar", "Cancelar la cita"], ["reprogramar", "Reprogramar"]] });
  logA(a, at, kind === "r3" ? "Recordatorio enviado (tres días antes)." : "Recordatorio enviado (24 horas antes).");
}
function closeActs(apptId) { S.msgs.forEach((m) => { if (m.appt === apptId && m.acts) m.used = true; }); }

/* ================================================================ respuestas del paciente */
function answer(apptId, act, at = S.now, silent = false) {
  const a = appt(apptId);
  if (!a || !["programada", "riesgo", "confirmada"].includes(a.status) || a.start <= at) return { ok: false, text: "Esta cita ya no admite cambios." };
  const p = pat(a.patient);
  if (act === "confirmar") {
    msg(a.patient, at, "Confirmar asistencia", { from: "paciente" });
    a.status = "confirmada"; a.confirmedBy = "paciente";
    closeActs(a.id);
    logA(a, at, "El paciente confirmó la asistencia.");
    msg(a.patient, at + 1000, `Gracias, ${firstName(p.name)}. Tu cita quedó confirmada. Te esperamos el ${fin(when(a.start))}`);
    if (!silent) toast(`${p.name} confirmó su cita.`);
    return { ok: true, text: "Tu cita quedó confirmada." };
  }
  if (act === "cancelar") {
    msg(a.patient, at, "Cancelar la cita", { from: "paciente" });
    a.status = "cancelada"; a.cancelledAt = at; a.cancelledBy = "paciente";
    closeActs(a.id);
    logA(a, at, "El paciente canceló la cita con aviso.");
    msg(a.patient, at + 1000, `Listo, ${firstName(p.name)}. Cancelamos tu cita. Gracias por avisarnos con tiempo.`);
    openOffer(a, at + 2000);
    if (!silent) toast(`${p.name} canceló. El cupo se ofrece a la lista de espera.`);
    return { ok: true, text: "Tu cita quedó cancelada. Gracias por avisar." };
  }
  return { ok: false, text: "" };
}
function reschedule(apptId, newStart, at = S.now) {
  const a = appt(apptId);
  if (!a || !["programada", "riesgo", "confirmada"].includes(a.status)) return null;
  if (!isFree(a.prof, newStart, a.dur, a.id)) return null;
  const p = pat(a.patient);
  msg(a.patient, at, `Reprogramar para el ${when(newStart)}`, { from: "paciente" });
  a.status = "reprogramada"; a.cancelledAt = at; a.cancelledBy = "paciente";
  closeActs(a.id);
  const b = { id: uid("a"), patient: a.patient, prof: a.prof, start: newStart, dur: a.dur, service: a.service, status: "confirmada", origin: "reprogramada", confirmedBy: "paciente", r3: newStart - at < 3 * DAY, r24: newStart - at < DAY, created: at, log: [{ at, text: `Cita creada al reprogramar la del ${fin(when(a.start))}` }] };
  S.appts.push(b);
  logA(a, at, `El paciente reprogramó la cita para el ${fin(when(newStart))}`);
  msg(a.patient, at + 1000, `Listo, ${firstName(p.name)}. Tu cita quedó para el ${when(newStart)} con ${prof(a.prof).name}.`);
  openOffer(a, at + 2000);
  toast(`${p.name} reprogramó. El cupo anterior se ofrece a la lista de espera.`);
  return b;
}

/* ================================================================ lista de espera y reasignación */
function openOffer(a, at) {
  if (a.start - at < H) return;
  const queue = S.waitlist.filter((w) => w.status === "esperando" && w.prof === a.prof).sort((x, y) => x.since - y.since).map((w) => w.id);
  const o = { id: uid("o"), slot: { prof: a.prof, start: a.start, dur: a.dur, service: a.service }, from: a.id, queue, tried: [], current: null, offeredAt: null, status: "abierta", opened: at };
  S.offers.push(o);
  logA(a, at, queue.length ? "El cupo se ofreció a la lista de espera." : "No hay pacientes en lista de espera para este profesional; el cupo quedó libre.");
  if (!queue.length) { o.status = "libre"; return; }
  offerNext(o, at);
}
function offerNext(o, at) {
  const nextId = o.queue.find((id) => !o.tried.includes(id));
  if (!nextId || o.slot.start - at < H) { o.status = "libre"; o.current = null; return; }
  const w = S.waitlist.find((x) => x.id === nextId);
  o.tried.push(nextId); o.current = nextId; o.offeredAt = at; w.status = "ofrecido";
  const p = pat(w.patient);
  msg(w.patient, at, `Hola, ${firstName(p.name)}. Se liberó un cupo con ${prof(o.slot.prof).name} el ${fin(when(o.slot.start))} ¿Lo quieres tomar? Tienes dos horas para responder.`, { offer: o.id, acts: [["tomar", "Tomar el cupo"], ["rechazar", "No puedo"]] });
}
function answerOffer(offerId, act, at = S.now) {
  const o = S.offers.find((x) => x.id === offerId);
  if (!o) return;
  const w = S.waitlist.find((x) => x.id === o.current);
  S.msgs.forEach((m) => { if (m.offer === o.id && m.patient === (w && w.patient)) m.used = true; });
  if (!w || o.status !== "abierta") return;
  at = Math.max(at, o.offeredAt + 1000);
  const p = pat(w.patient);
  if (act === "tomar") {
    msg(w.patient, at, "Tomar el cupo", { from: "paciente" });
    if (!isFree(o.slot.prof, o.slot.start, o.slot.dur)) {
      msg(w.patient, at + 1000, "Lo sentimos, ese cupo ya fue tomado. Sigues en la lista de espera.");
      w.status = "esperando"; o.status = "libre"; return;
    }
    const b = { id: uid("a"), patient: w.patient, prof: o.slot.prof, start: o.slot.start, dur: o.slot.dur, service: "Valoración", status: "confirmada", origin: "lista_espera", confirmedBy: "paciente", r3: true, r24: o.slot.start - at < DAY, created: at, log: [{ at, text: "Cita asignada desde la lista de espera." }] };
    S.appts.push(b);
    w.status = "asignado"; w.assignedAppt = b.id;
    o.status = "asignada"; o.assignedTo = b.id; o.current = null;
    const from = appt(o.from); if (from) logA(from, at, `El cupo fue tomado por ${p.name} desde la lista de espera.`);
    msg(w.patient, at + 1000, `¡Listo, ${firstName(p.name)}! Tu cita quedó agendada para el ${when(b.start)} con ${prof(b.prof).name}.`);
    toast(`${p.name} tomó el cupo liberado.`);
  } else {
    msg(w.patient, at, "No puedo", { from: "paciente" });
    w.status = "esperando";
    msg(w.patient, at + 1000, "Entendido. Sigues en la lista de espera y te avisaremos del próximo cupo.");
    offerNext(o, at + 2000);
  }
}

/* ================================================================ motor de eventos */
function riskAt(a) { return Math.max(a.start - 12 * H, (a.r24At || a.start) + 2 * H); }
function pendingEvents() {
  const ev = [];
  for (const a of S.appts) {
    if (a.status !== "programada" && a.status !== "riesgo") continue;
    if (a.start <= S.now) continue;
    if (a.status === "programada") {
      if (!a.r3 && !a.r24 && a.start - a.created >= 3 * DAY) ev.push({ t: a.start - 3 * DAY, kind: "r3", a });
      if (!a.r24 && a.start - a.created >= DAY) ev.push({ t: a.start - DAY, kind: "r24", a });
      if (a.r24) ev.push({ t: riskAt(a), kind: "riesgo", a });
    }
  }
  for (const o of S.offers) if (o.status === "abierta") ev.push({ t: o.offeredAt + OFFER_WINDOW, kind: "vence", o });
  return ev.sort((x, y) => x.t - y.t);
}
function process(now) {
  let guard = 0;
  while (guard++ < 500) {
    const ev = pendingEvents().find((e) => e.t <= now);
    if (!ev) break;
    const t = Math.max(ev.t, ev.a ? ev.a.created : 0);
    if (ev.kind === "r3") { if (ev.a.start - DAY > t) sendReminder(ev.a, "r3", t); else ev.a.r3 = true; }
    else if (ev.kind === "r24") sendReminder(ev.a, "r24", t);
    else if (ev.kind === "riesgo") { ev.a.status = "riesgo"; logA(ev.a, t, "Sin respuesta a los recordatorios: la cita quedó marcada en riesgo."); }
    else if (ev.kind === "vence") {
      const w = S.waitlist.find((x) => x.id === ev.o.current);
      if (w) { w.status = "esperando"; S.msgs.forEach((m) => { if (m.offer === ev.o.id && m.patient === w.patient) m.used = true; }); }
      offerNext(ev.o, ev.t);
    }
  }
  S.now = now;
}
function advance(ms) { process(S.now + ms); commit(); }
function nextEvent() {
  const ev = pendingEvents().find((e) => e.t > S.now);
  if (!ev) { toast("No hay eventos pendientes. Crea una cita o avanza un día."); return; }
  process(ev.t + 60e3);
  if (ev.a) ui.phonePatient = ev.a.patient;
  ui.phonePage = null;
  commit();
  const label = { r3: "Se envió un recordatorio de tres días", r24: "Se envió un recordatorio de 24 horas", riesgo: "Una cita quedó marcada en riesgo", vence: ev.o && ev.o.status === "abierta" ? "Venció una oferta de cupo y se ofreció al siguiente paciente" : "Venció una oferta de cupo y el cupo quedó libre" }[ev.kind];
  const who = ev.a ? pat(ev.a.patient) : null;
  toast(who ? `${label}: ${who.name}.` : `${label}.`);
}

/* ================================================================ disponibilidad */
function isFree(profId, start, dur, ignoreId = null) {
  const end = start + dur * 60e3;
  return !S.appts.some((a) => a.id !== ignoreId && a.prof === profId && active(a) && a.start < end && endOf(a) > start);
}
function freeSlots(profId, dur, from, days = 8, ignoreId = null) {
  const out = [];
  let d = startOfDay(from);
  for (let i = 0; i < days + 3 && out.length < days; i++, d = addDays(d, 1)) {
    if (isSunday(d)) continue;
    const list = [];
    for (let h = SLOT_FIRST; h <= SLOT_LAST - dur / 60 + 1e-9; h += 0.5) {
      const s = atHour(d, Math.floor(h), (h % 1) * 60);
      if (s < from + 2 * H) continue;
      if (isFree(profId, s, dur, ignoreId)) list.push(s);
    }
    if (list.length) out.push({ day: d, slots: list.slice(0, 6) });
  }
  return out;
}

/* ================================================================ acciones del consultorio */
function createAppt(f) {
  let pid = f.patient;
  if (pid === "nuevo") {
    const p = { id: uid("c"), name: f.name.trim(), phone: f.phone.trim(), consent: true, consentAt: S.now };
    S.patients.push(p); pid = p.id;
  }
  const a = { id: uid("a"), patient: pid, prof: f.prof, start: f.start, dur: f.dur, service: f.service, status: "programada", origin: "agenda", confirmedBy: null, r3: false, r24: false, created: S.now, log: [{ at: S.now, text: "Cita creada en la agenda." }] };
  if (f.start - S.now < DAY) { a.r3 = true; a.r24 = true; a.r24At = S.now; }
  S.appts.push(a);
  msgCreated(a, S.now);
  if (a.r24) S.msgs[S.msgs.length - 1].acts = [["confirmar", "Confirmar asistencia"], ["cancelar", "Cancelar la cita"], ["reprogramar", "Reprogramar"]], S.msgs[S.msgs.length - 1].appt = a.id;
  ui.phonePatient = pid;
  commit();
  toast(`Cita creada. ${pat(pid).name} recibió la confirmación por WhatsApp.`);
}
function setOutcome(id, status) {
  const a = appt(id);
  a.status = status;
  logA(a, S.now, status === "asistio" ? "Asistencia registrada por el consultorio." : "Inasistencia registrada por el consultorio.");
  commit();
}
function cancelByPractice(id) {
  const a = appt(id);
  const p = pat(a.patient);
  a.status = "cancelada"; a.cancelledAt = S.now; a.cancelledBy = "consultorio";
  closeActs(a.id);
  logA(a, S.now, "Cita cancelada por el consultorio.");
  msg(a.patient, S.now, `Hola, ${firstName(p.name)}. Tuvimos que cancelar tu cita del ${fin(when(a.start))} Te contactaremos para agendar una nueva fecha.`);
  openOffer(a, S.now + 2000);
  commit();
}

/* ================================================================ indicadores */
function metrics() {
  const from = S.now - 30 * DAY;
  const inP = S.appts.filter((a) => a.start >= from && a.start < S.now);
  const att = inP.filter((a) => a.status === "asistio").length;
  const no = inP.filter((a) => a.status === "no_asistio").length;
  const canc = inP.filter((a) => (a.status === "cancelada" || a.status === "reprogramada") && a.cancelledBy !== "consultorio").length;
  const pend = inP.filter((a) => ["programada", "confirmada", "riesgo"].includes(a.status)).length;
  const rem = S.appts.filter((a) => (a.r3 || a.r24) && a.start >= from && a.origin !== "lista_espera" && a.origin !== "reprogramada");
  const conf = rem.filter((a) => a.confirmedBy === "paciente").length;
  const reas = S.appts.filter((a) => a.origin === "lista_espera" && a.start >= from && active(a)).length;
  return { att, no, canc, pend, rate: att + no ? no / (att + no) : 0, confRate: rem.length ? conf / rem.length : 0, reas, income: reas * S.practice.value };
}
function weekly() {
  const out = [];
  let end = startOfDay(S.now);
  for (let i = 0; i < 4; i++) {
    const start = end - 7 * DAY;
    const list = S.appts.filter((a) => a.start >= start && a.start < end);
    const att = list.filter((a) => a.status === "asistio").length, no = list.filter((a) => a.status === "no_asistio").length;
    out.unshift({ label: `Semana del ${fDayShort.format(new Date(start)).replace(".", "")}`, rate: att + no ? no / (att + no) : 0, n: att + no });
    end = start;
  }
  return out;
}

/* ================================================================ render general */
const ICON = {
  logo: `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#fff"/><path d="M14 18a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H29l-9 8v-8a6 6 0 0 1-6-6z" fill="#1D5C63"/><path d="M23 27.5l5.5 5.5L41 20.5" fill="none" stroke="#E9A23B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  logoInv: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 18a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H29l-9 8v-8a6 6 0 0 1-6-6z" fill="#1D5C63"/><path d="M23 27.5l5.5 5.5L41 20.5" fill="none" stroke="#E9A23B" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>`,
  gear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>`,
};
const STATUS_SHORT = { programada: "Por confirmar", confirmada: "Confirmada", riesgo: "En riesgo", cancelada: "Cancelada", reprogramada: "Reprogramada", asistio: "Asistió", no_asistio: "No asistió" };
const STATUS = { programada: "Pendiente de confirmar", confirmada: "Confirmada", riesgo: "En riesgo", cancelada: "Cancelada", reprogramada: "Reprogramada", asistio: "Asistió", no_asistio: "No asistió" };

function route() { return (location.hash || "#/agenda").slice(2).split("/"); }
function commit() { save(); render(); }

function render() {
  const [view, arg] = route();
  const app = $("#app");
  if (view === "cita") { app.innerHTML = `<div class="pt-wrap">${patientPage(arg, false)}</div>`; return; }
  const views = { agenda: viewAgenda, espera: viewWaitlist, indicadores: viewMetrics, consultorio: viewSettings };
  const v = views[view] ? view : "agenda";
  const nav = [["agenda", "Agenda", ICON.cal], ["espera", "Lista de espera", ICON.list], ["indicadores", "Indicadores", ICON.chart], ["consultorio", "Consultorio", ICON.gear]];
  app.innerHTML = `
  <div class="shell">
    <aside class="side">
      <div class="brand">${ICON.logo}<div><b>Asistia</b><span>Agenda que se confirma sola</span></div></div>
      <nav class="nav" aria-label="Secciones">${nav.map(([k, l, ic]) => `<a href="#/${k}" ${k === v ? 'aria-current="page"' : ""}>${ic}${l}</a>`).join("")}</nav>
      <div class="practice"><b>${esc(S.practice.name)}</b>${S.profs.length} profesionales</div>
    </aside>
    <header class="top">
      <div class="clock">
        <div class="clock-face"><small>Reloj de la simulación</small><strong><time>${cap(day(S.now))}</time>, ${time(S.now)}</strong></div>
        <div class="clock-btns">
          <button class="btn next" data-act="next" title="Avanza hasta el próximo recordatorio, cambio de estado u oferta">Siguiente evento</button>
          <button class="btn" data-act="adv" data-ms="${H}">+1 hora</button>
          <button class="btn" data-act="adv" data-ms="${DAY}">+1 día</button>
        </div>
      </div>
      <span class="spacer"></span>
      <span class="demo-tag">Prototipo con datos de demostración</span>
      <button class="btn phone-toggle" data-act="phone-open">${ICON.phone} Teléfono del paciente</button>
    </header>
    <main class="main" id="main">${views[v]()}</main>
    <section class="phone-col ${ui.phoneOpen ? "open" : ""}" aria-label="Teléfono del paciente (simulación)">${phonePanel()}</section>
  </div>
  ${ui.drawer ? drawer(ui.drawer) : ""}
  ${ui.modal ? modal() : ""}`;
  const body = $(".ph-body");
  if (body) body.scrollTop = body.scrollHeight;
}

/* ================================================================ vista: agenda */
function weekDays() {
  let d = startOfDay(S.now);
  const dow = new Date(d).getDay();
  d = addDays(d, -((dow + 6) % 7) + ui.weekOffset * 7);
  return Array.from({ length: 6 }, (_, i) => addDays(d, i));
}
function viewAgenda() {
  const days = weekDays();
  const list = S.appts.filter((a) => (ui.prof === "todos" || a.prof === ui.prof));
  const today = startOfDay(S.now);
  const todays = list.filter((a) => startOfDay(a.start) === today && active(a));
  const cnt = (st) => todays.filter((a) => a.status === st).length;
  const guide = (() => { try { return localStorage.getItem(GUIDE_KEY) !== "1"; } catch { return true; } })();
  const PX = 52; // alto de una hora
  const top = (t) => ((new Date(t).getHours() + new Date(t).getMinutes() / 60) - DAY_START) * PX;
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const col = (d) => {
    const items = list.filter((a) => startOfDay(a.start) === d).sort((x, y) => x.start - y.start);
    const nowLine = d === today ? `<div class="wk-now" style="top:${top(S.now)}px" aria-hidden="true"></div>` : "";
    return `<div class="wk-col ${d === today ? "today" : ""}" style="height:${(DAY_END - DAY_START) * PX}px">
      ${hours.slice(1, -1).map((h) => `<div class="wk-line" style="top:${(h - DAY_START) * PX}px"></div>`).join("")}${nowLine}
      ${items.map((a) => `<button class="appt st-${a.status} ${a.dur <= 30 ? "short" : ""}" data-act="open" data-id="${a.id}" style="top:${top(a.start) + 1}px;height:${Math.max(a.dur / 60 * PX - 3, 24)}px" title="${esc(pat(a.patient).name)}, ${STATUS[a.status]}">
        <b>${esc(pat(a.patient).name)}</b><span>${time(a.start)} · ${STATUS_SHORT[a.status]}${a.origin === "lista_espera" ? " · lista de espera" : ""}</span></button>`).join("")}
    </div>`;
  };
  const daylist = days.map((d) => {
    const items = list.filter((a) => startOfDay(a.start) === d).sort((x, y) => x.start - y.start);
    return `<section><h3>${esc(cap(day(d)))}</h3>${items.length ? items.map((a) => `<button class="dl-item st-${a.status}" data-act="open" data-id="${a.id}"><time>${time(a.start)}</time><span><b>${esc(pat(a.patient).name)}</b><br><span class="small muted">${STATUS[a.status]} · ${esc(prof(a.prof).name)}</span></span></button>`).join("") : `<p class="small muted">Sin citas.</p>`}</section>`;
  }).join("");
  return `
  ${guide ? `<div class="howto"><div><h2>Cómo probar el prototipo</h2>
    <ol><li>Pulsa <b>Siguiente evento</b> para adelantar el reloj y ver llegar los recordatorios al teléfono del paciente.</li>
    <li>Responde como paciente desde el teléfono: confirma, cancela o reprograma.</li>
    <li>Cuando alguien cancela, el cupo se ofrece solo a la lista de espera. Acepta la oferta desde el teléfono.</li>
    <li>Revisa en <b>Indicadores</b> la tasa de inasistencia y los cupos recuperados.</li></ol></div>
    <button class="btn ghost" data-act="guide-close" aria-label="Cerrar la guía">Cerrar</button></div>` : ""}
  <div class="view-head">
    <div><h1>Agenda</h1><p>Semana del ${esc(day(days[0]))}</p></div>
    <div class="toolbar">
      <select class="inp" data-act="prof" aria-label="Profesional"><option value="todos">Todos los profesionales</option>${S.profs.map((p) => `<option value="${p.id}" ${ui.prof === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
      <button class="btn" data-act="week" data-d="-1" aria-label="Semana anterior">‹</button>
      <button class="btn" data-act="week" data-d="0">Esta semana</button>
      <button class="btn" data-act="week" data-d="1" aria-label="Semana siguiente">›</button>
      <button class="btn primary" data-act="new">${ICON.plus} Nueva cita</button>
    </div>
  </div>
  <div class="daybar" aria-label="Resumen de hoy">
    <span class="pill"><b>Hoy:</b> ${todays.length} citas</span>
    <span class="pill st-confirmada"><i style="background:var(--c)"></i>${cnt("confirmada")} confirmadas</span>
    <span class="pill st-programada"><i style="background:var(--c)"></i>${cnt("programada")} pendientes</span>
    <span class="pill st-riesgo"><i style="background:var(--c)"></i>${cnt("riesgo")} en riesgo</span>
  </div>
  <div class="week-wrap"><div class="week">
    <div class="wk-h"></div>
    ${days.map((d) => `<div class="wk-h ${d === today ? "today" : ""}">${esc(cap(fWeekday.format(new Date(d)).replace(".", "")))}<b>${new Date(d).getDate()}</b></div>`).join("")}
    <div class="wk-times" style="height:${(DAY_END - DAY_START) * PX}px">${hours.slice(1, -1).map((h) => `<span class="wk-time" style="top:${(h - DAY_START) * PX}px">${h > 12 ? h - 12 : h} ${h >= 12 ? "p. m." : "a. m."}</span>`).join("")}</div>
    ${days.map(col).join("")}
  </div></div>
  <div class="daylist">${daylist}</div>`;
}

/* ================================================================ detalle de cita */
function drawer(id) {
  const a = appt(id);
  if (!a) return "";
  const p = pat(a.patient);
  const past = endOf(a) <= S.now;
  const open = ["programada", "confirmada", "riesgo"].includes(a.status);
  return `<div class="drawer-bg" data-act="close-drawer"><aside class="drawer" role="dialog" aria-label="Detalle de la cita" data-stop>
    <header><div><h2>${esc(p.name)}</h2><span class="chip st-${a.status}"><span class="dot"></span>${STATUS[a.status]}</span></div>
      <button class="btn ghost" data-act="close-drawer" aria-label="Cerrar">Cerrar</button></header>
    <dl class="kv">
      <dt>Fecha</dt><dd>${esc(when(a.start))}</dd>
      <dt>Profesional</dt><dd>${esc(prof(a.prof).name)}</dd>
      <dt>Servicio</dt><dd>${esc(a.service)} (${a.dur} min)</dd>
      <dt>Celular</dt><dd>${esc(p.phone)}</dd>
      <dt>Autorización</dt><dd>${p.consent ? "Autorizó recibir recordatorios" : "Sin autorización"}</dd>
      <dt>Origen</dt><dd>${{ agenda: "Agendada por el consultorio", lista_espera: "Asignada desde la lista de espera", reprogramada: "Reprogramada por el paciente" }[a.origin] || "Agenda"}</dd>
    </dl>
    <div><h3>Historial</h3><ol class="timeline">${a.log.slice().reverse().map((l) => `<li><time>${esc(when(l.at))}</time>${esc(l.text)}</li>`).join("") || "<li>Sin movimientos.</li>"}</ol></div>
    <div class="actions">
      <button class="btn" data-act="see-phone" data-p="${a.patient}">${ICON.phone} Ver mensajes del paciente</button>
      <a class="btn" href="#/cita/${a.id}" target="_blank" rel="noopener">Abrir enlace del paciente</a>
    </div>
    ${past && open ? `<div><h3>Registrar asistencia</h3><div class="actions"><button class="btn primary" data-act="outcome" data-s="asistio" data-id="${a.id}">Asistió</button><button class="btn danger" data-act="outcome" data-s="no_asistio" data-id="${a.id}">No asistió</button></div></div>` : ""}
    ${!past && open ? `<div class="actions"><button class="btn danger" data-act="cancel-practice" data-id="${a.id}">Cancelar desde el consultorio</button></div>` : ""}
  </aside></div>`;
}

/* ================================================================ modal nueva cita */
function modal() {
  const d = startOfDay(S.now + DAY * (new Date(S.now).getHours() >= 16 ? 1 : 0));
  const iso = new Date(d - new Date(d).getTimezoneOffset() * 60e3).toISOString().slice(0, 10);
  const slots = [];
  for (let h = SLOT_FIRST; h <= SLOT_LAST; h += 0.5) slots.push(h);
  return `<div class="modal-bg"><form class="modal" data-form="new" role="dialog" aria-label="Nueva cita">
    <h2>Nueva cita</h2>
    <label class="fld">Paciente<select class="inp" name="patient" data-act="pick-patient"><option value="nuevo">Paciente nuevo</option>${S.patients.slice().sort((x, y) => x.name.localeCompare(y.name)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
    <div class="grid2 newp"><label class="fld">Nombre completo<input class="inp" name="name" autocomplete="off"></label><label class="fld">Celular<input class="inp" name="phone" placeholder="+57 300 000 0000"></label></div>
    <label class="chk newp"><input type="checkbox" name="consent"> El paciente autorizó recibir recordatorios por WhatsApp y el tratamiento de sus datos (Ley 1581 de 2012).</label>
    <div class="grid2"><label class="fld">Profesional<select class="inp" name="prof">${S.profs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
      <label class="fld">Servicio<select class="inp" name="service"><option>Valoración</option><option>Control</option><option>Limpieza</option><option>Resina</option><option>Control de ortodoncia</option></select></label></div>
    <div class="grid2"><label class="fld">Fecha<input class="inp" type="date" name="date" value="${iso}" required></label>
      <label class="fld">Hora<select class="inp" name="hour">${slots.map((h) => `<option value="${h}">${Math.floor(h) > 12 ? Math.floor(h) - 12 : Math.floor(h)}:${h % 1 ? "30" : "00"} ${h >= 12 ? "p. m." : "a. m."}</option>`).join("")}</select></label></div>
    <label class="fld">Duración<select class="inp" name="dur"><option value="30">30 minutos</option><option value="60" selected>1 hora</option></select></label>
    <p class="err" id="form-err"></p>
    <div class="actions"><button class="btn primary" type="submit">Crear cita y enviar confirmación</button><button class="btn" type="button" data-act="close-modal">Cancelar</button></div>
  </form></div>`;
}

/* ================================================================ teléfono simulado */
function convos() {
  const last = {};
  S.msgs.forEach((m) => { if (!last[m.patient] || m.at >= last[m.patient]) last[m.patient] = m.at; });
  return Object.keys(last).filter((id) => last[id] <= S.now + 5 * 60e3).sort((a, b) => last[b] - last[a]);
}
function phonePanel() {
  const list = convos();
  if (!ui.phonePatient || !list.includes(ui.phonePatient)) ui.phonePatient = list[0] || null;
  const pid = ui.phonePatient;
  const p = pid ? pat(pid) : null;
  let inner;
  if (ui.phonePage) {
    inner = `<div class="pt-wrap">${patientPage(ui.phonePage, true)}</div>`;
  } else {
    const msgs = S.msgs.filter((m) => m.patient === pid && m.at <= S.now + 5 * 60e3).sort((x, y) => x.at - y.at);
    let lastDay = null;
    const body = msgs.map((m) => {
      const d = startOfDay(m.at);
      const sep = d !== lastDay ? `<span class="ph-day">${esc(day(m.at))}</span>` : "";
      lastDay = d;
      const acts = m.acts ? `<div class="bub-acts">${m.acts.map(([k, l]) => `<button data-act="reply" data-m="${m.id}" data-k="${k}" ${m.used ? "disabled" : ""}>${l}</button>`).join("")}</div>` : "";
      return `${sep}<div class="bub ${m.from === "paciente" ? "me" : ""}">${esc(m.text)}<time>${time(m.at)}</time>${acts}</div>`;
    }).join("");
    inner = `
      <div class="ph-head"><span class="av">${ICON.logoInv}</span><div><b>Asistia · ${esc(S.practice.name)}</b><small>Mensajes de recordatorio</small></div></div>
      <div class="ph-pick"><select class="inp" data-act="pick-phone" aria-label="Ver como paciente">${list.map((id) => `<option value="${id}" ${id === pid ? "selected" : ""}>Ver como: ${esc(pat(id).name)}</option>`).join("")}</select></div>
      <div class="ph-body">${body || `<p class="ph-empty">Todavía no hay mensajes. Crea una cita o avanza el reloj.</p>`}</div>`;
  }
  return `<p class="phone-cap">Así ve el paciente los mensajes en su WhatsApp. Es una simulación: aquí no se envía nada real.</p>
  <div class="phone"><div class="screen">${inner}</div></div>
  <button class="btn phone-close" data-act="phone-close" style="margin-top:10px">Cerrar teléfono</button>`;
}

/* ================================================================ página del paciente (enlace del mensaje) */
function patientPage(id, inPhone) {
  const a = appt(id);
  const head = `<div class="pt-top">${ICON.logo}<div><b>Asistia</b><br><small>${esc(S.practice.name)}</small></div></div>`;
  if (!a) return `<div class="pt">${head}<div class="pt-main"><h2>No encontramos esta cita</h2><p class="muted">Puede que el enlace haya cambiado. Escribe al consultorio para confirmarla.</p></div></div>`;
  const p = pat(a.patient);
  const open = ["programada", "confirmada", "riesgo"].includes(a.status) && a.start > S.now;
  const back = inPhone ? `<button class="btn ghost" data-act="phone-back">‹ Volver al chat</button>` : "";
  let body;
  if (ui.reprog === a.id && open) {
    const opts = freeSlots(a.prof, a.dur, S.now, 6);
    body = `<h2>Elige una nueva hora</h2><p class="muted small">Horarios libres con ${esc(prof(a.prof).name)}.</p>
      <div class="slots">${opts.map((o) => `<div><h4>${esc(day(o.day))}</h4><div class="slot-row">${o.slots.map((s) => `<button data-act="pick-slot" data-id="${a.id}" data-t="${s}">${time(s)}</button>`).join("")}</div></div>`).join("") || "<p>No hay horarios libres en los próximos días.</p>"}</div>
      <button class="btn" data-act="reprog-cancel">Volver</button>`;
  } else {
    const state = {
      confirmada: "Tu cita está confirmada.", programada: "Tu cita está pendiente de confirmar.", riesgo: "Aún no has confirmado tu cita.",
      cancelada: "Esta cita fue cancelada.", reprogramada: "Esta cita fue reprogramada.", asistio: "Esta cita ya se realizó.", no_asistio: "Esta cita ya pasó.",
    }[a.status];
    body = `<p>Hola, ${esc(firstName(p.name))}.</p>
      <div class="pt-when"><span class="muted small">Tu cita</span><strong>${esc(day(a.start))}</strong>${time(a.start)} con ${esc(prof(a.prof).name)}<br><span class="small muted">${esc(S.practice.address)}</span></div>
      <p><span class="chip st-${a.status}"><span class="dot"></span>${state}</span></p>
      ${open ? `<div class="pt-btns">
        ${a.status !== "confirmada" ? `<button class="btn primary" data-act="pt" data-k="confirmar" data-id="${a.id}">Confirmar asistencia</button>` : ""}
        <button class="btn" data-act="reprog" data-id="${a.id}">Reprogramar</button>
        <button class="btn danger" data-act="pt" data-k="cancelar" data-id="${a.id}">Cancelar la cita</button></div>` : ""}`;
  }
  return `<div class="pt">${head}<div class="pt-main">${back}${body}
    <p class="pt-note">Prototipo de Asistia. En la versión final este enlace llega en el mensaje de WhatsApp y no muestra información sobre tu salud.</p></div></div>`;
}

/* ================================================================ lista de espera */
function viewWaitlist() {
  const rows = S.waitlist.slice().sort((a, b) => a.since - b.since);
  const st = { esperando: "En espera", ofrecido: "Cupo ofrecido", asignado: "Cita asignada" };
  const offers = S.offers.slice().reverse().slice(0, 8);
  return `<div class="view-head"><div><h1>Lista de espera</h1><p>Cuando alguien cancela, el cupo se ofrece en este orden. Cada paciente tiene dos horas para aceptarlo.</p></div></div>
  <div class="cols2">
    <div class="panel"><table class="tbl"><thead><tr><th>Paciente</th><th>Profesional</th><th>Preferencia</th><th>Estado</th><th></th></tr></thead><tbody>
      ${rows.map((w) => `<tr><td>${esc(pat(w.patient).name)}<br><span class="small muted">desde el ${esc(fDayShort.format(new Date(w.since)))}</span></td><td>${esc(prof(w.prof).name)}</td><td>${esc(w.pref)}</td><td>${st[w.status]}${w.assignedAppt && appt(w.assignedAppt) ? `<br><span class="small muted">${esc(when(appt(w.assignedAppt).start))}</span>` : ""}</td><td>${w.status === "esperando" ? `<button class="btn ghost small" data-act="wl-remove" data-id="${w.id}">Quitar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">Nadie en espera. Agrega pacientes que quieran una cita más pronto.</td></tr>`}
    </tbody></table></div>
    <div>
      <form class="panel form-stack" data-form="wl"><h2>Agregar a la lista</h2>
        <label class="fld">Paciente<select class="inp" name="patient">${S.patients.slice().sort((x, y) => x.name.localeCompare(y.name)).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
        <label class="fld">Profesional<select class="inp" name="prof">${S.profs.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
        <label class="fld">Preferencia de horario<input class="inp" name="pref" placeholder="Por ejemplo: martes en la tarde"></label>
        <button class="btn primary" type="submit">Agregar a la lista</button></form>
      <div class="panel"><h2>Cupos liberados</h2>
        ${offers.length ? `<table class="tbl"><thead><tr><th>Cupo</th><th>Estado</th></tr></thead><tbody>${offers.map((o) => `<tr><td>${esc(when(o.slot.start))}<br><span class="small muted">${esc(prof(o.slot.prof).name)}</span></td><td>${{ abierta: `Ofrecido a ${esc(pat(S.waitlist.find((w) => w.id === o.current)?.patient)?.name || "")}`, asignada: `Tomado por ${esc(pat(appt(o.assignedTo)?.patient)?.name || "")}`, libre: "Quedó libre" }[o.status]}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Aún no se ha liberado ningún cupo. Cancela una cita desde el teléfono del paciente para verlo funcionar.</p>`}
      </div>
    </div>
  </div>`;
}

/* ================================================================ indicadores */
function viewMetrics() {
  const m = metrics();
  const w = weekly();
  const base = S.practice.baseline / 100;
  const W = 480, Hh = 240, pad = 34, bw = 64;
  const max = Math.max(base, ...w.map((x) => x.rate), 0.2) * 1.15;
  const y = (v) => Hh - pad - (v / max) * (Hh - pad * 1.6);
  const bars = w.map((x, i) => {
    const cx = pad + 18 + i * ((W - pad * 1.5) / 4);
    return `<rect x="${cx}" y="${y(x.rate)}" width="${bw}" height="${Hh - pad - y(x.rate)}" rx="5" fill="#1D5C63"><title>${x.label}: ${pct(x.rate)}</title></rect>
      <text x="${cx + bw / 2}" y="${y(x.rate) - 6}" text-anchor="middle" font-size="15" font-weight="700" fill="#1F2A2E">${pct(x.rate)}</text>
      <text x="${cx + bw / 2}" y="${Hh - pad + 18}" text-anchor="middle" font-size="12.5" fill="#55666B">${x.label.replace("Semana del ", "")}</text>`;
  }).join("");
  const reas = S.appts.filter((a) => a.origin === "lista_espera" && active(a)).sort((a, b) => b.start - a.start).slice(0, 6);
  return `<div class="view-head"><div><h1>Indicadores</h1><p>Últimos 30 días hasta el ${esc(day(S.now))}. Datos de demostración del consultorio.</p></div></div>
  <div class="kpis">
    <div class="kpi ${m.rate < base ? "good" : ""}"><div class="v">${pct(m.rate)}</div><div class="l">Inasistencia sin aviso</div><p>${m.no} de ${m.att + m.no} citas. Antes de Asistia: ${S.practice.baseline} %.</p></div>
    <div class="kpi"><div class="v">${pct(m.confRate)}</div><div class="l">Citas confirmadas por el paciente</div><p>Sobre las citas que recibieron recordatorio.</p></div>
    <div class="kpi"><div class="v">${m.canc}</div><div class="l">Cancelaciones con aviso</div><p>Cupos que se pudieron ofrecer a otro paciente.</p></div>
    <div class="kpi good"><div class="v">${fMoney.format(m.income)}</div><div class="l">Ingreso recuperado</div><p>${m.reas} cupos reasignados desde la lista de espera.</p></div>
  </div>
  <div class="cols2">
    <div class="panel chart"><h2>Inasistencia por semana</h2><p class="small muted">Semanas que empiezan el día indicado. La línea punteada es la tasa del consultorio antes de usar Asistia.</p>
      <svg viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Inasistencia por semana frente a la línea base">
        <line x1="${pad}" x2="${W - pad / 2}" y1="${Hh - pad}" y2="${Hh - pad}" stroke="#CFDEE0"/>
        <line x1="${pad}" x2="${W - pad / 2}" y1="${y(base)}" y2="${y(base)}" stroke="#E9A23B" stroke-width="2" stroke-dasharray="6 5"/>
        <text x="${W - pad / 2}" y="${y(base) - 6}" text-anchor="end" font-size="13" fill="#9A6514">Antes de Asistia: ${S.practice.baseline} %</text>
        ${bars}
      </svg></div>
    <div class="panel"><h2>Últimos cupos recuperados</h2>
      ${reas.length ? `<table class="tbl"><thead><tr><th>Paciente</th><th>Cita</th></tr></thead><tbody>${reas.map((a) => `<tr><td>${esc(pat(a.patient).name)}</td><td>${esc(when(a.start))}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">Todavía no hay cupos reasignados.</p>`}
      ${m.pend ? `<p class="small muted" style="margin-top:10px">${m.pend === 1 ? "Hay 1 cita pasada" : `Hay ${m.pend} citas pasadas`} sin registrar asistencia. Regístrala${m.pend === 1 ? "" : "s"} desde la agenda.</p>` : ""}
    </div>
  </div>`;
}

/* ================================================================ consultorio */
function viewSettings() {
  return `<div class="view-head"><div><h1>Consultorio</h1><p>Datos que aparecen en los mensajes y en los indicadores.</p></div></div>
  <div class="cols2">
    <form class="panel form-stack" data-form="settings">
      <label class="fld">Nombre del consultorio<input class="inp" name="name" value="${esc(S.practice.name)}" required></label>
      <label class="fld">Dirección<input class="inp" name="address" value="${esc(S.practice.address)}" required></label>
      <div class="grid2"><label class="fld">Valor de la consulta (COP)<input class="inp" name="value" type="number" min="0" step="1000" value="${S.practice.value}"></label>
      <label class="fld">Inasistencia antes de Asistia (%)<input class="inp" name="baseline" type="number" min="0" max="100" value="${S.practice.baseline}"></label></div>
      <button class="btn primary" type="submit">Guardar cambios</button>
    </form>
    <div class="panel"><h2>Profesionales</h2>
      <table class="tbl"><thead><tr><th>Nombre</th><th>Área</th></tr></thead><tbody>${S.profs.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.area)}</td></tr>`).join("")}</tbody></table>
      <h2 style="margin-top:18px">Datos de demostración</h2>
      <p class="muted small">Los datos viven solo en este navegador. Restablecerlos vuelve a la agenda inicial y pone el reloj en hoy.</p>
      <button class="btn danger" data-act="reset">Restablecer datos de demostración</button>
    </div>
  </div>`;
}

/* ================================================================ eventos */
let toastTimer;
function toast(t) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = t; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  if (t.closest("[data-stop]") && t.dataset.act === "close-drawer" && t.classList.contains("drawer-bg")) return;
  if (t.classList.contains("drawer-bg") && e.target !== t) return;
  const act = t.dataset.act;
  switch (act) {
    case "next": nextEvent(); break;
    case "adv": advance(Number(t.dataset.ms)); break;
    case "week": ui.weekOffset = t.dataset.d === "0" ? 0 : ui.weekOffset + Number(t.dataset.d); render(); break;
    case "new": ui.modal = "new"; render(); setTimeout(() => { $("[name=name]")?.focus(); togglePatientFields(); }); break;
    case "close-modal": ui.modal = null; render(); break;
    case "open": ui.drawer = t.dataset.id; render(); break;
    case "close-drawer": ui.drawer = null; render(); break;
    case "see-phone": ui.phonePatient = t.dataset.p; ui.phonePage = null; ui.drawer = null; ui.phoneOpen = true; render(); break;
    case "outcome": setOutcome(t.dataset.id, t.dataset.s); break;
    case "cancel-practice": cancelByPractice(t.dataset.id); toast("Cita cancelada. El paciente recibió el aviso."); break;
    case "phone-open": ui.phoneOpen = true; render(); break;
    case "phone-close": ui.phoneOpen = false; render(); break;
    case "guide-close": try { localStorage.setItem(GUIDE_KEY, "1"); } catch { /* sin almacenamiento */ } render(); break;
    case "reply": {
      const m = S.msgs.find((x) => x.id === t.dataset.m);
      if (!m || m.used) break;
      const k = t.dataset.k;
      if (m.offer) { answerOffer(m.offer, k); commit(); break; }
      if (k === "reprogramar") { ui.phonePage = m.appt; ui.reprog = m.appt; render(); break; }
      const r = answer(m.appt, k);
      if (!r.ok) toast(r.text);
      commit(); break;
    }
    case "phone-back": ui.phonePage = null; ui.reprog = null; render(); break;
    case "pt": { const r = answer(t.dataset.id, t.dataset.k); toast(r.text); commit(); break; }
    case "reprog": ui.reprog = t.dataset.id; render(); break;
    case "reprog-cancel": ui.reprog = null; render(); break;
    case "pick-slot": {
      const b = reschedule(t.dataset.id, Number(t.dataset.t));
      ui.reprog = null;
      if (b && ui.phonePage) ui.phonePage = null;
      if (!b) toast("Ese horario ya no está libre. Elige otro.");
      commit(); break;
    }
    case "wl-remove": S.waitlist = S.waitlist.filter((w) => w.id !== t.dataset.id); commit(); break;
    case "reset":
      if (confirm("¿Restablecer los datos de demostración? Se perderán los cambios hechos en este navegador.")) {
        try { localStorage.removeItem(KEY); localStorage.removeItem(GUIDE_KEY); } catch { /* sin almacenamiento */ }
        S = seed(); ui = { ...ui, phonePatient: null, phonePage: null, drawer: null, weekOffset: 0 }; commit(); toast("Datos de demostración restablecidos.");
      }
      break;
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.act === "prof") { ui.prof = t.value; render(); }
  if (t.dataset.act === "pick-phone") { ui.phonePatient = t.value; ui.phonePage = null; render(); }
  if (t.dataset.act === "pick-patient") togglePatientFields();
});
function togglePatientFields() {
  const sel = $("[name=patient]");
  if (!sel) return;
  document.querySelectorAll(".newp").forEach((el) => { el.style.display = sel.value === "nuevo" ? "" : "none"; });
}
document.addEventListener("submit", (e) => {
  const f = e.target;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(f));
  if (f.dataset.form === "new") {
    const err = $("#form-err");
    if (fd.patient === "nuevo") {
      if (fd.name.trim().length < 3) { err.textContent = "Escribe el nombre completo del paciente."; return; }
      if (!/^\+?[\d\s]{10,16}$/.test(fd.phone.trim())) { err.textContent = "Escribe un celular válido, por ejemplo +57 300 000 0000."; return; }
      if (!fd.consent) { err.textContent = "Sin la autorización del paciente no se le pueden enviar recordatorios."; return; }
    }
    const [y, mo, d] = fd.date.split("-").map(Number);
    const h = Number(fd.hour);
    const start = new Date(y, mo - 1, d, Math.floor(h), (h % 1) * 60).getTime();
    const dur = Number(fd.dur);
    if (start <= S.now) { err.textContent = "La cita debe quedar después de la hora actual de la simulación."; return; }
    if (isSunday(start)) { err.textContent = "El consultorio no atiende los domingos."; return; }
    if (!isFree(fd.prof, start, dur)) { err.textContent = "Ese horario ya está ocupado para este profesional."; return; }
    ui.modal = null;
    createAppt({ ...fd, start, dur });
  }
  if (f.dataset.form === "wl") {
    if (S.waitlist.some((w) => w.patient === fd.patient && w.prof === fd.prof && w.status !== "asignado")) { toast("Ese paciente ya está en la lista para este profesional."); return; }
    S.waitlist.push({ id: uid("w"), patient: fd.patient, prof: fd.prof, pref: fd.pref.trim() || "Cualquier horario", since: S.now, status: "esperando" });
    commit(); toast("Paciente agregado a la lista de espera.");
  }
  if (f.dataset.form === "settings") {
    S.practice = { name: fd.name.trim(), address: fd.address.trim(), value: Math.max(0, Number(fd.value) || 0), baseline: Math.min(100, Math.max(0, Number(fd.baseline) || 0)) };
    commit(); toast("Cambios guardados.");
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (ui.modal || ui.drawer)) { ui.modal = null; ui.drawer = null; render(); }
});
window.addEventListener("hashchange", render);
window.addEventListener("storage", (e) => { if (e.key === KEY) { S = load() || S; render(); } });

S = load() || seed();
save();
render();
