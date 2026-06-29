import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Globe, 
  KeyRound, 
  FileEdit, 
  PlaySquare, 
  History, 
  Settings as SettingsIcon, 
  X,
  Sparkles,
  Zap,
  CheckCircle2,
  Info
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { AnimatePresence, motion } from 'framer-motion';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isActivated: boolean;
  onLogout: () => void;
}

interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'feature' | 'fix' | 'patch';
  changes: string[];
}

const CHANGELOG_DATA: ChangelogEntry[] = [
  {
    version: '1.0.49',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Exposed dynamic app version display in sidebar footer.',
      'Implemented a fully integrated, interactive Changelog popup modal.',
      'Built automatic local fallback mechanics for backend version queries.'
    ]
  },
  {
    version: '1.0.48',
    date: '2026-06-29',
    type: 'fix',
    changes: [
      'Resolved light/dark theme visual bugs by adding glassmorphic container overrides.',
      'Set dashboard stats cards, logs, and settings inputs to render with high-contrast text.',
      'Corrected border colors for inputs and selection fields to ensure legible layouts.'
    ]
  },
  {
    version: '1.0.47',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Introduced the Semantic AI Stock Image Selector (automatic image context evaluator).',
      'Queries LLM (OpenAI, Gemini, or Claude) to rate and choose the most relevant photo out of 10 candidates.',
      'Fallback chain matching order (Unsplash -> Pexels -> Pixabay) if selected API errors out.'
    ]
  },
  {
    version: '1.0.46',
    date: '2026-06-29',
    type: 'patch',
    changes: [
      'Optimized responsive layout columns for high-definition and widescreen displays.',
      'Improved scrollbars and margins in the settings views.'
    ]
  },
  {
    version: '1.0.45',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Added saved task default parameters (preset models, immediate publish, stock selection).',
      'Automated background WordPress posting queues on initial application startup.'
    ]
  }
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isActivated, onLogout }) => {
  const [showChangelog, setShowChangelog] = useState(false);
  const [version, setVersion] = useState('1.0.49');

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, disabled: !isActivated },
    { id: 'websites', label: 'WordPress Sites', icon: Globe, disabled: !isActivated },
    { id: 'providers', label: 'AI Providers', icon: KeyRound, disabled: !isActivated },
    { id: 'tasks', label: 'Bulk Tasks', icon: FileEdit, disabled: !isActivated },
    { id: 'queue', label: 'Task Monitor', icon: PlaySquare, disabled: !isActivated },
    { id: 'history', label: 'Post History', icon: History, disabled: !isActivated },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, disabled: !isActivated }
  ];

  useEffect(() => {
    const fetchVersion = async () => {
      const api = (window as any).api;
      if (api && api.getAppVersion) {
        try {
          const appVer = await api.getAppVersion();
          if (appVer) setVersion(appVer);
        } catch (err) {
          console.warn('Failed to retrieve version:', err);
        }
      }
    };
    fetchVersion();
  }, []);

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col h-full select-none relative">
      {/* Brand Logo Header */}
      <div className="h-16 flex items-center px-6 border-b border-zinc-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold font-outfit shadow-md">
            S
          </div>
          <div>
            <h1 className="text-md font-bold font-outfit tracking-wide bg-gradient-to-r from-zinc-50 to-zinc-300 bg-clip-text text-transparent">
              StackOrbit<span className="text-indigo-400">AI</span>
            </h1>
            <p className="text-[10px] text-zinc-500 font-medium">BULK WRITER PRO</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center space-x-3 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 outline-none text-left",
                item.disabled && "opacity-40 cursor-not-allowed",
                !item.disabled && activeTab === item.id 
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
              {item.id === 'queue' && activeTab !== 'queue' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User Area */}
      <div className="p-4 border-t border-zinc-800 text-center flex flex-col items-center justify-center space-y-1 bg-zinc-950/20">
        <span className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase">
          Open Source Edition
        </span>
        <button 
          onClick={() => setShowChangelog(true)}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium underline cursor-pointer transition-colors duration-200 outline-none"
        >
          v{version} (Changelog)
        </button>
      </div>

      {/* Changelog Modal Overlay */}
      <AnimatePresence>
        {showChangelog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg rounded-2xl glass p-6 overflow-hidden max-h-[80vh] flex flex-col border border-zinc-800 relative text-left shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-800/60 mb-4">
                <div className="flex items-center space-x-2">
                  <Sparkles className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-base font-bold font-outfit text-zinc-100">
                    What's New in StackOrbitAI
                  </h3>
                </div>
                <button 
                  onClick={() => setShowChangelog(false)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Scrollable Changelog Content */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-1 custom-scrollbar">
                {CHANGELOG_DATA.map((entry) => (
                  <div key={entry.version} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold font-outfit text-zinc-200">
                          Version {entry.version}
                        </span>
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider",
                          entry.type === 'major' && "bg-red-500/10 text-red-400 border border-red-500/20",
                          entry.type === 'feature' && "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
                          entry.type === 'fix' && "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                          entry.type === 'patch' && "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20"
                        )}>
                          {entry.type}
                        </span>
                      </div>
                      <span className="text-[10px] text-zinc-500">{entry.date}</span>
                    </div>

                    <ul className="space-y-1.5 pl-1.5">
                      {entry.changes.map((change, idx) => (
                        <li key={idx} className="flex items-start text-xs text-zinc-400 leading-relaxed">
                          <span className="text-indigo-400 mr-2 mt-1 select-none">•</span>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-500">
                <div className="flex items-center space-x-1">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span>Always up to date</span>
                </div>
                <button 
                  onClick={() => setShowChangelog(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 font-semibold font-outfit text-white px-4 py-1.5 rounded-lg text-xs transition-colors"
                >
                  Awesome!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </aside>
  );
};

export default Sidebar;
