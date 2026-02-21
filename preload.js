const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getNotesPath: () => ipcRenderer.invoke('get-notes-path'),
  setNotesPath: (path) => ipcRenderer.invoke('set-notes-path', path),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  readNotes: () => ipcRenderer.invoke('read-notes'),
  readNote: (filename) => ipcRenderer.invoke('read-note', filename),
  saveNote: (data) => {
    console.log('[preload] saveNote called, filename:', data?.filename);
    return ipcRenderer.invoke('save-note', data);
  },
  deleteNote: (filename) => ipcRenderer.invoke('delete-note', filename),
  saveImage: (data) => ipcRenderer.invoke('save-image', data),
  pickImage: () => ipcRenderer.invoke('pick-image'),
  onFilesChanged: (callback) => {
    ipcRenderer.on('files-changed', (event, data) => callback(data));
  }
});
