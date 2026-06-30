import React, { useState, useEffect } from 'react';
import { Sun, Moon, Bell, RefreshCw, Radio } from 'lucide-react';
import { cn } from '../../utils/cn';

interface TopbarProps {
  activeTab: string;
  theme: string;
  setTheme: (theme: string) => void;
}

const Topbar: React.FC<TopbarProps> = ({ activeTab, theme, setTheme }) => {
  const [updaterMessage, setUpdaterMessage] = useState<string>('');
  const [updaterType, setUpdaterType] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [apiPort, setApiPort] = useState<number | null>(null);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<string[]>([
    'Welcome to StackOrbitAI Bulk Writer Pro!',
    'Database initialized successfully.'
  ]);

  const tabTitles: Record<string, string> = {
    dashboard: 'Dashboard Overview',
    websites: 'WordPress Website Integrations',
    providers: 'AI Provider Configuration',
    tasks: 'Bulk Writing Tasks',
    agents: 'WordPress AI Optimization Agents',
    queue: 'Task monitor & Queue system',
    history: 'Published Post History',
    settings: 'Global Settings'
  };

  useEffect(() => {
    // Listen for updater events from preload
    const api = (window as any).api;
    if (!api) return;

    // Fetch API Port
    api.getExpressPort().then((port: number) => {
      setApiPort(port);
    }).catch(console.error);

    const unsubs = [
      api.onUpdaterEvent('updater-checking', () => {
        setUpdaterType('checking');
        setUpdaterMessage('Checking for updates...');
      }),
      api.onUpdaterEvent('updater-update-available', (info: any) => {
        setUpdaterType('available');
        setUpdaterMessage(`Update v${info.version} available!`);
        addNotification(`New update v${info.version} available. Click download in Topbar.`);
      }),
      api.onUpdaterEvent('updater-update-not-available', () => {
        setUpdaterType('idle');
        setUpdaterMessage('');
      }),
      api.onUpdaterEvent('updater-download-progress', (progressObj: any) => {
        setUpdaterType('downloading');
        setDownloadProgress(Math.round(progressObj.percent));
        setUpdaterMessage(`Downloading: ${Math.round(progressObj.percent)}%`);
      }),
      api.onUpdaterEvent('updater-update-downloaded', () => {
        setUpdaterType('downloaded');
        setUpdaterMessage('Update downloaded. Ready to install.');
        addNotification('Update downloaded successfully. Restart the application to apply.');
      }),
      api.onUpdaterEvent('updater-error', (err: any) => {
        setUpdaterType('error');
        setUpdaterMessage(`Update Error: ${err.message}`);
      })
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, []);

  const addNotification = (msg: string) => {
    setNotifications(prev => [msg, ...prev]);
  };

  const handleCheckUpdates = async () => {
    const api = (window as any).api;
    if (!api) return;
    setUpdaterType('checking');
    setUpdaterMessage('Checking...');
    const res = await api.checkUpdates();
    if (!res.success) {
      setUpdaterType('error');
      setUpdaterMessage('Update check failed');
    }
  };

  const handleDownloadUpdate = async () => {
    const api = (window as any).api;
    if (!api) return;
    await api.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    const api = (window as any).api;
    if (!api) return;
    
    const isMac = navigator.userAgent.toLowerCase().includes('mac');
    if (isMac) {
      alert("macOS Update Notice:\n\n1. Make sure you have copied the app to your /Applications folder and are not running it directly from the DMG file.\n2. Since this app is not code-signed, macOS security may block auto-installation. If the app does not restart updated, please download the latest .dmg from GitHub and replace the app manually.");
    }
    
    await api.installUpdate();
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    const api = (window as any).api;
    if (api) {
      api.updateSetting('theme', newTheme);
    }
  };

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center justify-between px-8 select-none z-10 relative">
      {/* Tab Title */}
      <div>
        <h2 className="text-lg font-bold font-outfit text-zinc-100">
          {tabTitles[activeTab] || 'Overview'}
        </h2>
      </div>

      {/* Action Tray */}
      <div className="flex items-center space-x-4">
        {/* API Server Active Badge */}
        <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          <span>Local REST API Active (Port {apiPort || '...'})</span>
        </div>

        {/* Update status actions */}
        {updaterType !== 'idle' && (
          <button
            onClick={
              updaterType === 'available' ? handleDownloadUpdate : 
              updaterType === 'downloaded' ? handleInstallUpdate : 
              undefined
            }
            className={cn(
              "text-xs px-3 py-1 rounded-lg border flex items-center space-x-1.5 font-medium transition-all",
              updaterType === 'checking' && "bg-zinc-800 border-zinc-700 text-zinc-300",
              updaterType === 'available' && "bg-indigo-600 border-indigo-500 hover:bg-indigo-700 text-white animate-bounce",
              updaterType === 'downloading' && "bg-zinc-800 border-zinc-700 text-indigo-400",
              updaterType === 'downloaded' && "bg-emerald-600 border-emerald-500 hover:bg-emerald-700 text-white animate-pulse",
              updaterType === 'error' && "bg-red-950 border-red-900 text-red-400"
            )}
          >
            <RefreshCw className={cn("h-3 w-3", (updaterType === 'checking' || updaterType === 'downloading') && "animate-spin")} />
            <span>{updaterMessage}</span>
          </button>
        )}

        {updaterType === 'idle' && (
          <button 
            onClick={handleCheckUpdates} 
            title="Check for Updates"
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg border border-transparent hover:border-zinc-800 transition-all"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle Theme"
          className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg border border-transparent hover:border-zinc-800 transition-all"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Notifications"
            className={cn(
              "p-2 rounded-lg border border-transparent hover:border-zinc-800 transition-all relative",
              showNotifications ? "bg-zinc-900 text-zinc-100" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
            )}
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-indigo-500 rounded-full" />
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl glass z-50">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Notifications</span>
                <button 
                  onClick={() => setNotifications([])} 
                  className="text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  Clear All
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {notifications.length === 0 ? (
                  <p className="text-xs text-zinc-500 py-4 text-center">No new notifications</p>
                ) : (
                  notifications.map((n, i) => (
                    <div key={i} className="text-xs text-zinc-300 bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/40">
                      {n}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
