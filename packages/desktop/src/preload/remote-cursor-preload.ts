import { contextBridge, ipcRenderer } from "electron";

export interface RemoteCursorUpdate {
  x: number;
  y: number;
  visible: boolean;
}

contextBridge.exposeInMainWorld("bedrockCursor", {
  onUpdate(callback: (state: RemoteCursorUpdate) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: RemoteCursorUpdate,
    ) => {
      callback(state);
    };

    ipcRenderer.on("bedrock:remote-cursor", listener);

    return () => {
      ipcRenderer.removeListener("bedrock:remote-cursor", listener);
    };
  },
});
