// Экраны школы: карта пути, тема, урок, итоговый тест, инструменты, профиль.
import * as P from "./progress.js";
import { esc } from "./markdown.js";
import { CALCS, mountCalcs } from "./calcs.js";

const PASS = 70;
let school, root, page, state, saveOk = true;

const today = () => P.localDate();
const topicById = id => school.topics.find(t => t.id === id);
const lessonById = id => {
  for (const t of school.topics) {
    const l = t.lessons.find(x => x.id === id);
    if (l) return { topic: t, lesson: l };
  }
  return null;
};
const stageOf = n => school.stages.find(s => s.n === n);
const isOpen = t => P.stageOpen(state, school, t.stage);
const lessonDone = id => !!state.lessons[id]?.done;
const plural = (n, one, few, many) => {
  const a = n % 100, b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many;
};
const days = n => plural(n, "день", "дня", "дней");
const questions = n => `${n} ${plural(n, "вопрос", "вопроса", "вопросов")}`;

function commit(next) {
  const before = new Set(P.achievements(state, school, today()).filter(a => a.got).map(a => a.id));
  const openBefore = school.stages.filter(s => P.stageOpen(state, school, s.n)).map(s => s.n);
  // Сначала всё вычисляем для нового состояния, и только потом принимаем и сохраняем его.
  const fresh = P.achievements(next, school, today()).filter(a => a.got && !before.has(a.id));
  const opened = school.stages.filter(s => P.stageOpen(next, school, s.n) && !openBefore.includes(s.n));
  state = next;
  saveOk = P.save(state);
  for (const s of opened) toast(`Открыт этап ${s.n}: ${s.title}`);
  for (const a of fresh) toast(`Достижение: ${a.title}`);
}

function toast(text) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.appendChild(el);
  const shown = document.querySelectorAll(".toast").length;
  el.style.setProperty("--n", shown - 1);
  setTimeout(() => el.remove(), 3600);
}

/** Первый непройденный шаг в открытых этапах: урок или итоговый тест. */
function nextStep() {
  for (const st of school.stages) {
    if (!P.stageOpen(state, school, st.n)) break;
    for (const t of school.topics.filter(x => x.stage === st.n && x.status === "готово").sort((a, b) => a.order - b.order)) {
      const l = t.lessons.find(x => !lessonDone(x.id));
      if (l) return { href: `#/l/${l.id}`, title: l.title, sub: t.title };
      if (t.quiz && (state.topicTests[t.id] ?? 0) < PASS) return { href: `#/test/${t.id}`, title: "Итоговый тест", sub: t.title };
    }
  }
  return null;
}

/* ---------- каркас ---------- */
const TABS = [["#/", "Карта"], ["#/tools", "Инструменты"], ["#/me", "Профиль"]];

function frame() {
  root.className = "app";
  root.innerHTML = `
    <nav class="tabs" aria-label="Разделы">
      <div class="brand">Школа</div>
      ${TABS.map(([h, t]) => `<a href="${h}" data-tab="${h}">${t}</a>`).join("")}
    </nav>
    <main id="page" tabindex="-1"></main>`;
  page = root.querySelector("#page");
}

function setTab(route) {
  const tab = route.startsWith("#/tools") ? "#/tools" : route.startsWith("#/me") || route.startsWith("#/glossary") || route.startsWith("#/sources") ? "#/me" : "#/";
  root.querySelectorAll(".tabs a").forEach(a => a.toggleAttribute("aria-current", a.dataset.tab === tab));
}

