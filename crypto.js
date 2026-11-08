// Шифрование данных школы паролем: PBKDF2-SHA-256 (600 000 итераций) → AES-GCM 256.
// Работает и в Node 24, и в Safari через globalThis.crypto.subtle.

const ITER = 600000;
const subtle = () => globalThis.crypto.subtle;

const toB64 = bytes => {
  let s = "";
  const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function deriveKey(password, saltB64) {
  // NFC: «й», набранная на iPhone и в Windows, может быть закодирована по-разному.
  const base = await subtle().importKey("raw", new TextEncoder().encode(password.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations: ITER },
    base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encrypt(plainText, password) {
  const salt = toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plainText));
  return { v: 1, salt, iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptWithKey(box, key) {
  try {
    const pt = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct));
    return new TextDecoder().decode(pt);
  } catch {
    throw new Error("Неверный пароль");
  }
}

export async function exportKey(key) {
  return toB64(await subtle().exportKey("raw", key));
}

export async function importKey(raw) {
  return subtle().importKey("raw", fromB64(raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}
