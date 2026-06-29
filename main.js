const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  screen,
  Notification,
  net,
  protocol,
  session,
  globalShortcut,
  Tray,
  Menu,
} = require("electron");
const path = require("path");
const fs = require("fs");

const CONFIG_PATH = path.join(app.getPath("userData"), "qface-config.json");
let cameraWindow = null;
let dashboardWindow = null;
let settingsWindow = null;
let tray = null;
let trayMode = false; // <-- NEW: track tray mode state
let lastNotificationTime = 0;
const NOTIFICATION_COOLDOWN = 5000;
let lastKnownPerson = null;
let pollInterval = null;
let settingsPollInterval = null;

// Session-only switches
let autoPopupEnabled = true;
let localDetectionEnabled = true;

// Server settings (refreshed every 30s)
let serverSettings = {
  crop_x_start: 140,
  crop_x_end: 460,
  crop_y_start: 200,
  crop_y_end: 480,
  crop_region_enabled: true,
};

let config = {
  dashboardUrl: "http://localhost:8080",
};

let sessionCookie = "";

function removeTrailingSlash(str) {
  while (str.endsWith("/")) str = str.slice(0, -1);
  return str;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(data);
      let du = removeTrailingSlash(parsed.dashboardUrl);
      if (du) config = { ...config, ...parsed, dashboardUrl: du };
      trayMode = config.trayMode || false;
    }
  } catch (e) {}
}

function saveConfig() {
  try {
    config.trayMode = trayMode;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (e) {}
}

// ---------- Tray ----------
function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, "icons", "icon.png");
  if (!fs.existsSync(iconPath)) {
    console.warn("Tray icon not found, using default");
    tray = new Tray(iconPath);
  } else {
    tray = new Tray(iconPath);
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show QFACE",
      click: () => {
        if (cameraWindow) {
          cameraWindow.show();
          cameraWindow.focus();
          cameraWindow.setAlwaysOnTop(true);
        }
      },
    },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("QFACE Camera");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (cameraWindow) {
      if (cameraWindow.isVisible()) {
        cameraWindow.hide();
      } else {
        cameraWindow.show();
        cameraWindow.focus();
        cameraWindow.setAlwaysOnTop(true);
      }
    }
  });

  tray.on("double-click", () => {
    if (cameraWindow) {
      cameraWindow.show();
      cameraWindow.focus();
      cameraWindow.setAlwaysOnTop(true);
    }
  });
}

// ---------- Fetch server settings ----------
function fetchServerSettings() {
  if (!sessionCookie) return;
  const request = net.request({
    method: "GET",
    url: config.dashboardUrl + "/api/settings",
  });
  request.setHeader("Cookie", sessionCookie);
  request.setHeader("Accept", "application/json");
  const chunks = [];
  request.on("response", (response) => {
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      if (response.statusCode !== 200) return;
      try {
        const data = JSON.parse(Buffer.concat(chunks).toString());
        if (data.success && data.settings) {
          const s = data.settings;
          serverSettings = {
            crop_x_start: parseInt(s.crop_x_start?.value ?? 140),
            crop_x_end: parseInt(s.crop_x_end?.value ?? 460),
            crop_y_start: parseInt(s.crop_y_start?.value ?? 200),
            crop_y_end: parseInt(s.crop_y_end?.value ?? 480),
            crop_region_enabled:
              s.crop_region_enabled?.value === true ||
              s.crop_region_enabled?.value === "true",
            auto_open:
              s.door_auto_open?.value === true ||
              s.door_auto_open?.value === "true",
          };
          // Push to renderer
          if (cameraWindow && !cameraWindow.isDestroyed()) {
            cameraWindow.webContents
              .executeJavaScript(
                `
              window.__qface_crop__ = ${JSON.stringify(serverSettings)};
              if (window.__qface_auto_open_switch) {
                window.__qface_auto_open_switch.setChecked(${serverSettings.auto_open}, false);
              }
            `,
              )
              .catch(() => {});
          }
        }
      } catch (e) {}
    });
  });
  request.on("error", () => {});
  request.end();
}

