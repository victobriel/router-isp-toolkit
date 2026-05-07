import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter, RouterPage, RouterPageKey, RouterSelectors } from '@/application/types';
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
   */
  public async ping(ip: string): Promise<PingTestResult | null> {
    const token = await this.readHuaweiCsrfToken();
    if (!token) return null;

    const startBody = new URLSearchParams({
      'x.Host': ip,
      'x.DiagnosticsState': 'Requested',
      'x.NumberOfRepetitions': String(HUAWEI_PING_DEFAULT_REPETITIONS),
      'x.DataBlockSize': String(HUAWEI_PING_DEFAULT_DATA_BLOCK_SIZE),
      'x.Timeout': String(HUAWEI_PING_DEFAULT_TIMEOUT_MS),
      'x.DSCP': String(HUAWEI_PING_DEFAULT_DSCP),
      'RUNSTATE_FLAG.value': 'START',
      'x.X_HW_Token': token,
    }).toString();

    const started = await this.huaweiPostForm(HUAWEI_PING_START_ENDPOINT, startBody);
    if (started == null) return null;

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
      const stopBody = new URLSearchParams({
        'x.Host': ip,
        // Firmware misspelling — must be sent as-is to be accepted.
        'RUNSTATE_FLAG.value': 'TERMIANL',
        'x.X_HW_Token': token,
      }).toString();
      await this.huaweiPostForm(HUAWEI_PING_START_ENDPOINT, stopBody);
    }

    if (!raw) return null;
    return this.parseHuaweiPingResult(raw, ip);
  }

  public reboot(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  public goToPage(_page: RouterPage, _key: RouterPageKey): void {
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
   * Read the Huawei CSRF token (`onttoken`). Tries the live document first
   * because the hidden input is rendered on essentially every Huawei admin
   * page; falls back to a one-shot GET of the diagnose page so `ping()` still
   * works when invoked from contexts without DOM access.
   */
  protected async readHuaweiCsrfToken(): Promise<string | null> {
    if (typeof document !== 'undefined') {
      for (const sel of ['#hwonttoken', '[name="onttoken"]']) {
        const el = document.querySelector(sel);
        if (el instanceof HTMLInputElement && el.value.trim()) return el.value.trim();
      }
    }
    const raw = await this.huaweiGet(HUAWEI_DIAGNOSE_PAGE_ENDPOINT);
    return this.matchInputValueById(raw, 'hwonttoken');
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
}
