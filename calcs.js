// Калькуляторы школы (перенесены из прежнего сайта с исправлениями: без отрицательных чисел,
// склонение лет, защита графика от бесконечности). Расчётные функции — отдельно, для тестов.

const fmt = n => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Math.round(n));
const rub = n => fmt(n) + " ₽";
const pct = (n, d = 1) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: d }).format(n) + "%";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = el => { const v = parseFloat(String(el.value).replace(",", ".").replace(/\s/g, "")); return isFinite(v) ? Math.max(0, v) : 0; };
const $ = id => document.getElementById(id);

export const yrs = n => {
  const a = Math.abs(n) % 100, b = a % 10;
  return n + " " + (a > 10 && a < 20 ? "лет" : b === 1 ? "год" : b >= 2 && b <= 4 ? "года" : "лет");
};

const NDFL = [[2.4e6, 0.13], [5e6, 0.15], [20e6, 0.18], [50e6, 0.20], [Infinity, 0.22]];
/** НДФЛ по прогрессивной шкале 2025–2026: повышенная ставка только на часть сверх порога. */
export function ndfl(year) {
  let prev = 0, tax = 0;
  for (const [lim, rate] of NDFL) { tax += Math.max(0, Math.min(year, lim) - prev) * rate; prev = lim; }
  return Math.round(tax);
}
const investmentTax = base => Math.min(base, 2.4e6) * 0.13 + Math.max(0, base - 2.4e6) * 0.15;
/** Налог с процентов по вкладам: 13%/15% по инвестиционной базе, упрощённо без капитализации. */
export const depositTax = (sum, ratePct, limit, otherIncome = 0) => {
  const interest = sum * ratePct / 100;
  return Math.round(investmentTax(otherIncome + Math.max(0, interest - limit)) - investmentTax(otherIncome));
};

/** Сумма на счёте через years лет: старт P, пополнение C в месяц, ставка r % годовых. */
export function compoundSeries({ P, C, r, years, monthly }) {
  const k = r / 100;
  let bal = P, inv = P;
  const vals = [P], invs = [P];
  for (let y = 1; y <= years; y++) {
    for (let m = 0; m < 12; m++) { if (monthly) bal *= 1 + k / 12; bal += C; inv += C; }
    if (!monthly) bal = (bal - C * 12) * (1 + k) + C * 12; // взносы года получают проценты со следующего года
    vals.push(bal); invs.push(inv);
  }
  return { bal, inv, vals, invs };
}
export const compound = o => compoundSeries(o).bal;

const field = (id, label, val, attrs = "") =>
  `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="decimal" value="${val}" ${/min=/.test(attrs) ? "" : 'min="0"'} ${attrs}></div>`;
const select = (id, label, opts) =>
  `<div class="field"><label for="${id}">${label}</label><select id="${id}">${opts.map(([v, t, s]) => `<option value="${v}" ${s ? "selected" : ""}>${t}</option>`).join("")}</select></div>`;
const kv = pairs => `<div class="kv">${pairs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>`;

