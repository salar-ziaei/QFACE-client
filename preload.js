const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  toggleAlwaysOnTop:    (pinned)  => ipcRenderer.invoke('toggle-always-on-top', pinned),
  minimizeWindow:       ()        => ipcRenderer.invoke('minimize-window'),
  openDashboard:        ()        => ipcRenderer.invoke('open-dashboard'),
  openSettings:         ()        => ipcRenderer.invoke('open-settings'),
  openDoor:             ()        => ipcRenderer.invoke('open-door'),
  closeCameraWindow:    ()        => ipcRenderer.invoke('close-camera-window'),
  closeSettings:        ()        => ipcRenderer.invoke('close-settings'),
  getConfig:            ()        => ipcRenderer.invoke('get-config'),
  saveConfig:           (config)  => ipcRenderer.invoke('save-config', config),
  faceDetected:         ()        => ipcRenderer.invoke('face-detected'),
  faceDetectedWithCrop: (dataUrl) => ipcRenderer.invoke('face-detected-with-crop', dataUrl),
  saveCropIcon:         (bytes)   => ipcRenderer.invoke('save-crop-icon', bytes),
  setAutoPopup:         (enabled) => ipcRenderer.invoke('set-auto-popup', enabled),
  setLocalDetection:    (enabled) => ipcRenderer.invoke('set-local-detection', enabled),
  setAutoOpenDoor:      (enabled) => ipcRenderer.invoke('set-auto-open-door', enabled),
  getAutoOpenDoor:      () => ipcRenderer.invoke('get-auto-open-door'),
  setTrayMode:          (enabled) => ipcRenderer.invoke('set-tray-mode', enabled),
  getAutoStart:         () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart:         (enabled) => ipcRenderer.invoke('set-auto-start', enabled),
});
