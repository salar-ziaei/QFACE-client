<div align="center">

# QFACE Client

### Desktop Camera Client for QFACE

A lightweight Electron application that connects cameras to the QFACE Server, streams video in real time, and enables centralized face recognition across distributed locations.

[![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)]()
[![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=black)]()
[![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)]()
[![AGPLv3](https://img.shields.io/badge/License-AGPLv3-red)]()

<img src="docs/client.png" width="100%">

**QFACE Client securely connects local cameras to the QFACE platform, allowing centralized monitoring and face recognition without exposing cameras directly to the network.**

</div>

---

# Features

## Camera Streaming

- USB camera support
- IP camera support
- RTSP stream support
- Real-time video transmission
- Automatic reconnection
- Low-latency streaming

---

## Device Management

- Register client devices
- Automatic server connection
- Device authentication
- Remote configuration
- Connection status monitoring
- Device identification

---

## Recognition Integration

- Streams camera frames to QFACE Server
- Receives recognition events
- Supports multiple camera sources
- Real-time communication
- WebSocket integration

---

## Reliability

- Automatic reconnect
- Background operation
- Connection recovery
- Error reporting
- Health monitoring
- Stable long-running sessions

---

# Technology Stack

| Category | Technology |
|----------|------------|
| Desktop Framework | Electron |
| Frontend | React |
| Runtime | Node.js |
| Build Tool | Vite |
| Communication | REST API |
| Real-Time | WebSocket |

---

# Architecture

```
      USB / IP Camera
              │
              │
      QFACE Client
      (Electron App)
              │
     REST / WebSocket
              │
        QFACE Server
              │
     Face Recognition
              │
    QFACE Dashboard
```

---

# Project Structure

```
QFACE-client
│
├── electron/
├── public/
├── src/
│   ├── assets/
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   ├── utils/
│   └── styles/
│
├── package.json
├── vite.config.js
└── README.md
```

---

# Installation

Clone the repository.

```bash
git clone https://github.com/salar-ziaei/QFACE-client

cd QFACE-client
```

Install dependencies.

```bash
npm install
```

---

# Development

Start the development environment.

```bash
npm run dev
```

---

# Build

Create a production build.

```bash
npm run build
```

Package the desktop application.

```bash
npm run dist
```

---

# Configuration

Configure the client to connect to your QFACE Server.

Typical settings include:

- Server URL
- Authentication token
- Device identifier
- Camera configuration
- Streaming options
- Auto-start preferences

---

# Workflow

```
Launch Client

        │

Connect to Server

        │

Authenticate Device

        │

Start Camera

        │

Stream Frames

        │

Recognition Results

        │

Display in Dashboard
```

---

# Device Communication

The client communicates with the server to:

- Register devices
- Send camera frames
- Receive commands
- Report health status
- Synchronize configuration
- Receive recognition notifications

---

# Screenshots

## Client Home

![](docs/client.png)

---

## Camera Configuration

![](docs/camera-settings.png)

---

## Device Status

![](docs/device-status.png)

---

## Live Camera

![](docs/live-camera.png)

---

# Deployment

QFACE Client can be deployed on:

- Windows
- Linux

Typical deployment scenarios include:

- Office entrances
- Factory gates
- Reception desks
- Schools
- Warehouses
- Retail stores
- Security checkpoints

---

# Integration

Works seamlessly with:

| Component | Purpose |
|-----------|---------|
| QFACE Server | Face recognition backend |
| QFACE Dashboard | Administration and monitoring |
| WebSocket Services | Real-time communication |

---

# Security

- Secure device authentication
- Encrypted communication
- JWT support
- Automatic session management
- Controlled device registration

---

# Roadmap

- [x] Desktop Client
- [x] Camera Streaming
- [x] Server Communication
- [x] Device Registration
- [x] Automatic Reconnection
- [ ] Multi-camera per Client
- [ ] Automatic Updates
- [ ] Offline Buffering
- [ ] Local Recognition Cache
- [ ] Hardware Monitoring
- [ ] Edge AI Processing

---

# Contributing

Contributions are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Push the branch.
5. Open a Pull Request.

---

# License

Licensed under the **GNU Affero General Public License v3.0 (AGPLv3).**

Commercial licensing is available for organizations requiring proprietary use.

---

<div align="center">

### Part of the QFACE Ecosystem

⭐ If QFACE helps your organization, consider giving this project a star.

</div>
