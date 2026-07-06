# Odoo for Thunderbird

A Thunderbird MailExtension (Manifest V3) that brings the **official
Odoo-for-Outlook add-in experience to Thunderbird**: next to any open e-mail
it shows the Odoo contact profile and lets you — just like the Outlook
add-in — create a contact, enrich the company, create a **lead**, a
**project task** or a **helpdesk ticket**, and **log the e-mail** on a
record.

**No custom Odoo module required.** The add-on talks directly to the routes
of the stock `mail_plugin` module (plus `crm_mail_plugin`,
`project_mail_plugin`, `helpdesk_mail_plugin`) — the same endpoints the
official Outlook plugin uses.

## Requirements

- Thunderbird **128 ESR** or newer (MV3 `message_display_action`)
- Odoo with the **Mail Plugin** integration enabled
  (Settings › General Settings › Integrations › *Mail Plugin* ☑) —
  developed and tested against Odoo 19
- For the CRM / project / helpdesk actions the respective apps must be
  installed; a missing app simply means the server does not serve that action
- Company enrichment needs IAP credits (same as in Outlook)

## Installation

Thunderbird does not require add-on signing to install an extension
permanently (unlike Firefox) — `xpinstall.signatures.required` defaults to
`false` on Thunderbird release builds, so a plain `.xpi` installs without any
warning or developer-mode toggle.

1. Download the `.xpi` from this repo's [Releases](../../releases), or build
   it yourself: `./build.sh` (produces `odoo-thunderbird-<version>.xpi`)
2. Thunderbird › **Tools › Add-ons and Themes** (or `about:addons`) › gear
   icon › **Install Add-on From File…** → select the `.xpi`
3. Open an e-mail → the **Odoo** button appears in the message header bar

That's it — the add-on stays installed across restarts, no developer mode
needed.

## First-time setup

1. Odoo button → **open settings** (gear icon)
2. Enter your **Odoo address** (e.g. `https://mycompany.odoo.com`) →
   save & grant the host permission
3. Open an e-mail → **Connect to Odoo** → confirm the consent screen in the
   browser window

## How authentication works

Identical to the Outlook plugin — an OAuth-style handshake against
`mail_plugin`:

1. `launchWebAuthFlow` opens `…/mail_plugin/auth?scope=outlook&redirect=…`;
   you log into Odoo and approve the access.
2. Odoo redirects back with a short-lived `auth_code`.
3. `…/mail_plugin/auth/access_token` exchanges it for an **API-key token**
   (scope `odoo.plugin.outlook`).
4. All data calls carry `Authorization: Bearer <token>`.

The scope **must** be `outlook` — the server checks for exactly
`odoo.plugin.outlook` in `_auth_method_outlook`. When the token expires, the
popup simply shows **Connect to Odoo** again.

## Endpoints used

| Action              | Route                                                  |
| ------------------- | ------------------------------------------------------ |
| Module probe        | `POST /mail_plugin/auth/check_version`                 |
| Get token           | `POST /mail_plugin/auth/access_token`                  |
| Contact for e-mail  | `POST /mail_plugin/partner/get`                        |
| Search contact      | `POST /mail_plugin/partner/search`                     |
| Create contact      | `POST /mail_plugin/partner/create`                     |
| Enrich company      | `POST /mail_plugin/partner/enrich_and_create_company`  |
| Create lead         | `POST /mail_plugin/lead/create`                        |
| Search project      | `POST /mail_plugin/project/search`                     |
| Create task         | `POST /mail_plugin/task/create`                        |
| Create ticket       | `POST /mail_plugin/ticket/create`                      |
| Log e-mail          | `POST /mail_plugin/log_mail_content`                   |

## Architecture

```
odoo-thunderbird/
├── manifest.json      MV3 MailExtension, message_display_action
├── background.js      auth handshake + JSON-RPC client (owns the token)
├── popup/             UI in the message header bar
├── options/           Odoo URL + host permission
├── icons/
└── build.sh           zips the above into an installable .xpi
```

The **popup** reads the e-mail via the Thunderbird `messages` API and sends
every Odoo request through `runtime.sendMessage` to the **background
script**, which is the only place that knows the token and performs network
calls. That keeps token handling and CORS in one spot.

## Privacy

This add-on only ever talks to the Odoo instance you configure in the
options page. There is no other server involved, no telemetry, no
third-party analytics. The access token is stored locally via
`storage.local` and never leaves the browser except as the `Authorization`
header sent to your own Odoo instance.

## Known limitations

- The contact lookup is **sender-based**, like the official Outlook add-in:
  it always resolves the message *author*. For an e-mail you sent yourself
  that means it looks up your own address, not the recipient. Direction-aware
  lookup (show the counterpart on outgoing mail) would need the `accountsRead`
  permission and is intentionally left out to keep this build minimal.
- Attachments are not yet transferred when logging an e-mail
  (`log_mail_content` supports them — contributions welcome).
- "Open in Odoo" uses the Odoo 19 web URLs (`/odoo/contacts/<id>`,
  `/odoo/crm/<id>`, …); adapt them for older routing schemes.
- UI strings are currently German — i18n contributions welcome.

## License

[MIT](LICENSE)
