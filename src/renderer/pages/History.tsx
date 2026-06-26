import React, { useState, useEffect } from 'react';
import { 
  History as HistoryIcon, 
  Search, 
  Download, 
  Eye, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

const History: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState('');
  const [selectedTaskFilter, setSelectedTaskFilter] = useState<string>('all');
  
  // Preview modal
  const [previewJob, setPreviewJob] = useState<any | null>(null);

  const fetchHistory = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const allTasks = await api.getTasks();
      setTasks(allTasks);

      // Fetch jobs across all tasks
      let allJobs: any[] = [];
      for (const t of allTasks) {
        const jData = await api.getJobs(t.id);
        const mapped = jData.map((j: any) => ({
          ...j,
          taskName: t.name,
          websiteName: t.website_name
        }));
        allJobs = [...allJobs, ...mapped];
      }
      
      // Sort by completion time/id desc
      allJobs.sort((a, b) => {
        if (!a.completed_at) return 1;
        if (!b.completed_at) return -1;
        return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
      });

      setJobs(allJobs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleExportCSV = () => {
    if (jobs.length === 0) return;
    
    const exportData = filteredJobs.map(j => ({
      Keyword: j.keyword,
      Title: j.generated_title || 'N/A',
      Status: j.status,
      WordPressPostID: j.post_id || 'N/A',
      PostURL: j.post_url || 'N/A',
      ImageURL: j.image_url || 'N/A',
      TokenUsage: j.token_usage || 0,
      EstimatedCost: j.estimated_cost || 0,
      CompletedAt: j.completed_at || 'N/A'
    }));

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `stackorbit_post_export_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (jobs.length === 0) return;

    const exportData = filteredJobs.map(j => ({
      Keyword: j.keyword,
      Title: j.generated_title || 'N/A',
      Status: j.status,
      WordPressPostID: j.post_id || 'N/A',
      PostURL: j.post_url || 'N/A',
      ImageURL: j.image_url || 'N/A',
      TokenUsage: j.token_usage || 0,
      EstimatedCost: j.estimated_cost || 0,
      CompletedAt: j.completed_at || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Published Posts');
    
    // Save to file
    XLSX.writeFile(workbook, `stackorbit_post_export_${Date.now()}.xlsx`);
  };

  const filteredJobs = jobs.filter(j => {
    const matchesSearch = j.keyword.toLowerCase().includes(search.toLowerCase()) || 
                          (j.generated_title && j.generated_title.toLowerCase().includes(search.toLowerCase()));
    
    const matchesTask = selectedTaskFilter === 'all' || j.task_id.toString() === selectedTaskFilter;

    return matchesSearch && matchesTask;
  });

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center">
            <HistoryIcon className="h-5 w-5 text-indigo-400 mr-2" />
            Article Publishing History
          </h3>
          <p className="text-xs text-zinc-400">View generated articles, verify live links, and export data packages.</p>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            onClick={handleExportCSV}
            disabled={filteredJobs.length === 0}
            variant="outline"
            className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs font-semibold h-9"
          >
            <Download className="h-4 w-4 mr-1.5" />
            <span>Export CSV</span>
          </Button>
          <Button
            onClick={handleExportExcel}
            disabled={filteredJobs.length === 0}
            variant="outline"
            className="border-zinc-800 text-zinc-300 hover:bg-zinc-900 text-xs font-semibold h-9"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1.5 text-emerald-400" />
            <span>Export Excel</span>
          </Button>
        </div>
      </div>

      {/* Filter Tray */}
      <div className="flex items-center space-x-4 bg-zinc-900/20 border border-zinc-850 p-4 rounded-xl">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search keywords or titles..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-zinc-950 border-zinc-800/80 text-zinc-100 focus:border-indigo-500 placeholder:text-zinc-600 h-9"
          />
        </div>
        
        {tasks.length > 0 && (
          <div className="w-56">
            <select
              value={selectedTaskFilter}
              onChange={(e) => setSelectedTaskFilter(e.target.value)}
              className="flex h-9 w-full rounded-md border border-zinc-850 bg-zinc-950 px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-zinc-300"
            >
              <option value="all">All Task Pipelines</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-500 text-xs py-10 text-center">Loading article archives...</p>
      ) : filteredJobs.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-2xl p-16 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <HistoryIcon className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-200">No records found</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Change your filters or run task generators to start populating post archives.
            </p>
          </div>
        </div>
      ) : (
        <Card className="border-zinc-800/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="p-4">Keyword</th>
                    <th className="p-4">WordPress Title</th>
                    <th className="p-4">Pipeline</th>
                    <th className="p-4">Completed Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {filteredJobs.map((job) => (
                    <tr key={job.id} className="hover:bg-zinc-900/10">
                      <td className="p-4 font-bold font-outfit text-zinc-200">{job.keyword}</td>
                      <td className="p-4 max-w-[200px] truncate text-zinc-400">
                        {job.generated_title || 'N/A'}
                      </td>
                      <td className="p-4 text-zinc-500 font-mono text-[10px]">
                        {job.taskName}
                      </td>
                      <td className="p-4 text-zinc-500">
                        {job.completed_at 
                          ? new Date(job.completed_at).toLocaleString() 
                          : 'Pending'}
                      </td>
                      <td className="p-4">
                        <Badge 
                          variant={job.status === 'completed' ? 'success' : 'destructive'}
                          className="capitalize"
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          {job.status === 'completed' && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                title="Preview Article"
                                onClick={() => setPreviewJob(job)}
                                className="h-8 w-8 border-zinc-800 text-indigo-400 hover:bg-indigo-500/5"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  if (job.post_url) {
                                    (window as any).api.openExternal(job.post_url);
                                  }
                                }}
                                className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 transition-all"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      {previewJob && (
        <Dialog open={!!previewJob} onOpenChange={() => setPreviewJob(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" onClose={() => setPreviewJob(null)}>
            <DialogHeader className="border-b border-zinc-800 pb-3 mb-2">
              <DialogTitle className="text-zinc-100">{previewJob.generated_title || previewJob.keyword}</DialogTitle>
              <DialogDescription className="flex items-center space-x-2 text-xs font-mono mt-1">
                <span>Keyword: &quot;{previewJob.keyword}&quot;</span>
                <span className="text-zinc-600">•</span>
                <span className="text-indigo-400">Tokens: {previewJob.token_usage}</span>
                <span className="text-zinc-600">•</span>
                <span className="text-emerald-400">Est. Cost: ${previewJob.estimated_cost?.toFixed(4)}</span>
              </DialogDescription>
            </DialogHeader>

            {previewJob.image_url && (
              <div className="rounded-xl overflow-hidden border border-zinc-850 aspect-[1200/630] max-h-60 relative bg-zinc-900/60 mb-4">
                <img 
                  src={previewJob.image_url} 
                  alt={previewJob.keyword} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-2 left-2 bg-zinc-950/80 px-2 py-0.5 rounded text-[9px] font-mono text-zinc-400 flex items-center border border-zinc-800">
                  <Sparkles className="h-3 w-3 mr-1 text-indigo-400" />
                  <span>Featured Image (DALL-E 3)</span>
                </div>
              </div>
            )}

            {/* Render HTML content generated */}
            <div 
              className="prose prose-invert prose-xs text-xs text-zinc-300 leading-relaxed space-y-4 max-h-96 overflow-y-auto bg-zinc-900/40 p-4 rounded-xl border border-zinc-850"
              dangerouslySetInnerHTML={{ __html: previewJob.generated_content || '' }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default History;