function lineChart(series, labels) {
  const W = 640, H = 220, p = { l: 8, r: 8, t: 12, b: 24 };
  const max = Math.max(...series.flatMap(s => s.values).filter(isFinite), 1);
  const n = series[0].values.length;
  const x = i => p.l + (W - p.l - p.r) * (n <= 1 ? 0 : i / (n - 1));
  const y = v => H - p.b - (H - p.t - p.b) * Math.min(isFinite(v) ? v : max, max) / max;
  const paths = series.map(s => `<path d="${s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round"/>`).join("");
  const step = Math.max(1, Math.ceil(n / 8));
  const ticks = labels.map((t, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" fill="#9ba4b4" font-size="12" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${t}</text>` : "")).join("");
  const grid = [0.25, 0.5, 0.75, 1].map(f => `<line x1="${p.l}" x2="${W - p.r}" y1="${y(max * f)}" y2="${y(max * f)}" stroke="#2e3748" stroke-width="1"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="График роста">${grid}${paths}${ticks}</svg>
  <div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("")}</div>`;
}

const debtStore = {
  get(d) { try { const v = localStorage.getItem("school:debts"); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(v) { try { localStorage.setItem("school:debts", JSON.stringify(v)); } catch { /* не сохранится — не страшно */ } },
};

export const CALCS = {
  "бюджет": {
    title: "Распределение бюджета 50 / 20 / 15 / 15", desc: "Сколько рублей в каждую категорию с вашего дохода.",
    html: u => `<div class="fields">${field(u + "inc", "Доход после налога в месяц, ₽", 100000, 'step="1000"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const inc = num($(u + "inc"));
      const parts = [["Обязательные", .5, "#9ba4b4"], ["Желания", .2, "#86bf9f"], ["Подушка", .15, "#e6c068"], ["Инвестиции", .15, "#d4a84b"]];
      const inv = [["BTC (спот)", .065], ["ETH (спот)", .045], ["Стейкинг ETH", .03], ["Фьючерсы", .01]];
      $(u + "o").innerHTML =
        `<div class="bar-parts">${parts.map(([n, f, c]) => `<div style="flex:${f};background:${c}">${f * 100}%</div>`).join("")}</div>
        <div class="legend">${parts.map(([n, f, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>
        ${kv(parts.map(([n, f]) => [n, rub(inc * f)]))}
        <h4>Внутри инвестиций</h4>${kv(inv.map(([n, f]) => [n, rub(inc * f)]))}
        <p class="note">Подушка: пока рублями не накоплены 3 месяца обязательных расходов (${rub(inc * .5 * 3)} при ваших обязательных ${rub(inc * .5)}), все ${rub(inc * .15)} идут на накопительный счёт. Потом — в стейблкоины: ${rub(inc * .15 * .53)} хранение, ${rub(inc * .15 * .47)} стейкинг.</p>`;
    },
  },
  "подушка": {
    title: "Подушка безопасности", desc: "Цель на 3 и 6 месяцев и срок накопления.",
    html: u => `<div class="fields">${field(u + "exp", "Обязательные расходы в месяц, ₽", 50000, 'step="1000"')}${field(u + "have", "Уже накоплено, ₽", 0, 'step="1000"')}${field(u + "save", "Откладываю в месяц, ₽", 15000, 'step="1000"')}${select(u + "m", "Цель", [["3", "3 месяца"], ["6", "6 месяцев", 1], ["9", "9 месяцев"], ["12", "12 месяцев"]])}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const e = num($(u + "exp")), have = num($(u + "have")), s = num($(u + "save")), m = +$(u + "m").value;
      const goal = e * m, rubL = Math.min(goal, e * 3), stab = Math.max(0, goal - rubL), left = Math.max(0, goal - have);
      const months = s > 0 ? Math.ceil(left / s) : Infinity;
      const done = goal > 0 ? Math.min(100, have / goal * 100) : 0;
      $(u + "o").innerHTML = `<div class="big">${rub(goal)}</div><p class="note">цель на ${m} мес.</p>
        <div class="bar-parts"><div style="flex:${done};background:#d4a84b"></div><div style="flex:${100 - done};background:#2e3748"></div></div>
        ${kv([["Рублёвый слой (3 мес.)", rub(rubL)], ["Слой стейблкоинов", rub(stab)], ["Осталось накопить", rub(left)], ["Срок", left <= 0 ? "цель достигнута" : months === Infinity ? "задайте сумму" : `${months} мес. (≈ ${(months / 12).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} г.)`]])}
        <p class="note">Накоплено ${pct(done, 0)}. Сначала заполняется рублёвый слой, потом стейблкоины.</p>`;
    },
  },
  "сложный процент": {
    title: "Сложный процент", desc: "Сколько станет при регулярных вложениях — на бумаге и в сегодняшних деньгах.",
    html: u => `<div class="fields">${field(u + "p", "Стартовая сумма, ₽", 10000, 'step="1000"')}${field(u + "c", "Пополнение в месяц, ₽", 1000, 'step="500"')}${field(u + "r", "Доходность, % годовых", 8, 'step="0.5"')}${field(u + "y", "Срок, лет", 20, 'min="1" max="60"')}${field(u + "inf", "Инфляция, % в год", 5, 'step="0.5"')}${select(u + "k", "Начисление процентов", [["12", "Каждый месяц", 1], ["1", "Раз в год"]])}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const Y = Math.min(60, Math.max(1, Math.round(num($(u + "y")))));
      const s = compoundSeries({ P: num($(u + "p")), C: num($(u + "c")), r: num($(u + "r")), years: Y, monthly: $(u + "k").value === "12" });
      const real = s.bal / Math.pow(1 + num($(u + "inf")) / 100, Y);
      $(u + "o").innerHTML = `<div class="big">${rub(s.bal)}</div><p class="note">через ${yrs(Y)}</p>
        ${kv([["Вложено своих", rub(s.inv)], ["Заработано процентов", rub(s.bal - s.inv)], ["В сегодняшних деньгах", rub(real)]])}
        ${lineChart([{ values: s.vals, color: "#d4a84b", name: "Сумма на счёте" }, { values: s.invs, color: "#9ba4b4", name: "Вложено своих" }], s.vals.map((_, i) => String(i)))}`;
    },
  },
  "ндфл": {
    title: "НДФЛ по прогрессивной шкале", desc: "Шкала 2025–2026 годов: повышенная ставка — только на часть сверх порога.",
    html: u => `<div class="fields">${field(u + "m", "Доход до налога в месяц, ₽", 150000, 'step="5000"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const year = num($(u + "m")) * 12;
      const tax = ndfl(year);
      let prev = 0; const rows = [];
      for (const [lim, rate] of NDFL) { const part = Math.max(0, Math.min(year, lim) - prev); if (part > 0) rows.push([`${pct(rate * 100, 0)} с ${rub(part)}`, rub(part * rate)]); prev = lim; }
      $(u + "o").innerHTML = `<div class="big">${rub(tax)}</div><p class="note">налог за год с дохода ${rub(year)}</p>
        ${kv([["Средняя ставка", pct(year ? tax / year * 100 : 0, 2)], ["На руки за год", rub(year - tax)], ["На руки в среднем в месяц", rub((year - tax) / 12)]])}
        <h4>По ступеням</h4>${kv(rows)}
        <p class="note">Расчёт для основной налоговой базы, например зарплаты. Вклады, инвестиции и продажа имущества образуют отдельную базу со ставками 13% и 15%.</p>`;
    },
  },
  "вклады": {
    title: "Налог с процентов по вкладам", desc: "Без налога: 1 млн ₽ × наибольшая ключевая ставка года.",
    html: u => `<div class="fields">${select(u + "y", "Год", [["0.16", "2026 (лимит 160 000 ₽)", 1], ["0.21", "2025 (лимит 210 000 ₽)"]])}${field(u + "s", "Сумма на всех вкладах и счетах, ₽", 1500000, 'step="50000"')}${field(u + "r", "Средняя ставка, % годовых", 15, 'step="0.5"')}${field(u + "other", "Другие доходы инвестиционной базы за год, ₽", 0, 'step="50000"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const lim = 1e6 * +$(u + "y").value, s = num($(u + "s")), r = num($(u + "r")), other = num($(u + "other"));
      const inc = s * r / 100, tax = depositTax(s, r, lim, other);
      $(u + "o").innerHTML = `<div class="big">${rub(tax)}</div><p class="note">налог за год</p>
        ${kv([["Проценты за год", rub(inc)], ["Без налога", rub(lim)], ["Облагается", rub(Math.max(0, inc - lim))]])}
        <p class="note">Расчёт упрощённый: проценты без капитализации. К инвестиционной базе до 2,4 млн ₽ применяется 13%, к части свыше — 15%. Учтите доходы от ценных бумаг, продажи имущества и другие компоненты этой базы в отдельном поле. Налог платится до 1 декабря следующего года по уведомлению из налоговой.${tax === 0 ? ' <span class="okc">Ваши проценты в пределах лимита.</span>' : ""}</p>`;
    },
  },
  "долги": {
    title: "Снежный ком против лавины", desc: "Введите свои долги — увидите, когда закроете и сколько переплатите каждым методом.",
    html: u => `<div class="debt-head"><span>Название</span><span>Остаток, ₽</span><span>Ставка, %</span><span>Минимальный платёж, ₽</span><span></span></div>
      <div class="debts" id="${u}list"></div>
      <button class="btn" type="button" id="${u}add">Добавить долг</button>
      <div class="fields">${field(u + "x", "Сверх минимальных платежей в месяц, ₽", 5000, 'step="500"')}</div><div class="out" id="${u}o"></div>`,
    init(u, rerun) {
      const list = $(u + "list");
      const saved = debtStore.get([["Кредитная карта", 50000, 45, 2500], ["Потребкредит", 150000, 22, 7000], ["Займ у друга", 10000, 0, 1000]]);
      const row = d => {
        const r = document.createElement("div"); r.className = "debt-row";
        const cell = (label, input) => `<label class="dl"><span>${label}</span>${input}</label>`;
        r.innerHTML = cell("Название", `<input value="${esc(d[0])}">`)
          + cell("Остаток, ₽", `<input type="number" inputmode="decimal" min="0" value="${+d[1] || 0}">`)
          + cell("Ставка, %", `<input type="number" inputmode="decimal" min="0" value="${+d[2] || 0}">`)
          + cell("Минимальный платёж, ₽", `<input type="number" inputmode="decimal" min="0" value="${+d[3] || 0}">`)
          + `<button class="del" type="button" aria-label="Удалить долг">Удалить</button>`;
        r.querySelector(".del").onclick = () => { r.remove(); rerun(); }; list.appendChild(r);
      };
      saved.forEach(row);
      $(u + "add").onclick = () => { row(["Новый долг", 0, 0, 0]); rerun(); };
    },
    run(u) {
      const debts = [...document.querySelectorAll(`#${u}list .debt-row`)].map(r => { const i = r.querySelectorAll("input"); return { n: i[0].value || "Долг", b: num(i[1]), r: num(i[2]), m: num(i[3]) }; });
      debtStore.set(debts.map(d => [d.n, d.b, d.r, d.m]));
      const live = debts.filter(d => d.b > 0);
      const out = $(u + "o");
      if (!live.length) { out.innerHTML = '<p class="note">Добавьте хотя бы один долг с остатком.</p>'; return; }
      const extra = num($(u + "x"));
      const sim = order => {
        const ds = live.map(d => ({ ...d })); const budget = ds.reduce((s, d) => s + d.m, 0) + extra;
        let month = 0, interest = 0; const closed = [];
        while (ds.some(d => d.b > 0.5) && month < 600) {
          month++;
          ds.forEach(d => { if (d.b > 0) { const it = d.b * d.r / 1200; d.b += it; interest += it; } });
          let money = budget;
          ds.forEach(d => { if (d.b > 0) { const p = Math.min(d.b, d.m, money); d.b -= p; money -= p; } });
          for (const d of ds.filter(x => x.b > 0).sort(order)) { if (money <= 0) break; const p = Math.min(d.b, money); d.b -= p; money -= p; }
          ds.forEach(d => { if (d.b <= 0.5 && !d.done) { d.done = true; closed.push([d.n, month]); } });
        }
        return { month, interest, closed, stuck: month >= 600 };
      };
      const snow = sim((a, b) => a.b - b.b), aval = sim((a, b) => b.r - a.r);
      const desc = s => s.stuck ? '<p class="warn">Платежей не хватает, чтобы покрыть проценты — долг не уменьшится. Увеличьте сумму сверх минимальных или обратитесь в банк за реструктуризацией.</p>'
        : `${kv([["Все долги закрыты через", `${s.month} мес.`], ["Переплата процентов", rub(s.interest)]])}<p class="note">Порядок закрытия: ${s.closed.map(([n, m]) => `${esc(n)} — ${m}-й мес.`).join("; ")}</p>`;
      const diff = snow.interest - aval.interest;
      out.innerHTML = `<h4>Снежный ком — сначала самый маленький</h4>${desc(snow)}<h4>Лавина — сначала самая высокая ставка</h4>${desc(aval)}
        ${!snow.stuck && !aval.stuck ? `<p class="note">${diff > 1 ? `Лавина экономит ${rub(diff)}.` : "Разница между методами почти нулевая — выбирайте тот, что мотивирует."}</p>` : ""}`;
    },
  },
  "пдн": {
    title: "Долговая нагрузка (ПДН)", desc: "Какая доля дохода уходит на кредиты.",
    html: u => `<div class="fields">${field(u + "i", "Доход после налога в месяц, ₽", 80000, 'step="1000"')}${field(u + "p", "Все платежи по кредитам в месяц, ₽", 20000, 'step="500"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const i = num($(u + "i")), p = num($(u + "p")); const v = i > 0 ? p / i * 100 : 0;
      const z = v <= 30 ? ["okc", "Нормально"] : v <= 50 ? ["midc", "Повышенная нагрузка — новых кредитов не брать"] : ["warn", "Опасно — нужен план погашения"];
      $(u + "o").innerHTML = `<div class="big ${z[0]}">${pct(v)}</div><p class="${z[0]}">${z[1]}</p>
        <div class="bar-parts"><div style="flex:${Math.min(v, 100)};background:${v <= 30 ? "#86bf9f" : v <= 50 ? "#e6c068" : "#e58a74"}"></div><div style="flex:${Math.max(0, 100 - v)};background:#2e3748"></div></div>`;
    },
  },
  "привычка": {
    title: "Цена привычки", desc: "Ежедневная мелочь за год — и сколько стало бы, если вкладывать.",
    html: u => `<div class="fields">${field(u + "d", "Трата в день, ₽", 200, 'step="10"')}${field(u + "r", "Доходность вложений, % годовых", 10, 'step="0.5"')}${field(u + "y", "Срок, лет", 10, 'min="1" max="50"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const d = num($(u + "d")), r = num($(u + "r")) / 1200, Y = Math.min(50, Math.max(1, Math.round(num($(u + "y")))));
      const m = d * 365 / 12; const fv = r ? m * ((Math.pow(1 + r, Y * 12) - 1) / r) : m * Y * 12;
      $(u + "o").innerHTML = kv([["В месяц", rub(m)], ["В год", rub(d * 365)], [`За ${yrs(Y)} просто так`, rub(d * 365 * Y)], [`За ${yrs(Y)}, если вкладывать`, rub(fv)]]);
    },
  },
  "dca": {
    title: "План покупок по DCA", desc: "Месячная сумма на BTC и ETH, разбитая на 4 недельные покупки по 25%.",
    html: u => `<div class="fields">${field(u + "inc", "Доход после налога в месяц, ₽", 100000, 'step="1000"')}</div><div class="out" id="${u}o"></div>`,
    run(u) {
      const inc = num($(u + "inc")); const b = inc * .065, e = inc * .045;
      $(u + "o").innerHTML = `${kv([["BTC в месяц", rub(b)], ["BTC каждую неделю", rub(b / 4)], ["ETH в месяц", rub(e)], ["ETH каждую неделю", rub(e / 4)]])}
        <p class="note">DCA означает одинаковую сумму по заранее выбранному графику, независимо от текущей цены. В личной схеме владельца стейкинг ETH (${rub(inc * .03)}) и фьючерсы (${rub(inc * .01)}) учитываются отдельно, раз в месяц. Это расчёт по схеме, а не совет что-либо покупать.</p>`;
    },
  },
};

let uid = 0;
export function mountCalcs(root) {
  root.querySelectorAll(".calc-slot").forEach(slot => {
    const c = CALCS[slot.dataset.calc];
    if (!c) { slot.remove(); return; }
    const u = "c" + (uid++) + "_";
    slot.outerHTML = `<section class="calc" id="${u}box"><h3>${c.title}</h3><p class="hint">${c.desc}</p>${c.html(u)}</section>`;
    const box = $(u + "box");
    const go = () => c.run(u);
    if (c.init) c.init(u, go);
    box.addEventListener("input", go);
    box.addEventListener("change", go);
    go();
  });
}
