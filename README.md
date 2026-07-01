# 🚀 WordPress Autopilot Bulk Article Writer Pro — AI-Powered Bulk Post Generator & Auto-Scheduler

StackOrbitAI Bulk Writer Pro is a production-ready, enterprise-grade cross-platform desktop application (Windows and macOS) built for automated, high-quality, bulk WordPress article generation and publishing. 

It integrates with multiple LLM providers (OpenAI, Google Gemini, Anthropic Claude, OpenRouter, and custom endpoints) and features a concurrent background queue system, dynamic SEO metadata population (Yoast/RankMath compatible), and automatic updates via GitHub Releases.

### 🆕 Latest Features in v1.0.63
* **Multimodal Vision Image Selector**: Stock photo candidates (from Unsplash, Pexels, and Pixabay) are visually analyzed by Vision-capable LLMs to choose the most thematic and visually aligned featured image matching your article topic.
* **Auto-Resolution Rounding**: Solves Runware.ai Stable Diffusion / FLUX API compatibility by automatically rounding custom sizes (e.g. `1200x628` or `1200x630`) to the nearest multiple of 64 (e.g. `1216x640`), preventing dimension-related API execution failures.
* **Robust Keyword & Topic Enforcement**: Substitutes template placeholders case-insensitively, handles missing curly braces via literal replacements, and injects a confidential system constraint so AI agents never write mismatched topics.
* **In-Session Image Deduplication & Concurrency Lock**: Eliminates duplicate images across bulk articles by caching used stock URLs and appending random suffixes to download filenames to prevent concurrent worker write clashes.
* **AdSense & E-E-A-T Default Prompt Template**: Pre-seeded with a comprehensive, professional blog generation template optimized for Google helpful content standards and AdSense approval.

---

## 🚀 Key Features

* **Sleek Dark UI**: Beautiful glassmorphic dark-theme workspace powered by React 19, Tailwind CSS, shadcn/ui styles, and Framer Motion.
* **AI Agents Hub & Page Templates**: Run real-time AI optimization agents to rewrite paragraphs, optimize headings, align keywords, generate standard static pages (About Us, Contact Us, Privacy Policy), and optimize category descriptions on connected WordPress sites.
* **SEO Link Controls**: Fine-grain controls for internal (placeholder wiki-style) and outbound (authoritative reference) hyperlink insertions with custom target density.
* **Google Docs Metadata Integration**: Automatically format and prepend structured SEO metadata (Yoast/RankMath compatible focus keyword, title, description, slug) directly inside uploaded Google Docs documents.
* **Image Credits & Disclaimer Injection**: Automatic insertion of image credits (AI generated or Pexels/Unsplash/Pixabay stock presets) and custom disclaimers to ensure AdSense compatibility.
* **License & Device Activation**: Multi-device license checking supporting online authorization and local offline activation modes.
* **AI Provider Suite**: Multi-key management for OpenAI, Gemini, Claude, OpenRouter, and custom OpenAI-compatible REST APIs.
* **Bulk Keyword Pipeline**: Direct TXT, CSV, or Excel file importer to parse and queue thousands of articles in seconds.
* **Concurrent Background Queue**: Resilient, multi-threaded background queue processor in Electron's main process with pause, resume, cancel, and auto-retry capabilities.
* **Human-Like Content Engine**: SEO & Helpful Content optimized generations using H2/H3 headlines, custom tables, formatted bullet lists, internal linking suggestions, and metadata.
* **Image Generator & Media Sync**: Integrated DALL-E 3 image generation (photorealistic, natural aspect ratios) with automatic upload to WordPress media libraries as the post's Featured Image.
* **SEO Metadata Mappings**: Direct synchronization with Yoast SEO, RankMath, or All in One SEO metadata fields (meta title, description, focus keywords, tags, slug).
* **Local Express REST Server**: Exposes a local REST API endpoint on Port 4890 to remotely queue tasks from third-party tools (Zapier, Make, Chrome Extension).
* **Auto-Updates**: Secure updater powered by `electron-updater` mapping public GitHub Releases with zero-touch background installations.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, TypeScript, Tailwind CSS, shadcn/ui components, Framer Motion
* **Desktop Shell**: Electron, Electron Builder, Electron Updater
* **Backend**: Node.js, Express, SQLite (`sqlite3`) with secure local AES-256-GCM credential encryption

---

## 📦 File Structure

