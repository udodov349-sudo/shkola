// Разметка уроков и тем: Markdown → HTML. Без DOM — работает и в сборке (Node), и в браузере.

export const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/(?:[^()\s]|\([^()\s]*\))+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return s;
}

const CALC_RE = /\[\[калькулятор:\s*([^\]]+)\]\]/;
const cells = row => {
  const result = [];
  let cell = "";
  const text = row.replace(/^\||\|$/g, "");
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\" && text[i + 1] === "|") { cell += "|"; i++; }
    else if (text[i] === "|") { result.push(cell.trim()); cell = ""; }
    else cell += text[i];
  }
  result.push(cell.trim());
  return result;
};

function tableHTML(rows) {
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  return `<div class="tbl"><table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${
    body.map(r => `<tr>${r.map((c, j) => `<td data-label="${esc((head[j] || "").replace(/\*/g, ""))}">${inline(c)}</td>`).join("")}</tr>`).join("")
  }</tbody></table></div>`;
}

export function renderMarkdown(md) {
  const L = md.replace(/\r/g, "").split("\n");
  let h = "", i = 0;
  while (i < L.length) {
    const line = L[i];
    if (!line.trim()) { i++; continue; }
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) { h += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`; i++; continue; }
    if (line.startsWith("|")) {
      const rows = [];
      while (i < L.length && L[i].startsWith("|")) rows.push(L[i++]);
      h += tableHTML(rows); continue;
    }
    if (line.startsWith(">")) {
      const q = [];
      while (i < L.length && L[i].startsWith(">")) q.push(L[i++].replace(/^>\s?/, ""));
      h += `<blockquote>${q.filter(x => x.trim()).map(x => `<p>${inline(x)}</p>`).join("")}</blockquote>`; continue;
    }
    if (/^\s*- /.test(line)) {
      let items = "";
      while (i < L.length && /^\s*- /.test(L[i])) items += `<li>${inline(L[i++].replace(/^\s*- (\[[ x]\] )?/, ""))}</li>`;
      h += `<ul>${items}</ul>`; continue;
    }
    if (/^\d+\. /.test(line)) {
      let items = "";
      while (i < L.length && /^\d+\. /.test(L[i])) items += `<li>${inline(L[i++].replace(/^\d+\. /, ""))}</li>`;
      h += `<ol>${items}</ol>`; continue;
    }
    const para = [];
    while (i < L.length && L[i].trim() && !/^(#|\||>|\s*- |\d+\. )/.test(L[i])) para.push(L[i++]);
    const text = para.join(" ");
    const cm = text.match(CALC_RE);
    if (cm) {
      const before = text.replace(CALC_RE, "").trim();
      if (before) h += `<p>${inline(before)}</p>`;
      h += `<div class="calc-slot" data-calc="${esc(cm[1].trim())}"></div>`;
    } else h += `<p>${inline(text)}</p>`;
  }
  return h;
}

/** Вынимает блоки :::имя … ::: из текста. */
function takeBlocks(md) {
  const blocks = {};
  const rest = [];
  const L = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(/^:::(\S+)\s*$/);
    if (m) {
      const body = [];
      i++;
      while (i < L.length && L[i].trim() !== ":::") body.push(L[i++]);
      blocks[m[1]] = body;
    } else rest.push(L[i]);
  }
  return { blocks, text: rest.join("\n") };
}

/** Вопросы теста: `? вопрос`, `- неверный`, `+ верный`, `> пояснение`. Поля — готовый HTML. */
function parseQuiz(lines) {
  if (!lines) return null;
  const qs = [];
  let cur = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith("? ")) { cur = { q: inline(l.slice(2)), options: [], explain: "" }; qs.push(cur); }
    else if (!cur) continue;
    else if (l.startsWith("+ ")) cur.options.push({ text: inline(l.slice(2)), correct: true });
    else if (l.startsWith("- ")) cur.options.push({ text: inline(l.slice(2)), correct: false });
    else if (l.startsWith("> ")) cur.explain = inline(l.slice(2));
  }
  return qs.length ? qs : null;
}

function takeTitle(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return { title: m ? m[1].trim() : "Без названия", text: m ? text.replace(m[0], "") : text };
}

export function parseLesson(md) {
  const { blocks, text } = takeBlocks(md);
  const { title, text: body } = takeTitle(text);
  const parts = body.split(/^---\s*$/m).map(s => s.trim()).filter(Boolean);
  const cards = parts.map(renderMarkdown);
  const summary = blocks["главное"]
    ? blocks["главное"].map(l => l.trim()).filter(l => l.startsWith("- ")).map(l => inline(l.slice(2)))
    : null;
  return { title, cards, fullHtml: cards.join(""), summary: summary && summary.length ? summary : null, quiz: parseQuiz(blocks["тест"]) };
}

export function parseTopic(md) {
  const { blocks, text } = takeBlocks(md);
  const { title, text: body0 } = takeTitle(text);
  const sm = body0.match(/^статус:\s*(\S+)\s*$/m);
  const status = sm && sm[1] === "готово" ? "готово" : "скоро";
  const body = sm ? body0.replace(sm[0], "") : body0;
  const [main, readPart = ""] = body.split(/^##\s+Что почитать дальше\s*$/m);
  const reading = readPart.split("\n").map(l => l.trim()).filter(l => l.startsWith("- ")).map(l => inline(l.slice(2)));
  return { title, status, description: renderMarkdown(main.trim()), reading, quiz: parseQuiz(blocks["тест"]) };
}
