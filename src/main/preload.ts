import { contextBridge, ipcRenderer } from 'electron';

// Expose safe, structured APIs to the Renderer process
contextBridge.exposeInMainWorld('api', {
  // DB & Settings
  getSettings: () => ipcRenderer.invoke('db:getSettings'),
  updateSetting: (key: string, value: string) => ipcRenderer.invoke('db:updateSetting', key, value),

  // WordPress Sites
  getWebsites: () => ipcRenderer.invoke('db:getWebsites'),
  addWebsite: (site: any) => ipcRenderer.invoke('db:addWebsite', site),
  deleteWebsite: (id: number) => ipcRenderer.invoke('db:deleteWebsite', id),
  testWebsite: (id: number) => ipcRenderer.invoke('db:testWebsite', id),
  testWebsiteConfig: (site: any) => ipcRenderer.invoke('db:testWebsiteConfig', site),
  getWordPressCategories: (websiteId: number) => ipcRenderer.invoke('wp:getCategories', websiteId),

  // AI Providers Keys
  getApiKeys: () => ipcRenderer.invoke('db:getApiKeys'),
  addApiKey: (key: any) => ipcRenderer.invoke('db:addApiKey', key),
  deleteApiKey: (id: number) => ipcRenderer.invoke('db:deleteApiKey', id),

  // Tasks
  getTasks: () => ipcRenderer.invoke('db:getTasks'),
  getTaskById: (id: number) => ipcRenderer.invoke('db:getTaskById', id),
  createTask: (task: any) => ipcRenderer.invoke('db:createTask', task),
  updateTask: (id: number, task: any) => ipcRenderer.invoke('db:updateTask', id, task),
  deleteTask: (id: number) => ipcRenderer.invoke('db:deleteTask', id),
  duplicateTask: (id: number) => ipcRenderer.invoke('db:duplicateTask', id),
  
  // Queue Operations
  startTask: (id: number) => ipcRenderer.invoke('queue:start', id),
  pauseTask: (id: number) => ipcRenderer.invoke('queue:pause', id),
  stopTask: (id: number) => ipcRenderer.invoke('queue:stop', id),
  cancelTask: (id: number) => ipcRenderer.invoke('queue:cancel', id),
  restartTask: (id: number) => ipcRenderer.invoke('queue:restart', id),
  retryTask: (id: number) => ipcRenderer.invoke('queue:retry', id),
  getJobs: (taskId: number) => ipcRenderer.invoke('db:getJobs', taskId),
  getLogs: (taskId: number, limit?: number) => ipcRenderer.invoke('db:getLogs', taskId, limit),
  getDashboardStats: () => ipcRenderer.invoke('db:getDashboardStats'),

  // Auto Updater
  checkUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),

  // Real-time Event Listeners
  onTaskStatusChanged: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('task-status-changed', listener);
    return () => ipcRenderer.removeListener('task-status-changed', listener);
  },
  onJobStatusChanged: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('job-status-changed', listener);
    return () => ipcRenderer.removeListener('job-status-changed', listener);
  },
  onNewLog: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('new-log', listener);
    return () => ipcRenderer.removeListener('new-log', listener);
  },
  onUpdaterEvent: (channel: string, callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:openExternal', url),
  onWordPressAuthSuccess: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('wordpress:auth-success', listener);
    return () => ipcRenderer.removeListener('wordpress:auth-success', listener);
  }
});
