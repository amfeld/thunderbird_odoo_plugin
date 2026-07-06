/*
 * Odoo for Thunderbird — popup.
 *
 * Reads the currently displayed message, asks the background script for the
 * Odoo contact behind it, and renders the profile plus the same actions the
 * Outlook add-in offers: create contact, enrich company, create lead, create
 * project task, create helpdesk ticket, and log the e-mail on a record.
 *
 * Optional extension hook: if a script defining `globalThis.OdooAblage` is
 * loaded before this one, this file adds a "log to record" action and
 * counterpart/direction detection for it. Without it (the normal case for
 * this repo), this popup is the complete standard feature set.
 */

const app = document.getElementById("app");

// message currently open in Thunderbird -> { id, name, email, outgoing,
// subject, bodyHtml, headerMessageId, date, emailFrom, emailTo }
// (name/email = Gegenpartei, nicht zwingend der Absender)
let mail = null;
// last partner/get response
let contact = null;

// ---------------------------------------------------------------------------
// messaging to the background script
// ---------------------------------------------------------------------------

function bg(message) {
  return messenger.runtime.sendMessage(message);
}

// Authenticated Odoo call. Throws { code } so callers can react to needs_auth.
async function api(path, params) {
  const res = await bg({ type: "api", path, params });
  if (!res || !res.ok) {
    const err = new Error((res && res.message) || "error");
    err.code = (res && res.code) || "error";
    throw err;
  }
  return res.result;
}

// ---------------------------------------------------------------------------
// reading the displayed e-mail
// ---------------------------------------------------------------------------

function parseAddress(raw) {
  const s = (raw || "").trim();
  const m = /<([^>]+)>/.exec(s);
  const email = (m ? m[1] : s).trim();
  let name = s.replace(/<[^>]*>/, "").replace(/"/g, "").trim();
  if (!name) name = email;
  return { name, email };
}

// Walk the MIME part tree and collect an HTML (preferred) or plain-text body.
function collectBody(part, acc) {
  if (part.body && part.contentType) {
    if (part.contentType.startsWith("text/html")) acc.html += part.body;
    else if (part.contentType.startsWith("text/plain")) acc.plain += part.body;
  }
  if (part.parts) for (const p of part.parts) collectBody(p, acc);
}

function escapeHtml(s) {
  return (s || "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])
  );
}

// MV3: getDisplayedMessage (Singular) wurde entfernt. getDisplayedMessages
// liefert je nach TB-Version ein Array oder eine MessageList ({messages}).
async function getDisplayedHeader(tabId) {
  const md = messenger.messageDisplay;
  if (typeof md.getDisplayedMessage === "function")
    return md.getDisplayedMessage(tabId);
  const res = await md.getDisplayedMessages(tabId);
  const list = Array.isArray(res) ? res : (res && res.messages) || [];
  return list[0] || null;
}

async function loadMail() {
  const [tab] = await messenger.tabs.query({
    active: true,
    currentWindow: true,
  });
  const header = await getDisplayedHeader(tab.id);
  if (!header) return null;

  const author = parseAddress(header.author);
  const recipients = (header.recipients || []).map(parseAddress);

  // Direction + counterpart come from the optional extension hook, if one is
  // loaded; this repo's standard build stays sender-based like the official
  // Outlook plugin. Detection is optional: if it fails, sender-logic applies
  // — it must never block the popup.
  let outgoing = false;
  let counterpart = author;
  if (globalThis.OdooAblage) {
    try {
      ({ outgoing, counterpart } = await OdooAblage.detectCounterpart(
        author,
        recipients,
        header
      ));
    } catch (e) {
      console.warn("OdooAblage: counterpart detection failed", e);
    }
  }

  const acc = { html: "", plain: "" };
  try {
    const full = await messenger.messages.getFull(header.id);
    collectBody(full, acc);
  } catch (e) {
    /* body is optional for the lookup */
  }
  const bodyHtml =
    acc.html || (acc.plain ? "<pre>" + escapeHtml(acc.plain) + "</pre>" : "");

  return {
    id: header.id,
    // name/email = Gegenpartei (Standard-Variante: immer der Absender): alle
    // Aktionen zielen damit auch bei Ausgangsmails auf den Kunden.
    name: counterpart.name,
    email: counterpart.email,
    outgoing,
    subject: header.subject || "",
    bodyHtml,
    headerMessageId: header.headerMessageId || "",
    date: header.date ? new Date(header.date).toISOString() : null,
    emailFrom: header.author || "",
    emailTo: (header.recipients || []).join(", "),
    tags: header.tags || [],
  };
}

// ---------------------------------------------------------------------------
// tiny DOM helpers (textContent everywhere -> no HTML injection from Odoo data)
// ---------------------------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function")
      node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function clear() {
  app.textContent = "";
}

function toast(text, kind) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.className = "toast" + (kind ? " " + kind : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2600);
}