function startSettingsPoll() {
  if (settingsPollInterval) clearInterval(settingsPollInterval);
  settingsPollInterval = setInterval(fetchServerSettings, 30000);
}

// ---------- Custom protocol ----------
function registerQfaceProtocol() {
  protocol.handle("qface", async (request) => {
    const url = request.url;

    // Stream proxy
    if (url.startsWith("qface://stream")) {
      try {
        const response = await net.fetch(
          config.dashboardUrl + "/api/proxy/stream",
          {
            headers: { Cookie: sessionCookie },
          },
        );
        return response;
      } catch (e) {
        console.error("QFACE stream proxy error:", e);
        return new Response("Stream unavailable", { status: 503 });
      }
    }

    // File serving
    let filePath = url.replace("qface://", "").replace(/\/$/, "");
    filePath = path.join(__dirname, filePath);
    if (!filePath.startsWith(__dirname)) {
      return new Response("Access denied", { status: 403 });
    }
    return net.fetch("file:///" + filePath.replace(/\\/g, "/"));
  });
}

function getCameraHtmlUrl() {
  return "file:///" + path.join(__dirname, "camera.html").replace(/\\/g, "/");
}

// ---------- Create camera window ----------
function createCameraWindow() {
  loadConfig();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  cameraWindow = new BrowserWindow({
    width: 432,
    height: 360,
    minWidth: 432,
    minHeight: 180,
    x: width - 420,
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icons", "icon.png"),
    show: false,
    backgroundColor: "#00000000",
  });

  cameraWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (trayMode) {
    cameraWindow.setSkipTaskbar(true);
    createTray();
  }

  // Prevent close from quitting
  cameraWindow.on("close", () => {
    app.quit();
  });

  function openLoginWindow() {
    if (dashboardWindow && !dashboardWindow.isDestroyed()) {
      dashboardWindow.focus();
      return;
    }
    dashboardWindow = new BrowserWindow({
      width: 480,
      height: 600,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      icon: path.join(__dirname, "icons", "icon.png"),
      title: "QFACE Login",
    });
    dashboardWindow.loadURL(config.dashboardUrl + "/login");

    dashboardWindow.webContents.on("did-finish-load", async () => {
      try {
        const url = new URL(config.dashboardUrl);
        const cookies = await session.defaultSession.cookies.get({
          url: url.origin,
        });
        const sc = cookies.find((c) => c.name === "session_token");
        if (sc) {
          sessionCookie = `session_token=${sc.value}`;
          dashboardWindow.close();
          if (cameraWindow && !cameraWindow.isDestroyed()) {
            const streamUrl = "qface://stream";
            cameraWindow.webContents
              .executeJavaScript(
                `window.setStreamUrl(${JSON.stringify(streamUrl)});`,
              )
              .catch(() => {});
            fetchServerSettings();
          }
        }
      } catch (e) {}
    });

    dashboardWindow.on("closed", () => {
      dashboardWindow = null;
    });
  }

  cameraWindow.webContents.on("did-finish-load", async () => {
    try {
      const url = new URL(config.dashboardUrl);
      const cookies = await session.defaultSession.cookies.get({
        url: url.origin,
      });
      const sc = cookies.find((c) => c.name === "session_token");

      if (sc) {
        sessionCookie = `session_token=${sc.value}`;
        const streamUrl = "qface://stream";
        cameraWindow.webContents
          .executeJavaScript(
            `window.setStreamUrl(${JSON.stringify(streamUrl)});`,
          )
          .catch(() => {});
        fetchServerSettings();
      } else {
        console.log("QFACE: No session cookie, opening login...");
        openLoginWindow();
      }
    } catch (e) {}
    if (cameraWindow && !cameraWindow.isDestroyed()) {
      cameraWindow.webContents
        .executeJavaScript(
        `
          if (window.__qface_tray) {
            window.__qface_tray.setChecked(${trayMode}, false);
          }
          `,
        )
        .catch(() => {});
    }
  });

  cameraWindow.webContents.on("did-fail-load", () => {
    console.error("Camera HTML load failed, retrying...");
    setTimeout(() => cameraWindow.loadURL(getCameraHtmlUrl()), 1000);
  });

  cameraWindow.webContents.on("dom-ready", () => {
    injectToolbar();
    if (localDetectionEnabled) injectLocalDetection();
  });

  cameraWindow.loadURL(getCameraHtmlUrl());

  cameraWindow.once("ready-to-show", () => cameraWindow.show());

  cameraWindow.on("closed", () => {
    cameraWindow = null;
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (settingsPollInterval) {
      clearInterval(settingsPollInterval);
      settingsPollInterval = null;
    }
  });

  startProxyPolling();
  startSettingsPoll();
  return cameraWindow;
}

