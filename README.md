# Router ISP Toolkit

A Chrome extension for managing ISP router configurations, data extraction, and automation.

## Overview

Router ISP Toolkit is a Chrome extension designed to simplify the process of interacting with various ISP routers. It provides automated data extraction, credential management, and configuration capabilities for different router models.

## Features

- **Automatic Router Detection**: Detects router model and saves it to chrome.storage
- **Credential Management**: Securely stores and manages router login credentials
- **Data Extraction**: Extracts various router data including WAN, LAN, DHCP, WLAN, and remote access information
- **Auto-login Handling**: Handles post-login redirects and automatic data collection
- **Multi-router Support**: Supports multiple router models including Huawei, ZTE, and others
- **Popup Interface**: User-friendly popup for viewing extracted data and managing settings
- **Settings Page**: Configure extension behavior and preferences

## Project Structure

```
router-isp-toolkit/
├── src/
│   ├── application/          # Application logic and use cases
│   ├── domain/               # Domain models and business logic
│   ├── infra/                # Infrastructure (drivers, services, gateways)
│   └── ui/                   # User interface components
├── public/                   # Static assets
├── manifest.json             # Chrome extension manifest
└── package.json              # Project dependencies and scripts
```

## Installation

### Development Mode

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd router-isp-toolkit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open Chrome and navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder (generated after build)

### Production Build

```bash
npm run build
```

The built extension will be in the `dist` directory.

## Usage

1. Click the extension icon in Chrome toolbar
2. Navigate to your router's login page (typically 192.168.1.1 or 192.168.0.1)
3. The extension will automatically detect your router model
4. Enter your router credentials and click the "Get Data" button that appears
5. View extracted data in the popup or save it for later use

## Configuration

### Available Scripts

- `npm run build` - Build the extension for production
- `npm run dev` - Start development mode with file watching
- `npm run test` - Run tests (currently placeholder)
- `npm run typecheck` - Type check TypeScript files
- `npm run lint` - Lint JavaScript/TypeScript files
- `npm run lint:fix` - Lint and fix JavaScript/TypeScript files
- `npm run format` - Format code with Prettier

## Supported Routers

The extension currently supports detection and data extraction for various router models including:
- Huawei series
- ZTE series (H198, H199, H3601, etc.)
- Other ISP routers (extensible architecture)

## Development

### Technology Stack

- **Framework**: React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Webpack
- **UI Components**: Shadcn UI, Radix UI, Lucide Icons
- **State Management**: Chrome Storage API
- **Validation**: Zod

### Code Organization

- **Application Layer**: Use cases and application logic (`src/application`)
- **Domain Layer**: Business logic, models, and interfaces (`src/domain`)
- **Infrastructure Layer**: Drivers, services, and external integrations (`src/infra`)
- **Presentation Layer**: UI components and views (`src/ui`)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with React and TypeScript
- Uses Chrome Extension APIs for browser integration
- Inspired by the need for simpler router management tools