function route() {
  const h = location.hash || "#/";
  root.classList.toggle("immersive", h.startsWith("#/l/") || h.startsWith("#/test/"));
  setTab(h);
  let m;
  if ((m = h.match(/^#\/t\/(t\d\d)$/))) showTopic(m[1]);
  else if ((m = h.match(/^#\/l\/(t\d\d-\d\d)$/))) showLesson(m[1]);
  else if ((m = h.match(/^#\/test\/(t\d\d)$/))) showTest(m[1]);
  else if (h === "#/tools") showTools();
  else if (h === "#/me") showProfile();
  else if (h === "#/glossary") showText("Словарь", school.glossary, true);
  else if (h === "#/sources") showText("Источники и проверка", school.sources, false);
  else showMap();
  mountCalcs(page);
  window.scrollTo(0, 0);
}

const back = (href, text) => `<a class="back" href="${href}">${text}</a>`;
const bar = pct => `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>`;

/* ---------- карта ---------- */
function showMap() {
  const xp = P.xp(state, school), lv = P.level(xp), sk = P.streak(state, today());
  const next = nextStep();
  const pctSchool = P.schoolPercent(state, school);
  page.innerHTML = `
    <header class="map-head">
      <h1>Путь</h1>
      <div class="stats">
        <div class="stat"><b>${sk}</b><span>${days(sk)} подряд</span></div>
        <div class="stat"><b>${lv.level}</b><span>уровень</span></div>
        <div class="stat"><b>${pctSchool}%</b><span>школы пройдено</span></div>
      </div>
      <div class="level-line"><span>До уровня ${lv.level + 1}: ${lv.to - xp} очков опыта</span>${bar(Math.round(((xp - lv.from) / (lv.to - lv.from)) * 100))}</div>
    </header>
    ${next
      ? `<a class="continue" href="${next.href}"><span class="continue-label">Продолжить</span><b>${esc(next.title)}</b><span>${esc(next.sub)}</span></a>`
      : `<div class="continue done"><b>${pctSchool === 100 ? "Вся школа пройдена" : "Все открытые уроки пройдены"}</b><span>${pctSchool === 100 ? "Все 40 тем завершены. Любой урок и тест можно открыть снова." : "Новые темы появятся на карте."}</span></div>`}
    <ol class="path">
      ${school.stages.map(st => {
        const open = P.stageOpen(state, school, st.n);
        const topics = school.topics.filter(t => t.stage === st.n).sort((a, b) => a.order - b.order);
        const ready = topics.some(t => t.status === "готово");
        const pct = P.stagePercent(state, school, st.n);
        return `<li class="stage ${open ? "open" : "locked"} ${pct === 100 && ready ? "complete" : ""}">
          <div class="stage-node" aria-hidden="true">${st.n}</div>
          <div class="stage-body">
            <h2>${esc(st.title)}</h2>
            <p class="stage-meta">${open ? (ready ? `Пройдено ${pct}%` : "Темы готовятся") : `Откроется после этапа ${st.n - 1}`}</p>
            <ul class="topics">
              ${topics.map(t => {
                const soon = t.status !== "готово";
                const state2 = soon ? `<span class="tag">Скоро</span>` : !open ? `<span class="tag">Закрыто</span>` : `<span class="pct">${P.topicPercent(state, t)}%</span>`;
                return `<li><a href="#/t/${t.id}" class="${soon || !open ? "dim" : ""}"><span>${esc(t.title)}</span>${state2}</a></li>`;
              }).join("")}
            </ul>
          </div>
        </li>`;
      }).join("")}
    </ol>`;
}

/* ---------- тема ---------- */
function showTopic(id) {
  const t = topicById(id);
  if (!t) return showMap();
  const st = stageOf(t.stage);
  if (t.status !== "готово") {
    page.innerHTML = `${back("#/", "Карта")}<h1 class="title">${esc(t.title)}</h1>
      <p class="lead">Этап ${st.n}: ${esc(st.title)}. Тема готовится — она появится здесь, когда будет собрана и проверена.</p>`;
    return;
  }
  if (!isOpen(t)) {
    page.innerHTML = `${back("#/", "Карта")}<h1 class="title">${esc(t.title)}</h1>
      <p class="lead">Эта тема откроется, когда будут пройдены итоговые тесты всех тем этапа ${st.n - 1}.</p>`;
    return;
  }
  const best = t.id in state.topicTests ? Number(state.topicTests[t.id]) : undefined;
  const pct = P.topicPercent(state, t);
  page.innerHTML = `${back("#/", "Карта")}
    <p class="kicker">Этап ${st.n}: ${esc(st.title)}</p>
    <h1 class="title">${esc(t.title)}</h1>
    <div class="reading">${t.description}</div>
    <div class="topic-progress"><span>Пройдено ${pct}%</span>${bar(pct)}</div>
    <h2 class="section">Уроки</h2>
    <ol class="lessons">
      ${t.lessons.map((l, i) => `<li><a href="#/l/${l.id}" class="${lessonDone(l.id) ? "done" : ""}">
        <span class="n">${i + 1}</span><span class="lt">${esc(l.title)}</span><span class="mark">${lessonDone(l.id) ? "Пройден" : ""}</span></a></li>`).join("")}
    </ol>
    ${t.quiz ? `<a class="test-row ${best >= PASS ? "passed" : ""}" href="#/test/${t.id}">
      <b>Итоговый тест</b>
      <span>${best === undefined ? `${questions(t.quiz.length)}, чтобы пройти — ${PASS}% верных` : best >= PASS ? `Пройден, лучший результат ${best}%` : `Лучший результат ${best}%, нужно ${PASS}%`}</span></a>` : ""}
    ${t.reading.length ? `<h2 class="section">Что почитать дальше</h2><ul class="read-more">${t.reading.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}`;
}

/* ---------- урок ---------- */
function quizBlock(quiz, name) {
  return `<div class="quiz" data-name="${name}">
    ${quiz.map((q, qi) => `<fieldset class="q"><legend>${qi + 1}. ${q.q}</legend>
      ${q.options.map((o, oi) => `<label class="opt" data-ok="${o.correct ? 1 : 0}"><input type="radio" name="${name}-${qi}" value="${oi}"><span>${o.text}</span></label>`).join("")}
      ${q.explain ? `<p class="why">${q.explain}</p>` : ""}</fieldset>`).join("")}
    <button class="btn primary wide check" type="button">Проверить ответы</button>
    <p class="score" aria-live="polite"></p>
  </div>`;
}

/** Проверка ответов: подсвечивает и возвращает процент верных. */
function bindQuiz(box, onScore) {
  box.querySelector(".check").addEventListener("click", () => {
    const qs = [...box.querySelectorAll(".q")];
    const left = qs.filter(q => !q.querySelector("input:checked")).length;
    if (left) {
      box.querySelector(".score").textContent = `Осталось ответить: ${questions(left)}`;
      return;
    }
    let right = 0;
    for (const q of qs) {
      q.classList.add("checked");
      const picked = q.querySelector("input:checked");
      q.querySelectorAll(".opt").forEach(o => {
        o.classList.toggle("right", o.dataset.ok === "1");
        o.classList.toggle("wrong", o.dataset.ok !== "1" && o.contains(picked));
      });
      if (picked && picked.closest(".opt").dataset.ok === "1") right++;
    }
    const pct = Math.round((right / qs.length) * 100);
    box.querySelector(".score").textContent = `Верно ${right} из ${qs.length}`;
    onScore(pct);
  });
}

function showLesson(id) {
  const found = lessonById(id);
  if (!found || found.topic.status !== "готово" || !isOpen(found.topic)) return showMap();
  const { topic, lesson } = found;
  const steps = [...lesson.cards.map(html => ({ kind: "card", html }))];
  if (lesson.quiz) steps.push({ kind: "quiz" });
  steps.push({ kind: "end" });
  let i = 0, full = false, quizPct = null;
  const finish = () => {
    commit(P.completeLesson(state, lesson.id, quizPct, today()));
    location.hash = `#/t/${topic.id}`;
  };
  const endHtml = () => `<div class="end">
      ${lesson.summary ? `<h2>Главное</h2><ul class="summary">${lesson.summary.map(s => `<li>${s}</li>`).join("")}</ul>` : `<h2>Урок закончен</h2>`}
      <button class="btn primary wide finish" type="button">${lessonDone(lesson.id) ? "Готово" : "Урок пройден"}</button></div>`;

  const draw = () => {
    const s = steps[i];
    page.innerHTML = `
      <div class="lesson-top">
        <a class="close" href="#/t/${topic.id}">Закрыть</a>
        <button class="toggle" type="button" aria-pressed="${full}">${full ? "По карточкам" : "Читать целиком"}</button>
      </div>
      ${full ? "" : `<div class="segments" aria-label="Шаг ${i + 1} из ${steps.length}">${steps.map((_, k) => `<i class="${k < i ? "past" : k === i ? "now" : ""}"></i>`).join("")}</div>`}
      <article class="lesson ${full ? "full" : "card"}">
        ${full
          ? `<h1 class="title">${esc(lesson.title)}</h1><div class="reading">${lesson.fullHtml}</div>${lesson.quiz ? `<h2>Проверь себя</h2>${quizBlock(lesson.quiz, "lq")}` : ""}${endHtml()}`
          : s.kind === "card" ? `${i === 0 ? `<h1 class="title">${esc(lesson.title)}</h1>` : ""}<div class="reading">${s.html}</div>`
          : s.kind === "quiz" ? `<h2>Проверь себя</h2>${quizBlock(lesson.quiz, "lq")}`
          : endHtml()}
      </article>
      ${full ? "" : `<div class="pager">
        <button class="btn prev" type="button" ${i === 0 ? "disabled" : ""}>Назад</button>
        ${i < steps.length - 1 ? `<button class="btn primary next" type="button">Дальше</button>` : ""}
      </div>`}`;
    page.querySelector(".toggle").onclick = () => { full = !full; draw(); };
    page.querySelector(".prev")?.addEventListener("click", () => { i--; draw(); });
    page.querySelector(".next")?.addEventListener("click", () => { i++; draw(); });
    page.querySelector(".finish")?.addEventListener("click", finish);
    const qz = page.querySelector(".quiz");
    if (qz) bindQuiz(qz, pct => { quizPct = pct; });
    mountCalcs(page);
    window.scrollTo(0, 0);
  };
  // Свайп влево-вправо листает карточки.
  let x0 = null;
  page.ontouchstart = e => { x0 = e.touches[0].clientX; };
  page.ontouchend = e => {
    if (x0 === null || full) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (e.target.closest("input, label, .calc, .tbl")) return;
    if (dx < -60 && i < steps.length - 1) { i++; draw(); }
    else if (dx > 60 && i > 0) { i--; draw(); }
  };
  draw();
}

/* ---------- итоговый тест темы ---------- */
function showTest(id) {
  const t = topicById(id);
  if (!t || !t.quiz || t.status !== "готово" || !isOpen(t)) return showMap();
  page.innerHTML = `
    <div class="lesson-top"><a class="close" href="#/t/${t.id}">Закрыть</a></div>
    <p class="kicker">Итоговый тест</p>
    <h1 class="title">${esc(t.title)}</h1>
    <p class="lead">${questions(t.quiz.length)}. Чтобы пройти тему, нужно ${PASS}% верных ответов. Пересдавать можно сколько угодно.</p>
    ${quizBlock(t.quiz, "tt")}
    <div class="test-result" hidden></div>`;
  bindQuiz(page.querySelector(".quiz"), pct => {
    commit(P.recordTopicTest(state, t.id, pct, today()));
    const ok = pct >= PASS;
    const box = page.querySelector(".test-result");
    box.hidden = false;
    box.className = `test-result ${ok ? "ok" : "retry"}`;
    box.innerHTML = `<b>${pct}%</b><span>${ok ? "Тема пройдена" : `Нужно ${PASS}%. Перечитайте уроки и пересдайте.`}</span>
      <a class="btn ${ok ? "primary" : ""} wide" href="${ok ? "#/" : `#/t/${t.id}`}">${ok ? "На карту" : "К урокам темы"}</a>
      ${ok ? "" : `<button class="btn wide again" type="button">Пересдать</button>`}`;
    page.querySelector(".check").disabled = true;
    box.querySelector(".again")?.addEventListener("click", () => showTest(id));
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

/* ---------- инструменты ---------- */
function showTools() {
  const names = Object.keys(CALCS);
  page.innerHTML = `<h1 class="title">Инструменты</h1>
    <p class="lead">Калькуляторы к урокам. Цифры пересчитываются сразу, как вы вводите.</p>
    ${names.length ? names.map(n => `<div class="calc-slot" data-calc="${esc(n)}"></div>`).join("") : `<p class="lead">Калькуляторы скоро появятся.</p>`}`;
}

/* ---------- профиль ---------- */
function showProfile() {
  const xp = P.xp(state, school), lv = P.level(xp);
  const ach = P.achievements(state, school, today());
  page.innerHTML = `<h1 class="title">Профиль</h1>
    <section class="level-card">
      <div class="level-big"><b>${lv.level}</b><span>уровень</span></div>
      <div class="level-info"><p>${xp} очков опыта. До уровня ${lv.level + 1} — ${lv.to - xp}.</p>${bar(Math.round(((xp - lv.from) / (lv.to - lv.from)) * 100))}
        <p class="hint">Урок — 10 очков, мини-тест без ошибок — ещё 5, итоговый тест темы — 50, пройденный этап — 200.</p></div>
    </section>
    <h2 class="section">Достижения</h2>
    <ul class="achievements">${ach.map(a => `<li class="${a.got ? "got" : ""}"><span class="medal" aria-hidden="true"></span><span>${esc(a.title)}</span><small>${a.got ? "Получено" : "Ещё нет"}</small></li>`).join("")}</ul>
    <h2 class="section">Справка</h2>
    <div class="links"><a class="btn wide" href="#/glossary">Словарь</a><a class="btn wide" href="#/sources">Источники и проверка</a></div>
    <h2 class="section">Прогресс</h2>
    ${saveOk ? "" : `<p class="warn">Прогресс не сохраняется на этом устройстве — сохраните его в файл.</p>`}
    <p class="hint">Прогресс хранится только на этом телефоне. Сохраните его в файл, чтобы не потерять при сбросе браузера или смене телефона.</p>
    <div class="links">
      <button class="btn wide" type="button" id="exp">Сохранить прогресс в файл</button>
      <label class="btn wide" for="imp">Загрузить прогресс из файла</label>
      <input id="imp" type="file" accept="application/json,.json" hidden>
    </div>
    <p class="import-msg" id="impMsg" role="status"></p>`;
  page.querySelector("#exp").onclick = () => {
    const blob = new Blob([P.exportProgress(state)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `прогресс-школы-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  page.querySelector("#imp").onchange = async e => {
    const file = e.target.files[0];
    const msg = page.querySelector("#impMsg");
    if (!file) return;
    try {
      const next = P.importProgress(await file.text());
      commit(next);
      msg.className = "import-msg ok";
      msg.textContent = "Прогресс загружен";
    } catch (err) {
      msg.className = "import-msg bad";
      msg.textContent = err.message;
    }
    e.target.value = "";
  };
}

function showText(title, html, searchable) {
  page.innerHTML = `${back("#/me", "Профиль")}${searchable ? `<input class="search" type="search" placeholder="Найти термин" aria-label="Найти термин">` : ""}<div class="reading doc">${html}</div>`;
  const h1 = page.querySelector(".doc h1");
  if (h1) h1.classList.add("title"); else page.querySelector(".doc").insertAdjacentHTML("afterbegin", `<h1 class="title">${esc(title)}</h1>`);
  const q = page.querySelector(".search");
  if (q) q.oninput = () => {
    const s = q.value.trim().toLowerCase();
    page.querySelectorAll(".tbl").forEach(tbl => {
      const rows = [...tbl.querySelectorAll("tbody tr")];
      for (const tr of rows) tr.hidden = !tr.textContent.toLowerCase().includes(s);
      const empty = rows.every(tr => tr.hidden);
      tbl.hidden = empty;
      const heading = tbl.previousElementSibling;
      if (heading?.matches("h2")) heading.hidden = empty;
    });
  };
}

export function startApp(data, el) {
  school = data;
  root = el;
  state = P.load();
  saveOk = P.save(state);
  frame();
  window.addEventListener("hashchange", route);
  route();
}