// ---------- Toolbar injection ----------
function injectToolbar() {
  const script = `
    (function() {
      if (document.getElementById('qface-toolbar')) return;

      const toolbar = document.createElement('div');
      toolbar.id = 'qface-toolbar';
      toolbar.style.cssText = \`
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 36px;
        background: rgba(0,0,0,0.75);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        padding: 0 8px;
        z-index: 9999;
        gap: 6px;
        user-select: none;
        -webkit-app-region: drag;
      \`;

      const mkBtn = (text, title, bg) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.title = title;
        b.style.cssText = \`background:\${bg||'rgba(255,255,255,0.15)'};border:none;color:white;font-size:13px;padding:2px 7px;border-radius:4px;cursor:pointer;-webkit-app-region:no-drag;transition:background 0.15s;\`;
        return b;
      };

      const mkSwitch = (label, title, initialOn, onChange) => {
        const wrap = document.createElement('div');
        wrap.title = title;
        wrap.style.cssText = 'display:flex;align-items:center;gap:4px;-webkit-app-region:no-drag;cursor:pointer;';
        
        const track = document.createElement('div');
        let on = initialOn;
        const update = () => {
          track.style.background = on ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.2)';
          thumb.style.transform = on ? 'translateX(12px)' : 'translateX(1px)';
        };
        track.style.cssText = 'width:26px;height:14px;border-radius:7px;position:relative;transition:background 0.2s;';
        
        const thumb = document.createElement('div');
        thumb.style.cssText = 'position:absolute;top:1px;width:12px;height:12px;background:white;border-radius:50%;transition:transform 0.2s;';
        track.appendChild(thumb);
        update();

        const lbl = document.createElement('span');
        lbl.textContent = label;
        lbl.style.cssText = 'color:rgba(255,255,255,0.8);font-size:10px;font-family:system-ui;';

        // Store reference to track and thumb for external update
        wrap.dataset.checked = on ? 'true' : 'false';
        wrap.setChecked = (newOn, onC = true) => {
          on = newOn;
          update();
          wrap.dataset.checked = on ? 'true' : 'false';
          if (onChange && onC) onChange(on);
        };

        wrap.addEventListener('click', () => {
          const newOn = !on;
          wrap.setChecked(newOn);
        });

        wrap.appendChild(track);
        wrap.appendChild(lbl);
        return wrap;
      };

      const drag = document.createElement('div');
      drag.style.cssText = 'flex:1;height:100%;-webkit-app-region:drag;';

      // --- Pin button ---
      const pinBtn = mkBtn('📌', 'Toggle always on top');
      let pinned = true;
      pinBtn.addEventListener('click', () => {
        pinned = !pinned;
        pinBtn.textContent = pinned ? '📌' : '📍';
        pinBtn.style.opacity = pinned ? '1' : '0.5';
        window.electronAPI.toggleAlwaysOnTop(pinned);
      });

      // --- Minimize button ---
      const minBtn = mkBtn('➖', 'Minimize');
      minBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());

      // --- Door button ---
      const doorBtn = mkBtn('🚪', 'Open Door', 'rgba(34,197,94,0.5)');
      doorBtn.addEventListener('mouseenter', () => doorBtn.style.background = 'rgba(34,197,94,0.8)');
      doorBtn.addEventListener('mouseleave', () => doorBtn.style.background = 'rgba(34,197,94,0.5)');
      doorBtn.addEventListener('click', () => {
        doorBtn.textContent = '⏳';
        doorBtn.disabled = true;
        window.electronAPI.openDoor().then(ok => {
          doorBtn.textContent = ok ? '✅' : '❌';
          setTimeout(() => { doorBtn.textContent = '🚪'; doorBtn.disabled = false; }, 2000);
        });
      });

      // --- Dashboard button ---
      const dashBtn = mkBtn('📊', 'Dashboard');
      dashBtn.addEventListener('click', () => window.electronAPI.openDashboard());

      // --- MORE DROPDOWN (⋮) ---
      const dropdownContainer = document.createElement('div');
      dropdownContainer.style.cssText = 'position:relative; -webkit-app-region:no-drag;';

      const moreBtn = mkBtn('⋮', 'More options');
      moreBtn.style.fontSize = '18px';
      moreBtn.style.padding = '0 4px';
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const content = dropdownContainer.querySelector('.dropdown-content');
        content.style.display = content.style.display === 'flex' ? 'none' : 'flex';
      });

      const dropdownContent = document.createElement('div');
      dropdownContent.className = 'dropdown-content';
      dropdownContent.style.cssText = \`
        display: none;
        position: absolute;
        right: 0;
        top: 28px;
        background: rgba(20,20,20,0.92);
        backdrop-filter: blur(8px);
        border-radius: 8px;
        padding: 8px;
        min-width: 180px;
        flex-direction: column;
        gap: 6px;
        z-index: 10000;
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      \`;

      // --- Get initial auto_open state ---
      let initialAutoOpen = true;
      window.electronAPI.getAutoOpenDoor().then(val => {
        if (val !== null) {
          initialAutoOpen = val;
          if (window.__qface_auto_open_switch) {
            window.__qface_auto_open_switch.setChecked(initialAutoOpen, false);
          }
        }
      });
      let initialAutoStart = false;
      window.electronAPI.getAutoStart().then(val => {
        initialAutoStart = val;
        if (window.__qface_auto_start_switch) {
          window.__qface_auto_start_switch.setChecked(initialAutoStart);
        }
      });

      // Switches (Popup, Detect, Crop, AutoOpen, Tray, AutoStart)
      const popupSwitch = mkSwitch('Popup', 'Auto popup on detection', true, (on) => {
        window.electronAPI.setAutoPopup(on);
      });
      const detectSwitch = mkSwitch('Detect', 'Local face detection', true, (on) => {
        window.electronAPI.setLocalDetection(on);
      });
      const cropSwitch = mkSwitch('Crop', 'Show server crop region', false, (on) => {
        window.toggleCropOverlay(on);
      });
      const autoOpenSwitch = mkSwitch('Auto door open', 'Automatically open door', initialAutoOpen, (on) => {
        window.electronAPI.setAutoOpenDoor(on);
      });
      const traySwitch = mkSwitch('Tray', 'Hide from taskbar', false, (on) => {
        window.electronAPI.setTrayMode(on);
      });
      const autoStartSwitch = mkSwitch('Auto Start', 'Launch with Windows', initialAutoStart, (on) => {
        window.electronAPI.setAutoStart(on);
      });



      // Store reference for external updates
      window.__qface_auto_open_switch = autoOpenSwitch;
      window.__qface_auto_start_switch = autoStartSwitch;
      window.__qface_tray = traySwitch;

      // Settings button (inside dropdown)
      const settingsBtn = mkBtn('⚙️ Settings', 'Open Settings');
      settingsBtn.style.width = '100%';
      settingsBtn.style.textAlign = 'left';
      settingsBtn.style.padding = '4px 8px';
      settingsBtn.addEventListener('click', () => {
        window.electronAPI.openSettings();
        dropdownContent.style.display = 'none';
      });

      // Separator
      const sep = document.createElement('div');
      sep.style.cssText = 'width:100%;height:1px;background:rgba(255,255,255,0.1);margin:2px 0;';

      dropdownContent.appendChild(popupSwitch);
      dropdownContent.appendChild(detectSwitch);
      dropdownContent.appendChild(cropSwitch);
      dropdownContent.appendChild(autoOpenSwitch);
      dropdownContent.appendChild(traySwitch);
      dropdownContent.appendChild(autoStartSwitch);
      dropdownContent.appendChild(sep);
      dropdownContent.appendChild(settingsBtn);

      dropdownContainer.appendChild(moreBtn);
      dropdownContainer.appendChild(dropdownContent);

      // Close dropdown when clicking elsewhere
      document.addEventListener('click', () => {
        dropdownContent.style.display = 'none';
      });

      // --- Close button: hide to tray ---
      const closeBtn = mkBtn('✕', 'Hide to tray', 'rgba(220,50,50,0.5)');
      closeBtn.addEventListener('mouseenter', () => closeBtn.style.background = 'rgba(220,50,50,0.8)');
      closeBtn.addEventListener('mouseleave', () => closeBtn.style.background = 'rgba(220,50,50,0.5)');
      closeBtn.addEventListener('click', () => {
        window.electronAPI.closeCameraWindow();
      });

      // Assemble toolbar
      [drag, doorBtn, dashBtn, pinBtn, dropdownContainer, minBtn, closeBtn]
        .forEach(el => toolbar.appendChild(el));
      document.body.appendChild(toolbar);

      // Adjust stream image
      const img = document.getElementById('stream');
      if (img) {
        img.style.marginTop = '36px';
        img.style.height = 'calc(100% - 36px)';
      }
    })();
  `;

  cameraWindow.webContents.executeJavaScript(script).catch((err) => {
    console.error("Toolbar injection error:", err);
  });
}

