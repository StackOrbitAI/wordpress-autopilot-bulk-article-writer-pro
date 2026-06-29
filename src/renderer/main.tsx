import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Dashboard from './pages/Dashboard';
import Websites from './pages/Websites';
import Providers from './pages/Providers';
import Tasks from './pages/Tasks';
import Queue from './pages/Queue';
import History from './pages/History';
import Settings from './pages/Settings';
import './index.css';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [theme, setTheme] = useState<string>('light');
  const [loading, setLoading] = useState<boolean>(true);
  
  // Custom navigation parameters (e.g. passing taskId to Queue page)
  const [navArgs, setNavArgs] = useState<any>(null);

  useEffect(() => {
    // 1. Fetch startup settings
    const loadState = async () => {
      const api = (window as any).api;
      if (!api) {
        setLoading(false);
        return;
      }
      try {
        const settings = await api.getSettings();
        
        // Setup theme class
        const currentTheme = settings.theme || 'light';
        setTheme(currentTheme);
        document.documentElement.className = currentTheme;
      } catch (err) {
        console.error('Failed to load initial settings:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadState();
  }, []);

  // Update theme class on HTML element dynamically
  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const handleNavigate = (tab: string, args: any = null) => {
    setNavArgs(args);
    setActiveTab(tab);
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-zinc-950 text-zinc-400 select-none">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium font-outfit">Loading Bulk Writer Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar Navigation */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => handleNavigate(tab)} 
        isActivated={true}
        onLogout={() => {}}
      />

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Header Tray */}
        <Topbar activeTab={activeTab} theme={theme} setTheme={setTheme} />

        {/* View Pages Router */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeTab === 'dashboard' && <Dashboard onNavigate={(tab) => handleNavigate(tab)} />}
          {activeTab === 'websites' && <Websites />}
          {activeTab === 'providers' && <Providers />}
          {activeTab === 'tasks' && <Tasks onNavigate={handleNavigate} />}
          {activeTab === 'queue' && <Queue selectedTaskId={navArgs} />}
          {activeTab === 'history' && <History />}
          {activeTab === 'settings' && <Settings />}
        </main>
      </div>
    </div>
  );
};

// Mount Application
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
