# Odoo für Thunderbird – Handbuch

Dieses Add-on zeigt zu einer geöffneten E-Mail das passende Odoo-Kontaktprofil
direkt in Thunderbird – wie das offizielle Odoo-Outlook-Add-in, nur eben für
Thunderbird. Damit kannst du direkt aus der Mail heraus einen Kontakt
anlegen, eine Firma anreichern, einen **Lead**, eine **Projektaufgabe** oder
ein **Ticket** erstellen und die Mail auf einem Datensatz protokollieren.

Es wird **kein zusätzliches Odoo-Modul** benötigt – das Add-on spricht die
Standard-Routen des Odoo-Moduls `mail_plugin` (plus `crm_mail_plugin`,
`project_mail_plugin`, `helpdesk_mail_plugin`) an, dieselben, die auch das
offizielle Outlook-Add-in nutzt.

## Voraussetzungen

- Thunderbird **128 ESR** oder neuer.
- Odoo mit aktiviertem **Mail-Plugin**
  (Einstellungen › Allgemeine Einstellungen › Integrationen ›
  *Mail-Plugin* ☑). Entwickelt und getestet gegen Odoo 19.
- Für die Aktionen CRM/Projekt/Helpdesk müssen die jeweiligen Apps installiert
  sein – fehlt eine App, wird die zugehörige Aktion serverseitig einfach
  nicht angeboten.
- Firmen-Anreicherung braucht IAP-Guthaben (wie beim Outlook-Plugin auch).

## Installation

Thunderbird verlangt – anders als Firefox – keine signierten Add-ons für
eine dauerhafte Installation. Eine `.xpi`-Datei lässt sich direkt und ohne
Entwicklermodus installieren.

1. Die `.xpi` aus den [Releases](../../releases) dieses Repos laden, oder
   selbst bauen: `./build.sh` (erzeugt `odoo-thunderbird-<version>.xpi`).
2. In Thunderbird: **Extras › Add-ons und Themes** (bzw. `about:addons`) →
   Zahnrad-Symbol → **Add-on aus Datei installieren…** → die `.xpi`
   auswählen.
3. Eine E-Mail öffnen → in der Kopfleiste der Nachricht erscheint der
   **Odoo**-Button.

Das Add-on bleibt danach dauerhaft installiert, auch nach einem Neustart –
es ist kein Entwicklermodus und keine weitere Bestätigung nötig.

## Ersteinrichtung

1. Odoo-Button → **Einstellungen öffnen** (Zahnrad).
2. **Odoo-Adresse** eintragen (z. B. `https://meinefirma.odoo.com`) →
   **Speichern** und die Host-Berechtigung bestätigen.
3. Eine E-Mail öffnen → **Mit Odoo verbinden**. Es öffnet sich das
   Odoo-Login/Consent-Fenster → dort den Zugriff erlauben.

Ab jetzt zeigt der Button zu jeder geöffneten Mail automatisch das passende
Odoo-Profil.

## Im Alltag

- **Kontaktprofil ansehen**: E-Mail öffnen, Odoo-Button klicken – zeigt den
  bereits bekannten Kontakt inkl. Firma, oder bietet an, ihn anzulegen.
- **Kontakt anlegen / Firma anreichern**: wenn der Absender noch unbekannt
  ist, direkt aus dem Popup heraus.
- **Lead / Aufgabe / Ticket erstellen**: erscheinen nur, wenn die jeweilige
  Odoo-App (CRM/Projekt/Helpdesk) installiert ist und du das Recht dazu hast.
- **E-Mail protokollieren**: hängt die Mail als Nachricht an einen
  bestehenden Datensatz (z. B. eine laufende Opportunity).
- Läuft der Verbindungs-Token ab, zeigt das Popup einfach wieder
  **Mit Odoo verbinden** – kein Datenverlust, nur einmal neu bestätigen.

## Bekannte Grenzen

- Anhänge werden beim „E-Mail protokollieren" aktuell noch nicht mit
  übertragen.
- „In Odoo öffnen" nutzt die Odoo-19-Web-URLs
  (`/odoo/contacts/<id>`, `/odoo/crm/<id>`, …); bei abweichendem Routing
  ggf. anpassen.
- Die Oberfläche ist aktuell auf Deutsch – Übersetzungen sind willkommen.

## Feedback & Probleme

Fehler, Wünsche oder Beiträge bitte als Issue bzw. Pull Request in diesem
Repository.
