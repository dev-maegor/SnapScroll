# SnapScroll

<p align="center">
  <strong>Full-page screenshots, without the manual scrolling.</strong><br>
  Capture long and scrollable webpages as one seamless image or a single-page PDF.
</p>

<p align="center">
  <a href="https://github.com/dev-maegor">
    <img src="https://img.shields.io/badge/creator-dev--maegor-181717?logo=github&logoColor=white" alt="Creator">
  </a>
  <img src="https://img.shields.io/badge/Microsoft%20Edge-Extension-0078D4?logo=microsoftedge&logoColor=white" alt="Microsoft Edge Extension">
  <img src="https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white" alt="Manifest V3">
  <img src="https://img.shields.io/badge/version-20.3.0-2563EB" alt="Version 20.3.0">
</p>

---

## What is SnapScroll?

SnapScroll is a Microsoft Edge extension for capturing **complete, scrollable webpages** as a single continuous screenshot.

Instead of manually taking several screenshots and joining them together, SnapScroll automatically detects the page's scrolling area, captures it section by section, and stitches the sections into one continuous result.

It also supports webpages that use **nested scrolling containers**, which are common in web applications.

### Highlights

- 📸 Capture an entire scrollable webpage
- 🧩 Seamlessly stitch multiple viewport captures
- 🖥️ Handle nested scroll containers
- 🖼️ Export as PNG or JPG
- 📄 Export as a single tall PDF
- 📝 Keep PDF text selectable and copyable
- 🗂️ Keep a local history of previous captures
- ↻ Re-download previous captures
- 🗑️ Delete individual history entries
- ⬇️ Save exports through the browser's normal Downloads system
- 🔒 No account or external screenshot-processing service required

---

## Features

### Full-page capture

Click **Capture full page** and SnapScroll automatically scrolls through the page and combines the captured sections into one continuous image.

This is designed for long pages where a normal viewport screenshot is not enough.

### Nested scroll support

Many modern websites do not scroll the entire document. Instead, they place the main content inside a scrollable element.

SnapScroll identifies the relevant scroll container and captures its contents while preserving the surrounding page/application chrome where required.

### Multiple export formats

After a capture is complete, export it as:

| Format | Description |
|---|---|
| **PNG** | Lossless full-page image |
| **JPG** | Compressed image suitable for smaller files |
| **PDF** | One continuous, tall PDF page |

### Selectable PDF text

The PDF export includes a text layer in addition to the captured page image, allowing text to be selected and copied instead of producing a purely image-only PDF.

### Capture history

SnapScroll keeps a local history of recent captures.

From the dashboard you can:

- download an earlier capture again;
- choose PNG, JPG, or PDF;
- remove individual captures;
- see the capture dimensions and page information.

The extension keeps up to **20 recent captures**.

### Browser Downloads

Exports are sent to the browser's configured download location rather than forcing a save-location dialog for every screenshot.

---

## Installation

### Install from source

1. Clone this repository:

   ```bash
   git clone https://github.com/dev-maegor/SnapScroll.git
   ```

2. Open Microsoft Edge and navigate to:

   ```text
   edge://extensions/
   ```

3. Enable **Developer mode**.

4. Select **Load unpacked**.

5. Choose the cloned `SnapScroll` directory.

6. Pin SnapScroll to the Edge toolbar for quick access.

> The exact repository URL may differ if the GitHub repository is given another name.

---

## Project structure

```text
SnapScroll/
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
│
├── background.js
├── manifest.json
├── popup.html
├── popup.css
├── popup.js
│
├── .gitattributes
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
├── README.md
└── SECURITY.md
```

### Architecture

```text
┌──────────────────────┐
│     Edge Popup       │
│      popup.html      │
└──────────┬───────────┘
           │
           │ capture request
           ▼
┌──────────────────────┐
│   Background Worker  │
│    background.js     │
└──────────┬───────────┘
           │
           ├── inspect page
           ├── find scroll container
           ├── scroll incrementally
           ├── capture viewport
           └── stitch captures
           │
           ▼
┌──────────────────────┐
│    Export Pipeline   │
│   PNG / JPG / PDF    │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ Local Capture History│
│       IndexedDB      │
└──────────────────────┘
```

---

## Permissions

SnapScroll uses a small set of browser permissions required for its core functionality.

| Permission | Why it is needed |
|---|---|
| `activeTab` | Access the webpage the user explicitly chooses to capture |
| `scripting` | Inspect the page and control the relevant scroll container during capture |
| `downloads` | Save user-requested PNG, JPG, and PDF exports |

SnapScroll does not request broad host permissions for every website.

---

## Privacy

SnapScroll is designed to process captures locally in the browser.

The extension does not require:

- an account;
- a screenshot-processing server;
- a cloud storage account;
- an analytics service.

Capture history is stored locally by the extension using browser storage.

The extension's source code is available in this repository so its behavior can be inspected directly.

---

## Development

SnapScroll is a Manifest V3 browser extension and does not require a build system for local development.

After changing source files:

1. Open `edge://extensions/`.
2. Find SnapScroll.
3. Click **Reload**.
4. Open the extension and test the changed behavior.

### Testing checklist

When modifying the capture engine, test at least:

- [ ] Normal long webpage
- [ ] Very long webpage
- [ ] Page with nested scrolling
- [ ] Page with fixed/sticky header
- [ ] Gmail or another application with its own scroll container
- [ ] PNG export
- [ ] JPG export
- [ ] PDF export
- [ ] PDF text selection
- [ ] Capture history
- [ ] Re-download from history
- [ ] Delete history item
- [ ] Browser Downloads behavior

---

## Known limitations

Browser screenshot APIs have platform and page-specific constraints. Extremely large webpages can require substantial memory during stitching.

Some websites also implement custom scrolling, virtualization, lazy loading, or protected browser surfaces that can affect what a browser extension is able to capture.

SnapScroll is designed to handle common document and nested-scroll layouts, but no browser extension can guarantee identical behavior on every website.

---

## Roadmap

Potential future improvements include:

- [ ] Capture selected page regions
- [ ] Capture specific DOM elements
- [ ] More export-quality controls
- [ ] Optional filename customization
- [ ] Better handling for highly dynamic/virtualized pages
- [ ] Additional browser support

---

## Contributing

Contributions, bug reports, and suggestions are welcome.

Before opening a pull request:

1. Keep the extension focused on full-page webpage capture.
2. Test the capture engine on multiple page layouts.
3. Avoid adding unnecessary permissions.
4. Keep the extension free of remote executable code.
5. Update the documentation when behavior changes.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the basic contribution guidelines.

---

## Bug reports

When reporting a capture problem, include:

- Microsoft Edge version
- SnapScroll version
- Website where the problem occurred
- Whether the page uses nested scrolling
- Export format that failed
- What was expected
- What actually happened

Avoid including screenshots or captured pages containing passwords, personal messages, payment information, or other sensitive data.

---

## Creator

**SnapScroll is created by [dev-maegor](https://github.com/dev-maegor).**

- GitHub: https://github.com/dev-maegor

---

## License

SnapScroll is released under the [MIT License](LICENSE).
