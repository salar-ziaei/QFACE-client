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
Configuration
The app reads settings from qface-config.json (created automatically). You can also adjust the dashboard URL via the Settings window or by editing the file:

json
{
  "dashboardUrl": "http://localhost:8080",
  "faceDetectionProxyUrl": "http://localhost:8080/api/proxy/face_detected",
  "rotation": 0
}

Development
bash
npm start
Build
bash
npm run build
The output will be in the dist/ folder (installer for Windows, AppImage for Linux, DMG for macOS).

Usage
Ensure the QFACE Server is running.

Launch the client – it will automatically detect your session cookie and load the camera stream.

Use the toolbar to open the door, access the dashboard, or toggle settings.

Click the close button (✕) to hide the window to the system tray (right‑click the tray icon to quit).

License
This project is licensed under the MIT License – see the LICENSE file for details.