function header() {
  return el("div", { class: "pane-head" }, [
    el("img", { src: "../icons/odoo-32.png", alt: "Odoo" }),
    el("span", { class: "title", text: "Odoo" }),
    el("button", {
      class: "gear",
      title: "Einstellungen",
      text: "⚙",
      onclick: () => messenger.runtime.openOptionsPage(),
    }),
  ]);
}

async function openInOdoo(pathname) {
  const { baseUrl } = await bg({ type: "getState" });
  if (baseUrl) messenger.windows.openDefaultBrowser(baseUrl + pathname);
}

// ---------------------------------------------------------------------------
// screens
// ---------------------------------------------------------------------------

function screenNotConfigured() {
  clear();
  app.append(
    header(),
    el("div", { class: "stack center" }, [
      el("p", { class: "muted", text: "Noch keine Odoo-Adresse hinterlegt." }),
      el("button", {
        class: "primary block",
        text: "Einstellungen öffnen",
        onclick: () => messenger.runtime.openOptionsPage(),
      }),
    ])
  );
}

function screenDisconnected(reason) {
  clear();
  app.append(
    header(),
    el("div", { class: "stack center" }, [
      el("p", {
        class: "muted",
        text: reason || "Mit deiner Odoo-Datenbank verbinden, um loszulegen.",
      }),
      el("button", {
        class: "primary block",
        text: "Mit Odoo verbinden",
        onclick: doConnect,
      }),
    ])
  );
}

async function doConnect() {
  clear();
  app.append(header(), el("div", { class: "loading" }, el("div", { class: "spinner" })));
  const res = await bg({ type: "connect" });
  if (res.ok) {
    render();
  } else if (res.code === "module_missing") {
    screenDisconnected(
      "Das Mail-Plugin-Modul antwortet nicht. In Odoo unter Einstellungen › Allgemeine Einstellungen › Integrationen aktivieren."
    );
  } else if (res.code === "network") {
    screenDisconnected("Odoo nicht erreichbar. Adresse in den Einstellungen prüfen.");
  } else if (res.code === "auth_cancelled" || res.code === "auth_denied") {
    screenDisconnected("Verbindung abgebrochen.");
  } else {
    screenDisconnected("Verbindung fehlgeschlagen: " + (res.message || res.code));
  }
}

function contactHeader(partner) {
  const img = partner.image
    ? el("img", {
        class: "avatar",
        src: "data:image/png;base64," + partner.image,
        alt: "",
      })
    : el("div", { class: "avatar", text: (partner.name || "?").charAt(0).toUpperCase() });

  return el("div", { class: "contact" }, [
    img,
    el("div", {}, [
      el("div", { class: "name", text: partner.name || mail.email }),
      partner.title ? el("div", { class: "sub", text: partner.title }) : null,
      el("div", { class: "sub", text: partner.email || mail.email }),
      partner.phone ? el("div", { class: "sub", text: partner.phone }) : null,
    ]),
  ]);
}

function companyCard(company) {
  if (!company || company.id === -1) return null;
  const rows = [el("div", { class: "row" }, el("strong", { text: company.name || "Firma" }))];
  if (company.website)
    rows.push(el("div", { class: "small muted", text: company.website }));
  if (company.address) {
    const a = company.address;
    const line = [a.street, a.zip, a.city, a.country].filter(Boolean).join(", ");
    if (line) rows.push(el("div", { class: "small muted", text: line }));
  }
  return el("div", {}, [
    el("div", { class: "section-title", text: "Unternehmen" }),
    el("div", { class: "card stack" }, rows),
  ]);
}

function leadsSection(leads) {
  if (!leads || !leads.length) return null;
  const items = leads.map((l) =>
    el("div", { class: "lead" }, [
      el("a", {
        text: l.name || "(ohne Titel)",
        href: "#",
        onclick: (e) => {
          e.preventDefault();
          openInOdoo("/odoo/crm/" + l.lead_id);
        },
      }),
      el("span", {
        class: "small muted",
        text:
          (l.expected_revenue ? l.expected_revenue + " · " : "") +
          Math.round(l.probability || 0) + "%",
      }),
    ])
  );
  return el("div", {}, [
    el("div", { class: "section-title", text: "Offene Leads / Chancen" }),
    el("div", { class: "card" }, items),
  ]);
}

// Unerwartete Fehler sichtbar machen statt Endlos-Spinner (async-Rejections
// in Event-Handlern/boot landen sonst nur in der Konsole).
function screenError(e) {
  console.error("Odoo-Popup:", e);
  clear();
  app.append(
    header(),
    el("p", {
      class: "muted center",
      text: "Fehler: " + ((e && e.message) || String(e)),
    })
  );
}