// ---------- Local face detection ----------
function injectLocalDetection() {
  const faceApiPath = path.join(__dirname, "face-api.js");
  if (!fs.existsSync(faceApiPath)) {
    console.warn("face-api.js not found — local detection disabled");
    return;
  }

  const initialCrop = JSON.stringify(serverSettings);

  const script = `
    (function() {
      if (document.getElementById('qface-faceapi')) return;

      window.__qface_crop__ = ${initialCrop};
      window.__qface_detect_enabled__ = true;

      const s = document.createElement('script');
      s.id = 'qface-faceapi';
      s.src = 'qface://face-api.js';
      s.onload = () => startDetection();
      s.onerror = (e) => console.error('QFACE: face-api load error', e);
      document.head.appendChild(s);

      function startDetection() {
        if (typeof faceapi === 'undefined') { setTimeout(startDetection, 200); return; }
        faceapi.nets.ssdMobilenetv1.loadFromUri('qface://models/').then(() => {
          console.log('QFACE: SSD MobileNet loaded');
          runDetectionLoop();
        }).catch(err => console.error('QFACE: Model load error:', err));
      }

      function runDetectionLoop() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        let lastDetection = 0;
        let detecting = false;

        setInterval(() => {
          if (!window.__qface_detect_enabled__) return;

          const img = document.getElementById('stream');
          if (!img || img.naturalWidth === 0) return;

          if (canvas.width !== img.naturalWidth && img.naturalWidth > 0) {
            canvas.width  = img.naturalWidth;
            canvas.height = img.naturalHeight;
          }

          const now = Date.now();
          if (detecting || now - lastDetection < 5000) return;

          detecting = true;
          lastDetection = now;

          try {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          } catch(e) { detecting = false; return; }

          const crop = window.__qface_crop__;
          if (crop && crop.crop_region_enabled) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(
              crop.crop_x_start,
              crop.crop_y_start,
              crop.crop_x_end - crop.crop_x_start,
              crop.crop_y_end - crop.crop_y_start
            );
          }

          faceapi.detectAllFaces(canvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 })
          ).then(detections => {
            console.log('QFACE local detections:', detections.length);
            if (detections.length > 0) {
              const det = detections[0].box;
              const pad = 20;
              const x = Math.max(0, det.x - pad);
              const y = Math.max(0, det.y - pad);
              const w = Math.min(canvas.width  - x, det.width  + pad * 2);
              const h = Math.min(canvas.height - y, det.height + pad * 2);
              const cropCanvas = document.createElement('canvas');
              cropCanvas.width  = w;
              cropCanvas.height = h;
              cropCanvas.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, w, h);
              window.electronAPI.faceDetectedWithCrop(cropCanvas.toDataURL('image/png'));
            }
            detecting = false;
          }).catch(() => { detecting = false; });
        }, 2000);
      }
    })();
  `;

  cameraWindow.webContents.executeJavaScript(script).catch((err) => {
    console.error("Local detection injection error:", err);
  });
}

