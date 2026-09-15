import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // Hymnal APIs
  hymnal: {
    // Album Management
    getSettings: () => ipcRenderer.invoke('hymnal:get-settings'),
    saveSettings: (settings: any) => ipcRenderer.invoke('hymnal:save-settings', settings),
    addAlbum: (album: any) => ipcRenderer.invoke('hymnal:add-album', album),
    updateAlbum: (album: any) => ipcRenderer.invoke('hymnal:update-album', album),
    deleteAlbum: (albumId: string) => ipcRenderer.invoke('hymnal:delete-album', albumId),

    getSongs: () => ipcRenderer.invoke('hymnal:get-songs'),
    selectFolder: () => ipcRenderer.invoke('hymnal:select-folder'),
    processImages: (args: any) => ipcRenderer.invoke('hymnal:process-images', args),
    onProgress: (callback: (data: { processed: number; total: number }) => void) => {
      const sub = (_: any, data: any) => callback(data);
      ipcRenderer.on('hymnal:process-progress', sub);
      return () => ipcRenderer.off('hymnal:process-progress', sub);
    },
    syncGDrive: (albumId?: string) => ipcRenderer.invoke('hymnal:sync-gdrive', albumId),
    getAuthUrl: () => ipcRenderer.invoke('hymnal:get-auth-url'),
    waitForAuthCode: () => ipcRenderer.invoke('hymnal:wait-for-auth-code'),
    confirmAuth: (code: string) => ipcRenderer.invoke('hymnal:confirm-auth', code),
    updateSong: (song: any) => ipcRenderer.invoke('hymnal:update-song', song),
    deleteSong: (songId: string) => ipcRenderer.invoke('hymnal:delete-song', songId),
    exportCSV: (args?: any) => ipcRenderer.invoke('hymnal:export-csv', args),
    importCSV: () => ipcRenderer.invoke('hymnal:import-csv'),
    openExternal: (url: string) => ipcRenderer.send('hymnal:open-external', url),
    
    // Google Slides
    generateSlides: (args: any) => ipcRenderer.invoke('hymnal:generate-slides', args),
    onSlidesProgress: (callback: any) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('hymnal:slides-progress', listener);
      return () => ipcRenderer.removeListener('hymnal:slides-progress', listener);
    },
    generatePDF: (args: any) => ipcRenderer.invoke('hymnal:generate-pdf', args),
    onPDFProgress: (callback: any) => {
      const listener = (_: any, data: any) => callback(data);
      ipcRenderer.on('hymnal:pdf-progress', listener);
      return () => ipcRenderer.removeListener('hymnal:pdf-progress', listener);
    },
    
    // Conti Storage
    getSavedContis: () => ipcRenderer.invoke('hymnal:get-saved-contis'),
    saveConti: (conti: any) => ipcRenderer.invoke('hymnal:save-conti', conti),
    deleteSavedConti: (id: string) => ipcRenderer.invoke('hymnal:delete-saved-conti', id),
    resizeWindow: (width: number, height: number) => ipcRenderer.send('hymnal:resize-window', { width, height }),
    writeClipboard: (text: string) => ipcRenderer.send('hymnal:write-clipboard', text)
  }
});