// The main "connected" screen.
async function render() {
  try {
    await renderInner();
  } catch (e) {
    screenError(e);
  }
}

async function renderInner() {
  clear();
  app.append(header(), el("div", { class: "loading" }, el("div", { class: "spinner" })));

  mail = await loadMail();
  if (!mail || !mail.email) {
    clear();
    app.append(header(), el("p", { class: "muted center", text: "Keine E-Mail geöffnet." }));
    return;
  }

  let data;
  try {
    data = await api("/mail_plugin/partner/get", { email: mail.email, name: mail.name });
  } catch (e) {
    if (e.code === "needs_auth") return screenDisconnected("Sitzung abgelaufen. Bitte neu verbinden.");
    clear();
    app.append(header(), el("p", { class: "muted center", text: "Fehler: " + e.message }));
    return;
  }

  contact = data;
  const partner = data.partner || {};
  const known = partner.id && partner.id !== -1;

  clear();
  const wrap = el("div", { class: "stack" }, [header(), contactHeader(partner)]);

  // Extension hook: renders an async "already logged" status with links
  // (Odoo is the source of truth, keyed by message ID)
  if (globalThis.OdooAblage) {
    const statusSlot = el("div");
    wrap.append(statusSlot);
    OdooAblage.showStatus(statusSlot);
  }

  // enrichment note (e.g. insufficient IAP credits, notification address, ...)
  const info = partner.enrichment_info;
  if (info && info.type && info.type !== "company_created")
    wrap.append(el("p", { class: "small muted", text: enrichmentText(info) }));

  const company = companyCard(partner.company);
  if (company) wrap.append(company);

  // Leads liefert crm_mail_plugin als Top-Level-Key (nur wenn CRM installiert
  // + Erstellrecht) — nicht unter partner
  const leads = leadsSection(data.leads);
  if (leads) wrap.append(leads);

  wrap.append(el("hr"));
  wrap.append(actions(known, partner));

  clear();
  app.append(wrap);
}

function enrichmentText(info) {
  switch (info.type) {
    case "insufficient_credit":
      return "Firmen-Anreicherung nicht möglich: keine IAP-Guthaben.";
    case "no_data":
    case "missing_data":
      return "Keine Anreicherungsdaten für diese Domain gefunden.";
    case "odoo_custom_error":
      return info.info || "";
    default:
      return "";
  }
}

// The action grid adapts to whether the contact already exists.
function actions(known, partner) {
  const grid = el("div", { class: "actions" });

  if (globalThis.OdooAblage)
    grid.append(btn("In Odoo ablegen", true, () => OdooAblage.flow()));

  if (!known && contact.can_create_partner) {
    grid.append(
      btn("Kontakt anlegen", true, () => createContact(partner)),
      btn("Firma anreichern", false, () => createContact(partner, true))
    );
  }

  if (known) {
    // Gating wie im Outlook-Add-in: die Keys leads/tasks/tickets liefert der
    // Server nur, wenn die App installiert ist UND der Nutzer Erstellrechte
    // hat (crm_/project_/helpdesk_mail_plugin._get_contact_data).
    if (contact.leads !== undefined)
      grid.append(btn("Lead erstellen", false, () => createLead(partner.id)));
    if (contact.tasks !== undefined)
      grid.append(btn("Projektaufgabe", false, () => taskFlow(partner.id)));
    if (contact.tickets !== undefined)
      grid.append(btn("Ticket erstellen", false, () => createTicket(partner.id)));
    grid.append(btn("E-Mail loggen", false, () => logMail("res.partner", partner.id)));
  }

  grid.append(
    btn("Kontakt suchen", false, searchFlow),
    btn("In Odoo öffnen", false, () =>
      openInOdoo(known ? "/odoo/contacts/" + partner.id : "/odoo/contacts")
    )
  );
  return grid;
}

function btn(label, primary, onclick) {
  return el("button", { class: primary ? "primary" : "", text: label, onclick });
}

// ---------------------------------------------------------------------------
// actions
// ---------------------------------------------------------------------------

async function guard(fn, okMsg) {
  try {
    const r = await fn();
    if (r && r.error) {
      toast(typeof r.error === "string" ? r.error : "Fehler", "err");
      return null;
    }
    if (okMsg) toast(okMsg, "ok");
    return r;
  } catch (e) {
    if (e.code === "needs_auth") screenDisconnected("Sitzung abgelaufen. Bitte neu verbinden.");
    else toast("Fehler: " + e.message, "err");
    return null;
  }
}