// ---------- Proxy polling ----------
function downloadToTemp(url, callback) {
  const tempPath = path.join(app.getPath("temp"), "qface_notif.jpg");
  const request = net.request({ method: "GET", url });
  request.setHeader("Cookie", sessionCookie);
  const chunks = [];
  request.on("response", (response) => {
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      try {
        fs.writeFileSync(tempPath, Buffer.concat(chunks));
        callback(tempPath.replace(/\\/g, "/"));
      } catch (e) {
        console.error("QFACE download error:", e);
        callback(null);
      }
    });
  });
  request.on("error", (e) => {
    console.error("QFACE download error:", e);
    callback(null);
  });
  request.end();
}

function startProxyPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => {
    if (!cameraWindow || !sessionCookie) return;

    const request = net.request({
      method: "GET",
      url: config.dashboardUrl + "/api/proxy/face_detected",
    });
    request.setHeader("Cookie", sessionCookie);
    request.setHeader("Accept", "application/json");
    const chunks = [];
    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) return;
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          if (data.detected === true) triggerNotification("Proxy", data);
        } catch (e) {}
      });
    });
    request.on("error", () => {});
    request.end();
  }, 1500);
}

function triggerDoorOpen(callback = null) {
  const request = net.request({
    method: "POST",
    url: config.dashboardUrl + "/api/proxy/door",
  });
  request.setHeader("Cookie", sessionCookie);
  request.setHeader("Content-Type", "application/json");
  request.on("response", (response) => {
    response.on("data", () => {});
    response.on("end", () => {
      const ok = response.statusCode === 200;
      if (callback) callback(ok);
      if (ok) {
        new Notification({
          title: "🚪 Door Opened",
          body: "Door triggered successfully",
          icon: path.join(__dirname, "icons", "icon.png"),
        }).show();
      }
    });
  });
  request.on("error", () => {
    if (callback) callback(false);
  });
  request.write(JSON.stringify({ door_id: 1, action: "open" }));
  request.end();
}

