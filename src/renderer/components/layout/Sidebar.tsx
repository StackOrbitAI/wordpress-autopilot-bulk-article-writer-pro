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
  Info,
  ChevronLeft,
  ChevronRight
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
    version: '1.0.60',
    date: '2026-06-30',
    type: 'feature',
    changes: [
      'Added WordPress static page optimization capabilities to the AI Agents Hub.',
      'Updated defaults to support full prompt-controlled article title, SEO description, and content output.'
    ]
  },
  {
    version: '1.0.59',
    date: '2026-06-30',
    type: 'feature',
    changes: [
      'Updated default settings: internal/outbound link options are disabled by default.',
      'Set default SEO plugin configuration to None.',
      'Set Google Gemini as the default model provider and default image generator source to Unsplash.',
      'Unchecked Auto SEO Injector checkbox by default on the AI agents page.'
    ]
  },
  {
    version: '1.0.58',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Reverted application product name to stackorbitai-bulk-writer-pro to natively load settings and tasks without folder shifts.',
      'Renamed GitHub repository to stackorbitai-wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents.'
    ]
  },
  {
    version: '1.0.57',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Implemented automatic multi-folder database migration. Your settings, API keys, and tasks are automatically imported from previous folder iterations (stackorbitai-bulk-writer-pro or wordpress-autopilot-bulk-article-writer-pro).'
    ]
  },
  {
    version: '1.0.56',
    date: '2026-06-29',
    type: 'fix',
    changes: [
      'Removed deprecated libasound2 and redundant GTK dependency links to ensure seamless compilation on Ubuntu 24.04 Actions.'
    ]
  },
  {
    version: '1.0.55',
    date: '2026-06-29',
    type: 'fix',
    changes: [
      'Migrated Linux builder actions to host environments to avoid bullseye container apt GPG validation failures.'
    ]
  },
  {
    version: '1.0.54',
    date: '2026-06-29',
    type: 'major',
    changes: [
      'Synchronized repository remote links and package names to the renamed repository structure.',
      'Refactored packaging builds to target the new wordpress-autopilot-bulk-article-seo-writer-pro-with-ai-agents repository releases.'
    ]
  },
  {
    version: '1.0.53',
    date: '2026-06-29',
    type: 'major',
    changes: [
      'Added a collapsible navigation sidebar toggle to allow full content width visibility on resize.',
      'Re-branded application to WordPress Autopilot Bulk Article SEO Writer Pro (with AI Agents).',
      'Optimized viewport responsiveness to prevent hiding options when minimizing browser/app window sizes.'
    ]
  },
  {
    version: '1.0.52',
    date: '2026-06-29',
    type: 'major',
    changes: [
      'Added the new AI Agents Hub featuring live WordPress article & category optimization tools.',
      'Implemented customizable internal and outbound reference links count density controls.',
      'Prepend RankMath / Yoast compatible SEO metadata tables at the top of uploaded Google Docs.',
      'Added automated image credits and disclaimer blocks at the bottom of generated posts.',
      'Introduced direct static layout page creation templates (About Us, Contact Us, Privacy Policy).'
    ]
  },
  {
    version: '1.0.51',
    date: '2026-06-29',
    type: 'feature',
    changes: [
      'Changed the default installation theme setting to light mode instead of dark mode.',
      'Fixed Gemini 404 API errors by adding support for Gemini 3.5 and 3.1 models in the providers selection.',
      'Removed discontinued Gemini model versions from standard selection options.'
    ]
  },
  {
    version: '1.0.50',
    date: '2026-06-29',
    type: 'fix',
    changes: [
      'Fixed a major WordPress media upload timeout inheritance bug.',
      'Allow caller-specified timeouts to bypass the default 30-second cap (increased upload limit to 120s).',
      'Aborted early on connection timeout to prevent cascading hangs across fallback routes.'
    ]
  },
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
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleCollapse = () => {
    const newVal = !isCollapsed;
    setIsCollapsed(newVal);
    localStorage.setItem('sidebar_collapsed', String(newVal));
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, disabled: !isActivated },
    { id: 'websites', label: 'WordPress Sites', icon: Globe, disabled: !isActivated },
    { id: 'providers', label: 'AI Providers', icon: KeyRound, disabled: !isActivated },
    { id: 'tasks', label: 'Bulk Tasks', icon: FileEdit, disabled: !isActivated },
    { id: 'agents', label: 'AI Agents', icon: Sparkles, disabled: !isActivated },
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
    <aside className={cn(
      "border-r border-zinc-800 bg-zinc-950 flex flex-col h-full select-none relative transition-all duration-300 ease-in-out shrink-0",
      isCollapsed ? "w-20" : "w-64"
    )}>
      {/* Brand Logo Header */}
      <div className={cn(
        "h-16 flex items-center border-b border-zinc-800 relative",
        isCollapsed ? "justify-center px-2" : "px-6"
      )}>
        <div className="flex items-center space-x-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold font-outfit shadow-md shrink-0">
            W
          </div>
          {!isCollapsed && (
            <div className="transition-opacity duration-200 py-1">
              <h1 className="text-[10px] font-bold font-outfit tracking-wide bg-gradient-to-r from-zinc-50 to-zinc-300 bg-clip-text text-transparent leading-tight w-44">
                WordPress Autopilot Bulk Article SEO Writer Pro
              </h1>
              <p className="text-[7.5px] text-indigo-400 font-bold tracking-wider uppercase leading-none mt-0.5">
                with AI Agents for WordPress
              </p>
            </div>
          )}
        </div>

        {/* Toggle Collapse Button */}
        <button
          onClick={toggleCollapse}
          className={cn(
            "absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-200 shadow-md cursor-pointer z-10 hover:bg-zinc-800 transition-colors"
          )}
        >
          {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className={cn("flex-1 py-6 space-y-1 overflow-y-auto", isCollapsed ? "px-2" : "px-4")}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "flex items-center w-full rounded-lg text-sm font-medium transition-all duration-200 outline-none text-left",
                isCollapsed ? "justify-center p-2.5" : "space-x-3 px-4 py-2.5",
                item.disabled && "opacity-40 cursor-not-allowed",
                !item.disabled && activeTab === item.id 
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!isCollapsed && <span className="transition-opacity duration-200">{item.label}</span>}
              {!isCollapsed && item.id === 'queue' && activeTab !== 'queue' && (
                <span className="ml-auto w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom User Area */}
      <div className={cn(
        "p-4 border-t border-zinc-800 text-center flex flex-col items-center justify-center bg-zinc-950/20",
        isCollapsed ? "space-y-1 px-1" : "space-y-1"
      )}>
        {!isCollapsed && (
          <span className="text-[10px] text-zinc-500 font-semibold tracking-widest uppercase truncate w-full">
            Open Source Edition
          </span>
        )}
        <button 
          onClick={() => setShowChangelog(true)}
          className={cn(
            "text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer transition-colors duration-200 outline-none",
            isCollapsed ? "text-[10px]" : "text-[11px] underline"
          )}
        >
          {isCollapsed ? `v${version.substring(0, 5)}` : `v${version} (Changelog)`}
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
                    What's New in WordPress Autopilot SEO Writer
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
