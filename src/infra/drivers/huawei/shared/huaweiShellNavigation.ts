/**
 * Huawei post-login UIs often render settings inside a same-origin content
 * {@link HTMLIFrameElement} (see `docs/mainpage.asp`: `#routermngtpageSrc`, …)
 * while the extension content script runs in the top document. Navigating by
 * assigning {@link HTMLIFrameElement#src} updates the embedded page only,
 * instead of replacing the whole tab via {@link Location#assign}.
 */

const HUAWEI_SETTINGS_IFRAME_SELECTORS: readonly string[] = [
  '#routermngtpageSrc',
  'iframe#content',
  'iframe[name="content"]',
  'iframe#mainFrame',
  'iframe[name="main"]',
  '#ConfigWifiPageSrc',
  '#InternetSrc',
  '#nowifiInternetSrc',
  '#usbsambapageSrc',
];

/**
 * Picks the first Huawei-style settings iframe in `root` and sets its `src`
 * to `path` (root-relative, e.g. `/html/bbsp/wan/wan.asp`).
 *
 * @returns the iframe element when `src` was set, otherwise `null` (caller
 * may fall back to top-level navigation if appropriate).
 */
export function assignHuaweiContentFrameSrc(root: Document, path: string): HTMLIFrameElement | null {
  for (const selector of HUAWEI_SETTINGS_IFRAME_SELECTORS) {
    const el = root.querySelector(selector);
    if (!(el instanceof HTMLIFrameElement)) continue;
    try {
      el.src = path;
      return el;
    } catch {
      /* cross-origin or policy */
    }
  }
  return null;
}

/**
 * Runs `fn` when the iframe document looks ready: after `load`, plus delayed
 * retries (Huawei ASP pages often populate controls after inline scripts run).
 */
export function runWhenHuaweiIframeReady(
  iframe: HTMLIFrameElement,
  fn: (doc: Document) => void,
  settleMs = 400,
): void {
  const run = (): void => {
    try {
      const doc = iframe.contentDocument;
      if (doc?.documentElement) fn(doc);
    } catch {
      /* cross-origin */
    }
  };

  iframe.addEventListener('load', () => window.setTimeout(run, settleMs), { once: true });
  window.setTimeout(run, settleMs);
  window.setTimeout(run, settleMs + 900);
}

export function focusInHuaweiDocument(doc: Document, selector: string): void {
  const el = doc.querySelector(selector);
  if (!(el instanceof HTMLElement)) return;
  el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    el.focus();
  }
}
