import { IDomGateway } from '@/application/ports/IDomGateway';
import { ExtractionFilter, RouterPage, RouterPageKey, RouterSelectors } from '@/application/types';
import { ButtonConfig } from '@/domain/ports/IRouter.types';
import { Credentials, ExtractionResult, PingTestResult } from '@/domain/schemas/validation';
import { BaseRouter } from '@/infra/router/BaseRouter';
import { ITopologySectionParser } from '../../shared/TopologySectionParser';

const REGEX_META = /[.*+?^${}()|[\]\\]/g;

function escapeRegExp(s: string): string {
  return s.replace(REGEX_META, '\\$&');
}

/** `value="…"` on a single HTML tag fragment (Huawei pages use double or single quotes). */
const INPUT_VALUE_ATTR = /value=["']([^"']*)["']/i;

/**
 * Standalone `disabled` HTML attribute on a single tag fragment. Matches `disabled`,
 * `disabled=""`, `disabled='disabled'`, etc., but NOT substrings like `data-disabled`
 * or `aria-disabled` because we require a tag-start or whitespace before the keyword.
 */
const DISABLED_ATTR = /(?:^|\s)disabled(?:\s|=|\/|>|$)/i;

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

  public ping(_ip: string): Promise<PingTestResult | null> {
    throw new Error('Method not implemented.');
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
    const tag = this.matchInputTagById(raw, id);
    if (!tag) return null;
    const value = INPUT_VALUE_ATTR.exec(tag)?.[1];
    return value == null ? null : this.unescapeHuaweiHex(value);
  }

  /** First `<input … id="…" …>` tag (verbatim) for the given id, or `null` if absent. */
  protected matchInputTagById(raw: string | null, id: string): string | null {
    if (!raw) return null;
    const escapedId = escapeRegExp(id);
    return new RegExp(`<input[^>]*id=["']${escapedId}["'][^>]*>`, 'i').exec(raw)?.[0] ?? null;
  }

  /**
   * Returns the enabled state of an `<input id="…">` element in raw HTML:
   * - `true`  → element exists and is **not** marked `disabled`,
   * - `false` → element exists but carries a `disabled` attribute,
   * - `null`  → element is absent.
   *
   * Useful for Huawei pages that always emit a form field but communicate
   * availability through the `disabled` attribute (e.g. WAN-side ACL toggles
   * like `#Protocol2` for HTTP remote access).
   */
  protected matchInputEnabledById(raw: string | null, id: string): boolean | null {
    const tag = this.matchInputTagById(raw, id);
    if (!tag) return null;
    return !DISABLED_ATTR.test(tag);
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
}
