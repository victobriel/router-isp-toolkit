import { IDomGateway } from '@/application/ports/IDomGateway';
import {
  ExtractionFilter,
  GoToPageOptions,
  RouterPage,
  RouterPageKey,
  RouterSelectors,
} from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import {
  Credentials,
  ExtractionResult,
  PingTestResult,
  PingTestResultSchema,
} from '@/domain/schemas/validation';
import { BaseRouter } from '@/infra/router/BaseRouter';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';
import {
  HUAWEI_DIAGNOSE_PAGE_ENDPOINT,
  HUAWEI_PING_POLL_ENDPOINT,
  HUAWEI_PING_START_ENDPOINT,
  HUAWEI_WAN_LIST_ENDPOINT,
  HUAWEI_WAN_LIST_INFO_ENDPOINT,
} from './HuaweiCommonDriverConstants';

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** Mirrors `splitobj` in `diagnosecommon.asp` — separates ping body from status. */
const HUAWEI_PING_RESULT_DELIMITER = '[@#@]';
const HUAWEI_PING_DEFAULT_REPETITIONS = 4;
const HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE = 56;
const HUAWEI_PING_DEFAULT_TIMEOUT_MS = 10_000;
const HUAWEI_PING_DEFAULT_DSCP = 0;
const HUAWEI_PING_POLL_INTERVAL_MS = 1_000;
const HUAWEI_PING_POLL_GRACE_MS = 5_000;

/** BusyBox `ping` reply line: `64 bytes from 1.2.3.4: seq=0 ttl=64 time=12.345 ms`. */
const HUAWEI_PING_REPLY_LINE =
  /^(\d+)\s+bytes\s+from\s+\S+?:\s+seq=(\d+)\s+ttl=(\d+)\s+time=([\d.]+)\s*ms/i;

/** BusyBox stats: `2 packets transmitted, 2 packets received, 0% packet loss`. */
const HUAWEI_PING_STATS_LINE =
  /(\d+)\s+packets\s+transmitted,\s*(\d+)\s+(?:packets\s+)?received(?:[^,]*)?,\s*(\d+)%\s*packet\s*loss/i;

/** BusyBox RTT: `round-trip min/avg/max = 1.234/2.345/3.456 ms`. */
const HUAWEI_PING_RTT_LINE = /min\/avg\/max\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i;

/** `PING 1.2.3.4 (1.2.3.4): 56 data bytes`. */
const HUAWEI_PING_HEADER_LINE = /^PING\s+\S+\s+\(\S+\):\s+(\d+)\s+data\s+bytes/i;

function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

/** `value="…"` on a single HTML tag fragment (Huawei pages use double or single quotes). */
const INPUT_VALUE_ATTR = /value=["']([^"']*)["']/i;

/**
 * Single- or double-quoted JS string literal, supporting `\x..` and other backslash
 * escapes. Group 1 captures the content of `"…"`; group 2 captures the content of `'…'`.
 */
const JS_STRING_LITERAL = /"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;

function extractIdsFromCommaSelector(selector: string): string[] {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith('#'))
    .map((part) => part.slice(1));
}

export abstract class HuaweiBaseDriver extends BaseRouter {
  protected readonly s: RouterSelectors;
  protected readonly topologyParser: ITopologySectionParser;

  protected constructor(
    model: string,
    selectors: RouterSelectors,
    topologyParser: ITopologySectionParser,
    domService: IDomGateway,
  ) {
    super(model, domService, selectors);
    this.s = selectors;
    this.topologyParser = topologyParser;
  }

  public authenticate(credentials: Credentials): void {
    const { username, password } = credentials;

    this.domService.updateHTMLElementValue(this.s.username, username);
    this.domService.updateHTMLElementValue(this.s.password, password);

    setTimeout(() => this.domService.safeClick(this.s.submit), 100);
  }

  public async extract(_filter?: ExtractionFilter): Promise<ExtractionResult> {
    throw new Error('Method not implemented.');
  }

