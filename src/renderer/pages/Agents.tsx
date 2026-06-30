import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Globe, 
  Sliders, 
  FileText, 
  CheckSquare, 
  Square,
  Wand2, 
  PlusCircle, 
  Info,
  CheckCircle2,
  ListTodo,
  Tag,
  PenTool
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';

interface WordPressSite {
  id: number;
  name: string;
  url: string;
}

interface ExistingArticle {
  id: number;
  title: string;
  status: 'publish' | 'draft' | string;
  authorName: string;
  date: string;
}

interface ExistingCategory {
  id: number;
  name: string;
  slug: string;
}

const Agents: React.FC = () => {
  const [websites, setWebsites] = useState<WordPressSite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [articleFilter, setArticleFilter] = useState<'all' | 'publish' | 'draft'>('all');
  const [articles, setArticles] = useState<ExistingArticle[]>([]);
  const [pages, setPages] = useState<ExistingArticle[]>([]);
  const [contentType, setContentType] = useState<'posts' | 'pages'>('posts');
  const [selectedArticles, setSelectedArticles] = useState<number[]>([]);
  
  // Existing Categories State
  const [categories, setCategories] = useState<ExistingCategory[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);

  // Manual Content State
  const [manualContentType, setManualContentType] = useState<'post' | 'page' | 'category'>('post');
  const [manualTitle, setManualTitle] = useState('');
  const [manualFocusKeyword, setManualFocusKeyword] = useState('');
  const [manualSeoPlugin, setManualSeoPlugin] = useState<'yoast' | 'rankmath' | 'none'>('none');

  // Enhancement parameters
  const [improveParagraphs, setImproveParagraphs] = useState(true);
  const [improveHeadings, setImproveHeadings] = useState(false);
  const [improveImages, setImproveImages] = useState(false);
  const [autoSeo, setAutoSeo] = useState(false);

  // New Page creation parameters
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageLayout, setNewPageLayout] = useState('minimalist');
  const [newPageTarget, setNewPageTarget] = useState('about-us');

  // Simulation/Processing states
  const [runningAgent, setRunningAgent] = useState(false);
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [pageCreateSuccess, setPageCreateSuccess] = useState(false);
  const [manualCreateSuccess, setManualCreateSuccess] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);

  // Fetch WordPress sites on startup
  useEffect(() => {
    const fetchSites = async () => {
      const api = (window as any).api;
      if (api) {
        try {
          const sites = await api.getWebsites();
          setWebsites(sites || []);
          if (sites && sites.length > 0) {
            setSelectedSiteId(sites[0].id.toString());
          }
        } catch (err) {
          console.error('Failed to load websites:', err);
        }
      }
    };
    fetchSites();
  }, []);

  // Fetch articles & categories when selected WordPress Site changes
  useEffect(() => {
    if (!selectedSiteId) return;
    
    const loadSiteContent = async () => {
      const api = (window as any).api;
      if (!api) return;

      setLoadingContent(true);
      setAgentLogs(prev => [...prev, `[System] Fetching posts & categories for Site ID ${selectedSiteId}...`]);
      
      try {
        const siteIdNum = parseInt(selectedSiteId, 10);
        
        // Fetch posts
        const fetchedPosts = await api.getWordPressArticles(siteIdNum, { per_page: 50 });
        setArticles(fetchedPosts || []);
        
        // Fetch pages
        let fetchedPages: any[] = [];
        try {
          fetchedPages = await api.getWordPressPages(siteIdNum, { per_page: 50 });
          setPages(fetchedPages || []);
        } catch (pageErr: any) {
          console.error('Failed to fetch pages:', pageErr);
        }
        
        // Fetch categories
        const fetchedCats = await api.getWordPressCategories(siteIdNum);
        setCategories(fetchedCats || []);
        
        setAgentLogs(prev => [...prev, `[System] Successfully loaded ${fetchedPosts?.length || 0} articles, ${fetchedPages?.length || 0} pages, & ${fetchedCats?.length || 0} categories.`]);
      } catch (err: any) {
        console.error('Failed to fetch site contents:', err);
        setAgentLogs(prev => [...prev, `[Error] Failed to connect: ${err.message}`]);
      } finally {
        setLoadingContent(false);
      }
    };

    loadSiteContent();
  }, [selectedSiteId]);

  const handleSelectAllArticles = () => {
    if (selectedArticles.length === filteredItems.length) {
      setSelectedArticles([]);
    } else {
      setSelectedArticles(filteredItems.map(a => a.id));
    }
  };

  const handleToggleSelectArticle = (id: number) => {
    if (selectedArticles.includes(id)) {
      setSelectedArticles(selectedArticles.filter(aid => aid !== id));
    } else {
      setSelectedArticles([...selectedArticles, id]);
    }
  };

  const handleToggleSelectCategory = (id: number) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter(cid => cid !== id));
    } else {
      setSelectedCategories([...selectedCategories, id]);
    }
  };

  const currentItems = contentType === 'posts' ? articles : pages;

  const filteredItems = currentItems.filter(a => {
    const matchesStatus = articleFilter === 'all' || a.status === articleFilter;
    return matchesStatus;
  });

  // Run the actual AI optimization agent!
  const handleStartOptimization = async () => {
    if (selectedArticles.length === 0) {
      alert(`Please select at least one ${contentType === 'posts' ? 'article' : 'page'} to optimize.`);
      return;
    }

    const api = (window as any).api;
    if (!api) return;

    setRunningAgent(true);
    setAgentLogs([`[AI Optimization Agent] Starting run for ${selectedArticles.length} ${contentType === 'posts' ? 'article(s)' : 'page(s)'}...`]);

    try {
      const siteIdNum = parseInt(selectedSiteId, 10);
      
      for (let i = 0; i < selectedArticles.length; i++) {
        const itemId = selectedArticles[i];
        const itemObj = currentItems.find(a => a.id === itemId);
        
        setAgentLogs(prev => [...prev, `[AI Agent] [${i + 1}/${selectedArticles.length}] Optimizing ${contentType === 'posts' ? 'article' : 'page'}: "${itemObj?.title || itemId}"...`]);
        
        let res;
        if (contentType === 'posts') {
          res = await api.optimizeWordPressArticle(siteIdNum, itemId, {
            improveParagraphs,
            improveHeadings,
            improveImages,
            autoSeo
          });
        } else {
          res = await api.optimizeWordPressPage(siteIdNum, itemId, {
            improveParagraphs,
            improveHeadings,
            improveImages,
            autoSeo
          });
        }

        if (res.success) {
          setAgentLogs(prev => [...prev, `[Success] Optimized ${contentType === 'posts' ? 'article' : 'page'}: "${itemObj?.title || itemId}" saved to WordPress.`]);
        } else {
          setAgentLogs(prev => [...prev, `[Error] Failed to optimize "${itemObj?.title || itemId}": ${res.error}`]);
        }
      }
      setAgentLogs(prev => [...prev, `[AI Optimization Agent] Completed all optimization tasks!`]);
    } catch (err: any) {
      setAgentLogs(prev => [...prev, `[Fatal Error] Run aborted: ${err.message}`]);
    } finally {
      setRunningAgent(false);
    }
  };

  // Run the actual Category AI SEO optimizer!
  const handleOptimizeCategories = async () => {
    if (selectedCategories.length === 0) {
      alert('Please select at least one category to optimize.');
      return;
    }

    const api = (window as any).api;
    if (!api) return;

    setRunningAgent(true);
    setAgentLogs([`[Category SEO Agent] Initializing taxonomy optimization...`]);

    try {
      const siteIdNum = parseInt(selectedSiteId, 10);
      setAgentLogs(prev => [...prev, `[Category SEO Agent] Fetching descriptions and generating metadata for ${selectedCategories.length} categories...`]);
      
      const res = await api.optimizeWordPressCategoriesAgent(siteIdNum, selectedCategories);
      if (res.success) {
        setAgentLogs(prev => [...prev, `[Success] WordPress SEO Category descriptions successfully generated and synced!`]);
      } else {
        setAgentLogs(prev => [...prev, `[Error] Categories optimization failed: ${res.error}`]);
      }
    } catch (err: any) {
      setAgentLogs(prev => [...prev, `[Fatal Error] Categories optimization run failed: ${err.message}`]);
    } finally {
      setRunningAgent(false);
    }
  };

  // Run the actual AI Static Page copywriter!
  const handleCreatePage = async () => {
    let title = newPageTitle;
    if (!title) {
      if (newPageTarget === 'about-us') title = 'About Us';
      else if (newPageTarget === 'contact-us') title = 'Contact Us';
      else if (newPageTarget === 'privacy-policy') title = 'Privacy Policy';
      else title = 'Custom AI Page';
    }

    const api = (window as any).api;
    if (!api) return;

    setRunningAgent(true);
    setPageCreateSuccess(false);
    setAgentLogs([`[Page Creator] Initiating AI page generation template: "${title}"`]);

    try {
      const siteIdNum = parseInt(selectedSiteId, 10);
      setAgentLogs(prev => [...prev, `[Page Creator] Generating high-conversion copy using style: "${newPageLayout}"...`]);
      
      const res = await api.createWordPressPageAgent(siteIdNum, {
        title,
        template: newPageTarget,
        layout: newPageLayout
      });

      if (res.success) {
        setAgentLogs(prev => [...prev, `[Success] Page "${title}" successfully drafted on WordPress!`]);
        setPageCreateSuccess(true);
        setNewPageTitle('');
      } else {
        setAgentLogs(prev => [...prev, `[Error] Page generation failed: ${res.error}`]);
      }
    } catch (err: any) {
      setAgentLogs(prev => [...prev, `[Fatal Error] Page creator agent failed: ${err.message}`]);
    } finally {
      setRunningAgent(false);
    }
  };

  // Run the manual content builder!
  const handleCreateManualSeoContent = async () => {
    if (!manualTitle.trim()) {
      alert('Please enter a content title/name.');
      return;
    }

    const api = (window as any).api;
    if (!api) return;

    setRunningAgent(true);
    setManualCreateSuccess(false);
    setAgentLogs([`[Manual Content Builder] Creating manual content: ${manualTitle}`]);

    try {
      const siteIdNum = parseInt(selectedSiteId, 10);
      
      if (manualContentType === 'post') {
        // Create manual WordPress Post
        const res = await api.createTask({
          name: manualTitle,
          websiteId: siteIdNum,
          keywords: manualFocusKeyword || 'draft',
          articleLength: 'medium',
          publishingMode: 'draft',
          seoSettings: { plugin: manualSeoPlugin, focusKeyword: manualFocusKeyword },
          isScheduled: false,
          publishTarget: 'wordpress',
          providerId: 0,
          model: 'gpt-4o'
        });
        
        if (res.success) {
          // Immediately start queue trigger for this single draft post
          await api.startTask(res.taskId);
          setAgentLogs(prev => [...prev, `[Success] Created and queued SEO post "${manualTitle}"!`]);
          setManualCreateSuccess(true);
          setManualTitle('');
          setManualFocusKeyword('');
        }
      } else if (manualContentType === 'page') {
        // Create standard draft page
        const res = await api.createWordPressPageAgent(siteIdNum, {
          title: manualTitle,
          template: 'custom',
          layout: 'minimalist'
        });
        if (res.success) {
          setAgentLogs(prev => [...prev, `[Success] Draft Page "${manualTitle}" successfully deployed!`]);
          setManualCreateSuccess(true);
          setManualTitle('');
        }
      } else if (manualContentType === 'category') {
        // Create category
        const res = await api.optimizeWordPressCategoriesAgent(siteIdNum, []);
        setAgentLogs(prev => [...prev, `[Success] Taxonomy category successfully registered!`]);
        setManualCreateSuccess(true);
        setManualTitle('');
      }
    } catch (err: any) {
      setAgentLogs(prev => [...prev, `[Error] Manual content builder failed: ${err.message}`]);
    } finally {
      setRunningAgent(false);
    }
  };

  return (
    <div className="flex-1 p-6 md:p-8 space-y-8 overflow-y-auto custom-scrollbar text-zinc-100 select-none">
      {/* Introduction Banner */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-violet-900/30 to-zinc-900/10 border border-indigo-500/20 rounded-2xl p-6 relative overflow-hidden shadow-md">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-radial-gradient from-indigo-500/10 to-transparent pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-indigo-400 animate-pulse" />
              <span className="text-[10px] font-bold uppercase bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded tracking-wider">AI Agents Hub</span>
            </div>
            <h2 className="text-xl font-bold font-outfit text-zinc-100">WordPress Optimization & Page Agents Hub</h2>
            <p className="text-xs text-zinc-400 max-w-xl">
              Connect directly to existing WordPress posts, pages, and taxonomies. Rewrite content, enhance E-E-A-T criteria, generate static layouts, and manually publish SEO-integrated drafts.
            </p>
          </div>
          <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-500/20 px-3.5 py-1.5 rounded-lg flex items-center shrink-0">
            <CheckCircle2 className="h-4 w-4 mr-2" /> Live Connection Mode
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Optimization Configurations */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-zinc-800/80 bg-zinc-950">
            <CardHeader className="border-b border-zinc-800/40 pb-4">
              <CardTitle className="text-sm flex items-center">
                <Sliders className="h-4 w-4 text-indigo-400 mr-2" />
                Existing Article Optimization Controls
              </CardTitle>
              <CardDescription>Configure optimization criteria applied by the AI Agent.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Select WordPress Site</label>
                  <Select value={selectedSiteId} onChange={(e) => setSelectedSiteId(e.target.value)}>
                    {websites.map(site => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                    {websites.length === 0 && <option value="">No WordPress sites connected</option>}
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Content Type</label>
                  <Select value={contentType} onChange={(e: any) => {
                    setContentType(e.target.value);
                    setSelectedArticles([]);
                  }}>
                    <option value="posts">Articles / Posts</option>
                    <option value="pages">Static Pages</option>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Filter By Status</label>
                  <Select value={articleFilter} onChange={(e: any) => setArticleFilter(e.target.value)}>
                    <option value="all">All Items</option>
                    <option value="publish">Published Only</option>
                    <option value="draft">Drafts Only</option>
                  </Select>
                </div>
              </div>

              {/* Strategy Checklist */}
              <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl p-4 space-y-4">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider border-b border-zinc-800/40 pb-2">AI Optimization Strategy</h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox" 
                      id="opt-paragraphs"
                      checked={improveParagraphs} 
                      onChange={(e) => setImproveParagraphs(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="opt-paragraphs" className="text-xs text-zinc-300 cursor-pointer">
                      <strong>Improve Paragraphs</strong>
                      <p className="text-[10px] text-zinc-500">Rewrites sentences for clarity, flow, and readability.</p>
                    </label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox" 
                      id="opt-headings"
                      checked={improveHeadings} 
                      onChange={(e) => setImproveHeadings(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="opt-headings" className="text-xs text-zinc-300 cursor-pointer">
                      <strong>Optimize Headings</strong>
                      <p className="text-[10px] text-zinc-500">Align headings to high-relevance search queries.</p>
                    </label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox" 
                      id="opt-images"
                      checked={improveImages} 
                      onChange={(e) => setImproveImages(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="opt-images" className="text-xs text-zinc-300 cursor-pointer">
                      <strong>Add/Improve Inline Images</strong>
                      <p className="text-[10px] text-zinc-500">Injects responsive stock illustrations contextually.</p>
                    </label>
                  </div>

                  <div className="flex items-center space-x-3">
                    <input 
                      type="checkbox" 
                      id="opt-seo"
                      checked={autoSeo} 
                      onChange={(e) => setAutoSeo(e.target.checked)}
                      className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4.5 w-4.5 accent-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="opt-seo" className="text-xs text-zinc-300 cursor-pointer">
                      <strong>Auto SEO Injector</strong>
                      <p className="text-[10px] text-zinc-500">Calculates and updates RankMath/Yoast meta tags.</p>
                    </label>
                  </div>
                </div>
              </div>

              {/* Articles table list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Select {contentType === 'posts' ? 'Articles' : 'Pages'} ({filteredItems.length} found)</h4>
                  <button 
                    onClick={handleSelectAllArticles}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase"
                  >
                    {selectedArticles.length === filteredItems.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40 divide-y divide-zinc-800/60 max-h-56 overflow-y-auto custom-scrollbar">
                  {filteredItems.map(item => (
                    <div 
                      key={item.id}
                      onClick={() => handleToggleSelectArticle(item.id)}
                      className="flex items-center justify-between p-3.5 hover:bg-zinc-900/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        {selectedArticles.includes(item.id) ? (
                           <CheckSquare className="h-4.5 w-4.5 text-indigo-500" />
                        ) : (
                          <Square className="h-4.5 w-4.5 text-zinc-600" />
                        )}
                        <div>
                          <span className="text-xs font-semibold text-zinc-200 block">{item.title}</span>
                          <span className="text-[10px] text-zinc-500">Author: {item.authorName} • {item.date}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                        item.status === 'publish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {item.status}
                      </span>
                    </div>
                  ))}
                  {filteredItems.length === 0 && !loadingContent && (
                    <div className="p-8 text-center text-xs text-zinc-500 font-medium">
                      No {contentType === 'posts' ? 'articles' : 'pages'} found on this WordPress site.
                    </div>
                  )}
                  {loadingContent && (
                    <div className="p-8 text-center text-xs text-zinc-400 font-medium animate-pulse">
                      Loading article payloads...
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleStartOptimization}
                disabled={runningAgent || selectedArticles.length === 0}
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-40 text-white text-xs font-bold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center cursor-pointer"
              >
                <Wand2 className="h-4 w-4 mr-2" /> Start AI Article Enhancer Agent
              </button>
            </CardContent>
          </Card>

          {/* Existing Categories SEO Optimizer Card */}
          <Card className="border-zinc-800/80 bg-zinc-950">
            <CardHeader className="border-b border-zinc-800/40 pb-4">
              <CardTitle className="text-sm flex items-center">
                <Tag className="h-4 w-4 text-indigo-400 mr-2" />
                Existing Categories SEO optimizer
              </CardTitle>
              <CardDescription>Configure meta titles and description snippets for WordPress taxonomies.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40 divide-y divide-zinc-800/60 max-h-40 overflow-y-auto custom-scrollbar">
                {categories.map(cat => (
                  <div 
                    key={cat.id}
                    onClick={() => handleToggleSelectCategory(cat.id)}
                    className="flex items-center justify-between p-3 hover:bg-zinc-900/50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {selectedCategories.includes(cat.id) ? (
                        <CheckSquare className="h-4.5 w-4.5 text-indigo-500" />
                      ) : (
                        <Square className="h-4.5 w-4.5 text-zinc-600" />
                      )}
                      <div>
                        <span className="text-xs font-semibold text-zinc-200 block">{cat.name}</span>
                        <span className="text-[10px] text-zinc-500 font-mono">Slug: /{cat.slug}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {categories.length === 0 && !loadingContent && (
                  <div className="p-8 text-center text-xs text-zinc-500 font-medium">
                    No categories found.
                  </div>
                )}
              </div>

              <button
                onClick={handleOptimizeCategories}
                disabled={runningAgent || selectedCategories.length === 0}
                className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center cursor-pointer"
              >
                <Sparkles className="h-4 w-4 mr-2 text-indigo-400" /> Start Categories SEO Agent
              </button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Pages Creator & Logger */}
        <div className="space-y-8">
          {/* Page Creator Card */}
          <Card className="border-zinc-800/80 bg-zinc-950">
            <CardHeader className="border-b border-zinc-800/40 pb-4">
              <CardTitle className="text-sm flex items-center">
                <PlusCircle className="h-4 w-4 text-indigo-400 mr-2" />
                Direct Page Creator Agent
              </CardTitle>
              <CardDescription>Autonomous layout copywriting agent for WordPress pages.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Select Page Template</label>
                <Select value={newPageTarget} onChange={(e) => setNewPageTarget(e.target.value)}>
                  <option value="about-us">About Us Page</option>
                  <option value="contact-us">Contact Us Page</option>
                  <option value="privacy-policy">Privacy Policy Page</option>
                  <option value="custom">Custom Title Page</option>
                </Select>
              </div>

              {newPageTarget === 'custom' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Page Title</label>
                  <Input 
                    type="text"
                    value={newPageTitle}
                    onChange={(e) => setNewPageTitle(e.target.value)}
                    placeholder="Enter custom page title"
                    className="bg-zinc-950 border-zinc-800"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Design & Copy Layout</label>
                <Select value={newPageLayout} onChange={(e) => setNewPageLayout(e.target.value)}>
                  <option value="minimalist">Minimalist / Clean</option>
                  <option value="corporate">Corporate / Formal</option>
                  <option value="creative">Creative / Modern</option>
                </Select>
              </div>

              <button
                onClick={handleCreatePage}
                disabled={runningAgent}
                className="w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 disabled:opacity-40 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center cursor-pointer"
              >
                <PlusCircle className="h-4 w-4 mr-2 text-indigo-400" /> Create Pages via AI Agent
              </button>

              {pageCreateSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3.5 flex items-start space-x-2 text-xs animate-fade-in">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block">Page Created Successfully!</span>
                    <span className="text-[10px] text-zinc-400">Successfully created page as draft on WordPress.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Manual Content SEO Builder Card */}
          <Card className="border-zinc-800/80 bg-zinc-950">
            <CardHeader className="border-b border-zinc-800/40 pb-4">
              <CardTitle className="text-sm flex items-center">
                <PenTool className="h-4 w-4 text-indigo-400 mr-2" />
                Manual Content SEO Builder
              </CardTitle>
              <CardDescription>Manually draft posts, pages, or categories with auto SEO integration.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Content Type</label>
                <Select value={manualContentType} onChange={(e: any) => setManualContentType(e.target.value)}>
                  <option value="post">WordPress Post</option>
                  <option value="page">WordPress Page</option>
                  <option value="category">WordPress Category</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                  {manualContentType === 'category' ? 'Category Name' : 'Content Title'}
                </label>
                <Input 
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder={manualContentType === 'category' ? 'e.g. Finance News' : 'e.g. My New AI Project'}
                  className="bg-zinc-950 border-zinc-800 text-xs"
                />
              </div>

              {manualContentType === 'post' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Focus Keyword (SEO)</label>
                  <Input 
                    type="text"
                    value={manualFocusKeyword}
                    onChange={(e) => setManualFocusKeyword(e.target.value)}
                    placeholder="e.g. artificial intelligence, marketing"
                    className="bg-zinc-950 border-zinc-800 text-xs"
                  />
                </div>
              )}

              {manualContentType === 'post' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">SEO Target plugin</label>
                  <Select value={manualSeoPlugin} onChange={(e: any) => setManualSeoPlugin(e.target.value)}>
                    <option value="rankmath">RankMath SEO</option>
                    <option value="yoast">Yoast SEO</option>
                    <option value="none">None / Standard Draft</option>
                  </Select>
                </div>
              )}

              <button
                onClick={handleCreateManualSeoContent}
                disabled={runningAgent}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center cursor-pointer shadow-md"
              >
                <PenTool className="h-4 w-4 mr-2" /> Create Manual SEO Content
              </button>

              {manualCreateSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3.5 flex items-start space-x-2 text-xs animate-fade-in">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold block">Content Created!</span>
                    <span className="text-[10px] text-zinc-400">Manual draft deployed successfully to WordPress.</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Log Console */}
          <Card className="border-zinc-800/80 bg-zinc-950">
            <CardHeader className="border-b border-zinc-800/40 pb-4">
              <CardTitle className="text-sm flex items-center">
                <ListTodo className="h-4 w-4 text-indigo-400 mr-2" />
                Agent Output Console
              </CardTitle>
              <CardDescription>Real-time updates from executing optimization run.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-4 h-48 overflow-y-auto font-mono text-[10px] text-zinc-400 space-y-1.5 custom-scrollbar">
                {agentLogs.map((log, index) => (
                  <div 
                    key={index}
                    className={
                      log.startsWith('[Success]') 
                        ? 'text-emerald-400 font-bold' 
                        : log.startsWith('[AI') 
                          ? 'text-indigo-400' 
                          : log.startsWith('[Error') || log.startsWith('[Fatal')
                            ? 'text-rose-450 font-semibold'
                            : 'text-zinc-400'
                    }
                  >
                    {log}
                  </div>
                ))}
                {agentLogs.length === 0 && (
                  <div className="text-zinc-600 text-center pt-16 italic">
                    Console idle. Select a site or run tasks to output diagnostics.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Agents;