function triggerNotification(source, data = null) {
  const now = Date.now();

  if (source === "Proxy" && data !== null && lastKnownPerson !== data.name) {
    lastKnownPerson = data.name;
  } else if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) return;

  lastNotificationTime = now;

  if (autoPopupEnabled && cameraWindow) {
    cameraWindow.show();
    cameraWindow.setAlwaysOnTop(true);
  }

  if (!Notification.isSupported()) return;

  if (data?.image) {
    const imageUrl = `${config.dashboardUrl}/api/proxy/log_image/${data.image}`;
    downloadToTemp(imageUrl, (tempPath) => {
      const isRecognised = data.recognised === true;
      const isAllowed = data.allowed === true;

      let title, body;
      if (isRecognised && isAllowed) {
        title = `✅ ${data.name}`;
        body = `Access granted — ${data.confidence?.toFixed(1)}%`;
      } else if (isRecognised && !isAllowed) {
        title = `⛔ ${data.name}`;
        body = `Access denied — outside allowed hours`;
      } else {
        title = `❌ ${data.name}`;
        body = `Face detected but not recognised`;
      }

      const notification = new Notification({
        title,
        body,
        icon: tempPath || path.join(__dirname, "icons", "icon.png"),
        urgency: isRecognised && isAllowed ? "normal" : "critical",
        actions: [{ type: "button", text: "🚪 Open Door" }],
        hasReply: false,
      });

      notification.on("action", (_, index) => {
        if (index === 0) triggerDoorOpen();
      });

      notification.show();
    });
  } else {
    new Notification({
      title: "👤 Face Detected",
      body: `Detected by ${source}`,
      icon: data?.iconPath || path.join(__dirname, "icons", "icon.png"),
    }).show();
  }
}