  public buttonElementConfig(): ButtonConfig | null {
    return {
      targetSelector: '',
      text: 'Run data extraction',
      style: `
        position: absolute;
        bottom: 6.5px;
        left: 27px;
        z-index: 10000;
        padding: 8px;
        color: white;
        border: none;
        cursor: pointer;
        background-color: transparent;
      `,
      extLogoStyle: `
        font-size: 9px;
        color: #FFFFFF90;
        margin-left: 4px;
      `,
    };
  }

  public isAuthenticated(): boolean {
    const $homeTab = this.domService.getHTMLElement(this.s.homeTab, HTMLElement);
    const onLoginPage = this.isLoginPage();
    return !onLoginPage && !!$homeTab;
  }

  /**
   * Drives the IPPingDiagnostics flow at `/html/bbsp/maintenance/diagnosecommon.asp`.
   *
   * The page itself uses a hidden form POST to `complex.cgi?...&RUNSTATE_FLAG=Ping`
   * to start the test and then polls `GetPingResult.asp` for a string of shape
   * `<raw ping output>[@#@]<Status>`. We do exactly the same from the extension,
   * which avoids needing an iframe / DOM scrape: cookies are shared with this
   * origin and the CSRF token is harvested either from `document` (when the user
   * is on any Huawei admin page) or from a one-shot GET of the diagnose page.
   *
   * Interface selection matters: the firmware's TR-069 IPPingDiagnostics
   * defaults to `br0` (the LAN bridge) when `x.Interface` is omitted, which
   * means external IPs and hostnames silently time out (br0 has no WAN egress).
   * For non-private targets we discover the routed INTERNET WAN from
   * `wan_list.asp` and pin the test to it; for RFC 1918 / loopback / link-local
   * targets we leave it unset so the LAN default keeps working.
   */
  public async ping(ip: string): Promise<PingTestResult | null> {
    // Build params in the same order webSubmitForm.addParameter calls them in
    // OnApply, in case the firmware's parser is sensitive to ordering.
    const params: Record<string, string> = {
      'x.Host': ip,
      'x.DiagnosticsState': 'Requested',
      'x.NumberOfRepetitions': String(HUAWEI_PING_DEFAULT_REPETITIONS),
      'x.DSCP': String(HUAWEI_PING_DEFAULT_DSCP),
      'x.DataBlockSize': String(HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE),
      'x.Timeout': String(HUAWEI_PING_DEFAULT_TIMEOUT_MS),
    };

    if (!HuaweiBaseDriver.isPrivateOrLocalIPv4(ip)) {
      const wanDomain = await this.findHuaweiInternetWanDomain();
      if (wanDomain) params['x.Interface'] = wanDomain;
    }

    params['RUNSTATE_FLAG.value'] = 'START';

    // Token must be fetched *just before* the POST: the firmware rotates
    // onttoken on every accepted CGI write, so any cached value (DOM, prior
    // response, previous ping invocation) is already stale and will be
    // silently rejected. Without this, a second ping() call leaves the
    // firmware's PingResult buffer untouched and `GetPingResult.asp` keeps
    // replaying the previous target's output.
    const token = await this.fetchHuaweiCsrfToken();
    if (!token) return null;
    params['x.X_HW_Token'] = token;

    const started = await this.submitHuaweiCgiForm(HUAWEI_PING_START_ENDPOINT, params);
    if (started == null) return null;

    // Verify the firmware actually accepted the new target. complex.cgi's
    // response is the diagnose page with the rotated state inlined as a
    // `new PingResultClass(domain, DiagnosticsState, Interface, Host, …)`
    // call. If `Host` doesn't match what we asked for, our POST was dropped
    // (typical causes: stale token, CSRF/Sec-Fetch gating, or the previous
    // test still latched). Returning null here is strictly better than
    // polling and reporting the previous target's cached result as if it
    // were ours.
    const newState = this.parseHuaweiStructCall(started, 'PingResultClass');
    if (!newState || (newState.Host ?? '') !== ip) return null;

    // complex.cgi's response also carries the rotated token — capture it for
    // the cancel path so we don't have to do another GET.
    const tokenAfterStart = this.matchInputValueById(started, 'hwonttoken') ?? token;

    const deadline =
      Date.now() +
      HUAWEI_PING_DEFAULT_REPETITIONS * HUAWEI_PING_DEFAULT_TIMEOUT_MS +
      HUAWEI_PING_POLL_GRACE_MS;

    let raw = '';
    let status = 'Requested';

    while (Date.now() < deadline) {
      await this.delay(HUAWEI_PING_POLL_INTERVAL_MS);
      const polled = await this.pollHuaweiPingResult();
      if (!polled) continue;
      raw = polled.raw;
      status = polled.status;
      if (status !== 'Requested') break;
    }

    if (status === 'Requested') {
      const stopParams: Record<string, string> = {
        'x.Host': ip,
        // Firmware misspelling — must be sent as-is to be accepted.
        'RUNSTATE_FLAG.value': 'TERMIANL',
        'x.X_HW_Token': tokenAfterStart,
      };
      await this.submitHuaweiCgiForm(HUAWEI_PING_START_ENDPOINT, stopParams);
    }

    if (!raw) return null;
    return this.parseHuaweiPingResult(raw, ip);
  }