async function createContact(partner, enrich) {
  const created = await guard(
    () =>
      api("/mail_plugin/partner/create", {
        email: mail.email,
        name: partner.name || mail.name || mail.email,
        company: (partner.company && partner.company.id) || -1,
      }),
    "Kontakt angelegt"
  );
  if (created && created.id) {
    if (enrich) {
      await guard(
        () => api("/mail_plugin/partner/enrich_and_create_company", { partner_id: created.id }),
        "Firma angereichert"
      );
    }
    render();
  }
}

async function createLead(partnerId) {
  const r = await guard(
    () =>
      api("/mail_plugin/lead/create", {
        partner_id: partnerId,
        email_subject: mail.subject,
        email_body: mail.bodyHtml,
      }),
    "Lead erstellt"
  );
  if (r && r.lead_id) offerOpen("Lead öffnen", "/odoo/crm/" + r.lead_id);
}

async function createTicket(partnerId) {
  const r = await guard(
    () =>
      api("/mail_plugin/ticket/create", {
        partner_id: partnerId,
        email_subject: mail.subject,
        email_body: mail.bodyHtml,
      }),
    "Ticket erstellt"
  );
  if (r && r.ticket_id) offerOpen("Ticket öffnen", "/odoo/helpdesk/" + r.ticket_id);
}

async function logMail(model, resId) {
  await guard(
    () =>
      api("/mail_plugin/log_mail_content", {
        model,
        res_id: resId,
        message: mail.bodyHtml || "<p>(kein Text)</p>",
      }),
    "E-Mail protokolliert"
  );
}

// Project task needs a project first -> small inline search/pick step.
async function taskFlow(partnerId) {
  clear();
  const input = el("input", { type: "text", placeholder: "Projekt suchen…" });
  const list = el("div", { class: "stack" });
  const box = el("div", { class: "stack" }, [
    header(),
    el("div", { class: "section-title", text: "Projekt wählen" }),
    input,
    list,
    el("button", { text: "Zurück", onclick: render }),
  ]);
  app.replaceChildren(box);
  input.focus();

  let timer;
  const doSearch = async () => {
    const term = input.value.trim();
    if (!term) return list.replaceChildren();
    const projects = await guard(() =>
      api("/mail_plugin/project/search", { search_term: term, limit: 8 })
    );
    list.replaceChildren();
    if (!projects || !projects.length) {
      list.append(el("p", { class: "small muted", text: "Keine Projekte gefunden." }));
      return;
    }
    for (const p of projects) {
      list.append(
        el("button", {
          class: "block",
          text: p.name + (p.partner_name ? " · " + p.partner_name : ""),
          onclick: () => createTask(partnerId, p.project_id),
        })
      );
    }
  };
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(doSearch, 250);
  });
}

async function createTask(partnerId, projectId) {
  const r = await guard(
    () =>
      api("/mail_plugin/task/create", {
        partner_id: partnerId,
        project_id: projectId,
        email_subject: mail.subject,
        email_body: mail.bodyHtml,
      }),
    "Aufgabe erstellt"
  );
  render();
  if (r && r.task_id) offerOpen("Aufgabe öffnen", "/odoo/project/task/" + r.task_id);
}

// Manual contact search (when the sender didn't resolve to the right record).
async function searchFlow() {
  clear();
  const input = el("input", { type: "text", placeholder: "Name, E-Mail oder Referenz…" });
  const list = el("div", { class: "stack" });
  const box = el("div", { class: "stack" }, [
    header(),
    el("div", { class: "section-title", text: "Kontakt suchen" }),
    input,
    list,
    el("button", { text: "Zurück", onclick: render }),
  ]);
  app.replaceChildren(box);
  input.focus();

  let timer;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const term = input.value.trim();
      if (!term) return list.replaceChildren();
      const res = await guard(() =>
        api("/mail_plugin/partner/search", { search_term: term, limit: 12 })
      );
      list.replaceChildren();
      const partners = (res && res.partners) || [];
      if (!partners.length)
        return list.append(el("p", { class: "small muted", text: "Nichts gefunden." }));
      for (const p of partners) {
        list.append(
          el("button", {
            class: "block",
            text: p.name + (p.email ? " · " + p.email : ""),
            onclick: () => openInOdoo("/odoo/contacts/" + p.id),
          })
        );
      }
    }, 250);
  });
}

function offerOpen(label, pathname) {
  const t = document.getElementById("toast");
  t.className = "toast ok";
  t.textContent = "";
  t.append(
    document.createTextNode("Erledigt. "),
    el("a", {
      href: "#",
      text: label,
      style: "color:#fff;text-decoration:underline",
      onclick: (e) => {
        e.preventDefault();
        openInOdoo(pathname);
      },
    })
  );
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 4000);
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------

(async function boot() {
  try {
    const state = await bg({ type: "getState" });
    if (!state.configured) return screenNotConfigured();
    if (!state.connected) return screenDisconnected();
    render();
  } catch (e) {
    screenError(e);
  }
})();