// ---------- Settings window ----------
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 480,
    height: 400,
    resizable: false,
    modal: true,
    parent: cameraWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "icons", "icon.png"),
    show: false,
    backgroundColor: "#fff",
  });
  settingsWindow.loadFile("settings.html");
  settingsWindow.once("ready-to-show", () => settingsWindow.show());
  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

// ---------- IPC handlers ----------
ipcMain.handle("toggle-always-on-top", (_, pinned) => {
  if (cameraWindow) cameraWindow.setAlwaysOnTop(pinned, "normal");
});

ipcMain.handle("open-door", () => {
  return new Promise((resolve) => triggerDoorOpen(resolve));
});

ipcMain.handle("minimize-window", () => {
  if (cameraWindow) cameraWindow.minimize();
});

ipcMain.handle("open-dashboard", () => {
  if (!dashboardWindow) {
    dashboardWindow = new BrowserWindow({
      width: 1280,
      height: 860,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
      icon: path.join(__dirname, "icons", "icon.png"),
    });
    dashboardWindow.loadURL(config.dashboardUrl);
    dashboardWindow.on("closed", () => {
      dashboardWindow = null;
    });
  } else {
    dashboardWindow.focus();
  }
});

ipcMain.handle("open-settings", () => createSettingsWindow());

ipcMain.handle("close-camera-window", () => {
  if (cameraWindow) {
    app.isQuitting = true;
    cameraWindow.close();
    app.quit();
  }
});

ipcMain.handle("close-settings", () => {
  if (settingsWindow) settingsWindow.close();
});

ipcMain.handle("get-config", () => {
  loadConfig();
  return config;
});

ipcMain.handle("save-config", (_, newConfig) => {
  config = { ...config, ...newConfig };
  saveConfig();
  if (cameraWindow) cameraWindow.loadURL(getCameraHtmlUrl());
});

ipcMain.handle("set-auto-popup", (_, enabled) => {
  autoPopupEnabled = enabled;
});

ipcMain.handle("get-auto-open-door", async () => {
  return new Promise((resolve) => {
    if (!sessionCookie) {
      resolve(null);
      return;
    }
    const request = net.request({
      method: "GET",
      url: config.dashboardUrl + "/api/settings/auto_open",
    });
    request.setHeader("Cookie", sessionCookie);
    request.setHeader("Accept", "application/json");
    const chunks = [];
    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          resolve(data.value === true);
        } catch (e) {
          resolve(null);
        }
      });
    });
    request.on("error", () => resolve(null));
    request.end();
  });
});

ipcMain.handle("set-auto-open-door", (_, enabled) => {
  return new Promise((resolve) => {
    const request = net.request({
      method: "PUT",
      url: config.dashboardUrl + "/api/settings/auto_open",
    });
    request.setHeader("Cookie", sessionCookie);
    request.setHeader("Content-Type", "application/json");
    const body = JSON.stringify({ value: enabled });
    request.on("response", (response) => {
      response.on("data", () => {});
      response.on("end", () => {
        const ok = response.statusCode === 200;
        if (ok) {
          serverSettings.auto_open = enabled;
          if (cameraWindow && !cameraWindow.isDestroyed()) {
            cameraWindow.webContents
              .executeJavaScript(
                `if (window.__qface_auto_open_switch) window.__qface_auto_open_switch.setChecked(${enabled}, false);`,
              )
              .catch(() => {});
          }
          new Notification({
            title: `${enabled ? "✅" : "❌"} Auto door open: ${enabled ? "On" : "Off"}`,
            icon: path.join(__dirname, "icons", "icon.png"),
          }).show();
        }
        resolve(ok);
      });
    });
    request.on("error", () => resolve(false));
    request.write(body);
    request.end();
  });
});

