import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("splitAll", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  pickFiles: () => ipcRenderer.invoke("files:pick"),
  pickFolders: () => ipcRenderer.invoke("folders:pick"),
  createJob: (payload) => ipcRenderer.invoke("jobs:create", payload),
  getJob: (jobId) => ipcRenderer.invoke("jobs:get", jobId),
  getJobResult: (jobId) => ipcRenderer.invoke("jobs:result", jobId),
  exportResult: (payload) => ipcRenderer.invoke("result:export", payload)
});
