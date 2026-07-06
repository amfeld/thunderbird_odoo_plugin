/*
 * Options page: store the Odoo base URL and request host permission for it so
 * the background script may fetch the JSON-RPC endpoints.
 */

const input = document.getElementById("baseUrl");
const status = document.getElementById("status");

function say(text, kind) {
  status.textContent = text;
  status.className = kind || "";
}

function normalize(raw) {
  let url = (raw || "").trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    return u.origin; // scheme + host (+ port), no path/trailing slash
  } catch (e) {
    return null;
  }
}

async function load() {
  const { settings } = await messenger.storage.local.get("settings");
  if (settings && settings.baseUrl) input.value = settings.baseUrl;
}

async function save() {
  const origin = normalize(input.value);
  if (!origin) return say("Bitte eine gültige URL eingeben.", "err");

  // Ask for permission to talk to exactly this host.
  let granted;
  try {
    granted = await messenger.permissions.request({ origins: [origin + "/*"] });
  } catch (e) {
    granted = false;
  }
  if (!granted) {
    return say(
      "Zugriff auf " + origin + " wurde nicht erlaubt – ohne diese Berechtigung kann das Add-on Odoo nicht erreichen.",
      "err"
    );
  }

  await messenger.storage.local.set({ settings: { baseUrl: origin } });
  input.value = origin;
  say("Gespeichert. Du kannst das Fenster schließen und eine E-Mail öffnen.", "ok");
}

document.getElementById("save").addEventListener("click", save);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") save();
});
load();