// ---------- NEW: Tray mode handler ----------
ipcMain.handle("set-tray-mode", (_, enabled) => {
  trayMode = enabled;
  config.trayMode = enabled;
  saveConfig();
  if (cameraWindow) {
    if (enabled) {
      cameraWindow.setSkipTaskbar(true);
      createTray();
    } else {
      cameraWindow.setSkipTaskbar(false);
      if (tray) {
        tray.destroy();
        tray = null;
      }
      cameraWindow.show();
      cameraWindow.focus();
    }
  }
  return { success: true };
});

ipcMain.handle("set-local-detection", (_, enabled) => {
  localDetectionEnabled = enabled;
  if (cameraWindow && !cameraWindow.isDestroyed()) {
    cameraWindow.webContents
      .executeJavaScript(`window.__qface_detect_enabled__ = ${enabled};`)
      .catch(() => {});
    if (enabled) injectLocalDetection();
  }
});

ipcMain.handle("face-detected", () => {
  triggerNotification("Local", null);
});

ipcMain.handle("face-detected-with-crop", (_, dataUrl) => {
  if (cameraWindow && !cameraWindow.isDestroyed()) {
    cameraWindow.webContents
      .executeJavaScript(
        `window.__qface_crop_dataurl__ = ${JSON.stringify(dataUrl)};`,
      )
      .then(() => {
        const resizeScript = `
        (function() {
          const offscreen = new OffscreenCanvas(64, 64);
          const octx = offscreen.getContext('2d');
          const img = new Image();
          img.onload = () => {
            octx.drawImage(img, 0, 0, 64, 64);
            offscreen.convertToBlob({ type: 'image/png' }).then(blob => {
              blob.arrayBuffer().then(buf => {
                window.electronAPI.saveCropIcon(Array.from(new Uint8Array(buf)));
              });
            });
          };
          img.onerror = (e) => console.error('QFACE crop error', e);
          img.src = window.__qface_crop_dataurl__;
        })();
      `;
        cameraWindow.webContents
          .executeJavaScript(resizeScript)
          .catch(() => {});
      })
      .catch(() => {});
  }
});

ipcMain.handle("save-crop-icon", (_, bytes) => {
  const now = Date.now();
  if (now - lastNotificationTime < NOTIFICATION_COOLDOWN) return;
  const tempPath = path
    .join(app.getPath("temp"), "qface_face.png")
    .replace(/\\/g, "/");
  fs.writeFileSync(tempPath, Buffer.from(bytes));
  triggerNotification("Local", { iconPath: tempPath });
});

ipcMain.handle("set-auto-start", (_, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true, // start minimized to tray
  });
  return { success: true };
});

ipcMain.handle("get-auto-start", () => {
  return app.getLoginItemSettings().openAtLogin;
});

// ---------- App setup ----------
app.setPath("userData", path.join(app.getPath("appData"), "QFACECamera"));
app.setAppUserModelId("com.qface.camera");
app.setName("QFACE Camera");
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu-shader-disk-cache");
app.commandLine.appendSwitch(
  "disk-cache-dir",
  path.join(app.getPath("temp"), "qface-cache"),
);

protocol.registerSchemesAsPrivileged([
  {
    scheme: "qface",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.whenReady().then(() => {
  globalShortcut.register("Shift+F8", () => {
    if (cameraWindow) {
      if (cameraWindow.webContents.isDevToolsOpened()) {
        cameraWindow.webContents.closeDevTools();
      } else {
        cameraWindow.webContents.openDevTools({ mode: "detach" });
      }
    }
  });
  registerQfaceProtocol();
  createCameraWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createCameraWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", (event) => {
  if (tray) {
    event.preventDefault();
  }
});
