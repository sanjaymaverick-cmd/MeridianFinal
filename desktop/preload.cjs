const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("meridianDesktop", {
  paper: true,
});