  public reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public goToPage(_page: RouterPage, _key: RouterPageKey, _options?: GoToPageOptions): void {
    throw new Error('Method not implemented.');
  }

  protected goToHomePage(): boolean {
    this.domService.safeClick(this.s.homeTab);
    return true;
  }

  /**
   * Huawei ASP/HTML often encodes non-ASCII as `\xNN` inside attribute strings.
   */
  protected unescapeHuaweiHex(value: string): string {
    return value.replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    );
  }

  protected matchInputValueById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    const tag = new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*>`, 'i').exec(raw)?.[0];
    if (!tag) return null;
    const value = INPUT_VALUE_ATTR.exec(tag)?.[1];
    return value == null ? null : this.unescapeHuaweiHex(value);
  }

  /**
   * Reads checked / value hints for `#id` on Huawei WLAN pages (e.g. `#BandSteeringPolicy`
   * on `WlanAdvance.asp?5G`). Returns `null` when the tag is missing or markup does not
   * encode the state (typical when Huawei relies on `new stXHWGlobalConfig(...)` instead).
   */
  protected matchHuaweiCheckboxCheckedById(raw: string | null, id: string): boolean | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    const tag = new RegExp(`<input\\b(?=[^>]*\\bid=["']${escapedId}["'])[^>]*>`, 'i').exec(
      raw,
    )?.[0];
    if (!tag) return null;

    if (/checked\s*=\s*["']?(?:false|off|0|no)["']?/i.test(tag)) return false;
    if (/checked\s*=\s*["']?(?:true|on|1|checked|yes)["']?/i.test(tag)) return true;
    if (/(?<![-\\w])checked(?=[\s/>])/i.test(tag)) return true;

    const valueAttr = INPUT_VALUE_ATTR.exec(tag)?.[1]?.trim();
    if (valueAttr === '1' || /^on$/i.test(valueAttr || '')) return true;
    if (valueAttr === '0' || /^off$/i.test(valueAttr || '')) return false;

    return null;
  }

  /**
   * First `new stXHWGlobalConfig(domain, policy)` on the page (`BandSteeringPolicy`).
   * Handles multiline calls (`WlanBasic.asp`-style) and a numeric `policy` (`1` / `0`)
   * without quotes — {@link parseHuaweiStructCall} only reads string literals and misses those.
   */
  protected parseHuaweiBandSteeringPolicyFromStXHWGlobalConfig(raw: string | null): string | null {
    if (!raw) return null;
    const re =
      /new\s+stXHWGlobalConfig\s*\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*,\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|(\d+))\s*,?\s*\)/gi;
    for (const m of raw.matchAll(re)) {
      const policy = m[3] ?? m[4] ?? m[5];
      if (policy === undefined) continue;
      return m[5] !== undefined ? m[5] : this.unescapeHuaweiHex(m[3] ?? m[4] ?? '');
    }
    return null;
  }

  /**
   * Band steering from **5 GHz advanced only** (`WlanAdvance.asp?5G`): prefers
   * `#BandSteeringPolicy` markup from {@link matchHuaweiCheckboxCheckedById}, then the first
   * `new stXHWGlobalConfig(..., policy)` on that same response when the checkbox omits `checked`.
   */
  protected extractHuaweiBandSteeringEnabledFromWlanAdvance5g(
    wlanAdvance5gRaw: string | null,
  ): boolean | undefined {
    if (!wlanAdvance5gRaw) return undefined;
    const fromInput = this.matchHuaweiCheckboxCheckedById(wlanAdvance5gRaw, 'BandSteeringPolicy');
    if (fromInput !== null) return fromInput;
    const policy = this.parseHuaweiBandSteeringPolicyFromStXHWGlobalConfig(wlanAdvance5gRaw);
    if (policy === null || policy === '') return undefined;
    return policy === '1';
  }

  /**
   * Reads `value` from raw HTML for the first `#id` segment in a comma-separated selector list
   * (e.g. `#URL, input[type="text"]` tries `URL` only).
   */
  protected matchInputValueBySelector(raw: string | null, selector: string): string | null {
    if (!raw) return null;
    for (const id of extractIdsFromCommaSelector(selector)) {
      const value = this.matchInputValueById(raw, id);
      if (value != null) return value;
    }
    return null;
  }

  /**
   * Huawei feature pages (e.g. `tr069.asp`, `upnp.asp`) render form fields at runtime
   * from a `new stXxx(...)` constructor call, so the raw HTML never contains
   * `<input value="…">` for those fields. The configured values are positional
   * arguments mapped 1:1 to the parameters declared by `function stXxx(...)` in the
   * same page.
   *
   * Returns a `paramName -> value` map (with Huawei `\xNN` escapes decoded), or `null`
   * when either the signature or the call cannot be located.
   */
  protected parseHuaweiStructCall(
    raw: string | null,
    structName: string,
  ): Record<string, string> | null {
    if (!raw) return null;
    const escaped = escapeRegExp(structName);
    const sig = new RegExp(`function\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`).exec(raw);
    const call = new RegExp(`new\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`).exec(raw);
    if (!sig || !call) return null;

    const params = sig[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const values = Array.from(call[1].matchAll(JS_STRING_LITERAL), (m) => m[1] ?? m[2]);
    if (!params.length || !values.length) return null;

    const result: Record<string, string> = {};
    const len = Math.min(params.length, values.length);
    for (let i = 0; i < len; i++) {
      result[params[i]] = this.unescapeHuaweiHex(values[i]);
    }
    return result;
  }

  /**
   * Variant of {@link parseHuaweiStructCall} that returns **every** `new stXxx(...)`
   * call in the page, not just the first one. Use this for list-shaped data such as
   * the `stNewDeviceAcl(...)` rows on `newacl.asp` or `stUpnpPortMapping(...)` on
   * `upnp.asp`. Returns an empty array when the signature or no call can be located.
   */
  protected parseHuaweiStructCallAll(
    raw: string | null,
    structName: string,
  ): Record<string, string>[] {
    if (!raw) return [];
    const escaped = escapeRegExp(structName);
    const sig = new RegExp(`function\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`).exec(raw);
    if (!sig) return [];

    const params = sig[1]
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!params.length) return [];

    const callRegex = new RegExp(`new\\s+${escaped}\\s*\\(([\\s\\S]*?)\\)`, 'g');
    const records: Record<string, string>[] = [];
    for (const match of raw.matchAll(callRegex)) {
      const values = Array.from(match[1].matchAll(JS_STRING_LITERAL), (m) => m[1] ?? m[2]);
      if (!values.length) continue;
      const record: Record<string, string> = {};
      const len = Math.min(params.length, values.length);
      for (let i = 0; i < len; i++) {
        record[params[i]] = this.unescapeHuaweiHex(values[i]);
      }
      records.push(record);
    }
    return records;
  }

  /** Parse the `new stCWMP(...)` constructor in `tr069.asp`. */
  protected parseHuaweiCwmp(raw: string | null): Record<string, string> | null {
    return this.parseHuaweiStructCall(raw, 'stCWMP');
  }

  /**
   * Read a top-level inline `<script>` variable declaration of the form
   * `var <name> = "value";` (or single-quoted) from a Huawei page.
   *
   * Used for shell/index pages (e.g. `/index.asp`) that surface device metadata as
   * plain JS variables (`ProductName`, `UserName`, `IsModifiedPwd`, `CfgMode`, …)
   * instead of via a `stXxx(...)` constructor.
   *
   * Picks the **last** matching declaration so duplicated variables (`var X = 'A';
   * … var X = 'B';`) resolve to the value the firmware actually uses at runtime.
   */
  protected matchHuaweiScriptVar(raw: string | null, name: string): string | null {
    if (!raw) return null;
    const escaped = escapeRegExp(name);
    const re = new RegExp(
      `var\\s+${escaped}\\s*=\\s*(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')\\s*;?`,
      'g',
    );
    let last: RegExpExecArray | null = null;
    for (const match of raw.matchAll(re)) last = match as RegExpExecArray;
    if (!last) return null;
    return this.unescapeHuaweiHex(last[1] ?? last[2]);
  }

  /**
   * Fetch a fresh Huawei CSRF token (`onttoken`) from `diagnosecommon.asp`.
   *
   * Why no DOM shortcut: the firmware rotates `onttoken` on every accepted
   * `complex.cgi` write, so the value embedded in the live page (or in the
   * response of the previous CGI POST) goes stale immediately after use.
   * Reading the DOM-cached token across calls causes the next CGI POST to be
   * silently dropped — the firmware returns 200 with a redirect-to-diagnose
   * page but never updates state. Always read the token from a fresh GET of
   * the diagnose page, immediately before the POST that needs it.
   */
  protected async fetchHuaweiCsrfToken(): Promise<string | null> {
    const raw = await this.huaweiGet(HUAWEI_DIAGNOSE_PAGE_ENDPOINT);
    return this.matchInputValueById(raw, 'hwonttoken');
  }

  /**
   * Discover the routed INTERNET WAN's TR-069 `domain` so `ping()` can pin
   * external probes to the WAN side. Mirrors the WAN selection logic of
   * `getWanState` in the EG8145V5 driver: prefer routed + INTERNET + enabled,
   * then routed + INTERNET, then any INTERNET, else `null` (e.g. bridged
   * mode, or `wan_list*.asp` not exposed by this firmware).
   */
  protected async findHuaweiInternetWanDomain(): Promise<string | null> {
    const [info, list] = await Promise.all([
      this.huaweiGet(HUAWEI_WAN_LIST_INFO_ENDPOINT),
      this.huaweiGet(HUAWEI_WAN_LIST_ENDPOINT),
    ]);
    if (!info && !list) return null;
    const buffer = `${info ?? ''}\n${list ?? ''}`;

    const entries = [
      ...this.parseHuaweiStructCallAll(buffer, 'WanPPP'),
      ...this.parseHuaweiStructCallAll(buffer, 'WanIP'),
    ];
    if (entries.length === 0) return null;

    const isInternet = (e: Record<string, string>) =>
      (e.ServiceList ?? '').toUpperCase().includes('INTERNET');
    const isRouted = (e: Record<string, string>) => (e.Mode ?? '').toUpperCase().includes('ROUTED');
    const isEnabled = (e: Record<string, string>) => (e.Enable ?? '') === '1';

    const chosen =
      entries.find((e) => isInternet(e) && isRouted(e) && isEnabled(e)) ??
      entries.find((e) => isInternet(e) && isRouted(e)) ??
      entries.find(isInternet) ??
      null;

    const domain = chosen?.domain?.trim();
    return domain ? domain : null;
  }

  /**
   * RFC 1918 private + loopback + link-local (and `0.0.0.0`). Hostnames are
   * deliberately treated as non-private because their resolution requires DNS,
   * which on Huawei ONTs only runs on the WAN side.
   */
  private static isPrivateOrLocalIPv4(host: string): boolean {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host.trim());
    if (!m) return false;
    const [a, b] = [Number.parseInt(m[1]!, 10), Number.parseInt(m[2]!, 10)];
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }

  private async pollHuaweiPingResult(): Promise<{ raw: string; status: string } | null> {
    const body = await this.huaweiPostForm(HUAWEI_PING_POLL_ENDPOINT, '');
    if (body == null) return null;

    const decoded = this.decodeHuaweiPingExpression(body);
    if (decoded == null) return null;

    const idx = decoded.indexOf(HUAWEI_PING_RESULT_DELIMITER);
    if (idx < 0) return { raw: decoded, status: 'Requested' };

    const raw = decoded.slice(0, idx);
    const tail = decoded.slice(idx + HUAWEI_PING_RESULT_DELIMITER.length).trim();
    const status = tail.split(/\s+/)[0] ?? '';
    return { raw, status };
  }

  /**
   * Decode the JS expression returned by `GetPingResult.asp`. The body is a
   * concatenation of one or more single- or double-quoted string literals
   * separated by `+` and whitespace, e.g.
   *
   *     "PING 1.2.3.4 ...\n" +
   *     "64 bytes from 1.2.3.4: ... ms\n"
   *     + "[@#@]Complete";
   *
   * The original page does `eval(data)`; we walk literals manually because MV3
   * extensions cannot `eval`. Supports `\xNN`, `\uNNNN`, and the standard
   * single-char escapes (`\n`, `\r`, `\t`, `\\`, `\"`, `\'`, …). Any leading
   * non-quote bytes are skipped so the `data.substr(8)` workaround inside
   * `GetPingResult` (firmware occasionally emits `\n\n" + ` style preambles)
   * isn't needed.
   */
  private decodeHuaweiPingExpression(src: string): string | null {
    let pos = 0;
    while (pos < src.length && src[pos] !== '"' && src[pos] !== "'") pos++;

    const parts: string[] = [];
    while (pos < src.length) {
      if (parts.length > 0) {
        while (pos < src.length && /[\s+;]/.test(src[pos]!)) pos++;
        if (pos >= src.length) break;
      }

      const quote = src[pos];
      if (quote !== '"' && quote !== "'") {
        return parts.length > 0 ? parts.join('') : null;
      }

      let i = pos + 1;
      let chunk = '';
      let closed = false;
      while (i < src.length) {
        const c = src[i]!;
        if (c === '\\') {
          if (i + 1 >= src.length) return null;
          chunk += HuaweiBaseDriver.decodeJsEscape(src, i);
          i += src[i + 1] === 'x' ? 4 : src[i + 1] === 'u' ? 6 : 2;
        } else if (c === quote) {
          closed = true;
          break;
        } else {
          chunk += c;
          i++;
        }
      }
      if (!closed) return null;
      parts.push(chunk);
      pos = i + 1;
    }

    return parts.length > 0 ? parts.join('') : null;
  }

  /** Decode a single `\…` escape starting at `src[i]` (which must be `\`). */
  private static decodeJsEscape(src: string, i: number): string {
    const next = src[i + 1]!;
    if (next === 'x') {
      const hex = src.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) return next;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    if (next === 'u') {
      const hex = src.slice(i + 2, i + 6);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return next;
      return String.fromCharCode(Number.parseInt(hex, 16));
    }
    switch (next) {
      case 'n':
        return '\n';
      case 'r':
        return '\r';
      case 't':
        return '\t';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case 'v':
        return '\v';
      case '0':
        return '\0';
      default:
        return next;
    }
  }

  /**
   * Parse Huawei/BusyBox-style ping output into `PingTestResult`. Differs from
   * `BaseRouter.parsePingTestResult` (which targets ZTE/Windows-style replies):
   *
   *     PING 1.2.3.4 (1.2.3.4): 56 data bytes
   *     64 bytes from 1.2.3.4: seq=0 ttl=64 time=12.345 ms
   *     ...
   *     --- 1.2.3.4 ping statistics ---
   *     2 packets transmitted, 2 packets received, 0% packet loss
   *     round-trip min/avg/max = 12.345/13.456/14.567 ms
   *
   * Mid-test buffers (status `Requested`) lack the trailing stats/RTT block, so
   * those fields are intentionally optional and left undefined when absent.
   */
  protected parseHuaweiPingResult(raw: string, ip: string): PingTestResult | null {
    const lines = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    let bytes: number | undefined;
    let ttl: number | undefined;
    const times: number[] = [];
    const sequences: number[] = [];

    for (const line of lines) {
      const headerMatch = HUAWEI_PING_HEADER_LINE.exec(line);
      if (headerMatch) {
        bytes = Number.parseInt(headerMatch[1]!, 10);
        continue;
      }
      const replyMatch = HUAWEI_PING_REPLY_LINE.exec(line);
      if (replyMatch) {
        bytes = Number.parseInt(replyMatch[1]!, 10);
        sequences.push(Number.parseInt(replyMatch[2]!, 10));
        ttl = Number.parseInt(replyMatch[3]!, 10);
        times.push(Number.parseFloat(replyMatch[4]!));
      }
    }

    const statsLine = lines.find((line) => HUAWEI_PING_STATS_LINE.test(line));
    const statsMatch = statsLine ? HUAWEI_PING_STATS_LINE.exec(statsLine) : null;
    const transmitted = statsMatch ? Number.parseInt(statsMatch[1]!, 10) : undefined;
    const received = statsMatch ? Number.parseInt(statsMatch[2]!, 10) : undefined;
    const loss = statsMatch ? Number.parseInt(statsMatch[3]!, 10) : undefined;

    const rttLine = lines.find((line) => HUAWEI_PING_RTT_LINE.test(line));
    const rttMatch = rttLine ? HUAWEI_PING_RTT_LINE.exec(rttLine) : null;
    const min = rttMatch ? Number.parseFloat(rttMatch[1]!) : undefined;
    const avg = rttMatch ? Number.parseFloat(rttMatch[2]!) : undefined;
    const max = rttMatch ? Number.parseFloat(rttMatch[3]!) : undefined;

    return PingTestResultSchema.parse({
      ip,
      bytes,
      time: times.length > 0 ? times : undefined,
      sequence: sequences.length > 0 ? sequences : undefined,
      ttl,
      packets: { transmitted, received, loss, min, avg, max },
      message: raw,
    });
  }

  private async huaweiGet(path: string): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  private async huaweiPostForm(path: string, body: string): Promise<string | null> {
    try {
      const response = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
      });
      if (!response.ok) return null;
      return await response.text();
    } catch {
      return null;
    }
  }

  /**
   * Submit a `complex.cgi` form via a hidden iframe-targeted form, byte-for-byte
   * the same way `webSubmitForm.submit()` does on `diagnosecommon.asp`.
   *
   * Why not `fetch`: some Huawei builds gate state-mutating CGIs on
   * `Sec-Fetch-Mode: navigate`, which `fetch` cannot produce — XHR submits land
   * with `Sec-Fetch-Mode: cors` and get silently dropped (response is the
   * unchanged diagnose page, polling keeps replaying the previous test). A
   * real form submit into a same-origin iframe target produces a proper
   * navigation, including the headers the firmware expects.
   *
   * The iframe is sandboxed without `allow-scripts` so the response page's
   * inline scripts (auto-pollers, `LoadFrame`, `setInterval` registrations)
   * do not run inside the hidden iframe; we still get full `outerHTML` access
   * via `allow-same-origin`. Form parameter order matches `OnApply` exactly.
   */
  private submitHuaweiCgiForm(
    action: string,
    params: Record<string, string>,
  ): Promise<string | null> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined' || !document.body) {
        resolve(null);
        return;
      }

      const iframeName = `__huawei_form_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const iframe = document.createElement('iframe');
      iframe.name = iframeName;
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('sandbox', 'allow-forms allow-same-origin');
      iframe.style.display = 'none';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = action;
      form.target = iframeName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';

      for (const [key, value] of Object.entries(params)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);

      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          form.remove();
        } catch {
          /* noop */
        }
        try {
          iframe.remove();
        } catch {
          /* noop */
        }
      };
      const finish = (html: string | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(html);
      };

      iframe.addEventListener('load', () => {
        if (settled) return;

        // Some browsers fire `load` for the implicit about:blank document
        // before the form's navigation completes; we want only the response.
        let url = '';
        try {
          url = iframe.contentWindow?.location?.href ?? '';
        } catch {
          /* same-origin allowed by sandbox; defensive */
        }
        if (!url || url === 'about:blank') return;

        let html: string | null = null;
        try {
          html = iframe.contentDocument?.documentElement?.outerHTML ?? null;
        } catch {
          html = null;
        }
        finish(html);
      });

      timer = setTimeout(() => finish(null), 30_000);

      try {
        form.submit();
      } catch {
        finish(null);
      }
    });
  }
}
