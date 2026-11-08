// Точка входа: пароль → расшифровка данных → экраны школы.
import { deriveKey, decryptWithKey, exportKey, importKey } from "./crypto.js";
import { startApp } from "./views.js";

const KEY = "school:key";
const root = document.getElementById("app");

const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: v => { try { localStorage.setItem(KEY, v); } catch { /* ключ не запомнится — спросим пароль снова */ } },
  drop: () => { try { localStorage.removeItem(KEY); } catch { /* нечего удалять */ } },
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { /* без офлайна, но школа работает */ });
}

async function fetchBox() {
  try {
    const r = await fetch("data.json");
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch {
    return null;
  }
}

function message(title, text) {
  root.className = "gate";
  root.innerHTML = `<div class="gate-card"><h1>${title}</h1><p>${text}</p></div>`;
}

function passwordScreen(box) {
  root.className = "gate";
  root.innerHTML = `
    <form class="gate-card" id="gate" autocomplete="on">
      <h1>Школа</h1>
      <p>Введите пароль. На этом телефоне его нужно ввести только один раз.</p>
      <label class="field"><span>Пароль</span>
        <input id="pw" type="password" name="password" autocomplete="current-password" required></label>
      <p class="gate-error" id="err" role="alert"></p>
      <button class="btn primary" type="submit" id="go">Войти</button>
    </form>`;
  const form = root.querySelector("#gate"), pw = root.querySelector("#pw"), err = root.querySelector("#err"), go = root.querySelector("#go");
  pw.focus();
  form.addEventListener("submit", async e => {
    e.preventDefault();
    go.disabled = true;
    go.textContent = "Проверяю…";
    err.textContent = "";
    try {
      const key = await deriveKey(pw.value, box.salt);
      const school = JSON.parse(await decryptWithKey(box, key));
      store.set(await exportKey(key));
      startApp(school, root);
    } catch {
      err.textContent = "Неверный пароль";
      pw.value = "";
      pw.focus();
      go.disabled = false;
      go.textContent = "Войти";
    }
  });
}

async function main() {
  const box = await fetchBox();
  if (!box) {
    message("Нужен интернет", "Первый раз школа открывается с интернетом. Потом она работает и без него.");
    return;
  }
  const saved = store.get();
  if (saved) {
    try {
      const school = JSON.parse(await decryptWithKey(box, await importKey(saved)));
      startApp(school, root);
      return;
    } catch {
      store.drop(); // пароль сменился при новой сборке
    }
  }
  passwordScreen(box);
}

main();