```
StackOrbitAI Bulk Blog Writer/
├── .github/
│   └── workflows/
│       └── build.yml               # GitHub Actions build pipeline
├── dist/                           # Compiled production assets
├── electron-builder.yml            # Electron builder settings (mapped in package.json)
├── package.json                    # Main dependencies, build configurations
├── tsconfig.json                   # TS compiler rules
├── vite.config.ts                  # Vite bundler config for React
├── src/
│   ├── main/                       # Electron Main Process
│   │   ├── index.ts                # Main loop, app lifecycle, IPC endpoints
│   │   ├── preload.ts              # Electron preload script (safe context bridge)
│   │   ├── database/
│   │   │   ├── connection.ts       # Database connection & wrapper methods
│   │   │   └── schema.ts           # Schema definitions and default seeds
│   │   ├── services/
│   │   │   ├── ai.ts               # AI rest wrapper (OpenAI, Gemini, Claude, OpenRouter)
│   │   │   ├── wordpress.ts        # WordPress REST API handshake & publisher
│   │   │   ├── queue.ts            # Concurrent queue worker process
│   │   │   ├── scheduler.ts        # Background cron check loop
│   │   │   ├── updater.ts          # Auto-updater event handler
│   │   │   └── security.ts         # Encrypted key storage (AES-256-GCM)
│   │   └── server.ts               # Local Express server (Port 4890)
│   └── renderer/                   # React 19 Frontend
│       ├── index.html              # Core HTML structure (Outfit + Inter fonts)
│       ├── main.tsx                # React app mount
│       ├── index.css               # Tailwind imports & scrollbar scroll definitions
│       ├── components/             # Reusable UI widgets and layout views
│       └── pages/                  # Dashboard, websites, queue monitor, etc.
```

---

## 📥 Download & Installation Guide (Windows, macOS, Linux)

