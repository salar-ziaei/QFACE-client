# QFACE Client – Desktop Camera Widget

QFACE Client is an Electron‑based desktop application that provides a floating, pin‑able camera window with face detection, door control, and system tray integration. It connects to the QFACE Server to stream video and trigger door actions.

## Features

- **Always‑on‑top camera window** with minimal UI.
- **Local face detection** using `face-api.js` (SSD MobileNet) – works offline.
- **Proxy polling** to the server for face detection status.
- **System tray** support – hide to tray, auto‑start with Windows.
- **Toolbar buttons**: Pin, Minimize, Open Door, Dashboard, Settings, Hide to tray.
- **Dropdown switches**: Popup, Detect, Crop, Auto Door Open, Tray, Auto Start.
- **Custom protocol** (`qface://`) for serving static assets and streaming video.
- **Persistent configuration** (`qface-config.json`) for dashboard URL, rotation, and proxy settings.

## Requirements

- Node.js 18+
- npm or yarn
- A running QFACE Server (camera + recognition + main servers)

## Installation

```bash
git clone https://github.com/salar-ziaei/QFACE-client.git
cd QFACE-client
npm install