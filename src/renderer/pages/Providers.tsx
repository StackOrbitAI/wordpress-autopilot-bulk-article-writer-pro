import React, { useState, useEffect } from 'react';
import { KeyRound, Plus, Trash2, CheckCircle2, AlertTriangle, BadgeAlert, BrainCircuit, Globe } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';

const Providers: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [openAdd, setOpenAdd] = useState<boolean>(false);

  // Form Fields
  const [provider, setProvider] = useState<'openai' | 'gemini' | 'claude' | 'openrouter' | 'custom'>('openai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [organization, setOrganization] = useState('');
  const [modelsText, setModelsText] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [formError, setFormError] = useState('');

  // Default models list for pre-population
  const defaultModels: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    gemini: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-3.5-flash', 'gemini-3.5-pro', 'gemini-3.1-flash', 'gemini-3.1-pro'],
    claude: ['claude-3-5-sonnet-latest', 'claude-3-opus-latest', 'claude-3-haiku-20240307'],
    openrouter: ['google/gemini-3.5-flash', 'google/gemini-3.5-pro', 'google/gemini-1.5-flash', 'google/gemini-1.5-pro', 'anthropic/claude-3.5-sonnet', 'meta-llama/llama-3-70b-instruct'],
    custom: ['gpt-4o-mini', 'deepseek-chat']
  };

  useEffect(() => {
    // Populate default name & models when provider changes
    const readable: Record<string, string> = {
      openai: 'OpenAI Production',
      gemini: 'Google Gemini',
      claude: 'Anthropic Claude',
      openrouter: 'OpenRouter Console',
      custom: 'Custom LLM API'
    };
    setName(readable[provider] || '');
    setModelsText(defaultModels[provider]?.join(', ') || '');
    if (provider === 'openai') setBaseUrl('https://api.openai.com/v1');
    else if (provider === 'openrouter') setBaseUrl('https://openrouter.ai/api/v1');
    else setBaseUrl('');
  }, [provider]);

  const fetchKeys = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const data = await api.getApiKeys();
      setKeys(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = (window as any).api;
    if (!api) return;

    if (!name || !apiKey) {
      setFormError('Name and API Key are required.');
      return;
    }

    const parsedModels = modelsText
      .split(',')
      .map(m => m.trim())
      .filter(m => m.length > 0);

    try {
      const res = await api.addApiKey({
        provider,
        name,
        apiKey,
        baseUrl,
        organization,
        models: parsedModels,
        isDefault
      });

      if (res.success) {
        setOpenAdd(false);
        setApiKey('');
        setOrganization('');
        fetchKeys();
      }
    } catch (err: any) {
      setFormError(err.message || 'Failed to save API keys.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this API key provider? Tasks depending on it may fail.')) return;
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.deleteApiKey(id);
      fetchKeys();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSetDefault = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    try {
      await api.setDefaultApiKey(id);
      fetchKeys();
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to set default provider.');
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center">
            <KeyRound className="h-5 w-5 text-indigo-400 mr-2" />
            AI API Provider Integrations
          </h3>
          <p className="text-xs text-zinc-400 font-medium">Add credentials for OpenAI, Google Gemini, Anthropic, or custom endpoints.</p>
        </div>
        <Button 
          onClick={() => setOpenAdd(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-outfit flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Add Credentials</span>
        </Button>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-xs py-10 text-center">Loading AI provider integrations...</p>
      ) : keys.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-2xl p-16 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <BrainCircuit className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-200">No API keys configured</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              Configure your API keys (e.g. OpenAI or Gemini) to start generating SEO-friendly articles.
            </p>
          </div>
          <Button 
            onClick={() => setOpenAdd(true)}
            className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100"
          >
            Add API Key
          </Button>
        </div>
      ) : (
        <Card className="border-zinc-800/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="p-4">Provider</th>
                    <th className="p-4">Connection Name</th>
                    <th className="p-4">Base URL</th>
                    <th className="p-4">Models List</th>
                    <th className="p-4">Defaults</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {keys.map((key) => {
                    const parsedModels = JSON.parse(key.models || '[]');
                    return (
                      <tr key={key.id} className="hover:bg-zinc-900/10">
                        <td className="p-4 capitalize">
                          <Badge variant="outline" className="bg-zinc-900 font-mono text-[10px]">
                            {key.provider}
                          </Badge>
                        </td>
                        <td className="p-4 font-bold font-outfit text-zinc-200">{key.name}</td>
                        <td className="p-4 font-mono text-[10px] text-zinc-500 max-w-[200px] truncate">
                          {key.base_url || 'Default SDK URL'}
                        </td>
                        <td className="p-4 max-w-[250px] truncate">
                          <span className="text-zinc-400 text-[11px]">
                            {parsedModels.join(', ') || 'Auto-detect'}
                          </span>
                        </td>
                        <td className="p-4">
                          {key.is_default === 1 ? (
                            <Badge variant="success" className="flex items-center space-x-1 w-fit">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Default Provider</span>
                            </Badge>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-6 py-0 px-2 bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                              onClick={() => handleSetDefault(key.id)}
                            >
                              Make Default
                            </Button>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(key.id)}
                            className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/5"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Add Keys Dialog */}
      <Dialog open={openAdd} onOpenChange={setOpenAdd}>
        <DialogContent onClose={() => setOpenAdd(false)}>
          <DialogHeader>
            <DialogTitle>Add AI Provider Credentials</DialogTitle>
            <DialogDescription>
              Configure API keys securely. Credentials are encrypted locally via AES-256-GCM.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AI Platform</label>
                <Select value={provider} onChange={(e: any) => setProvider(e.target.value)}>
                  <option value="openai">OpenAI (DALL-E & GPT)</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="openrouter">OpenRouter API</option>
                  <option value="custom">Custom (OpenAI Spec)</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Connection Name</label>
                <Input 
                  placeholder="e.g. OpenAI Main" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Secret API Key</label>
              <Input 
                type="password" 
                placeholder="sk-..." 
                value={apiKey} 
                onChange={(e) => setApiKey(e.target.value)} 
                className="bg-zinc-950 border-zinc-800 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Custom Base URL (Optional)</label>
                <Input 
                  placeholder="https://..." 
                  value={baseUrl} 
                  onChange={(e) => setBaseUrl(e.target.value)} 
                  className="bg-zinc-950 border-zinc-800 font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Organization ID (Optional)</label>
                <Input 
                  placeholder="org-..." 
                  value={organization} 
                  onChange={(e) => setOrganization(e.target.value)} 
                  className="bg-zinc-950 border-zinc-800 font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Models List (Comma Separated)</label>
              <Input 
                placeholder="gpt-4o, gpt-4-turbo" 
                value={modelsText} 
                onChange={(e) => setModelsText(e.target.value)} 
                className="bg-zinc-950 border-zinc-800"
              />
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                id="default-prov"
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-zinc-800 bg-zinc-950 text-indigo-600 focus:ring-indigo-500/30 h-4 w-4 accent-indigo-600 cursor-pointer"
              />
              <label htmlFor="default-prov" className="text-xs font-semibold text-zinc-400 cursor-pointer select-none">
                Set as Default Provider for this model set
              </label>
            </div>

            {formError && (
              <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
                {formError}
              </p>
            )}

            <DialogFooter className="pt-4 border-t border-zinc-800/40">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenAdd(false)}
                className="border-zinc-800 text-zinc-300"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-outfit"
              >
                Save Integration
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Providers;