You can download the pre-built installers for Windows, macOS, and Linux directly from the **[GitHub Releases](https://github.com/StackOrbitAI/stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents/releases)** page.

### 🌐 Quick Download Links
* **Windows (.exe)**: [Download Latest Windows Setup](https://github.com/StackOrbitAI/stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents/releases/latest) (Select `stackorbitai-bulk-writer-pro-Setup-[version]-[arch].exe`)
* **macOS (.dmg)**: [Download Latest macOS DMG](https://github.com/StackOrbitAI/stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents/releases/latest) (Select `stackorbitai-bulk-writer-pro-[version]-arm64.dmg` for Apple Silicon or `stackorbitai-bulk-writer-pro-[version]-x64.dmg` for Intel Macs)
* **Linux (.AppImage / .deb)**: [Download Latest Linux Package](https://github.com/StackOrbitAI/stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents/releases/latest) (Select `stackorbitai-bulk-writer-pro-[version].AppImage` or `stackorbitai-bulk-writer-pro_[version]_[arch].deb`)

---

### 🪟 Windows Installation Guide
1. **Download**: Click the Windows setup link above and download the `.exe` file (typically `stackorbitai-bulk-writer-pro-Setup-[version]-x64.exe`).
2. **Install**: Double-click the downloaded `.exe` file to run the installer.
3. **SmartScreen Bypass** (if prompted):
   * Since this is a newly released app, Windows SmartScreen may show a warning saying *"Windows protected your PC"*.
   * Click **More info**.
   * Click **Run anyway** to proceed.
4. **Launch**: The installer will place a shortcut on your Desktop and Start Menu. Run **StackOrbitAI Bulk Writer Pro** from there.

---

### 🍎 macOS Installation & Security Setup
1. **Download**: Download the `.dmg` installer for your system architecture:
   * **`-arm64.dmg`** if you are using an Apple Silicon Mac (M1, M2, M3, M4, etc.).
   * **`-x64.dmg`** if you are using an Intel Mac.
2. **Install**: Double-click the downloaded `.dmg` file. **Drag and drop** the `StackOrbitAI Bulk Writer Pro` icon directly into your **Applications** folder.
   > [!IMPORTANT]
   > Do not run the app directly from the mounted DMG volume. Running it from `/Applications` is required for auto-updates and local SQLite database read/write access.
3. **Bypass Gatekeeper "Developer Cannot Be Verified" warning**:
   * Open **Finder** and navigate to your **Applications** folder.
   * **Right-click** (or Control-click) the `StackOrbitAI Bulk Writer Pro` app icon and choose **Open**.
   * A popup warning will appear. Click **Open** to confirm. macOS will save this exception, allowing the app to open by double-clicking in the future.
   * *Alternative terminal bypass*: Open Terminal and run:
     ```bash
     xattr -d com.apple.quarantine "/Applications/StackOrbitAI Bulk Writer Pro.app"
     ```

---

### 🐧 Linux Installation Guide

We provide both a portable **AppImage** and a **Debian/Ubuntu (.deb)** package.

#### Method A: AppImage (Recommended)
1. **Download**: Grab the `.AppImage` file from the releases list.
2. **Make Executable**:
   * **GUI**: Right-click the `.AppImage` file -> Properties -> Permissions -> Check "Allow executing file as program".
   * **Terminal**: Open a terminal in the folder containing your downloaded file and run:
     ```bash
     chmod +x stackorbitai-bulk-writer-pro-*.AppImage
     ```
3. **Run**: Double-click the `.AppImage` file to launch the application.

#### Method B: Debian/Ubuntu Package (.deb)
1. **Download**: Grab the `.deb` package file.
2. **Install**:
   * Double-click the `.deb` file to open it in your Software Center, then click **Install**.
   * Or run the following command in terminal:
     ```bash
     sudo dpkg -i stackorbitai-bulk-writer-pro_*.deb
     sudo apt-get install -f # Resolve any potential dependency issues
     ```

---

## 🔧 Installation & Local Setup

### Prerequisites
* **Node.js**: Version 18.0.0 or higher
* **npm**: Version 9.0.0 or higher

### 1. Install Dependencies
Run the command below in the project root directory. Use `--legacy-peer-deps` to bypass React 19 peer-dependency warnings from older third-party packages:
```bash
npm install --legacy-peer-deps
```

### 2. Start Development Workspace
Runs the React hot-reload Vite server and compiles/watches Electron main processes:
```bash
npm run dev
```

### 3. Build & Package Clean Desktop Executables
To build and package installer binaries for Windows (`.exe` NSIS installer) and macOS (`.dmg` installer):
```bash
# Package both platforms (cross-build configuration)
npm run package

# Package specifically for Windows
npm run package:win

# Package specifically for macOS
npm run package:mac
```
Packaged installer output files will be created in the `release/` directory.

---

## ⚙️ Integrations & Setup Details

### 🔑 WordPress Application Passwords
We utilize WordPress's native REST API. To establish connections securely:
1. Log in to your WordPress dashboard.
2. Go to **Users -> Profile**.
3. Scroll down to **Application Passwords**.
4. Type a label (e.g. `StackOrbitAI Desktop`) and click **Add New Application Password**.
5. Copy the generated 24-character password and paste it into the application connection form.

### 🔒 Credential Security (AES-256-GCM)
All API keys and WordPress Application Passwords are encrypted before storing in the database. 
* A cryptographically secure random key file is generated on first boot and stored outside the database folder at `AppData/Local/stackorbitai-bulk-writer-pro/.security.key`.
* This ensures that even if database exports are compromised, credentials remain fully protected.

### 📡 Local Express REST API Endpoints (Port 4890)
When the application is running, a local web server is launched in the background. You can trigger tasks remotely using simple JSON API calls:

* **Health Check**:
  `GET http://localhost:4890/health`
* **Trigger Task Queue**:
  `POST http://localhost:4890/api/tasks/:id/start`
* **Create Task Remotely**:
  `POST http://localhost:4890/api/tasks`
  ```json
  {
    "name": "API Task 1",
    "websiteId": 1,
    "providerId": 1,
    "model": "gpt-4o",
    "category": "Marketing",
    "keywords": ["SEO marketing guide", "AI copywriting"]
  }
  ```

---

## 🚀 CI/CD & Auto-Updater

The application features fully automated updates pulled from public GitHub releases.

### GitHub Actions Pipeline
The included workflow in `.github/workflows/build.yml` executes on tags:
1. Push a version tag:
   ```bash
   git tag v1.0.63
   git push origin v1.0.63
   ```
2. The pipeline checks out the project, installs dependencies, compiles assets, packages the binaries, and posts them to your repository releases list.

### Repository Updates Configuration
Ensure the `publish` block in `package.json` matches your organization and repo name:
   ```json
   "publish": {
     "provider": "github",
     "owner": "StackOrbitAI",
     "repo": "stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents",
     "private": false
   }
   ```
3. The app will automatically check for updates on boot, download them silently, and alert the user with a restart trigger once downloaded.
