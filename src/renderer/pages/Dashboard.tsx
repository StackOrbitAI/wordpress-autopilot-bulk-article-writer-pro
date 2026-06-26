import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Play, 
  CheckCircle, 
  XCircle, 
  Clock, 
  TrendingUp, 
  Sparkles,
  ArrowRight,
  Database,
  ExternalLink
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

interface DashboardProps {
  onNavigate: (tab: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const [stats, setStats] = useState<any>({
    tasks: { total: 0, running: 0, completed: 0, failed: 0, scheduled: 0 },
    posts: { published: 0, waiting: 0 },
    chartData: [],
    recentActivity: []
  });
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStats = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Poll stats every 10 seconds to keep live tasks monitored
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const statsCards = [
    { 
      title: 'Total Bulk Tasks', 
      value: stats.tasks.total, 
      desc: 'Configured workflows', 
      icon: FileText, 
      color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' 
    },
    { 
      title: 'Running Pipelines', 
      value: stats.tasks.running, 
      desc: 'Active content generators', 
      icon: Play, 
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' 
    },
    { 
      title: 'Published Posts', 
      value: stats.posts.published, 
      desc: 'Live on WordPress sites', 
      icon: CheckCircle, 
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
    },
    { 
      title: 'Failed Generators', 
      value: stats.tasks.failed, 
      desc: 'Errors requiring review', 
      icon: XCircle, 
      color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' 
    },
    { 
      title: 'Scheduled Executions', 
      value: stats.tasks.scheduled, 
      desc: 'Future content queues', 
      icon: Clock, 
      color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' 
    }
  ];

  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center bg-zinc-950">
        <div className="text-zinc-400 flex flex-col items-center space-y-2">
          <Database className="h-8 w-8 animate-spin text-indigo-500" />
          <span className="text-sm font-medium">Aggregating workspace analytics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      {/* Top Banner Card */}
      <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-r from-indigo-950/40 to-zinc-900/60 p-6 flex flex-col md:flex-row items-center justify-between glass shadow-xl shadow-indigo-500/[0.02]">
        <div className="space-y-1.5 text-center md:text-left mb-4 md:mb-0">
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center justify-center md:justify-start">
            <Sparkles className="h-5 w-5 text-indigo-400 mr-2 animate-pulse" />
            AI Content Pipeline Ready
          </h3>
          <p className="text-sm text-zinc-400 max-w-xl">
            Configure keywords, templates, and link multiple WordPress sites to automate high-quality, human-like publishing in bulk.
          </p>
        </div>
        <Button 
          onClick={() => onNavigate('tasks')}
          className="bg-indigo-600 hover:bg-indigo-700 font-semibold font-outfit text-white flex items-center space-x-2"
        >
          <span>Launch Bulk Writer</span>
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {stats.activePipeline && (
        <Card className="border-amber-500/20 bg-amber-500/[0.01] hover:border-amber-500/30 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-900/50">
            <div>
              <CardTitle className="text-sm flex items-center text-amber-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping mr-2"></span>
                Active Pipeline: {stats.activePipeline.name}
              </CardTitle>
              <CardDescription>Real-time keyword generation tracking</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('queue')}
              className="border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs"
            >
              Open Live Monitor
            </Button>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-zinc-500">Progress</span>
                <p className="font-bold text-zinc-200">{stats.activePipeline.completed} / {stats.activePipeline.total} keywords ({stats.activePipeline.progress}%)</p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-500">Est. Remaining Time</span>
                <p className="font-bold text-zinc-200">{stats.activePipeline.etrMinutes} mins</p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-500">Next Keyword</span>
                <p className="font-bold text-zinc-200 truncate max-w-[180px]">{stats.activePipeline.nextKeyword || 'None (Queue Empty)'}</p>
              </div>
              <div className="space-y-1">
                <span className="text-zinc-500">Last Published Article</span>
                <p className="font-bold text-zinc-200 truncate max-w-[180px]">
                  {stats.activePipeline.lastPublishedKeyword ? (
                    stats.activePipeline.lastPublishedUrl ? (
                      <a 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          if (stats.activePipeline.lastPublishedUrl) {
                            (window as any).api.openExternal(stats.activePipeline.lastPublishedUrl);
                          }
                        }}
                        className="text-indigo-400 hover:underline inline-flex items-center"
                      >
                        {stats.activePipeline.lastPublishedKeyword}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    ) : stats.activePipeline.lastPublishedKeyword
                  ) : 'None yet'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-indigo-500 transition-all duration-500" 
                  style={{ width: `${stats.activePipeline.progress}%` }}
                ></div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
        {statsCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="border-zinc-800/80 hover:border-zinc-700/60 transition-all duration-300">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{card.title}</span>
                <div className={`p-1.5 rounded-lg border ${card.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold font-outfit text-zinc-100">{card.value}</div>
                <p className="text-[11px] text-zinc-500 mt-1">{card.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Grid: Chart and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Analytics Line Chart */}
        <Card className="lg:col-span-2 border-zinc-800/80">
          <CardHeader>
            <CardTitle className="text-base flex items-center">
              <TrendingUp className="h-4 w-4 text-indigo-400 mr-2" />
              Publishing Volume (Last 7 Days)
            </CardTitle>
            <CardDescription>Daily completed article transfers to WordPress sites.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pt-4">
            {stats.chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs border border-dashed border-zinc-800 rounded-lg">
                No published articles recorded in database.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="date" 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    tickFormatter={(val) => {
                      const d = new Date(val);
                      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    }}
                  />
                  <YAxis 
                    stroke="#52525b" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false} 
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{ background: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                    labelStyle={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 'bold' }}
                    itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                    labelFormatter={(label) => new Date(label).toDateString()}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="count" 
                    name="Published"
                    stroke="#6366f1" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorCount)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent Activities Panel */}
        <Card className="border-zinc-800/80">
          <CardHeader>
            <CardTitle className="text-base">System Logs & Activity</CardTitle>
            <CardDescription>Live streaming logs from background workers.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 overflow-y-auto space-y-3 pr-2">
            {stats.recentActivity.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-xs border border-dashed border-zinc-800 rounded-lg">
                No activity logs available.
              </div>
            ) : (
              stats.recentActivity.map((log: any, idx: number) => (
                <div key={idx} className="flex items-start space-x-3 text-xs bg-zinc-900/30 border border-zinc-850 p-2.5 rounded-lg">
                  <div className="mt-0.5">
                    {log.level === 'error' && <XCircle className="h-3.5 w-3.5 text-rose-400" />}
                    {log.level === 'warn' && <Clock className="h-3.5 w-3.5 text-amber-400 animate-pulse" />}
                    {log.level === 'info' && <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between text-[10px] text-zinc-500">
                      <span className="font-semibold text-zinc-400 truncate max-w-[120px]">
                        {log.task_name || 'System Queue'}
                      </span>
                      <span>
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-zinc-300 text-[11px] leading-relaxed break-words">{log.message}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
