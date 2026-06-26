import React, { useState, useEffect, useRef } from 'react';
import { 
  PlaySquare, 
  Play, 
  Pause, 
  XCircle, 
  RotateCcw, 
  ChevronRight, 
  ExternalLink,
  Terminal,
  Activity,
  Coins,
  Cpu,
  BadgeAlert
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Progress } from '../components/ui/progress';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';

interface QueueProps {
  selectedTaskId?: number | null;
}

const Queue: React.FC<QueueProps> = ({ selectedTaskId }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskId, setTaskId] = useState<number | null>(selectedTaskId || null);
  const [task, setTask] = useState<any | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  
  // Running stats counters
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [totalCost, setTotalCost] = useState<number>(0);
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [copied, setCopied] = useState<boolean>(false);

  const handleCopyLogs = () => {
    const logsText = logs.map((log: any) => {
      const timeStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return `[${timeStr}] ${log.message}`;
    }).join('\n');
    navigator.clipboard.writeText(logsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const consoleEndRef = useRef<HTMLDivElement>(null);

  const fetchTasks = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const data = await api.getTasks();
      setTasks(data);
      if (data.length > 0 && !taskId) {
        setTaskId(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTaskDetails = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const tData = await api.getTaskById(id);
      const jData = await api.getJobs(id);
      const lData = await api.getLogs(id, 200); // Pull last 200 logs
      
      setTask(tData);
      setJobs(jData);
      setLogs(lData.reverse()); // Reverse to chronological order

      // Sum token usage and costs
      let tokens = 0;
      let cost = 0;
      jData.forEach((j: any) => {
        tokens += j.token_usage || 0;
        cost += j.estimated_cost || 0;
      });
      setTotalTokens(tokens);
      setTotalCost(cost);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    if (taskId) {
      fetchTaskDetails(taskId);
    }
  }, [taskId]);

  useEffect(() => {
    // Scroll logs console to bottom
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const api = (window as any).api;
    if (!api || !taskId) return;

    // Hook real-time events for active task monitoring
    const unsubTask = api.onTaskStatusChanged((data: any) => {
      if (data.taskId === taskId) {
        setTask(prev => prev ? { ...prev, status: data.status } : null);
      }
    });

    const unsubJob = api.onJobStatusChanged((data: any) => {
      if (data.taskId === taskId) {
        fetchTaskDetails(taskId);
      }
    });

    const unsubLog = api.onNewLog((data: any) => {
      if (data.taskId === taskId) {
        setLogs(prev => [...prev, data]);
      }
    });

    return () => {
      unsubTask();
      unsubJob();
      unsubLog();
    };
  }, [taskId]);

  const handleStart = async () => {
    if (!taskId) return;
    const api = (window as any).api;
    await api.startTask(taskId);
  };

  const handlePause = async () => {
    if (!taskId) return;
    const api = (window as any).api;
    await api.pauseTask(taskId);
  };

  const handleCancel = async () => {
    if (!taskId) return;
    const api = (window as any).api;
    await api.cancelTask(taskId);
  };

  const handleRetry = async () => {
    if (!taskId) return;
    const api = (window as any).api;
    await api.retryTask(taskId);
  };

  // Helper Stats Calcs
  const total = jobs.length;
  const completed = jobs.filter(j => j.status === 'completed').length;
  const failed = jobs.filter(j => j.status === 'failed').length;
  const running = jobs.filter(j => j.status === 'running').length;
  const waiting = jobs.filter(j => j.status === 'waiting').length;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Estimated Time Remaining calculation
  // We assume DALL-E + Article writing takes roughly 25 seconds average.
  const remaining = waiting + running;
  const secondsPerJob = 25;
  const etrSeconds = remaining * secondsPerJob;
  const etrMinutes = Math.ceil(etrSeconds / 60);

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center">
            <PlaySquare className="h-5 w-5 text-indigo-400 mr-2" />
            Live Queue Monitor
          </h3>
          <p className="text-xs text-zinc-400">Monitor active generation runs, token costs, and API error logs.</p>
        </div>

        {tasks.length > 0 && (
          <div className="w-64">
            <Select value={taskId || ''} onChange={(e) => setTaskId(parseInt(e.target.value, 10))}>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </div>
        )}
      </div>

      {!task ? (
        <p className="text-zinc-500 text-xs py-10 text-center">Please select or configure a bulk task to monitor.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Monitor Left Side */}
          <div className="lg:col-span-2 space-y-8">
            {/* Progress Card */}
            <Card className="border-zinc-800/80">
              <CardHeader className="flex flex-row items-center justify-between pb-2 border-b border-zinc-800/40">
                <div>
                  <CardTitle className="text-base">{task.name}</CardTitle>
                  <CardDescription>Pipeline execution details</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  {task.status !== 'running' ? (
                    <Button 
                      onClick={handleStart} 
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3 font-semibold"
                    >
                      <Play className="h-3 w-3 mr-1 fill-white" /> Start
                    </Button>
                  ) : (
                    <Button 
                      onClick={handlePause} 
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-8 px-3 font-semibold"
                    >
                      <Pause className="h-3 w-3 mr-1 fill-white" /> Pause
                    </Button>
                  )}
                  {task.status === 'running' && (
                    <Button 
                      onClick={handleCancel} 
                      className="bg-rose-950 border border-rose-900 text-rose-400 text-xs h-8 px-3 font-semibold hover:bg-rose-900 hover:text-white"
                    >
                      <XCircle className="h-3 w-3 mr-1" /> Cancel
                    </Button>
                  )}
                  {failed > 0 && task.status !== 'running' && (
                    <Button 
                      onClick={handleRetry} 
                      className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs h-8 px-3 font-semibold hover:bg-zinc-700"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" /> Retry Failed
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                {/* Stats Bar */}
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-zinc-900/40 border border-zinc-850 p-3 rounded-xl">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Completed</span>
                    <div className="text-xl font-bold font-outfit text-emerald-400 mt-1">{completed} / {total}</div>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-850 p-3 rounded-xl">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Running</span>
                    <div className="text-xl font-bold font-outfit text-amber-400 mt-1">{running}</div>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-850 p-3 rounded-xl">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Failed</span>
                    <div className="text-xl font-bold font-outfit text-rose-400 mt-1">{failed}</div>
                  </div>
                  <div className="bg-zinc-900/40 border border-zinc-850 p-3 rounded-xl">
                    <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Est. Remaining</span>
                    <div className="text-xl font-bold font-outfit text-sky-400 mt-1">
                      {task.status === 'running' ? `${etrMinutes}m` : '-'}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-semibold text-zinc-400">
                    <span>Task Completion</span>
                    <span>{percent}%</span>
                  </div>
                  <Progress value={completed} max={total} />
                </div>
              </CardContent>
            </Card>

            {/* Keyword Jobs list */}
            <Card className="border-zinc-800/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Job Pipeline Details</CardTitle>
                <CardDescription>Individual article status tracker.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Searchable/Filterable Status Tabs */}
                <div className="flex border-b border-zinc-800/80 overflow-x-auto pb-1 gap-1">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'waiting', label: 'Pending' },
                    { key: 'running', label: 'Running' },
                    { key: 'completed', label: 'Completed' },
                    { key: 'failed', label: 'Failed' }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setFilterStatus(tab.key)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${
                        filterStatus === tab.key 
                          ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 font-bold' 
                          : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="max-h-96 overflow-y-auto space-y-2.5 pr-1">
                  {jobs
                    .filter(job => {
                      if (filterStatus === 'all') return true;
                      return job.status === filterStatus;
                    })
                    .map((job) => (
                      <div 
                        key={job.id} 
                        className={`flex items-center justify-between border px-4 py-3 rounded-xl text-xs transition-all ${
                          job.status === 'running' 
                            ? 'border-amber-500/50 bg-amber-500/5 shadow-md shadow-amber-500/5 animate-pulse' 
                            : 'border-zinc-850/60 bg-zinc-900/20 hover:border-zinc-800'
                        }`}
                      >
                        <div className="space-y-1 pr-4 truncate">
                          <p className="font-bold text-zinc-200 truncate">{job.keyword}</p>
                          {job.error_message && (
                            <p className="text-[10px] text-rose-400/90 break-all">{job.error_message}</p>
                          )}
                        </div>

                        <div className="flex items-center space-x-3 shrink-0">
                          {job.status === 'completed' && (
                            <a 
                              href="#" 
                              onClick={(e) => {
                                e.preventDefault();
                                if (job.post_url) {
                                  (window as any).api.openExternal(job.post_url);
                                }
                              }}
                              className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1 border border-indigo-500/10 hover:border-indigo-500/30 px-2 py-1 rounded bg-indigo-500/5 transition-all text-[11px]"
                            >
                              <span>Visit Post</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          
                          <Badge 
                            variant={
                              job.status === 'completed' ? 'success' :
                              job.status === 'failed' ? 'destructive' :
                              job.status === 'running' ? 'warning' : 'outline'
                            }
                            className="capitalize"
                          >
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  {jobs.filter(job => {
                    if (filterStatus === 'all') return true;
                    return job.status === filterStatus;
                  }).length === 0 && (
                    <div className="text-center py-6 text-zinc-500 text-xs italic">
                      No jobs found in this status.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Side Stats & Live Logs */}
          <div className="space-y-8">
            {/* Counters Card */}
            <Card className="border-zinc-800/80">
              <CardHeader>
                <CardTitle className="text-sm">Resource Counters</CardTitle>
                <CardDescription>API consumption calculations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between bg-zinc-900/30 border border-zinc-850 p-3 rounded-xl text-xs">
                  <div className="flex items-center space-x-2.5">
                    <Coins className="h-4 w-4 text-indigo-400" />
                    <span className="font-semibold text-zinc-400">Total Run Cost</span>
                  </div>
                  <span className="font-mono font-bold text-indigo-400">${totalCost.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between bg-zinc-900/30 border border-zinc-850 p-3 rounded-xl text-xs">
                  <div className="flex items-center space-x-2.5">
                    <Cpu className="h-4 w-4 text-amber-400" />
                    <span className="font-semibold text-zinc-400">Tokens Consumed</span>
                  </div>
                  <span className="font-mono font-bold text-amber-400">{totalTokens.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Live Streaming Console Terminal */}
            <Card className="border-zinc-800/80 bg-zinc-950">
              <CardHeader className="border-b border-zinc-900 pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center font-mono">
                    <Terminal className="h-4 w-4 text-indigo-400 mr-2" />
                    pipeline-console.log
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    {logs.length > 0 && (
                      <button
                        onClick={handleCopyLogs}
                        className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-500/20 px-2 py-0.5 rounded bg-indigo-500/5"
                      >
                        {copied ? 'Copied!' : 'Copy Logs'}
                      </button>
                    )}
                    <Badge variant="outline" className="text-[9px] border-zinc-800 font-mono text-zinc-500 animate-pulse">
                      Live
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-64 overflow-y-auto font-mono text-[10px] space-y-2 pr-1">
                  {logs.length === 0 ? (
                    <p className="text-zinc-600 text-center py-10">Starting shell listeners...</p>
                  ) : (
                    logs.map((log: any, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 leading-relaxed">
                        <span className="text-zinc-600 shrink-0 select-none">
                          [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                        </span>
                        <span className={
                          log.level === 'error' ? 'text-red-400' :
                          log.level === 'warn' ? 'text-amber-400' : 'text-zinc-400'
                        }>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={consoleEndRef} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default Queue;
