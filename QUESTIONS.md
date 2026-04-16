# QUESTIONS.md — Code Review & Technical Audit

> Reviewed by: AI Tech Lead / Code Reviewer
> Date: 2026-03-22
> Project: Router ISP Toolkit (Chrome Extension — Manifest V3)
> Version: 2.0.0

Each question below represents an architectural concern, potential bug, security issue, performance opportunity, or improvement point discovered during a full codebase audit. Answer each one so the improvement pass can begin.

---

## 1 · Architecture & Layer Boundaries

~~### Q1.1 — `ValueElement` type is duplicated in two files~~

~~ValueElement`is defined in both`src/application/ports/IDomGateway.ts`(application layer) and`src/infra/dom/types.ts`(infra layer).`DomService`imports from the infra copy while`DomGateway`implements the application port. Which is the canonical source? Should the infra copy be deleted and`DomService` import from the port instead, or does the domain need its own copy to stay independent of browser types?~~

~~### Q1.2 — `DomService` used directly by drivers, bypassing the `IDomGateway` port~~

~~Both `ZteH199Driver` and `ZteH3601Driver` call `DomService` static methods directly (e.g. `DomService.getElement`, `DomService.getOptionalValue`) rather than going through the `IDomGateway` port. This makes the drivers impossible to test without a real DOM. Was this intentional (perf reasons, DOM always available in content script), or should the drivers receive an `IDomGateway` instance via constructor injection?~~

~~### Q1.3 — `PopupUiStateService` imports a concrete instance from infra~~

~~`PopupUiStateService` constructor takes `IStorage`, which is correct, but the file also exports `defaultPopupUiStateService` that directly imports `defaultSessionStorageService` from infra. This tight-couples an application-layer module to infra. Should this default be moved to the composition root (`src/index.ts`) instead?~~

~~### Q1.4 — `services` singleton eagerly instantiated on import~~

~~`src/index.ts` exports `const services = createServices()` at module top-level. Every module that imports `services` triggers the composition root immediately — including in the popup and settings UI entries, the content script, etc. Is this acceptable for all contexts, or could it cause side effects (e.g. running infra constructors in the background script where `document` doesn't exist)?~~

~~### Q1.5 — Background script (`src/background/index.ts`) doesn't use the composition root~~

~~The background script creates its own direct references to `defaultTabMessenger` and `defaultSessionStorageService` instead of going through `createServices()`. Is this intentional? Would it be better to have the background use the composition root for consistency and testability?~~

~~### Q1.6 — The `ipOrPattern` field exists in the schema but is never extracted or displayed~~

~~`routerStateShape` accepts an `ipOrPattern` parameter, and `RouterPreferencesStore` includes it, but no driver ever populates it and no UI component displays it. Is this a placeholder for a future feature, or dead code that should be removed?~~

~~### Q1.7 — `goToHomePage` is embedded in extraction data~~

~~The `extract()` method calls `goToHomePage()` and puts the boolean result inside the `ExtractionResult`. This mixes a side-effect (navigating the router's UI) with data extraction. Was this intentional? Should navigation be separated from the extraction result?~~

~~### Q1.8 — `ButtonConfig` lives in the domain validation file~~

~~`ButtonConfig` (with `targetSelector`, `text`, `style`) is defined in `src/domain/schemas/validation.ts` alongside Zod schemas. This is a UI/presentation concern. Should it be moved to the application or infra layer?~~

~~### Q1.9 — `DiagnosticsMode` enum is in the domain validation file but is only used by UI~~

~~`DiagnosticsMode.INTERNAL / EXTERNAL` is defined in `src/domain/schemas/validation.ts` but is only used in the popup diagnostics tab and `PopupDataProvider`. Should it live in the UI types instead?~~

### Q1.10 — Application layer `CollectionService` catches Zod errors from `CredentialsSchema.parse`

~~`CollectionService.handleCollect` uses `.parse()` (throws on failure) for credentials inside the `authenticate` action, but the wrapping code doesn't catch the `ZodError`. If invalid credentials are passed, this will throw an unhandled error. Should this use `.safeParse()` and return a `CollectResponse` with `success: false`?~~

---

## 2 · Security

~~### Q2.1 — Credentials stored in plain text in `chrome.storage.local`~~

~~Bookmark credentials (`username` / `password`) are stored in plain text via `BookmarksService` → `StorageService` → `chrome.storage.local`. Any extension with `storage` permission can read these. Is this acceptable given the target audience, or should some form of encryption/obfuscation be applied?~~

~~### Q2.2 — Passwords visible in the Settings page~~

~~The Settings page displays bookmark passwords as plain text (`<p className="text-xs text-muted-foreground truncate">{cred.password}</p>`). Should these be masked with an option to reveal?~~

~~### Q2.3 — Import file not validated for `schemaVersion`~~

~~The import flow in `Settings.tsx` reads `root.data` but ignores `root.schemaVersion`. If a future version changes the export format, importing an old file won't warn the user. Should `schemaVersion` be validated?~~

~~### Q2.4 — `host_permissions: ["<all_urls>"]` is overly broad~~

~~The manifest requests `<all_urls>` host permissions. This triggers a "can read and change all your data on all websites" warning in Chrome. Could the permissions be narrowed to only the known router IP ranges (e.g. `192.168.*`, `10.0.*`) or at minimum use `optional_host_permissions`?~~

### Q2.5 — Content script injected on every page

`content_scripts` in `manifest.json` matches `"<all_urls>"`, so the content script runs on every page the user visits. This means `RouterFactory.create()` runs on every page load (even google.com). Could this be limited to router-like URLs, or could `chrome.scripting.executeScript` be used on-demand instead?

### Q2.6 — `web_accessible_resources` exposes `popup.html` and `popup.js` to all origins

Any page can load the extension's `popup.html` via the extension URL. Could a malicious page exploit this to extract router data? Should resources only be accessible to the extension itself?

### Q2.7 — No IP validation for ping

In `PopupDiagnosticsTab`, the external IP input is a free-text field with no validation. Malicious input (e.g. command injection characters) could be passed to the router's ping form. Should the IP be validated before sending?

### Q2.8 — No CSRF protection when automating router forms

The drivers submit login forms and navigate the router UI. If the router has any CSRF token mechanism, the extension bypasses it by directly manipulating form fields and clicking submit. Is this a concern, or are the target routers known to have no CSRF protection?

---

## 3 · Bugs & Potential Issues

### Q3.1 — `waitForInputPopulated` redundant condition

In `BaseRouter.waitForInputPopulated`, the `isPopulated` check does `value.length > 0 && value !== ''`. The second condition is always true when the first is true — it looks like it was meant to be `value !== '...'` (to filter the "loading" placeholder). Is this a bug?

### Q3.2 — `readDhcpOctetFields` returns `(string | null)[]` but is `.join('.')`-ed

When `DomService.getOptionalValue` returns `null` for an octet field, the result array contains `null`. Then `dhcpIpAddress.join('.')` produces strings like `"192.168.null.1"`. Should nulls be replaced with `"0"` or cause the field to be omitted entirely?

### Q3.3 — Topology may accumulate duplicate clients

In `extractTopologyData`, when multiple SVG circles are clicked, each popup may contain overlapping clients (the same client appears in multiple popups). The current logic pushes all of them, potentially resulting in duplicate MAC entries. Should the results be deduplicated by MAC address?

### Q3.4 — `handleGoToSection` is a no-op

In `PopupDataRow`, the "go to section" button calls `handleGoToSection` which just `return;`s. The button is rendered for every row but does nothing. Should it be hidden until implemented, or removed?

### Q3.5 — Possible race condition in `authenticate` → `waitForAuthRedirect`

In `CollectionService.handleCollect`, `router.authenticate()` calls `setTimeout(() => DomService.safeClick(submitButton), 100)` to click the submit button asynchronously, but `waitForAuthRedirect` starts immediately. If the 100ms delay hasn't fired yet, the interval starts polling before the form is even submitted. Is this reliably timed on all target routers?

### Q3.6 — `clickElementAndWait` with no `waitForSelector` waits for itself

When `clickElementAndWait(selector)` is called without a second argument, `targetSelector` defaults to `sectionSelector`. The method clicks the element and then immediately checks if it exists — which it always does since it was just clicked. Is the intent to wait for a different condition after the click?

### Q3.7 — Popup credentials default to `'admin'`

In `PopupContent`, `username` state is initialized to `'admin'`. If bookmarks load and overwrite this (via `useEffect`), there's a brief flash of `'admin'` before the real username appears. Also, if no bookmarks exist, is `'admin'` always the correct default for all routers?

### Q3.8 — `useEffect` dependency warning: `setStatus` function reference

In `PopupDataProvider`, the initialization `useEffect` includes `setStatus` in its dependency array, but `setStatus` is wrapped in `useCallback` depending on `setStatusType` and `setStatusMessage`. If those function references change between renders, the init effect could re-run. Is this safe?

### Q3.9 — Bookmark key collision when multiple credentials have same user/pass

In `PopupCredentials`, the bookmark list uses `key={bookmark.username}-${bookmark.password}}` instead of `key={bookmark.id}`. If two bookmarks happen to have the same username and password, React will warn about duplicate keys. Should this use `bookmark.id`?

### Q3.10 — `copyText` callback closes over stale `internalPingResult` / `externalPingResult`

The `copyText` function in `PopupDataProvider` is memoized with `useCallback` over `[data, internalPingResult, externalPingResult]`. But it's also async and reads from `services.storage.get`. If the user triggers a ping and then copies immediately, the stale ping result may be used. Is this a concern?

### Q3.11 — `normalizeImportBookmarkStore` silently returns `null` on invalid entries

When importing bookmarks, a single invalid credential object causes the entire import to fail. Should it instead skip invalid entries and import the rest?

### Q3.12 — `router-state-schema.ts` references `wlanConfigSchema` before it's defined

Looking at the full file, `wlanConfigSchema` is defined on line 30 and used in `routerStateShape` on line 92. Since `routerStateShape` is a function (not evaluated at module parse time), this works due to hoisting. But it would be clearer if the schema was defined before the function. Is this acceptable, or should it be reordered?

---

## 4 · Performance

### Q4.1 — Content script evaluates `document.body.textContent` on every page

`RouterFactory.create()` reads `document.body.textContent?.toLowerCase()` to detect the router model. On large pages, this materializes the entire text content of the page. Should this use a more targeted check (e.g. `document.title` only, or specific element lookups)?

### Q4.2 — Sequential extraction with no parallelism

The `extract()` method in both drivers runs all extraction steps sequentially: topology → link speed → WAN → remote access → band steering → WLAN → LAN → UPnP → version → TR069 → goToHomePage. Each step clicks a menu item and waits for content. Could any of these be parallelized, or does the router's SPA-like UI prevent it?

### Q4.3 — Multiple redundant `clickElementAndWait` calls for the same section

For example, in `extractWlanData`, the `localNetworkTab` is clicked, then `wlanContainer`, then `wlanBasicContainer`. But `extractBandSteeringData` (called just before) already navigated to `localNetworkTab` → `wlanContainer`. Should the driver track current navigation state to avoid redundant clicks?

### Q4.4 — `delay(500)` hardcoded in multiple extraction methods

Both `extractLanData` and `extractTr069UrlData` have `await this.delay(500)` after waiting for input population. Is this a workaround for a known timing issue, or can it be replaced with a smarter condition-based wait?

### Q4.5 — `COPY_TEXT_VALUE_KEYS` array is evaluated at module level with `translator.t()` calls

The `COPY_TEXT_VALUE_KEYS` constant in `popup-data-provider/index.tsx` calls `translator.t()` ~60 times at import time. If the locale hasn't loaded yet (or if it changes), these translations will be stale. Should this be lazily computed?

### Q4.6 — No memoization on `PopupDataRow` or section components

Each section component (WAN, DHCP, WLAN, etc.) creates a new array of `PopupDataRowProps` on every render. Since `PopupContent` re-renders on every state change (tab switch, status update), all rows are re-rendered. Should `React.memo` or `useMemo` be used for the row arrays?

### Q4.7 — Webpack is in `mode: 'production'` even for `dev` script

`webpack.config.js` hardcodes `mode: 'production'`. The `dev` script just runs `webpack --watch`. This means no source maps and slow rebuilds during development. Should `mode` be dynamic based on an environment variable?

---

## 5 · Code Duplication

### Q5.1 — `ZteH199Driver` and `ZteH3601Driver` are ~99% identical

The two driver files are 527 lines each and differ only in the import paths and class/selector names. Every method body is identical character-for-character. Should these be collapsed into a single parameterized class (e.g. `ZteDriver(model, selectors, loginSelectors, topologyParser)`) with model-specific config objects?

### Q5.2 — `ZteH199Selectors` and `ZteH3601Selectors` are identical

Both selector files just spread `ZteCommonSelectors` without adding any overrides. Should these be removed in favor of using `ZteCommonSelectors` directly?

### Q5.3 — `ZteH199Driver/constants.ts` and `ZteH3601Driver/constants.ts` are identical

Both re-export the same constants from `ZteCommonDriverConstants.ts`. Should these be eliminated?

### Q5.4 — `StorageService` and `SessionStorageService` share ~80% of their logic

Both services follow the same pattern: try chrome.storage → try window.storage → fall back to in-memory. The only difference is `chrome.storage.local` vs `chrome.storage.session`. Should a generic `ChromeStorageAdapter` base class be extracted?

### Q5.5 — `boolMatch`, `regexMatch`, `textMatch` helper functions in popup-data-provider

These comparison functions are simple but are only used in one file. Should they be extracted to a shared utility, or are they fine where they are?

### Q5.6 — Repetitive `SelectPref` / `TextPref` patterns in `RouterPreferenceSection`

The same `SelectPref` and `TextPref` components are used ~30+ times with similar patterns (especially for boolean toggle selects). Could a more declarative config-driven approach reduce the boilerplate?

---

## 6 · Testing

### Q6.1 — Zero tests in the project

The `test` script is `echo "No tests configured" && exit 0`. There are no test files, no test framework (Jest, Vitest, etc.), and no test infrastructure. What is the plan for testing? At minimum, should the domain schemas, validation functions, and services have unit tests?

### Q6.2 — No test infrastructure for driver/content-script code

The drivers interact with real DOM elements (querySelector, MutationObserver, etc.). There's no JSDOM or Puppeteer setup. How should these be tested — integration tests against a mock router page, or E2E tests?

### Q6.3 — Composition root supports DI for tests but there are no test consumers

`createServices()` accepts partial overrides for `storage`, `sessionStorage`, `routerFactory`, `domGateway`, and `tabMessenger`. This was designed for testability, but no tests exist yet. Should a test harness be created with mocked implementations?

---

## 7 · Build, Tooling & CI/CD

### Q7.1 — No CI/CD pipeline

There's no `.github/workflows`, no Jenkinsfile, no CI configuration. Should a pipeline be set up for linting, typechecking, and building on every push?

### Q7.2 — Both `ts-loader` and `babel-loader` are in `devDependencies` but only `babel-loader` is used

`webpack.config.js` uses `babel-loader` with `@babel/preset-typescript`. `ts-loader` is installed but never configured. Should `ts-loader` be removed from dependencies?

### Q7.3 — No source maps configured

The webpack config doesn't set `devtool`. In production mode, there are no source maps. For debugging the extension during development, should `devtool: 'cheap-module-source-map'` (or similar) be enabled?

### Q7.4 — `package.json` has empty `description`, `homepage`, `repository`, `bugs`, `author` fields

These are all empty strings or objects. Should they be filled in or removed?

### Q7.5 — `"private": false` but no npm publish workflow

`package.json` has `"private": false`, which means `npm publish` would work. Since this is a Chrome extension (not an npm package), should this be `true`?

### Q7.6 — No README.md

The project has no README file. Should one be created explaining what the extension does, how to build it, how to install it, and how to contribute?

### Q7.7 — `engines` field specifies Node `>= 14.0.0` which is extremely old

The codebase uses ES2019+, ESM modules in `webpack.config.js` (requiring Node 18+), and Zod v4 (requires Node 18+). Should `engines.node` be bumped to `>= 18.0.0`?

### Q7.8 — `shadcn` is listed as a runtime dependency

`shadcn` (the CLI tool) is in `dependencies` instead of `devDependencies`. It's only used for scaffolding components and should not be shipped. Should it be moved to `devDependencies`?

---

## 8 · UI / UX

### Q8.1 — `val()` helper returns `'--'` but `PopupDataRow` renders `value ?? '-'`

`val()` in `src/ui/lib/utils.ts` returns `'--'` (two dashes) for empty values, but `PopupDataRow` falls back to `'-'` (one dash). This creates inconsistent placeholder text. Which should be canonical?

### Q8.2 — Toast system in Settings is custom and ephemeral

The `useToast` hook in `Settings/App.tsx` uses a counter + `setTimeout` pattern that doesn't support undo, stacking, or accessibility announcements. Should this be replaced with a proper toast library (e.g. Sonner, react-hot-toast) or at minimum add `role="alert"` to toast elements?

### Q8.3 — Modal dialogs (Import/Export) don't trap keyboard focus

The import and export dialogs render a backdrop and content div but don't use a focus trap. Users can tab out of the dialog into the background page. Should a proper dialog component (e.g. Radix Dialog) be used?

### Q8.4 — No loading state when popup first opens

`AppTabProvider` queries `chrome.tabs.query` and `sessionStorage.get` on mount. While these are in-flight, the component shows the "No supported router detected" empty state for a split second. Should a loading skeleton or spinner be shown instead?

### Q8.5 — Theme provider only wraps the popup, not the settings page

`useAppTheme` is used in both popup and settings, but the `ThemeProvider` wrapping is inconsistent. Does the settings page properly inherit the theme?

### Q8.6 — No confirmation before overwriting bookmarks on import

The import flow replaces all bookmarks if the section is checked. There's no "merge" option. Should the user be warned that existing bookmarks will be overwritten?

### Q8.7 — `handleClearAll` uses `window.confirm` which is blocked in extension popups

`window.confirm()` is used in the Settings page for the "Clear all" action. This works in an options page opened as a tab, but if Settings is ever rendered inside the popup overlay, `confirm` may be blocked. Should a custom confirmation dialog be used?

### Q8.8 — Popup overlay is 400px wide, hardcoded

The overlay iframe is hardcoded to `width: '400px'`. On narrow screens or high-DPI displays, this may not be ideal. Should the width be responsive or configurable?

### Q8.9 — Password field in popup doesn't have a "show password" toggle

The popup credentials section has a password input but no visibility toggle. The settings page shows passwords in plain text. Should the UX be consistent?

---

## 9 · Domain & Schema

### Q9.1 — `ExtractionResultSchema` uses `.partial()` on the entire object

Every field in `ExtractionResult` is optional. This means an extraction can succeed with an empty object `{}`. Should at minimum `routerModel` and `timestamp` be required?

### Q9.2 — `routerStateShape` mixes domain-level and infrastructure-level concerns

Fields like `goToHomePage: z.boolean()` and `timestamp: z.string()` are metadata, not router state. Should they be separated from the actual router configuration data?

### Q9.3 — No `wlanConfigSchema` export

`wlanConfigSchema` is defined in `router-state-schema.ts` but not exported. It's only used within `routerStateShape`. Should it be exported for use in tests or other consumers?

### Q9.4 — `PingTestResult.message` stores the raw ping output

The entire raw text output of the ping command is stored in `message`. This can be quite large. Should the raw output be stored separately from the parsed metrics?

### Q9.5 — `CollectMessageAction` enum lives in the validation file

This enum controls the message protocol between popup and content script. It's more of an application/messaging concern than a validation concern. Should it be moved to the application constants?

### Q9.6 — `Credentials` type doesn't validate password strength

`CredentialsSchema` only checks `min(1)` for both username and password. Should the schema enforce any additional constraints (e.g. no whitespace-only passwords)?

---

## 10 · Infrastructure

### Q10.1 — `RouterFactory.create()` uses `document.body.textContent` for detection

This reads the entire page text on every call. For performance and reliability, could the factory check `document.title` first (fast path), and only fall back to body text if needed?

### Q10.2 — `RouterFactory` throws on unsupported routers

When a router isn't recognized, `RouterFactory.create()` throws an error. `ContentPageUseCase.bootstrap()` catches it silently. But if any other caller forgets the catch, it crashes. Should it return `null` instead, making the "no router" case explicit?

### Q10.3 — `InMemoryFallbackStore.enforceMaxEntries` has O(n) LRU eviction

When the store exceeds `maxEntries`, it iterates all entries to find the oldest. For 500 entries this is fine, but should a proper LRU data structure (e.g. doubly-linked list) be used if the cap increases?

### Q10.4 — TTL entries use a magic-string key prefix `'__ttl:'`

The TTL implementation uses `'__ttl:expiresAt'` and `'__v'` as special keys within stored objects. If a user's data happens to contain these keys, it would be misinterpreted. Should a more collision-resistant scheme be used (e.g. Symbol or a wrapper envelope)?

### Q10.5 — `SessionStorageService.save` always writes to in-memory store even if chrome session succeeds

The `save` method in `SessionStorageService` tries `chrome.storage.session` first. If it succeeds, it returns early. But if the next call to `get` falls through to the in-memory backend (e.g. because chrome session is temporarily unavailable), it won't find the value. Should both backends be populated consistently?

### Q10.6 — `BaseRouter.waitForElement` doesn't disconnect the observer on success if the timeout already fired

If the timeout fires first (calling `reject`), the `MutationObserver` is disconnected. But if the observer fires and resolves, the timeout `setTimeout` is never cleared. This means the reject handler will still fire after resolution, though the promise is already settled. Should `clearTimeout` be called on success?

### Q10.7 — `DomService.safeClick` attaches `preventDefault` listener for `javascript:` hrefs but dispatches click

For `javascript:` hrefs, `safeClick` adds a one-time `preventDefault` handler and then dispatches a synthetic click. The intent is to prevent navigation but still trigger click handlers. However, the synthetic `MouseEvent` may not trigger the `javascript:` href execution in all browsers. Is this tested behavior?

### Q10.8 — `ChromeI18nTranslator.t()` falls back to the key string when translation is missing

If `chrome.i18n.getMessage` returns an empty string (translation not found), the translator returns the raw key (e.g. `'popup_label_tr069_url'`). Should this log a warning during development to catch missing translations?

---

## 11 · Internationalization (i18n)

### Q11.1 — Only 2 locales: English and Portuguese (Brazil)

The `_locales` folder has `en` and `pt_BR`. Are more locales planned? Should the `pt_BR/messages.json` be reviewed for completeness?

### Q11.2 — Some UI strings are hardcoded in English

The "Get Data Automatically" button text in `buttonElementConfig()` is hardcoded in both drivers. The injected button on the router page is always in English. Should this use the i18n service?

### Q11.3 — `val()` helper returns hardcoded English strings

`val()` in `utils.ts` returns `'Enabled'` / `'Disabled'` for booleans. These are not translated. Should they use `translator.t()`?

### Q11.4 — `boolText` in `copyText` callback also returns hardcoded English

The `boolText` function inside the `copyText` callback uses `translator.t('popup_status_enabled')` / `translator.t('popup_status_disabled')`, which is correct. But `val()` used in other places doesn't. Are both functions supposed to behave the same way?

### Q11.5 — `ExtensionManager` error messages are not localized

Error messages in `src/background/index.ts` (e.g. `'No tab id available for extraction data'`) are hardcoded English. Should these go through the translator?

---

## 12 · Missing Features & Future Considerations

### Q12.1 — No support for routers other than ZTE H199 and H3601

The `RouterFactory` only detects two ZTE models. What is the plan for supporting additional router models/brands? Should there be a plugin/driver registration system?

### Q12.2 — No data export/download from the popup

The popup shows extracted data but there's no way to export it as JSON or CSV. The "Copy text" feature requires a template. Should there be a "Download raw data" button?

### Q12.3 — Logs tab is commented out

In `PopupContent`, there's a commented-out `{ label: 'Logs', value: 'logs', type: 'tab', icon: Activity }` entry. The `logs` state exists in `PopupDataProvider` but is never displayed. What is the plan for the logs feature?

### Q12.4 — No error boundary in React components

Neither the popup nor the settings page has a React error boundary. If any component throws during render, the entire UI crashes with a white screen. Should `ErrorBoundary` components be added?

### Q12.5 — No automatic data refresh / polling

The popup shows data from the last extraction. There's no way to auto-refresh on an interval. Would a periodic re-extraction (e.g. every 5 minutes) be useful?

### Q12.6 — No notification when preferences don't match

The preference comparison shows green/red badges in the popup, but there's no proactive notification (e.g. extension badge icon, desktop notification) when extracted data doesn't match preferences. Should this be a feature?

### Q12.7 — SSID preferences only match the first SSID

In `RouterPreferenceSection`, the user can set one SSID name/hide/security/maxClients per band. But extraction returns up to 4 SSIDs per band. The comparison in `PopupDataProvider` applies the same preference to all SSIDs. Should preferences support per-SSID matching (e.g. by SSID index)?

### Q12.8 — No undo for "Clear all" in Settings

The danger zone "Clear all" button wipes everything after a `window.confirm`. Should there be an "export first" prompt, or an undo grace period?

### Q12.9 — The `downloads` permission is declared but never used

`manifest.json` requests `"downloads"` permission. No code uses `chrome.downloads`. Was this for a planned feature (e.g. exporting data), or is it dead config?

---

## 13 · Naming & Code Style

### Q13.1 — Inconsistent directory naming: `infra` vs full words elsewhere

The infra directory is `src/infra/` while other layers are `src/application/`, `src/domain/`, `src/ui/`. Should it be renamed to `src/infrastructure/` for consistency?

### Q13.2 — `IRouter` imported as `Router` in some files

In `CollectionService.ts` and `ContentPageUseCase.ts`, the import is `import type { IRouter as Router }`. This hides the port/interface nature of the type. Should the `I` prefix be kept consistently?

### Q13.3 — Inconsistent module export patterns

Some modules use `export const defaultX = new X()` (singleton), others use `export class X`, and the composition root uses `export const services = createServices()`. Should there be a consistent pattern?

### Q13.4 — `use-popup-bookmark.ts` vs `use-app-theme.tsx` extension mismatch

Hooks that contain JSX use `.tsx`, and those that don't use `.ts`. `use-popup-bookmark.ts` doesn't contain JSX so `.ts` is correct, but `use-app-theme.tsx` also contains JSX (ThemeProvider component). Is this convention intentional and documented?

### Q13.5 — `PopupDataProvider` is 900+ lines

This component handles data fetching, state management, comparison logic, copy text generation, and renders children via render props. Should it be split into smaller hooks (e.g. `useRouterData`, `usePreferencesComparison`, `useCopyText`)?

---

## 14 · Miscellaneous

### Q14.1 — `document.execCommand('copy')` fallback in clipboard util

`copyTextToClipboard` falls back to `document.execCommand('copy')` which is deprecated. In a Manifest V3 extension with proper permissions, `navigator.clipboard.writeText` should always be available. Should the fallback be removed?

### Q14.2 — `downloadJsonFile` doesn't revoke blob URL synchronously on failure

In `Settings/App.tsx`, `downloadJsonFile` creates a blob URL, clicks a link, and revokes it immediately. If the download doesn't start fast enough (e.g. on slow systems), the URL might be revoked before the browser fetches it. Should a small delay be added before revocation?

### Q14.3 — Module-level `let toastCounter = 0` in Settings

The `toastCounter` variable is a module-level mutable variable. If the Settings page is mounted/unmounted multiple times, the counter doesn't reset. This is probably fine for uniqueness but is unusual. Should it be a `useRef`?

### Q14.4 — `formatTime()` uses hardcoded `'en-US'` locale

`formatTime()` in `lib/utils.ts` always uses `en-US` locale with 24-hour format. Should it respect the user's browser locale?

### Q14.5 — 63 `.mdc` rule files in `.cursor/rules/`

There are 63 Cursor rule files. Are these all actively used and maintained? Could they be consolidated?

### Q14.6 — `popup.html` and `settings.html` don't include `lang` attribute value

Both HTML files have `<html lang="en">` hardcoded. For the `pt_BR` locale, this is incorrect. Should the lang attribute be dynamic?

### Q14.7 — No `Suspense` boundaries in React entry points

The popup and settings entry points render React roots without `Suspense` boundaries. If any component uses lazy loading in the future, it will crash. Should `Suspense` be added proactively?

### Q14.8 — `eslint-plugin-react-hooks` version `^5.0.0` may not be compatible with eslint `^8.57.0`

ESLint 8 is used, but `eslint-plugin-react-hooks@5` is designed for the flat config system (ESLint 9+). Is this causing any linting issues? Should the versions be aligned?

```

```

```

```

```

```

```

```

```

```

```

```
