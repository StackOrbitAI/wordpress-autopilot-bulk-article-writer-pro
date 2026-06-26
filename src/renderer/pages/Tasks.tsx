import React, { useState, useEffect } from 'react';
import { 
  FileEdit, 
  Plus, 
  Trash2, 
  Copy, 
  Play, 
  Pause, 
  XCircle, 
  Clock, 
  Upload, 
  FileSpreadsheet, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  AlertTriangle,
  MonitorPlay,
  FileText,
  Loader2,
  Search,
  ArrowUpDown,
  SlidersHorizontal,
  MoreVertical,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';

interface TasksProps {
  onNavigate: (tab: string, arg?: any) => void;
}

const Tasks: React.FC<TasksProps> = ({ onNavigate }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [websites, setWebsites] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [openAdd, setOpenAdd] = useState<boolean>(false);
  
  // Wizard Step Track
  const [step, setStep] = useState<number>(1);

  // Form Fields
  const [name, setName] = useState('');
  const [websiteId, setWebsiteId] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryQuery, setCategoryQuery] = useState('');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordsText, setKeywordsText] = useState('');
  const [promptTemplate, setPromptTemplate] = useState(
    "Write an exhaustive, SEO optimized blog post about: {keyword}. Include H2/H3 subheadings, lists, and a table if helpful. Target length is {length}."
  );
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [imageGeneration, setImageGeneration] = useState(true);
  const [imageStyle, setImageStyle] = useState('photorealistic');
  const [imageSize, setImageSize] = useState('1200x628');
  const [articleLength, setArticleLength] = useState('medium');
  const [publishingMode, setPublishingMode] = useState<'draft' | 'pending' | 'publish' | 'future'>('draft');
  const [seoPlugin, setSeoPlugin] = useState<'yoast' | 'rankmath' | 'aioseo' | 'none'>('yoast');
  const [isScheduled, setIsScheduled] = useState(false);
  
  // Scheduling fields
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState('once');

  const [formError, setFormError] = useState('');

  // Additional states for Categories & Actions
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string; slug: string }[]>([]);
  const [fetchingCategories, setFetchingCategories] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<number | null>(null);

  // Search/Filter/Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const fetchTasks = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const data = await api.getTasks();
      setTasks(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCategories = async (siteId: string) => {
    if (!siteId) return;
    setFetchingCategories(true);
    const api = (window as any).api;
    if (!api) return;
    try {
      const cats = await api.getWordPressCategories(parseInt(siteId, 10));
      setCategories(cats || []);
      if (cats && cats.length > 0) {
        setDropdownOpen(true);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setCategories([]);
    } finally {
      setFetchingCategories(false);
    }
  };

  const fetchDependencies = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const webs = await api.getWebsites();
      const provs = await api.getApiKeys();
      setWebsites(webs);
      setProviders(provs);
      
      const savedSettings = await api.getSettings();
      const lastWebId = savedSettings.find((s: any) => s.key === 'last_selected_website')?.value;
      const lastCat = savedSettings.find((s: any) => s.key === 'last_selected_category')?.value;

      if (lastWebId && webs.some(w => w.id.toString() === lastWebId)) {
        setWebsiteId(lastWebId);
      } else if (webs.length > 0) {
        setWebsiteId(webs[0].id.toString());
      }

      if (lastCat) {
        setSelectedCategories(lastCat.split(',').map(c => c.trim()).filter(Boolean));
      }
      
      if (provs.length > 0) {
        setProviderId(provs[0].id.toString());
        const models = JSON.parse(provs[0].models || '[]');
        if (models.length > 0) {
          const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
          if (gpt4oIndex !== -1) {
            setModel(models[gpt4oIndex]);
          } else {
            setModel(models[0]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchDependencies();
  }, []);

  useEffect(() => {
    if (websiteId) {
      fetchCategories(websiteId);
    }
  }, [websiteId]);

  // Load wizard draft from local storage on mount
  useEffect(() => {
    const savedStateStr = localStorage.getItem('task_wizard_draft');
    if (savedStateStr) {
      try {
        const draft = JSON.parse(savedStateStr);
        setName(draft.name || '');
        setWebsiteId(draft.websiteId || '');
        setSelectedCategories(draft.selectedCategories || []);
        setKeywords(draft.keywords || []);
        setPromptTemplate(draft.promptTemplate || '');
        setProviderId(draft.providerId || '');
        setModel(draft.model || '');
        setImageGeneration(draft.imageGeneration !== undefined ? draft.imageGeneration : true);
        setImageStyle(draft.imageStyle || 'photorealistic');
        setImageSize(draft.imageSize || '1200x628');
        setArticleLength(draft.articleLength || 'medium');
        setPublishingMode(draft.publishingMode || 'draft');
        setSeoPlugin(draft.seoPlugin || 'yoast');
        setIsScheduled(draft.isScheduled || false);
        setScheduleDate(draft.scheduleDate || '');
        setScheduleTime(draft.scheduleTime || '');
        setScheduleFrequency(draft.scheduleFrequency || 'once');
        setStep(draft.step || 1);
        if (draft.editingTaskId) {
          setEditingTaskId(draft.editingTaskId);
        }
      } catch (err) {
        console.error('Error parsing wizard draft:', err);
      }
    }
  }, []);

  // Autosave draft to local storage
  useEffect(() => {
    if (!openAdd) return;
    const interval = setInterval(() => {
      const draft = {
        name, websiteId, selectedCategories, keywords,
        promptTemplate, providerId, model, imageGeneration, imageStyle,
        imageSize, articleLength, publishingMode, seoPlugin, isScheduled,
        scheduleDate, scheduleTime, scheduleFrequency, step, editingTaskId
      };
      localStorage.setItem('task_wizard_draft', JSON.stringify(draft));
    }, 10000);
    return () => clearInterval(interval);
  }, [
    openAdd, name, websiteId, selectedCategories, keywords,
    promptTemplate, providerId, model, imageGeneration, imageStyle,
    imageSize, articleLength, publishingMode, seoPlugin, isScheduled,
    scheduleDate, scheduleTime, scheduleFrequency, step, editingTaskId
  ]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleWindowClick = () => {
      setActiveMenuTaskId(null);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  // Update available models when selected provider changes
  useEffect(() => {
    if (!providerId) return;
    const selected = providers.find(p => p.id.toString() === providerId);
    if (selected) {
      const models = JSON.parse(selected.models || '[]');
      if (models.length > 0) {
        const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
        if (gpt4oIndex !== -1) {
          setModel(models[gpt4oIndex]);
        } else {
          setModel(models[0]);
        }
      } else {
        setModel('');
      }
    }
  }, [providerId, providers]);

  // File Importer (CSV, TXT, Excel)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    if (fileExt === 'txt') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        const list = text.split('\n').map(k => k.trim()).filter(k => k.length > 0);
        setKeywords(prev => Array.from(new Set([...prev, ...list])));
      };
      reader.readAsText(file);
    } else if (fileExt === 'csv') {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          const list = results.data.flat().map((k: any) => k.toString().trim()).filter(k => k.length > 0);
          setKeywords(prev => Array.from(new Set([...prev, ...list])));
        }
      });
    } else if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const list = json.flat().map((k: any) => k?.toString().trim()).filter(k => k && k.length > 0);
        setKeywords(prev => Array.from(new Set([...prev, ...list])));
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const handleManualKeywordsAdd = () => {
    if (!keywordsText.trim()) return;
    const list = keywordsText
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    setKeywords(prev => Array.from(new Set([...prev, ...list])));
    setKeywordsText('');
  };

  const handleStartTask = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.startTask(id);
      fetchTasks();
      onNavigate('queue', id); // Redirect to Monitor
    } catch (err: any) {
      alert(`Failed to start task: ${err.message}`);
    }
  };

  const handlePauseTask = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.pauseTask(id);
      fetchTasks();
    } catch (err: any) {
      alert(`Failed to pause task: ${err.message}`);
    }
  };

  const handleCancelTask = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.cancelTask(id);
      fetchTasks();
    } catch (err: any) {
      alert(`Failed to cancel task: ${err.message}`);
    }
  };

  const handleStopTask = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.stopTask(id);
      fetchTasks();
    } catch (err: any) {
      alert(`Failed to stop task: ${err.message}`);
    }
  };

  const handleRestartTask = async (id: number) => {
    if (!confirm('Are you sure you want to restart this task? This will reset all keywords back to waiting and clear previously generated content.')) return;
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.restartTask(id);
      fetchTasks();
      onNavigate('queue', id);
    } catch (err: any) {
      alert(`Failed to restart task: ${err.message}`);
    }
  };

  const handleConvertToDraft = async (task: any) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const payload = {
        name: task.name,
        websiteId: task.website_id,
        language: 'en',
        country: 'us',
        category: task.category,
        keywords: JSON.parse(task.keywords || '[]'),
        promptTemplate: task.prompt_template,
        providerId: task.provider_id,
        model: task.model,
        imageGeneration: task.image_generation === 1,
        imageStyle: task.image_style,
        imageSize: task.image_size,
        articleLength: task.article_length,
        publishingMode: task.publishing_mode,
        seoSettings: JSON.parse(task.seo_settings || '{}'),
        scheduleSettings: JSON.parse(task.schedule_settings || '{}'),
        isScheduled: task.is_scheduled === 1,
        status: 'draft'
      };
      await api.updateTask(task.id, payload);
      await fetchTasks();
    } catch (err: any) {
      alert(`Failed to convert task to draft: ${err.message}`);
    }
  };

  const handleDuplicate = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.duplicateTask(id);
      fetchTasks();
    } catch (err: any) {
      alert(`Failed to duplicate task: ${err.message}`);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this task? All history and logs will be permanently erased.')) return;
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.deleteTask(id);
      fetchTasks();
    } catch (err: any) {
      alert(`Failed to delete task: ${err.message}`);
    }
  };

  const handleEditTask = (task: any) => {
    setEditingTaskId(task.id);
    setName(task.name);
    setWebsiteId(task.website_id.toString());
    setSelectedCategories(task.category ? task.category.split(',').map((c: string) => c.trim()).filter(Boolean) : []);
    setCategoryQuery('');
    setKeywords(JSON.parse(task.keywords || '[]'));
    setPromptTemplate(task.prompt_template);
    setProviderId(task.provider_id.toString());
    setModel(task.model);
    setImageGeneration(task.image_generation === 1);
    setImageStyle(task.image_style || 'photorealistic');
    setImageSize(task.image_size || '1200x628');
    setArticleLength(task.article_length || 'medium');
    setPublishingMode(task.publishing_mode || 'draft');
    
    const seo = JSON.parse(task.seo_settings || '{}');
    setSeoPlugin(seo.plugin || 'yoast');

    const sched = JSON.parse(task.schedule_settings || '{}');
    if (sched.startDate) {
      const dateObj = new Date(sched.startDate);
      const yyyy = dateObj.getFullYear();
      const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
      const dd = String(dateObj.getDate()).padStart(2, '0');
      setScheduleDate(`${yyyy}-${mm}-${dd}`);
      
      const hh = String(dateObj.getHours()).padStart(2, '0');
      const min = String(dateObj.getMinutes()).padStart(2, '0');
      setScheduleTime(`${hh}:${min}`);
      setScheduleFrequency(sched.frequency || 'once');
      setIsScheduled(true);
    } else {
      setIsScheduled(false);
      setScheduleDate('');
      setScheduleTime('');
      setScheduleFrequency('once');
    }

    const targetSiteId = task.website_id.toString();
    setWebsiteId(targetSiteId);
    fetchCategories(targetSiteId);

    setStep(1);
    setFormError('');
    setOpenAdd(true);
  };

  const resetForm = () => {
    setEditingTaskId(null);
    setStep(1);
    setName('');
    if (websites.length > 0) setWebsiteId(websites[0].id.toString());
    setSelectedCategories([]);
    setCategoryQuery('');
    setKeywords([]);
    setPromptTemplate("Write an exhaustive, SEO optimized blog post about: {keyword}. Include H2/H3 subheadings, lists, and a table if helpful. Target length is {length}.");
    if (providers.length > 0) setProviderId(providers[0].id.toString());
    setImageGeneration(true);
    setImageStyle('photorealistic');
    setImageSize('1200x628');
    setArticleLength('medium');
    setPublishingMode('draft');
    setSeoPlugin('yoast');
    setIsScheduled(false);
    setScheduleDate('');
    setScheduleTime('');
    setScheduleFrequency('once');
    setFormError('');
    localStorage.removeItem('task_wizard_draft');
  };

  const validateStep = (currentStep: number): boolean => {
    setFormError('');
    switch (currentStep) {
      case 1:
        if (!name.trim()) {
          setFormError('Pipeline name is required.');
          return false;
        }
        if (!websiteId) {
          setFormError('Please select a target WordPress site.');
          return false;
        }
        break;
      case 2:
        if (keywords.length === 0) {
          setFormError('Please import or enter at least one keyword.');
          return false;
        }
        break;
      case 3:
        if (!providerId) {
          setFormError('Please select an AI Provider.');
          return false;
        }
        if (!model) {
          setFormError('Please select an LLM Model.');
          return false;
        }
        break;
      case 5:
        if (isScheduled) {
          if (!scheduleDate || !scheduleTime) {
            setFormError('Please configure both start date and trigger time for scheduling.');
            return false;
          }
        }
        break;
      default:
        break;
    }
    return true;
  };

  const handleCreateTask = async () => {
    const api = (window as any).api;
    if (!api) return;

    if (!validateStep(1) || !validateStep(2) || !validateStep(3) || !validateStep(5)) {
      return;
    }

    let scheduleSettings = {};
    if (isScheduled && scheduleDate && scheduleTime) {
      const scheduleIso = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      scheduleSettings = {
        startDate: scheduleIso,
        frequency: scheduleFrequency
      };
    }

    const taskPayload = {
      name,
      websiteId: parseInt(websiteId, 10),
      language: 'en',
      country: 'us',
      category: selectedCategories.join(', '),
      keywords,
      promptTemplate,
      providerId: parseInt(providerId, 10),
      model,
      imageGeneration,
      imageStyle,
      imageSize,
      articleLength,
      publishingMode: publishingMode === 'future' ? 'future' : publishingMode,
      seoSettings: { plugin: seoPlugin },
      scheduleSettings,
      isScheduled
    };

    try {
      if (editingTaskId) {
        const currentTask = tasks.find(t => t.id === editingTaskId);
        const res = await api.updateTask(editingTaskId, {
          ...taskPayload,
          status: currentTask?.status || 'draft'
        });
        if (res.success) {
          setOpenAdd(false);
          resetForm();
          fetchTasks();
        }
      } else {
        const res = await api.createTask(taskPayload);
        if (res.success) {
          await api.updateSetting('last_selected_website', websiteId);
          await api.updateSetting('last_selected_category', selectedCategories.join(', '));

          if (!isScheduled) {
            try {
              await api.startTask(res.taskId);
            } catch (startErr) {
              console.error('Failed to auto-start task:', startErr);
            }
          }
          setOpenAdd(false);
          resetForm();
          fetchTasks();
          if (!isScheduled) {
            onNavigate('queue', res.taskId);
          }
        }
      }
    } catch (err: any) {
      setFormError(err.message || 'Error saving task.');
    }
  };

  const renderWizardContent = () => {
    const selectedProvider = providers.find(p => p.id.toString() === providerId);
    const availableModels = selectedProvider ? JSON.parse(selectedProvider.models || '[]') : [];

    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Step 1: Pipeline Details</h4>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pipeline Name</label>
              <Input 
                placeholder="e.g. Finance Content May" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                className="bg-zinc-950 border-zinc-800"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target WordPress site</label>
              <Select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>
                {websites.map(w => (
                  <option key={w.id} value={w.id}>{w.name} ({w.url})</option>
                ))}
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Publish Status</label>
              <Select value={publishingMode} onChange={(e: any) => setPublishingMode(e.target.value)}>
                <option value="draft">Save as Draft</option>
                <option value="pending">Pending Review</option>
                <option value="publish">Publish Immediately</option>
                <option value="future">Post Schedule Time</option>
              </Select>
            </div>
            
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex justify-between items-center">
                <span>Category Target(s) (Select one or more)</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => websiteId && fetchCategories(websiteId)}
                    disabled={fetchingCategories}
                    className="text-zinc-500 hover:text-indigo-400 transition-colors p-0.5"
                    title="Refresh categories"
                  >
                    <RotateCcw className={`h-3 w-3 ${fetchingCategories ? 'animate-spin text-indigo-400' : ''}`} />
                  </button>
                  {fetchingCategories && <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />}
                </div>
              </label>

              {/* Filter Categories Search Input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                <Input 
                  placeholder="Filter categories..."
                  value={categoryQuery} 
                  onChange={(e) => setCategoryQuery(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-xs pl-9 h-9 w-full"
                />
              </div>
              
              {/* Scrollable Box showing all categories directly */}
              <div className="border border-zinc-800 bg-zinc-950 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2.5">
                {fetchingCategories ? (
                  <p className="text-zinc-500 text-[11px] italic py-1">Fetching categories from WordPress...</p>
                ) : categories.length === 0 ? (
                  <p className="text-zinc-500 text-[11px] italic py-1">No categories found on connected site.</p>
                ) : (() => {
                  const filtered = categories.filter((cat) => 
                    cat.name.toLowerCase().includes(categoryQuery.toLowerCase())
                  );
                  if (filtered.length === 0) {
                    return (
                      <p className="text-zinc-500 text-[11px] italic py-1">
                        No categories matching "{categoryQuery}" found.
                      </p>
                    );
                  }
                  return filtered.map((cat) => {
                    const isChecked = selectedCategories.includes(cat.name);
                    return (
                      <label 
                        key={cat.id} 
                        className="flex items-center space-x-2.5 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer select-none transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedCategories(prev => prev.filter(c => c !== cat.name));
                            } else {
                              setSelectedCategories(prev => Array.from(new Set([...prev, cat.name])));
                            }
                          }}
                          className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                        />
                        <span className="font-medium">{cat.name}</span>
                      </label>
                    );
                  });
                })()}
              </div>

              {/* Badges for selected categories */}
              {selectedCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] font-bold text-zinc-500 self-center uppercase tracking-wider mr-1">Selected:</span>
                  {selectedCategories.map((cat, idx) => (
                    <Badge 
                      key={idx} 
                      variant="secondary" 
                      className="flex items-center space-x-1 text-[10px] py-0.5 px-2 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                    >
                      <span>{cat}</span>
                      <button 
                        type="button" 
                        onClick={() => setSelectedCategories(prev => prev.filter(c => c !== cat))} 
                        className="text-zinc-500 hover:text-zinc-300 font-bold ml-1"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Step 2: Keywords Configuration</h4>
            
            <div className="border border-dashed border-zinc-800 rounded-xl p-6 text-center space-y-4">
              <div className="flex justify-center space-x-4">
                <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 px-4 py-2 rounded-lg flex items-center space-x-2 text-xs font-medium transition-all text-zinc-300">
                  <Upload className="h-4 w-4 text-indigo-400" />
                  <span>Upload CSV / TXT</span>
                  <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                </label>
                <label className="cursor-pointer bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 px-4 py-2 rounded-lg flex items-center space-x-2 text-xs font-medium transition-all text-zinc-300">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                  <span>Upload Excel</span>
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
              <p className="text-[10px] text-zinc-500">Supports column/row-based keywords. Duplicates will be filtered automatically.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex justify-between">
                <span>Or Enter Manually (One per line)</span>
                <span className="text-indigo-400 font-bold">{keywords.length} Loaded</span>
              </label>
              <textarea
                placeholder="how to rank on google&#10;best seo strategies"
                rows={3}
                value={keywordsText}
                onChange={(e) => setKeywordsText(e.target.value)}
                onBlur={handleManualKeywordsAdd}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-indigo-500 bg-zinc-950 text-zinc-100"
              />
            </div>

            {keywords.length > 0 && (
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-3 max-h-32 overflow-y-auto flex flex-wrap gap-1.5">
                {keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="flex items-center space-x-1">
                    <span>{kw}</span>
                    <button type="button" onClick={() => setKeywords(prev => prev.filter(k => k !== kw))} className="text-zinc-500 hover:text-zinc-300">×</button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Step 3: Writer Parameters</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AI Provider</label>
                <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">LLM Model</label>
                <Select value={model} onChange={(e) => setModel(e.target.value)}>
                  {availableModels.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Custom Prompt Template</label>
              <textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-zinc-950 text-zinc-100"
              />
              <p className="text-[10px] text-zinc-500">Variables: {'{keyword}'}, {'{category}'}, {'{length}'}</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Length</label>
              <Select value={articleLength} onChange={(e) => setArticleLength(e.target.value)}>
                <option value="short">Short (600 - 900 words)</option>
                <option value="medium">Medium (1,200 - 1,800 words)</option>
                <option value="long">Long (2,200 - 3,500 words)</option>
              </Select>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Step 4: Image & SEO Mappings</h4>
            
            {/* Image generation toggle */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-zinc-200">Featured Image Generation</h5>
                  <p className="text-[10px] text-zinc-400">Generate featured images dynamically via DALL-E 3</p>
                </div>
                <input
                  type="checkbox"
                  checked={imageGeneration}
                  onChange={(e) => setImageGeneration(e.target.checked)}
                  className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                />
              </div>

              {imageGeneration && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/40">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Aspect Style</label>
                    <Select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)}>
                      <option value="photorealistic">Photorealistic</option>
                      <option value="natural">Natural</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="professional">Professional</option>
                      <option value="high resolution">High Resolution</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Image Resolution</label>
                    <Select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
                      <option value="1200x628">1200 × 628 px (WordPress Landscape - Recommended)</option>
                      <option value="1200x675">1200 × 675 px (WordPress Landscape - Alternative)</option>
                      <option value="1024x1024">1024 × 1024 px (Square)</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Publish Status</label>
                <Select value={publishingMode} onChange={(e: any) => setPublishingMode(e.target.value)}>
                  <option value="draft">Save as Draft</option>
                  <option value="pending">Pending Review</option>
                  <option value="publish">Publish Immediately</option>
                  <option value="future">Post Schedule Time</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">SEO Plugin Target</label>
                <Select value={seoPlugin} onChange={(e: any) => setSeoPlugin(e.target.value)}>
                  <option value="yoast">Yoast SEO</option>
                  <option value="rankmath">RankMath Plugin</option>
                  <option value="aioseo">All in One SEO</option>
                  <option value="none">None / Default</option>
                </Select>
              </div>
            </div>
          </div>
        );
      case 5:
        return (
          <div className="space-y-4">
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Step 5: Execution Schedule</h4>
            
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-zinc-200">Scheduled Automation Mode</h5>
                  <p className="text-[10px] text-zinc-400">Trigger this queue based on dates and intervals.</p>
                </div>
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                />
              </div>

              {isScheduled && (
                <div className="space-y-4 pt-2 border-t border-zinc-800/40">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Start Date</label>
                      <Input 
                        type="date" 
                        value={scheduleDate} 
                        onChange={(e) => setScheduleDate(e.target.value)} 
                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Trigger Time</label>
                      <Input 
                        type="time" 
                        value={scheduleTime} 
                        onChange={(e) => setScheduleTime(e.target.value)} 
                        className="bg-zinc-950 border-zinc-800 text-zinc-100"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Recurrence Frequency</label>
                    <Select value={scheduleFrequency} onChange={(e) => setScheduleFrequency(e.target.value)}>
                      <option value="once">Run Once (Single Trigger)</option>
                      <option value="daily">Run Daily</option>
                      <option value="weekly">Run Weekly</option>
                      <option value="monthly">Run Monthly</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const handleOpenAdd = () => {
    if (websites.length === 0) {
      alert('Please connect at least one WordPress website before setting up tasks.');
      onNavigate('websites');
      return;
    }
    if (providers.length === 0) {
      alert('Please configure at least one AI API key provider before setting up tasks.');
      onNavigate('providers');
      return;
    }
    setFormError('');
    setStep(1);
    setOpenAdd(true);
    if (websiteId) {
      fetchCategories(websiteId);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center">
            <FileEdit className="h-5 w-5 text-indigo-400 mr-2" />
            Bulk Writing Tasks
          </h3>
          <p className="text-xs text-zinc-400">Configure bulk keyword pipelines, model params, and auto-publishing settings.</p>
        </div>
        <Button 
          onClick={handleOpenAdd}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-outfit flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Create Task</span>
        </Button>
      </div>

      {/* Search, Filter, Sort Controls */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-zinc-900/20 border border-zinc-800/80 p-4 rounded-xl">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 bg-zinc-950 border-zinc-800 text-xs h-9"
          />
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto items-center justify-end">
          <div className="flex items-center space-x-1.5 text-xs text-zinc-400">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Filter:</span>
          </div>
          <Select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 text-xs w-32 border-zinc-800"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="running">Running</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </Select>

          <div className="flex items-center space-x-1.5 text-xs text-zinc-400 ml-2">
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span>Sort:</span>
          </div>
          <Select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="h-9 text-xs w-36 border-zinc-800"
          >
            <option value="newest">Newest Created</option>
            <option value="oldest">Oldest Created</option>
            <option value="name">Alphabetical</option>
          </Select>
        </div>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-xs py-10 text-center">Loading bulk task queues...</p>
      ) : tasks.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-2xl p-16 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <FileEdit className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-200">No tasks created yet</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Set up a task by adding keyword files, target categories, and scheduling options.
            </p>
          </div>
          <Button 
            onClick={handleOpenAdd}
            className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100"
          >
            Create Task
          </Button>
        </div>
      ) : (
        <Card className="border-zinc-800/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="p-4">Task Name</th>
                    <th className="p-4">WordPress Website</th>
                    <th className="p-4">Keywords Count</th>
                    <th className="p-4">AI Config</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {tasks
                    .filter(task => {
                      const matchesSearch = task.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            (task.website_name && task.website_name.toLowerCase().includes(searchQuery.toLowerCase()));
                      const matchesStatus = statusFilter === 'all' || task.status === statusFilter;
                      return matchesSearch && matchesStatus;
                    })
                    .sort((a, b) => {
                      if (sortBy === 'newest') {
                        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
                      } else if (sortBy === 'oldest') {
                        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
                      } else if (sortBy === 'name') {
                        return a.name.localeCompare(b.name);
                      }
                      return 0;
                    })
                    .map((task) => {
                      const kwList = JSON.parse(task.keywords || '[]');
                      return (
                        <tr key={task.id} className="hover:bg-zinc-900/10">
                          <td className="p-4 font-bold font-outfit text-zinc-200">
                            {task.name}
                          </td>
                          <td className="p-4 text-zinc-400 truncate max-w-[150px]">
                            {task.website_name || 'Disconnected'}
                          </td>
                          <td className="p-4">
                            <span className="font-semibold text-indigo-400">{kwList.length} keywords</span>
                          </td>
                          <td className="p-4 truncate max-w-[150px]">
                            <span className="text-zinc-500 font-mono text-[10px]">
                              {task.model} ({task.provider_name})
                            </span>
                          </td>
                          <td className="p-4">
                            <Badge 
                              variant={
                                task.status === 'running' ? 'warning' :
                                task.status === 'completed' ? 'success' :
                                task.status === 'failed' ? 'destructive' :
                                task.status === 'scheduled' ? 'info' : 'outline'
                              }
                              className="capitalize"
                            >
                              {task.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end space-x-1.5 relative">
                              {task.status !== 'running' ? (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="Run Task Pipeline"
                                  onClick={() => handleStartTask(task.id)}
                                  className="h-8 w-8 border-zinc-800 text-emerald-400 hover:bg-emerald-500/5 hover:text-emerald-300"
                                >
                                  <Play className="h-3.5 w-3.5 fill-emerald-400/20" />
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="Pause Queue"
                                  onClick={() => handlePauseTask(task.id)}
                                  className="h-8 w-8 border-zinc-800 text-amber-400 hover:bg-amber-500/5 hover:text-amber-300"
                                >
                                  <Pause className="h-3.5 w-3.5 fill-amber-400/20" />
                                </Button>
                              )}

                              {(task.status === 'running' || task.status === 'paused') && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="Stop Queue"
                                  onClick={() => handleStopTask(task.id)}
                                  className="h-8 w-8 border-zinc-800 text-rose-400 hover:bg-rose-500/5 hover:text-rose-300"
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              <Button
                                variant="outline"
                                size="icon"
                                title="Monitor Queue"
                                onClick={() => onNavigate('queue', task.id)}
                                className="h-8 w-8 border-zinc-800 text-indigo-400 hover:bg-indigo-500/5"
                              >
                                <MonitorPlay className="h-3.5 w-3.5" />
                              </Button>

                              <div className="relative inline-block text-left">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="More Actions"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuTaskId(activeMenuTaskId === task.id ? null : task.id);
                                  }}
                                  className="h-8 w-8 text-zinc-500 hover:text-zinc-300"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                                
                                {activeMenuTaskId === task.id && (
                                  <div className="absolute right-0 mt-1 w-44 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl z-50 py-1 text-left">
                                    <button
                                      onClick={() => handleEditTask(task)}
                                      className="w-full px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center space-x-2 transition-all"
                                    >
                                      <FileEdit className="h-3.5 w-3.5 text-blue-400" />
                                      <span>Edit Pipeline</span>
                                    </button>
                                    <button
                                      onClick={() => handleRestartTask(task.id)}
                                      className="w-full px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center space-x-2 transition-all"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                                      <span>Restart Queue</span>
                                    </button>
                                    <button
                                      onClick={() => handleDuplicate(task.id)}
                                      className="w-full px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center space-x-2 transition-all"
                                    >
                                      <Copy className="h-3.5 w-3.5 text-indigo-400" />
                                      <span>Duplicate Task</span>
                                    </button>
                                    {task.status !== 'draft' && (
                                      <button
                                        onClick={() => handleConvertToDraft(task)}
                                        className="w-full px-4 py-2 text-xs hover:bg-zinc-800 text-zinc-300 flex items-center space-x-2 transition-all"
                                      >
                                        <Clock className="h-3.5 w-3.5 text-sky-400" />
                                        <span>Convert to Draft</span>
                                      </button>
                                    )}
                                    <div className="border-t border-zinc-800/60 my-1"></div>
                                    <button
                                      onClick={() => handleDelete(task.id)}
                                      className="w-full px-4 py-2 text-xs hover:bg-zinc-800 text-rose-400 flex items-center space-x-2 transition-all"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                                      <span>Delete Task</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Task Dialog Wizard */}
      <Dialog open={openAdd} onOpenChange={(open) => {
        if (!open) {
          resetForm();
        }
        setOpenAdd(open);
      }}>
        <DialogContent onClose={() => {
          resetForm();
          setOpenAdd(false);
        }}>
          <DialogHeader>
            <DialogTitle>{editingTaskId ? 'Edit Bulk Article Pipeline' : 'Setup Bulk Article Pipeline'}</DialogTitle>
            <DialogDescription>
              {editingTaskId ? 'Modify details, keywords, model options, and scheduling intervals.' : 'Configure details, keywords, model options, and scheduling intervals.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 min-h-[300px]">
            {renderWizardContent()}
            {formError && (
              <p className="mt-4 text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
                {formError}
              </p>
            )}
          </div>

          <DialogFooter className="pt-4 border-t border-zinc-800/40 flex justify-between sm:justify-between">
            <div>
              {step > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setFormError('');
                    setStep(step - 1);
                  }}
                  className="border-zinc-800 text-zinc-400"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  <span>Back</span>
                </Button>
              )}
            </div>
            
            <div className="flex space-x-2">
              {step < 5 ? (
                <Button
                  type="button"
                  onClick={() => {
                    if (validateStep(step)) {
                      setStep(step + 1);
                    }
                  }}
                  className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100 flex items-center space-x-1"
                >
                  <span>Continue</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleCreateTask}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-outfit flex items-center space-x-1.5"
                >
                  <MonitorPlay className="h-4 w-4" />
                  <span>{editingTaskId ? 'Save Changes' : 'Build Pipeline'}</span>
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
