# Scraping data from `<iframe>`-based Huawei routers

Some Huawei firmwares (e.g. K562e-10, HG8145X6, HN8245X6) render the dashboard
inside an `<iframe>` instead of in the top-level document:

```html
<iframe id="functioncontent"
        src="/html/bbsp/maintop/MainTopAP.asp"
        ...></iframe>
```

The current extraction pipeline in this toolkit is **DOM-based**:
`HuaweiBaseDriver` (and every other driver) talks to the page through
`IDomGateway`, which calls `document.querySelector(...)` on the *top* document.
So if you point a selector at `#ipAddress`, it returns `null`, because that
element only exists inside the iframe's own document.

This document explains exactly **what to change in this codebase** to make it
work for iframe-based Huawei firmwares.

---

## 1. Why current selectors fail

`DomService` (the only `IDomGateway` implementation) does this:

```5:9:src/infra/dom/DomService.ts
  public getHTMLElement<T extends HTMLElement>(selector: string, type: new () => T): T | null {
    const el = document.querySelector(selector);
    if (el instanceof type) return el;
    return null;
  }
```

That `document` is always the **outer** page (`MainTopAP.asp`'s parent). The
iframe has its own `Document`, reachable only via `iframe.contentDocument` (or,
better, via `fetch()` to the iframe's URL).

Same problem for `HuaweiBaseDriver.isAuthenticated()`:

```95:99:src/infra/drivers/huawei/shared/HuaweiBaseDriver.ts
  public isAuthenticated(): boolean {
    const $homeTab = this.domService.getHTMLElement(this.s.homeTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!$homeTab;
  }
```

If `homeTab` lives inside the iframe, the check returns `false` even when the
user *is* authenticated.

---

## 2. Three valid strategies

You have three ways to read iframe data from a Manifest V3 content script.
Pick one (or combine them) per driver.

### Strategy A — Read the iframe's DOM (`contentDocument`)

Works because the iframe `src` is on the **same origin** as the parent
(`/html/bbsp/maintop/MainTopAP.asp` → relative URL). No CORS, no cookies issues.

```ts
const iframe = document.getElementById('functioncontent') as HTMLIFrameElement | null;
const iframeDoc = iframe?.contentDocument ?? iframe?.contentWindow?.document ?? null;
const ipText = iframeDoc?.querySelector('#ipAddress')?.textContent?.trim();
```

Caveats:

- The iframe loads **after** the parent. If you query too early you get
  `null`. Wait for `iframe.addEventListener('load', ...)` or poll until the
  target node exists.
- Values like `#ipAddress` are populated by JavaScript (`setIPinfo()`),
  not by the server. So even after `load`, you may need a small additional
  delay or a `MutationObserver`.

### Strategy B — `fetch()` the iframe URL (recommended)

This is the most robust approach for a Chrome extension content script.
You skip the iframe entirely and parse a fresh copy of the HTML.

```ts
const html = await fetch('/html/bbsp/maintop/MainTopAP.asp', {
  method: 'GET',
  credentials: 'include', // MANDATORY: forwards the router's session cookie
}).then((r) => r.text());

const doc = new DOMParser().parseFromString(html, 'text/html');
```

Pros: deterministic (no race with the JS that mutates the iframe DOM), no
need to worry about iframe load timing, can be retried independently.

Cons: many of the values you want (`#ipAddress`, `#onlineTime`, …) are *only*
filled in by the iframe's JavaScript and **are not in the static HTML**. For
those, see Strategy C.

### Strategy C — Read the embedded JS state, or hit the AJAX endpoint directly

The iframe's `<script>` block contains the raw data the JS will later render:

```js
// Inside MainTopAP.asp
var WanPpp = new Array(
  new WANPPP("…", "Connected", "100.72.42.254", "TR069_INTERNET", "IP_Routed", …)
);
var dev_uptime = '440323';
var productName = 'K562e-10';
var APType = '0';
```

So instead of scraping the rendered DOM, scrape the **script source** with a
regex (or extract `<script>` text and `eval` it inside a sandboxed VM — but
regex is safer in a content script).

For data that's truly loaded via AJAX (e.g. the connected-device count), call
the same endpoint the firmware calls:

```js
// from MainTopAP.asp
$.ajax({ type: "POST", url: "/html/bbsp/common/GetLanUserDevInfo.asp", ... });
```

In our extension:

```ts
const raw = await fetch('/html/bbsp/common/GetLanUserDevInfo.asp', {
  method: 'POST',
  credentials: 'include',
}).then((r) => r.text());
```

The response is a JS-flavored payload (`GetUserDevInfoList();`). Strip the
wrapper with the same `dealDataWithStr()` logic the firmware uses (or a small
custom parser) and you have a structured list of devices.

---

## 3. How to wire this into `HuaweiBaseDriver`

The cleanest path is to keep `IDomGateway` for top-level operations and
introduce a small helper for iframe/HTTP access. The base driver already
exposes overridable extractors (`extractWanData`, `extractTopologyData`, …),
so we only have to change the *implementation* of those methods in a new
driver subclass — not the interface.

### 3.1. Add an iframe/HTTP helper

Create `src/infra/drivers/huawei/shared/HuaweiIframeFetcher.ts`:

```ts
export interface IHuaweiIframeFetcher {
  /** GET an internal `.asp` page and return parsed Document. */
  fetchDocument(path: string): Promise<Document>;

  /** POST to an internal endpoint and return the raw response text. */
  postRaw(path: string, body?: string): Promise<string>;

  /** Extract a JS variable's value from the embedded `<script>` of a page. */
  extractScriptVar(doc: Document, varName: string): string | null;
}

export class HuaweiIframeFetcher implements IHuaweiIframeFetcher {
  public async fetchDocument(path: string): Promise<Document> {
    const html = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    }).then((r) => r.text());
    return new DOMParser().parseFromString(html, 'text/html');
  }

  public async postRaw(path: string, body = ''): Promise<string> {
    return fetch(path, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }).then((r) => r.text());
  }

  public extractScriptVar(doc: Document, varName: string): string | null {
    for (const script of Array.from(doc.querySelectorAll('script'))) {
      const text = script.textContent ?? '';
      const re = new RegExp(`var\\s+${varName}\\s*=\\s*['"]([^'"]*)['"]`);
      const m = text.match(re);
      if (m) return m[1];
    }
    return null;
  }
}
```

Why a separate helper instead of extending `IDomGateway`?

- `IDomGateway` is intentionally synchronous and DOM-shaped
  (`querySelector`-style). Network I/O does not belong there.
- The fetcher is Huawei-specific (cookie-based session, proprietary
  `.asp` endpoints, JS-encoded responses). Other drivers (ZTE) have a
  different mechanism.
- It keeps `BaseRouter` and `HuaweiBaseDriver` constructors backward
  compatible.

### 3.2. Inject the fetcher into the driver

Update `HuaweiBaseDriver` to optionally accept the fetcher:

```ts
// src/infra/drivers/huawei/shared/HuaweiBaseDriver.ts
export abstract class HuaweiBaseDriver extends BaseRouter {
  protected readonly s: RouterSelectors;
  protected readonly topologyParser: ITopologySectionParser;
  protected readonly iframeFetcher: IHuaweiIframeFetcher;

  protected constructor(
    model: string,
    selectors: RouterSelectors,
    topologyParser: ITopologySectionParser,
    domService: IDomGateway,
    iframeFetcher: IHuaweiIframeFetcher = new HuaweiIframeFetcher(),
  ) {
    super(model, domService, selectors);
    this.s = selectors;
    this.topologyParser = topologyParser;
    this.iframeFetcher = iframeFetcher;
  }
  // ...
}
```

Existing drivers (`HuaweiEG8145V5Driver`) do not need to pass the fetcher;
the default works for production and tests can pass a stub.

### 3.3. Override extraction methods in the iframe-based driver

Create the new driver, e.g. `src/infra/drivers/huawei/HuaweiK562eDriver/`:

```ts
// HuaweiK562eDriver.ts
export class HuaweiK562eDriver extends HuaweiBaseDriver {
  constructor(topologyParser: ITopologySectionParser, domService: IDomGateway) {
    super('HUAWEI K562e-10', HuaweiK562eSelectors, topologyParser, domService);
  }

  public override isAuthenticated(): boolean {
    const iframe = document.getElementById('functioncontent') as HTMLIFrameElement | null;
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!iframe;
  }

  protected override async extractWanData() {
    const doc = await this.iframeFetcher.fetchDocument('/html/bbsp/maintop/MainTopAP.asp');

    // Pull the WAN entry from the inline JS (most reliable).
    const scriptText = Array.from(doc.querySelectorAll('script'))
      .map((s) => s.textContent ?? '')
      .join('\n');

    const ipMatch = scriptText.match(/WANPPP\([^)]*?,\s*"([\d.]+)"/);
    const userMatch = scriptText.match(/WANPPP\([^)]*?,\s*"[\d.]+",\s*"([^"]+)"/);

    return {
      internetEnabled: /ConnectionStatus\s*=\s*"Connected"/.test(scriptText) || undefined,
      tr069Enabled: /TR069_INTERNET/.test(scriptText) || undefined,
      pppoeUsername: userMatch?.[1],
      ipVersion: undefined,
      requestPdEnabled: undefined,
      slaacEnabled: undefined,
      dhcpv6Enabled: undefined,
      pdEnabled: undefined,
    };
  }

  protected override async extractTopologyData() {
    const raw = await this.iframeFetcher.postRaw('/html/bbsp/common/GetLanUserDevInfo.asp');
    const clients = parseHuaweiUserDevList(raw); // small custom parser
    // Split by band/connection type as needed; here just example for "cable":
    return {
      topology: {
        '24ghz': { clients: [], totalClients: 0 },
        '5ghz':  { clients: [], totalClients: 0 },
        cable:   { clients, totalClients: clients.length },
      },
    };
  }
}
```

### 3.4. Register it in the factory

```26:32:src/infra/router/RouterFactory.ts
  private static readonly MODELS: RouterModelDefinition[] = [
    { indicators: ['h199'], Driver: ZteH199Driver },
    { indicators: ['h3601'], Driver: ZteH3601Driver },
    { indicators: ['h198'], Driver: ZteH198Driver },
    { indicators: ['e2320'], Driver: ZteE2320Driver },
    { indicators: ['eg8145v5'], Driver: HuaweiEG8145V5Driver },
  ];
```

Add an entry whose `indicators` match a string visible in the *outer* document
(the iframe parent). For the K562e-10 a good candidate is the page title or
`productName`:

```ts
{ indicators: ['k562e', 'k562e-10'], Driver: HuaweiK562eDriver },
```

Note: `RouterFactory.create()` reads `document.title` and `document.body.textContent`
of the parent frame. Those usually still mention the product name, so detection
works without any iframe inspection.

---

## 4. Inventory of useful endpoints

Confirmed from `MainTopAP.asp` (the file shared in the source conversation):

| Data                            | Where                                           | How                                                  |
| ------------------------------- | ----------------------------------------------- | ---------------------------------------------------- |
| WAN IPv4, status, ConnectionType, PPPoE user | inline JS `var WanPpp = new Array(new WANPPP(...))` in `/html/bbsp/maintop/MainTopAP.asp` | regex over the script text                           |
| WAN IPv6                        | `/html/bbsp/common/wanipv6state.asp`            | `iframeFetcher.fetchDocument(...)` then read JS vars |
| Connected devices               | `/html/bbsp/common/GetLanUserDevInfo.asp` (POST) | `iframeFetcher.postRaw(...)`, parse `GetUserDevInfoList();` payload |
| Uptime (seconds)                | `var dev_uptime = '...'` in `MainTopAP.asp`     | `extractScriptVar(doc, 'dev_uptime')`                |
| Product name / model            | `var productName = '...'` in `MainTopAP.asp`    | `extractScriptVar(doc, 'productName')`               |
| Firmware/operator profile       | `var CfgModeWord = '...'`                       | `extractScriptVar(doc, 'CfgModeWord')`               |
| AP type (gateway vs repeater)   | `var APType = '...'`                            | `extractScriptVar(doc, 'APType')`                    |
| Repeater Wi-Fi metrics (SSID, RSSI, channel, MCS, rates) | `var rePeaterInfo = new stRepeaterInfo(...)` | regex                            |
| CSRF / session token            | `<input id="hwonttoken" value="...">` in the iframe | parse iframe body                                    |

Likely-present endpoints (verify per firmware via DevTools → Network with the
filter `.asp` or `cgi`):

```
/html/bbsp/waninfo/waninfo.asp        # full WAN connection table
/html/bbsp/wlan/wlaninfo.asp          # Wi-Fi status
/html/bbsp/wlan/getWlanInfo.asp       # Wi-Fi config
/html/bbsp/systeminfo/systeminfo.asp  # device + firmware info
/login.cgi or /web_login.cgi          # login (already handled)
/set.cgi?x=...                        # configuration write (POST)
```

> The CSRF token (`#hwonttoken` / `onttoken`) is required for any `set.cgi`
> POST. Read it from the iframe before sending writes.

---

## 5. Critical pitfalls

1. **Always pass `credentials: 'include'`.** Without it `fetch()` drops the
   session cookie and the router replies with the login page or `401`.
2. **CSP / `script-src 'self'`.** Our `manifest.json` already restricts
   extension pages, but content scripts run in the page's world and can
   freely call `fetch` against the router's origin. Do **not** try to
   `eval()` the iframe scripts; use regex extraction.
3. **Same-origin only.** `iframe.contentDocument` only works because both
   pages are served by the router. Don't try the same trick across routers.
4. **JS-rendered fields are empty in the static HTML.** `#ipAddress`,
   `#onlineTime`, `#connectionDevice`, etc. are filled by `loadframe()`.
   If you need them you must either:
   - read the underlying JS variable (Strategy C), or
   - access the *live* iframe DOM after `load` (Strategy A), not a
     re-fetched HTML string.
5. **The iframe height is rewritten by the firmware**
   (`window.parent.document.getElementById("functioncontent").style.height`),
   so don't rely on a fixed wait time — wait for the element you actually need.
6. **`isLoginPage` and `isAuthenticated`** in `HuaweiBaseDriver` use top-level
   selectors. Override them per iframe-based driver (see §3.3).

---

## 6. Recommended order of work

1. Add `HuaweiIframeFetcher` (new file, no behavioural change).
2. Make `HuaweiBaseDriver` accept the fetcher with a default value
   (backward compatible).
3. Create the new driver subclass for the iframe-based model and override
   only the methods whose data lives inside the iframe.
4. Register the driver in `RouterFactory.MODELS` with appropriate indicators.
5. For each datum, pick the cheapest valid strategy:
   - In static HTML → parse with `DOMParser`.
   - In inline JS → `extractScriptVar` / regex.
   - In an AJAX endpoint → `iframeFetcher.postRaw` + custom parser.
6. Add unit tests by injecting a fake `IHuaweiIframeFetcher` into the driver.

---

## 7. TL;DR

- The current driver layer reads from `document.querySelector(...)`. Iframe
  content is invisible to it.
- For Huawei iframe firmwares, do not try to "scrape the iframe wrapper".
  Instead, **fetch the inner `.asp` URL with `credentials: 'include'`** and
  parse the response — or read the inline JS variables / call the AJAX
  endpoints the firmware itself uses.
- Encapsulate that as a `HuaweiIframeFetcher` and override the relevant
  `extract*` methods on a new `HuaweiBaseDriver` subclass; everything else
  in the pipeline (factory, popup, schema validation) stays unchanged.
