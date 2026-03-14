# Router Inspector

A Chrome extension for automated data extraction from home routers, built for ISP technicians and network administrators.

## Overview

Router Inspector connects to your router's web interface, authenticates automatically, and extracts configuration data (PPPoE credentials, network settings, router version, topology, etc.) into a clean popup UI — with CSV export support.

## Features

- **Automated authentication** — fills and submits router login forms programmatically
- **Data extraction** — collects WAN configuration, PPPoE credentials, network status, router version, and topology
- **Retry logic** — handles post-login page redirects gracefully with configurable retry attempts
- **CSV export** — download collected data for reporting or record-keeping
- **Injected UI** — adds a "Get Data Automatically" button directly on the router's login page
- **Settings page** — extension options and metadata
- **i18n** — English and Portuguese (Brazil) locales

## Supported Routers

| Model         | Status       |
| ------------- | ------------ |
| ZTE ZXHN H199 | ✅ Supported |

New router models can be added by implementing the `IRouter` port (via `BaseRouter`) and registering the driver in `RouterFactory`. See [Adding a New Router Driver](#adding-a-new-router-driver).

## Project Structure

```
src/
├── application/           # Use cases and app services
│   ├── CollectionService.ts
│   ├── ContentPageUseCase.ts
│   ├── PopupUiStateService.ts
│   ├── BookmarksService.ts
│   ├── constants/
│   ├── ports/              # ITabMessenger, IStorage
│   └── types/
├── domain/                 # Contracts and shared types
│   ├── models/
│   │   └── Router.ts       # Re-export of IRouter
│   ├── ports/
│   │   └── IRouter.ts      # Router adapter contract
│   └── schemas/
│       └── validation.ts   # Zod schemas and shared types
├── infra/                  # Implementations and drivers
│   ├── background/
│   │   └── background.ts  # Service worker
│   ├── dom/
│   │   ├── DomService.ts
│   │   └── types.ts
│   ├── drivers/
│   │   ├── shared/         # TopologySectionParser, shared types
│   │   └── zte/            # ZTE H199 driver, selectors, constants
│   ├── router/
│   │   ├── BaseRouter.ts   # Abstract base for router drivers
│   │   └── RouterFactory.ts
│   ├── tabs/
│   │   └── ChromeTabMessenger.ts
│   ├── i18n/
│   │   └── I18nService.ts
│   └── storage/
│       └── StorageService.ts
└── presentation/
    ├── content/
    │   └── main.ts         # Content script entry
    ├── popup/
    │   ├── popup.html
    │   ├── popup.css
    │   ├── popup.ts
    │   ├── PopupController.ts
    │   ├── PopupView.ts
    │   └── ThemeManager.ts
    ├── settings/
    │   ├── settings.html
    │   ├── settings.css
    │   └── settings.ts
    └── tokens.css          # Design tokens
```

Driver details and how to add new routers are documented in `src/infra/drivers/README.md`.

## Prerequisites

- Node.js >= 14
- npm >= 6

## Installation

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

The compiled extension is output to the `dist/` directory.

## Loading in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** and select the `dist/` folder
4. The Router Inspector icon will appear in the toolbar

## Usage

1. Navigate to your router's admin page (e.g. `http://192.168.1.1`)
2. Click the Router Inspector icon in the Chrome toolbar
3. Enter your router credentials (default username: `admin`)
4. Click **Collect Data**
5. When collection finishes, use **Export CSV** to download the data

Alternatively, use the **"Get Data Automatically"** button injected on the router's login page — it uses the credentials in the login form and runs collection automatically.

## Adding a New Router Driver

1. Create a new folder under `src/infra/drivers/` (e.g. `tp-link/`, `asus/`).

2. Implement a class extending `BaseRouter` (from `src/infra/router/BaseRouter.ts`) that satisfies the domain `IRouter` port:

```typescript
import { BaseRouter } from "../../router/BaseRouter.js";
import type {
  ButtonConfig,
  Credentials,
  ExtractionResult,
} from "../../../domain/schemas/validation.js";

export class MyRouterDriver extends BaseRouter {
  constructor() {
    super("My Router Model Name");
  }

  protected readonly loginSelectors = {
    username: "#username",
    password: "#password",
  };

  isLoginPage(): boolean {
    /* ... */
  }
  authenticate(credentials: Credentials): void {
    /* ... */
  }
  async extract(): Promise<ExtractionResult> {
    /* ... */
  }
  buttonElementConfig(): ButtonConfig | null {
    /* ... */
  }
  isAuthenticated(): boolean {
    /* ... */
  }
}
```

3. Add selectors and driver-specific constants in that folder.

4. Register the driver in `RouterFactory` (`src/infra/router/RouterFactory.ts`): add a detection predicate (e.g. from `document.title` or `document.body`) and a `create()` branch that instantiates your driver.

The domain and application layers depend only on `IRouter`; they do not import from driver folders.

## Tech Stack

- **TypeScript** — strict mode, `nodenext` modules
- **esbuild** — bundling to IIFE for Chrome (via `build.js`)
- **Zod v4** — runtime schema validation for messages and extracted data
- **Chrome Extensions Manifest V3**

## License

AGPL-3.0
