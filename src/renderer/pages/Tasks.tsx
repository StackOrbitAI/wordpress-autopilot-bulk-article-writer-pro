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
    `Write an in-depth, captivating, and well-researched blog post of 2,000–3,000 words on {keyword}. The content should be written in a natural, human tone, engaging the reader through storytelling, personal anecdotes, and clear examples.

Ensure the post is rich in value, covering every aspect of the topic from different perspectives, offering expert insights, analysis, and actionable advice. While writing, naturally incorporate strong E-E-A-T principles by demonstrating real-life experience, expert-backed insights, credible research support, and trustworthy guidance that aligns with Google's quality standards. The writing should flow seamlessly, with easy-to-follow subheadings, bullet points, and unique markdown formatting to enhance readability, without Separator in paragraph.

Incorporate outbound links to authoritative websites and resources within each paragraph and heading to support key points and improve SEO. Avoid jargon and keep the language conversational and relatable, making the content both informative and entertaining. Ensure the content reflects high levels of experience, expertise, authoritativeness, and trustworthiness in every section to build credibility and create a strong E-E-A-T foundation.

For outbound links, include 8 to 10 high-quality references from authoritative sources within the content. Do not list these links separately; instead, naturally integrate them within different paragraphs by hyperlinking relevant keywords or phrases. Avoid using direct URLs. The links should add value and credibility without overwhelming the content.

Include a comparison table (with an attractive heading) to illustrate key points, as well as a detailed FAQ section to address common questions. End with a long, well-rounded conclusion that ties the content together and offers next steps or reflections for the reader.
Make sure the article is plagiarism-free and SEO-optimized.
I also want my blogs to be written specifically for getting AdSense approval, so there should not be any issues like policy violations or low-value content. Please make sure the blogs are high-value and completely free from any kind of policy violation, and ensure the writing follows strong E-E-A-T standards to maximize trustworthiness and AdSense compatibility.

Important Instruction:

The final blog content must ONLY discuss the topic itself.
Do NOT mention, reference, explain, or hint at this prompt, instructions, writing guidelines, SEO rules, E-E-A-T terms, AdSense approval, or any meta/process-related information anywhere in the blog content.

➕ ADDITIONAL BUYER REQUIREMENTS

Add the following conditions while writing the blog:

The content must not feel AI-generated and should read like it is written by a knowledgeable human subject-matter expert

Do NOT use first-person storytelling or personal anecdotes such as “I’ll never forget…”, “I once saw…”, “my neighbor”, or similar narrative-style experiences

Do NOT include fictional characters, names, or repeated story examples (for example, recurring names like “Sarah” or invented scenarios)

All examples must be neutral, factual, topic-focused, and informational, written in an objective third-person tone
Avoid emotional storytelling meant to simulate human experience; instead, rely on real-world context, practical explanations, observed patterns, and credible references

Keep examples varied, realistic, and directly relevant to the topic, without templated storytelling formats`
  );
  const [providerId, setProviderId] = useState('');
  const [model, setModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState<boolean>(false);
  const [imageGeneration, setImageGeneration] = useState<number>(1);
  const [imageStyle, setImageStyle] = useState('photorealistic');
  const [imageSize, setImageSize] = useState('1200x628');
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [insertInlineImages, setInsertInlineImages] = useState<boolean>(false);
  const [inlineImagesCount, setInlineImagesCount] = useState<number>(3);
  const [inlineImagesParagraphInterval, setInlineImagesParagraphInterval] = useState<number>(3);
  const [customImageSize, setCustomImageSize] = useState<string>('');
  const [runwareModelsList, setRunwareModelsList] = useState<string[]>(['runware:100', 'civitai:102438@133677']);
  const [articleLength, setArticleLength] = useState('medium');
  const [publishingMode, setPublishingMode] = useState<'draft' | 'pending' | 'publish' | 'future'>('publish');
  const [publishTargetWp, setPublishTargetWp] = useState(true);
  const [publishTargetGoogle, setPublishTargetGoogle] = useState(false);
  const [seoPlugin, setSeoPlugin] = useState<'yoast' | 'rankmath' | 'aioseo' | 'none'>('yoast');
  const [insertInternalLinks, setInsertInternalLinks] = useState<boolean>(true);
  const [internalLinksCount, setInternalLinksCount] = useState<number>(3);
  const [insertOutboundLinks, setInsertOutboundLinks] = useState<boolean>(true);
  const [outboundLinksCount, setOutboundLinksCount] = useState<number>(5);
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
      const runwareModelsSetting = savedSettings.find((s: any) => s.key === 'runware_custom_models')?.value;
      if (runwareModelsSetting) {
        setRunwareModelsList(runwareModelsSetting.split(',').map((m: string) => m.trim()).filter(Boolean));
      }

      const defaultsStr = localStorage.getItem('task_defaults');
      if (defaultsStr) {
        try {
          const d = JSON.parse(defaultsStr);
          if (d.websiteId && webs.some(w => w.id.toString() === d.websiteId)) {
            setWebsiteId(d.websiteId);
          } else if (lastWebId && webs.some(w => w.id.toString() === lastWebId)) {
            setWebsiteId(lastWebId);
          } else if (webs.length > 0) {
            setWebsiteId(webs[0].id.toString());
          }
          
          if (d.selectedCategories && d.selectedCategories.length > 0) {
            setSelectedCategories(d.selectedCategories);
          } else if (lastCat) {
            setSelectedCategories(lastCat.split(',').map(c => c.trim()).filter(Boolean));
          }
          
          setPromptTemplate(d.promptTemplate || '');
          
          const dbDefaultProv = provs.find((p: any) => p.is_default === 1);
          if (dbDefaultProv) {
            setProviderId(dbDefaultProv.id.toString());
            const models = JSON.parse(dbDefaultProv.models || '[]');
            if (models.length > 0) {
              const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
              if (gpt4oIndex !== -1) {
                setModel(models[gpt4oIndex]);
              } else {
                setModel(models[0]);
              }
              setIsCustomModel(false);
            }
          } else if (d.providerId && provs.some(p => p.id.toString() === d.providerId)) {
            setProviderId(d.providerId);
            const selected = provs.find(p => p.id.toString() === d.providerId);
            const models = JSON.parse(selected?.models || '[]');
            if (d.model && (models.includes(d.model) || d.isCustomModel)) {
              setIsCustomModel(!!d.isCustomModel);
              setModel(d.model);
            } else if (models.length > 0) {
              setIsCustomModel(false);
              setModel(models[0]);
            }
          } else if (provs.length > 0) {
            setProviderId(provs[0].id.toString());
            const models = JSON.parse(provs[0].models || '[]');
            if (models.length > 0) {
              setIsCustomModel(false);
              setModel(models[0]);
            }
          }
          
          setImageGeneration(d.imageGeneration !== undefined ? d.imageGeneration : 1);
          setImageStyle(d.imageStyle || 'photorealistic');
          setImageSize(d.imageSize || '1200x628');
          setImageModel(d.imageModel || 'gpt-image-2');
          setArticleLength(d.articleLength || 'medium');
          setPublishingMode(d.publishingMode || 'publish');
          setPublishTargetWp(d.publishTargetWp !== undefined ? d.publishTargetWp : true);
          setPublishTargetGoogle(d.publishTargetGoogle !== undefined ? d.publishTargetGoogle : false);
          setSeoPlugin(d.seoPlugin || 'yoast');
          setIsScheduled(d.isScheduled || false);
          setScheduleFrequency(d.scheduleFrequency || 'once');
          return;
        } catch (e) {
          console.error('Error loading task defaults in fetchDependencies:', e);
        }
      }

      if (lastWebId && webs.some(w => w.id.toString() === lastWebId)) {
        setWebsiteId(lastWebId);
      } else if (webs.length > 0) {
        setWebsiteId(webs[0].id.toString());
      }

      if (lastCat) {
        setSelectedCategories(lastCat.split(',').map(c => c.trim()).filter(Boolean));
      }
      
      if (provs.length > 0) {
        const defaultProv = provs.find((p: any) => p.is_default === 1);
        const selectedProv = defaultProv || provs[0];
        setProviderId(selectedProv.id.toString());
        const models = JSON.parse(selectedProv.models || '[]');
        if (models.length > 0) {
          const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
          if (gpt4oIndex !== -1) {
            setModel(models[gpt4oIndex]);
          } else {
            setModel(models[0]);
          }
          setIsCustomModel(false);
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
        setPublishTargetWp(draft.publishTargetWp !== undefined ? draft.publishTargetWp : true);
        setPublishTargetGoogle(draft.publishTargetGoogle !== undefined ? draft.publishTargetGoogle : false);
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
        scheduleDate, scheduleTime, scheduleFrequency, step, editingTaskId,
        publishTargetWp, publishTargetGoogle
      };
      localStorage.setItem('task_wizard_draft', JSON.stringify(draft));
    }, 10000);
    return () => clearInterval(interval);
  }, [
    openAdd, name, websiteId, selectedCategories, keywords,
    promptTemplate, providerId, model, imageGeneration, imageStyle,
    imageSize, articleLength, publishingMode, seoPlugin, isScheduled,
    scheduleDate, scheduleTime, scheduleFrequency, step, editingTaskId,
    publishTargetWp, publishTargetGoogle
  ]);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleWindowClick = () => {
      setActiveMenuTaskId(null);
    };
    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, []);

  // Ensure default selections are set once websites load
  useEffect(() => {
    if (!websiteId && websites.length > 0) {
      setWebsiteId(websites[0].id.toString());
    }
  }, [websiteId, websites]);

  // Update available models when selected provider changes
  useEffect(() => {
    if (!providerId && providers.length > 0) {
      setProviderId(providers[0].id.toString());
      return;
    }
    if (!providerId) return;
    if (isCustomModel) return;

    const selected = providers.find(p => p.id.toString() === providerId);
    if (selected) {
      const models = JSON.parse(selected.models || '[]');
      if (models.length > 0) {
        if (!models.includes(model)) {
          const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
          if (gpt4oIndex !== -1) {
            setModel(models[gpt4oIndex]);
          } else {
            setModel(models[0]);
          }
        }
      } else {
        setModel('');
      }
    }
  }, [providerId, providers, model, isCustomModel]);

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
        imageGeneration: task.image_generation || 0,
        imageStyle: task.image_style,
        imageSize: task.image_size,
        imageModel: task.image_model || 'gpt-image-2',
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
    const isWp = !task.publish_target || task.publish_target.includes('wordpress');
    const isGoogle = !!(task.publish_target && task.publish_target.includes('googledocs'));
    setPublishTargetWp(isWp);
    setPublishTargetGoogle(isGoogle);
    setSelectedCategories(task.category ? task.category.split(',').map((c: string) => c.trim()).filter(Boolean) : []);
    setCategoryQuery('');
    setKeywords(JSON.parse(task.keywords || '[]'));
    setPromptTemplate(task.prompt_template);
    setProviderId(task.provider_id.toString());
    const selectedProvider = providers.find(p => p.id.toString() === task.provider_id.toString());
    const standardModels = selectedProvider ? JSON.parse(selectedProvider.models || '[]') : [];
    if (task.model && !standardModels.includes(task.model)) {
      setIsCustomModel(true);
    } else {
      setIsCustomModel(false);
    }
    setModel(task.model);
    setImageGeneration(task.image_generation || 0);
    let styleVal = task.image_style || 'photorealistic';
    let modelVal = 'gpt-image-2';
    let inlineCountVal = 3;
    let inlineIntervalVal = 3;
    if (styleVal.startsWith('{')) {
      try {
        const parsed = JSON.parse(styleVal);
        styleVal = parsed.style || 'photorealistic';
        modelVal = parsed.model || 'gpt-image-2';
        if (parsed.inlineCount !== undefined) inlineCountVal = parsed.inlineCount;
        if (parsed.inlineInterval !== undefined) inlineIntervalVal = parsed.inlineInterval;
      } catch (e) {
        // ignore
      }
    }
    setImageStyle(styleVal);
    setImageModel(modelVal);
    setInlineImagesCount(inlineCountVal);
    setInlineImagesParagraphInterval(inlineIntervalVal);
    setInsertInlineImages(task.insert_inline_images === 1);

    const stdSizes = ['1200x628', '1200x675', '1024x1024', '1024x768', '768x1024'];
    const sizeVal = task.image_size || '1200x628';
    if (stdSizes.includes(sizeVal)) {
      setImageSize(sizeVal);
      setCustomImageSize('');
    } else {
      setImageSize('custom');
      setCustomImageSize(sizeVal);
    }
    setArticleLength(task.article_length || 'medium');
    setPublishingMode(task.publishing_mode || 'publish');
    
    const seo = JSON.parse(task.seo_settings || '{}');
    setSeoPlugin(seo.plugin || 'yoast');
    setInsertInternalLinks(seo.insertInternalLinks !== false);
    setInternalLinksCount(seo.internalLinksCount !== undefined ? seo.internalLinksCount : 3);
    setInsertOutboundLinks(seo.insertOutboundLinks !== false);
    setOutboundLinksCount(seo.outboundLinksCount !== undefined ? seo.outboundLinksCount : 5);

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
    setCategoryQuery('');
    setKeywords([]);
    setScheduleDate('');
    setScheduleTime('');
    setFormError('');
    localStorage.removeItem('task_wizard_draft');
    const defaultsStr = localStorage.getItem('task_defaults');
    if (defaultsStr) {
      try {
        const d = JSON.parse(defaultsStr);
        if (d.websiteId && websites.some(w => w.id.toString() === d.websiteId)) {
          setWebsiteId(d.websiteId);
        } else if (websites.length > 0) {
          setWebsiteId(websites[0].id.toString());
        }
        
        setSelectedCategories(d.selectedCategories || []);
        setPromptTemplate(d.promptTemplate || '');
        
        const dbDefaultProv = providers.find((p: any) => p.is_default === 1);
        if (dbDefaultProv) {
          setProviderId(dbDefaultProv.id.toString());
          const models = JSON.parse(dbDefaultProv.models || '[]');
          if (models.length > 0) {
            const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
            if (gpt4oIndex !== -1) {
              setModel(models[gpt4oIndex]);
            } else {
              setModel(models[0]);
            }
            setIsCustomModel(false);
          }
        } else if (d.providerId && providers.some(p => p.id.toString() === d.providerId)) {
          setProviderId(d.providerId);
          const selected = providers.find(p => p.id.toString() === d.providerId);
          const models = JSON.parse(selected?.models || '[]');
          if (d.model && (models.includes(d.model) || d.isCustomModel)) {
            setIsCustomModel(!!d.isCustomModel);
            setModel(d.model);
          } else if (models.length > 0) {
            setIsCustomModel(false);
            setModel(models[0]);
          }
        } else if (providers.length > 0) {
          setProviderId(providers[0].id.toString());
          const models = JSON.parse(providers[0].models || '[]');
          if (models.length > 0) {
            setIsCustomModel(false);
            setModel(models[0]);
          }
        }
        
        setImageGeneration(d.imageGeneration !== undefined ? d.imageGeneration : 1);
        setIsCustomModel(d.isCustomModel !== undefined ? d.isCustomModel : false);
        setImageStyle(d.imageStyle || 'photorealistic');
        setImageSize(d.imageSize || '1200x628');
        setImageModel(d.imageModel || 'gpt-image-2');
        setInsertInlineImages(d.insertInlineImages !== undefined ? d.insertInlineImages : false);
        setInlineImagesCount(d.inlineImagesCount !== undefined ? d.inlineImagesCount : 3);
        setInlineImagesParagraphInterval(d.inlineImagesParagraphInterval !== undefined ? d.inlineImagesParagraphInterval : 3);
        setCustomImageSize(d.customImageSize || '');
        setArticleLength(d.articleLength || 'medium');
        setPublishingMode(d.publishingMode || 'publish');
        setPublishTargetWp(d.publishTargetWp !== undefined ? d.publishTargetWp : true);
        setPublishTargetGoogle(d.publishTargetGoogle !== undefined ? d.publishTargetGoogle : false);
        setSeoPlugin(d.seoPlugin || 'yoast');
        setInsertInternalLinks(d.insertInternalLinks !== undefined ? d.insertInternalLinks : true);
        setInternalLinksCount(d.internalLinksCount !== undefined ? d.internalLinksCount : 3);
        setInsertOutboundLinks(d.insertOutboundLinks !== undefined ? d.insertOutboundLinks : true);
        setOutboundLinksCount(d.outboundLinksCount !== undefined ? d.outboundLinksCount : 5);
        setIsScheduled(d.isScheduled || false);
        setScheduleFrequency(d.scheduleFrequency || 'once');
        return;
      } catch (err) {
        console.error('Error loading task defaults in resetForm:', err);
      }
    }

    if (websites.length > 0) setWebsiteId(websites[0].id.toString());
    setPublishTargetWp(true);
    setPublishTargetGoogle(false);
    setSelectedCategories([]);
    setPromptTemplate(`Write an in-depth, captivating, and well-researched blog post of 2,000–3,000 words on {keyword}. The content should be written in a natural, human tone, engaging the reader through storytelling, personal anecdotes, and clear examples.

Ensure the post is rich in value, covering every aspect of the topic from different perspectives, offering expert insights, analysis, and actionable advice. While writing, naturally incorporate strong E-E-A-T principles by demonstrating real-life experience, expert-backed insights, credible research support, and trustworthy guidance that aligns with Google's quality standards. The writing should flow seamlessly, with easy-to-follow subheadings, bullet points, and unique markdown formatting to enhance readability, without Separator in paragraph.

Incorporate outbound links to authoritative websites and resources within each paragraph and heading to support key points and improve SEO. Avoid jargon and keep the language conversational and relatable, making the content both informative and entertaining. Ensure the content reflects high levels of experience, expertise, authoritativeness, and trustworthiness in every section to build credibility and create a strong E-E-A-T foundation.

For outbound links, include 8 to 10 high-quality references from authoritative sources within the content. Do not list these links separately; instead, naturally integrate them within different paragraphs by hyperlinking relevant keywords or phrases. Avoid using direct URLs. The links should add value and credibility without overwhelming the content.

Include a comparison table (with an attractive heading) to illustrate key points, as well as a detailed FAQ section to address common questions. End with a long, well-rounded conclusion that ties the content together and offers next steps or reflections for the reader.
Make sure the article is plagiarism-free and SEO-optimized.
I also want my blogs to be written specifically for getting AdSense approval, so there should not be any issues like policy violations or low-value content. Please make sure the blogs are high-value and completely free from any kind of policy violation, and ensure the writing follows strong E-E-A-T standards to maximize trustworthiness and AdSense compatibility.

Important Instruction:

The final blog content must ONLY discuss the topic itself.
Do NOT mention, reference, explain, or hint at this prompt, instructions, writing guidelines, SEO rules, E-E-A-T terms, AdSense approval, or any meta/process-related information anywhere in the blog content.

➕ ADDITIONAL BUYER REQUIREMENTS

Add the following conditions while writing the blog:

The content must not feel AI-generated and should read like it is written by a knowledgeable human subject-matter expert

Do NOT use first-person storytelling or personal anecdotes such as “I’ll never forget…”, “I once saw…”, “my neighbor”, or similar narrative-style experiences

Do NOT include fictional characters, names, or repeated story examples (for example, recurring names like “Sarah” or invented scenarios)

All examples must be neutral, factual, topic-focused, and informational, written in an objective third-person tone
Avoid emotional storytelling meant to simulate human experience; instead, rely on real-world context, practical explanations, observed patterns, and credible references

Keep examples varied, realistic, and directly relevant to the topic, without templated storytelling formats`);
    
    if (providers.length > 0) {
      const defaultProv = providers.find((p: any) => p.is_default === 1);
      setProviderId(defaultProv ? defaultProv.id.toString() : providers[0].id.toString());
      const selectedProv = defaultProv || providers[0];
      const models = JSON.parse(selectedProv.models || '[]');
      if (models.length > 0) {
        const gpt4oIndex = models.findIndex((m: string) => m.toLowerCase() === 'gpt-4o');
        if (gpt4oIndex !== -1) {
          setModel(models[gpt4oIndex]);
        } else {
          setModel(models[0]);
        }
        setIsCustomModel(false);
      }
    }
    setImageGeneration(1);
    setIsCustomModel(false);
    setImageStyle('photorealistic');
    setImageSize('1200x628');
    setImageModel('gpt-image-2');
    setInsertInlineImages(false);
    setInlineImagesCount(3);
    setInlineImagesParagraphInterval(3);
    setCustomImageSize('');
    setArticleLength('medium');
    setPublishingMode('publish');
    setSeoPlugin('yoast');
    setInsertInternalLinks(true);
    setInternalLinksCount(3);
    setInsertOutboundLinks(true);
    setOutboundLinksCount(5);
    setIsScheduled(false);
    setScheduleFrequency('once');
  };

  const validateStep = (currentStep: number): boolean => {
    setFormError('');
    switch (currentStep) {
      case 1:
        if (!name.trim()) {
          const dateStr = new Date().toLocaleDateString();
          setName(`Bulk Writer - ${dateStr}`);
        }
        if (!publishTargetWp && !publishTargetGoogle) {
          setFormError('Please select at least one publishing target.');
          return false;
        }
        if (publishTargetWp && !websiteId) {
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

    let finalName = name.trim();
    if (!finalName) {
      const dateStr = new Date().toLocaleDateString();
      finalName = `Bulk Writer - ${dateStr}`;
      setName(finalName);
    }

    let scheduleSettings = {};
    if (isScheduled && scheduleDate && scheduleTime) {
      const scheduleIso = new Date(`${scheduleDate}T${scheduleTime}`).toISOString();
      scheduleSettings = {
        startDate: scheduleIso,
        frequency: scheduleFrequency
      };
    }

    const targets = [];
    if (publishTargetWp) targets.push('wordpress');
    if (publishTargetGoogle) targets.push('googledocs');
    const publishTarget = targets.join(',') || 'wordpress';

    const finalStyleStr = JSON.stringify({
      style: imageStyle,
      model: imageModel,
      inlineCount: inlineImagesCount,
      inlineInterval: inlineImagesParagraphInterval
    });

    const taskPayload = {
      name: finalName,
      websiteId: publishTargetWp ? parseInt(websiteId, 10) : 0,
      language: 'en',
      country: 'us',
      category: selectedCategories.join(', '),
      keywords,
      promptTemplate,
      providerId: parseInt(providerId, 10),
      model,
      imageGeneration,
      imageStyle: finalStyleStr,
      imageSize: imageSize === 'custom' ? customImageSize : imageSize,
      imageModel: imageModel || 'gpt-image-2',
      insertInlineImages: insertInlineImages ? 1 : 0,
      articleLength,
      publishingMode: publishingMode === 'future' ? 'future' : publishingMode,
      seoSettings: {
        plugin: seoPlugin,
        insertInternalLinks,
        internalLinksCount,
        insertOutboundLinks,
        outboundLinksCount
      },
      scheduleSettings,
      isScheduled,
      publishTarget
    };

    try {
      const saveDefaults = () => {
        const defaults = {
          websiteId,
          selectedCategories,
          promptTemplate,
          providerId,
          model,
          isCustomModel,
          imageGeneration,
          imageStyle,
          imageSize,
          imageModel,
          insertInlineImages,
          inlineImagesCount,
          inlineImagesParagraphInterval,
          customImageSize,
          articleLength,
          publishingMode,
          publishTargetWp,
          publishTargetGoogle,
          seoPlugin,
          insertInternalLinks,
          internalLinksCount,
          insertOutboundLinks,
          outboundLinksCount,
          isScheduled,
          scheduleFrequency
        };
        localStorage.setItem('task_defaults', JSON.stringify(defaults));
      };

      if (editingTaskId) {
        const currentTask = tasks.find(t => t.id === editingTaskId);
        const res = await api.updateTask(editingTaskId, {
          ...taskPayload,
          status: currentTask?.status || 'draft'
        });
        if (res.success) {
          saveDefaults();
          setOpenAdd(false);
          resetForm();
          fetchTasks();
        }
      } else {
        const res = await api.createTask(taskPayload);
        if (res.success) {
          saveDefaults();
          if (publishTargetWp && websiteId) {
            await api.updateSetting('last_selected_website', websiteId);
          }
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

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Publishing Target</label>
              <div className="flex items-center space-x-6 bg-zinc-900/30 border border-zinc-800 p-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <input
                    id="target-wp"
                    type="checkbox"
                    checked={publishTargetWp}
                    onChange={(e) => setPublishTargetWp(e.target.checked)}
                    className="rounded border-zinc-850 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4 w-4 accent-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="target-wp" className="text-xs font-semibold text-zinc-300 cursor-pointer select-none">
                    WordPress Blog
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    id="target-google"
                    type="checkbox"
                    checked={publishTargetGoogle}
                    onChange={(e) => setPublishTargetGoogle(e.target.checked)}
                    className="rounded border-zinc-850 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4 w-4 accent-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="target-google" className="text-xs font-semibold text-zinc-300 cursor-pointer select-none">
                    Google Docs
                  </label>
                </div>
              </div>
            </div>

            {publishTargetWp && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target WordPress site</label>
                <Select value={websiteId} onChange={(e) => setWebsiteId(e.target.value)}>
                  {websites.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.url})</option>
                  ))}
                </Select>
              </div>
            )}
            
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
                <Select value={isCustomModel ? 'custom' : model} onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setIsCustomModel(true);
                    setModel('');
                  } else {
                    setIsCustomModel(false);
                    setModel(e.target.value);
                  }
                }}>
                  {availableModels.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="custom">✏️ Enter Custom Model ID...</option>
                </Select>
              </div>
            </div>

            {isCustomModel && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Custom Model ID</label>
                <Input
                  placeholder="e.g. google/gemini-2.5-pro, gemini-1.5-pro, or gpt-4o-mini"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 font-mono text-xs"
                />
              </div>
            )}

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
            
            {/* Featured Image Selection */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Featured Image Source</label>
                <Select value={imageGeneration.toString()} onChange={(e) => setImageGeneration(parseInt(e.target.value, 10))}>
                  <option value="0">None (No Featured Image)</option>
                  <option value="1">AI Generated (OpenAI DALL-E)</option>
                  <option value="100">AI Generated (Runware.ai)</option>
                  <option value="101">AI Generated (Google Gemini Imagen)</option>
                  <option value="2">Pexels (Free Stock Photos)</option>
                  <option value="3">Unsplash (Free Stock Photos)</option>
                  <option value="4">Pixabay (Free Stock Photos)</option>
                  <option value="10">💻 Tech / AI (Unsplash + Pixabay Presets)</option>
                  <option value="11">🍕 Food (Pexels + Unsplash Presets)</option>
                  <option value="12">✈️ Travel (Flickr + Pexels Presets)</option>
                  <option value="13">🏋️ Health / Fitness (Pexels + Pixabay Presets)</option>
                  <option value="14">📚 Education (Wikimedia + Openverse Presets)</option>
                  <option value="15">🚀 Science / Space (NASA + Pixabay Presets)</option>
                  <option value="16">🛒 E-commerce (Burst + Pexels Presets)</option>
                  <option value="17">💰 Finance / Business (Unsplash + StockSnap Presets)</option>
                  <option value="18">🎨 Creative / Art (Reshot + Gratisography Presets)</option>
                  <option value="19">🌿 Nature / Environment (Life of Pix + Pixabay Presets)</option>
                </Select>
                <p className="text-[10px] text-zinc-500">
                  {imageGeneration === 1 && "Generates a custom illustration using OpenAI DALL-E models."}
                  {imageGeneration === 100 && "Generates a custom illustration using Stable Diffusion via Runware.ai."}
                  {imageGeneration === 101 && "Generates a custom illustration using Google Gemini Imagen models."}
                  {imageGeneration === 2 && "Downloads high-resolution free stock photos from Pexels."}
                  {imageGeneration === 3 && "Downloads high-resolution free stock photos from Unsplash."}
                  {imageGeneration === 4 && "Downloads high-resolution free stock photos from Pixabay."}
                  {imageGeneration >= 10 && imageGeneration <= 19 && "Applies smart niche-specific stock photo provider fallbacks."}
                  {imageGeneration === 0 && "No featured image will be added to the articles."}
                </p>
              </div>

              {/* OpenAI DALL-E Settings */}
              {imageGeneration === 1 && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/40">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AI Image Model</label>
                    <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                      <option value="gpt-image-2">gpt-image-2 (OpenAI DALL-E 3 - Recommended)</option>
                      <option value="dall-e-3">dall-e-3 (OpenAI DALL-E 3)</option>
                      <option value="dall-e-2">dall-e-2 (OpenAI DALL-E 2)</option>
                    </Select>
                  </div>
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
                      <option value="1200x628">1200 × 628 px (WordPress Landscape)</option>
                      <option value="1200x675">1200 × 675 px (WordPress Landscape - Alt)</option>
                      <option value="1024x1024">1024 × 1024 px (Square)</option>
                      <option value="1024x768">1024 × 768 px (Standard Landscape)</option>
                      <option value="768x1024">768 × 1024 px (Standard Portrait)</option>
                      <option value="custom">Custom Size</option>
                    </Select>
                  </div>
                  {imageSize === 'custom' && (
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Custom Resolution</label>
                      <Input 
                        type="text" 
                        value={customImageSize} 
                        onChange={(e) => setCustomImageSize(e.target.value)} 
                        placeholder="e.g. 800x600" 
                        className="bg-zinc-950 border-zinc-800 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Runware Settings */}
              {imageGeneration === 100 && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/40">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Runware.ai Model ID</label>
                    <Input 
                      type="text" 
                      value={imageModel} 
                      onChange={(e) => setImageModel(e.target.value)} 
                      placeholder="e.g. runware:100 or civitai:123456@7890" 
                      className="bg-zinc-950 border-zinc-800 font-mono text-xs"
                    />
                    <p className="text-[9px] text-zinc-500">
                      Standard options from settings: {runwareModelsList.join(', ')}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Aspect Style</label>
                    <Select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)}>
                      <option value="photorealistic">Photorealistic</option>
                      <option value="anime">Anime</option>
                      <option value="cinematic">Cinematic</option>
                      <option value="3d-render">3D Render</option>
                      <option value="painting">Painting</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Image Resolution</label>
                    <Select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
                      <option value="1200x628">1200 × 628 px (WordPress Landscape)</option>
                      <option value="1200x675">1200 × 675 px (WordPress Landscape - Alt)</option>
                      <option value="1024x1024">1024 × 1024 px (Square)</option>
                      <option value="1024x768">1024 × 768 px (Standard Landscape)</option>
                      <option value="768x1024">768 × 1024 px (Standard Portrait)</option>
                      <option value="custom">Custom Size</option>
                    </Select>
                  </div>
                  {imageSize === 'custom' && (
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Custom Resolution</label>
                      <Input 
                        type="text" 
                        value={customImageSize} 
                        onChange={(e) => setCustomImageSize(e.target.value)} 
                        placeholder="e.g. 800x600" 
                        className="bg-zinc-950 border-zinc-800 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Gemini Imagen Settings */}
              {imageGeneration === 101 && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800/40">
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Google Imagen Model</label>
                    <Select value={imageModel} onChange={(e) => setImageModel(e.target.value)}>
                      <option value="imagen-3.0-generate-002">imagen-3.0-generate-002 (Imagen 3 - Best Quality)</option>
                      <option value="imagen-3.0-capability-001">imagen-3.0-capability-001</option>
                      <option value="imagen-2.5-generate-002">imagen-2.5-generate-002</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Aspect Style</label>
                    <Select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)}>
                      <option value="photorealistic">Photorealistic</option>
                      <option value="natural">Natural</option>
                      <option value="cinematic">Cinematic</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Image Resolution</label>
                    <Select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
                      <option value="1200x628">1200 × 628 px (WordPress Landscape)</option>
                      <option value="1200x675">1200 × 675 px (WordPress Landscape - Alt)</option>
                      <option value="1024x1024">1024 × 1024 px (Square)</option>
                      <option value="1024x768">1024 × 768 px (Standard Landscape)</option>
                      <option value="768x1024">768 × 1024 px (Standard Portrait)</option>
                      <option value="custom">Custom Size</option>
                    </Select>
                  </div>
                  {imageSize === 'custom' && (
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Custom Resolution</label>
                      <Input 
                        type="text" 
                        value={customImageSize} 
                        onChange={(e) => setCustomImageSize(e.target.value)} 
                        placeholder="e.g. 800x600" 
                        className="bg-zinc-950 border-zinc-800 text-xs font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Stock / Niche Presets Settings */}
              {((imageGeneration > 1 && imageGeneration < 100) || imageGeneration >= 10) && (
                <div className="pt-2 border-t border-zinc-800/40 text-[11px] text-zinc-400 space-y-3">
                  <p>Images will be searched and downloaded from the selected free stock libraries automatically using context-relevant keywords.</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Image Resolution</label>
                      <Select value={imageSize} onChange={(e) => setImageSize(e.target.value)}>
                        <option value="1200x628">1200 × 628 px (WordPress Landscape)</option>
                        <option value="1200x675">1200 × 675 px (WordPress Landscape - Alt)</option>
                        <option value="1024x1024">1024 × 1024 px (Square)</option>
                        <option value="1024x768">1024 × 768 px (Standard Landscape)</option>
                        <option value="768x1024">768 × 1024 px (Standard Portrait)</option>
                        <option value="custom">Custom Size</option>
                      </Select>
                    </div>
                    {imageSize === 'custom' && (
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Custom Resolution</label>
                        <Input 
                          type="text" 
                          value={customImageSize} 
                          onChange={(e) => setCustomImageSize(e.target.value)} 
                          placeholder="e.g. 800x600" 
                          className="bg-zinc-950 border-zinc-800 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Inline Images Settings Card */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold text-zinc-200">Insert Contextual Inline Images</h5>
                  <p className="text-[10px] text-zinc-400">Automatically search and embed relevant stock images inside the body of the article.</p>
                </div>
                <input
                  type="checkbox"
                  checked={insertInlineImages}
                  onChange={(e) => setInsertInlineImages(e.target.checked)}
                  className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                />
              </div>

              {insertInlineImages && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800/40">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Max Number of Inline Images</label>
                    <Select value={inlineImagesCount.toString()} onChange={(e) => setInlineImagesCount(parseInt(e.target.value, 10))}>
                      <option value="1">1 Image</option>
                      <option value="2">2 Images</option>
                      <option value="3">3 Images</option>
                      <option value="5">5 Images</option>
                    </Select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Paragraph Interval</label>
                    <Select value={inlineImagesParagraphInterval.toString()} onChange={(e) => setInlineImagesParagraphInterval(parseInt(e.target.value, 10))}>
                      <option value="2">Every 2 Paragraphs</option>
                      <option value="3">Every 3 Paragraphs (Recommended)</option>
                      <option value="4">Every 4 Paragraphs</option>
                      <option value="5">Every 5 Paragraphs</option>
                    </Select>
                  </div>
                  <p className="text-[9px] text-zinc-500 col-span-2">
                    Images are automatically selected contextually from the stock provider based on the paragraph immediately preceding the image placement.
                  </p>
                </div>
              )}
            </div>

            {/* Internal & External SEO Links Control Card */}
            <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 space-y-4">
              <h5 className="text-xs font-bold text-zinc-200 uppercase tracking-wider border-b border-zinc-800/40 pb-2">SEO Article Links Controls</h5>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Internal Links Column */}
                <div className="space-y-4 bg-zinc-950/40 border border-zinc-900 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h6 className="text-[11px] font-bold text-zinc-300">Insert Internal Links</h6>
                      <p className="text-[9px] text-zinc-500">Insert placeholder wiki-style internal links.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={insertInternalLinks}
                      onChange={(e) => setInsertInternalLinks(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4 w-4 accent-indigo-600 cursor-pointer"
                    />
                  </div>
                  {insertInternalLinks && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Number of Internal Links</label>
                      <Select value={internalLinksCount.toString()} onChange={(e) => setInternalLinksCount(parseInt(e.target.value, 10))}>
                        <option value="1">1 Link</option>
                        <option value="2">2 Links</option>
                        <option value="3">3 Links (Default)</option>
                        <option value="5">5 Links</option>
                        <option value="8">8 Links</option>
                      </Select>
                    </div>
                  )}
                </div>

                {/* External/Outbound Links Column */}
                <div className="space-y-4 bg-zinc-950/40 border border-zinc-900 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h6 className="text-[11px] font-bold text-zinc-300">Insert Outbound Links</h6>
                      <p className="text-[9px] text-zinc-500">Insert authoritative outbound reference links.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={insertOutboundLinks}
                      onChange={(e) => setInsertOutboundLinks(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4 w-4 accent-indigo-600 cursor-pointer"
                    />
                  </div>
                  {insertOutboundLinks && (
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Number of Outbound Links</label>
                      <Select value={outboundLinksCount.toString()} onChange={(e) => setOutboundLinksCount(parseInt(e.target.value, 10))}>
                        <option value="2">2 Links</option>
                        <option value="3">3 Links</option>
                        <option value="5">5 Links (Default)</option>
                        <option value="8">8 Links</option>
                        <option value="10">10 Links</option>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
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

                              <Button
                                variant="outline"
                                size="icon"
                                title="Delete Task"
                                onClick={() => handleDelete(task.id)}
                                className="h-8 w-8 border-zinc-800 text-rose-400 hover:bg-rose-500/5 hover:text-rose-300"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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

          <DialogFooter className="pt-4 border-t border-zinc-800/40 flex justify-between sm:justify-between items-center">
            <div className="flex space-x-2">
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

              {!editingTaskId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const defaults = {
                      websiteId,
                      selectedCategories,
                      promptTemplate,
                      providerId,
                      model,
                      isCustomModel,
                      imageGeneration,
                      imageStyle,
                      imageSize,
                      imageModel,
                      articleLength,
                      publishingMode,
                      seoPlugin,
                      isScheduled,
                      scheduleFrequency
                    };
                    localStorage.setItem('task_defaults', JSON.stringify(defaults));
                    alert('Current settings saved as defaults for new tasks!');
                  }}
                  className="border-zinc-800 text-zinc-400 hover:text-indigo-400 text-xs h-9"
                  title="Save current configuration as default for new tasks"
                >
                  Save as Defaults
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
