// Прогресс ученика: уроки, тесты тем, дни занятий. Всё остальное (серия, опыт, уровни,
// проценты, открытые этапы, достижения) вычисляется из него — так повтор не даёт двойных очков.

const KEY = "school:progress";
const PASS = 70;

export const empty = () => ({ v: 1, lessons: {}, topicTests: {}, days: [] });

const pad = n => String(n).padStart(2, "0");
export const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDay = (day, delta) => {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};
const weekKey = day => {
  const [y, m, d] = day.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = воскресенье
  return addDay(day, -((dow + 6) % 7)); // понедельник недели
};
const withDay = (days, today) => (days.includes(today) ? days : [...days, today].sort());

export function completeLesson(s, lessonId, quizPct, today) {
  const prev = s.lessons[lessonId];
  const best = quizPct === null ? prev?.quizBest ?? null : Math.max(quizPct, prev?.quizBest ?? 0);
  return { ...s, lessons: { ...s.lessons, [lessonId]: { done: true, quizBest: best } }, days: withDay(s.days, today) };
}

export function recordTopicTest(s, topicId, pct, today) {
  const best = Math.max(pct, s.topicTests[topicId] ?? 0);
  return { ...s, topicTests: { ...s.topicTests, [topicId]: best }, days: withDay(s.days, today) };
}

/** Серия: день из days — +1; пропуск закрывается одной заморозкой на неделю (пн–вс), иначе обрыв. */
export function streak(s, today) {
  if (!s.days.length) return 0;
  const set = new Set(s.days);
  const first = s.days.reduce((a, b) => (a < b ? a : b));
  const frozen = new Set();
  let count = set.has(today) ? 1 : 0;
  for (let day = addDay(today, -1); day >= first; day = addDay(day, -1)) {
    if (set.has(day)) { count++; continue; }
    const wk = weekKey(day);
    if (frozen.has(wk)) break;
    frozen.add(wk);
  }
  return count;
}

const passed = (s, topicId) => (s.topicTests[topicId] ?? 0) >= PASS;
const stageTopics = (school, n) => school.topics.filter(t => t.stage === n);
const stageDone = (s, school, n) => {
  const ts = stageTopics(school, n);
  return ts.length > 0 && ts.every(t => t.status === "готово" && passed(s, t.id));
};

export function xp(s, school) {
  let total = 0;
  for (const t of school.topics) {
    for (const l of t.lessons) {
      const r = s.lessons[l.id];
      if (r?.done) total += 10 + (r.quizBest === 100 ? 5 : 0);
    }
    if (passed(s, t.id)) total += 50;
  }
  for (const st of school.stages) if (stageDone(s, school, st.n)) total += 200;
  return total;
}

/** Уровень L начинается с 50·L·(L−1) очков. */
export function level(points) {
  let L = 1;
  while (50 * (L + 1) * L <= points) L++;
  return { level: L, from: 50 * L * (L - 1), to: 50 * (L + 1) * L };
}

const steps = (s, topics) => {
  let all = 0, done = 0;
  for (const t of topics) {
    all += t.lessons.length + 1;
    done += t.lessons.filter(l => s.lessons[l.id]?.done).length + (passed(s, t.id) ? 1 : 0);
  }
  return all ? Math.round((done / all) * 100) : 0;
};
export const topicPercent = (s, topic) => steps(s, [topic]);
export const stagePercent = (s, school, n) => steps(s, stageTopics(school, n).filter(t => t.status === "готово"));
export const schoolPercent = (s, school) => steps(s, school.topics.filter(t => t.status === "готово"));

export function stageOpen(s, school, n) {
  if (n === 1) return true;
  return stageTopics(school, n - 1).every(t => t.status === "готово" && passed(s, t.id));
}

export function achievements(s, school, today) {
  const best = Math.max(0, streak(s, today), ...s.days.map(d => streak(s, d)));
  const list = [
    { id: "first-lesson", title: "Первый урок", got: Object.values(s.lessons).some(r => r.done) },
    { id: "first-topic", title: "Первая тема", got: Object.keys(s.topicTests).some(id => passed(s, id)) },
  ];
  for (let n = 1; n <= 8; n++) list.push({ id: `stage-${n}`, title: `Этап ${n} пройден`, got: stageDone(s, school, n) });
  for (const d of [7, 30, 100]) list.push({ id: `streak-${d}`, title: `Серия ${d} дней`, got: best >= d });
  return list;
}

export const exportProgress = s => JSON.stringify(s);

const isObj = x => x !== null && typeof x === "object" && !Array.isArray(x);
const isPct = x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100;
const isDay = d => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && addDay(d, 0) === d;
const isLesson = r => isObj(r) && r.done === true && (r.quizBest === null || isPct(r.quizBest));

/** Строгая проверка каждого значения: чужой или битый файл не должен испортить прогресс. */
export function importProgress(text) {
  let o;
  try { o = JSON.parse(text); } catch { o = null; }
  const ok = isObj(o) && o.v === 1 && isObj(o.lessons) && isObj(o.topicTests) && Array.isArray(o.days)
    && Object.entries(o.lessons).every(([k, r]) => /^t\d\d-\d\d$/.test(k) && isLesson(r))
    && Object.entries(o.topicTests).every(([k, p]) => /^t\d\d$/.test(k) && isPct(p))
    && o.days.every(isDay);
  if (!ok) throw new Error("Файл прогресса не подходит");
  const lessons = {};
  for (const [k, r] of Object.entries(o.lessons)) lessons[k] = { done: true, quizBest: r.quizBest };
  return { v: 1, lessons, topicTests: { ...o.topicTests }, days: [...new Set(o.days)].sort() };
}

const defaultStorage = () => { try { return globalThis.localStorage; } catch { return null; } };

export function load(storage = defaultStorage()) {
  try {
    const raw = storage.getItem(KEY);
    return raw ? importProgress(raw) : empty();
  } catch {
    return empty();
  }
}

export function save(s, storage = defaultStorage()) {
  try {
    storage.setItem(KEY, exportProgress(s));
    return true;
  } catch {
    return false;
  }
}
