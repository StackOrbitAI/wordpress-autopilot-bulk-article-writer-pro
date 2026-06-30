import React, { useState, useEffect } from 'react';
import { Globe, Plus, Trash2, CheckCircle2, AlertTriangle, Activity, Check, Link } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';

const Websites: React.FC = () => {
  const [websites, setWebsites] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [openAdd, setOpenAdd] = useState<boolean>(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [formTesting, setFormTesting] = useState(false);
  const [authMode, setAuthMode] = useState<'oneclick' | 'manual'>('oneclick');
  const [isWaitingAuth, setIsWaitingAuth] = useState(false);

  const fetchWebsites = async () => {
    const api = (window as any).api;
    if (!api) return;
    try {
      const data = await api.getWebsites();
      setWebsites(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWebsites();

    const api = (window as any).api;
    if (api && api.onWordPressAuthSuccess) {
      const unsubscribe = api.onWordPressAuthSuccess((data: any) => {
        setOpenAdd(false);
        setName('');
        setUrl('');
        setUsername('');
        setPassword('');
        setIsWaitingAuth(false);
        fetchWebsites();
      });
      return () => {
        unsubscribe();
      };
    }
  }, []);

  const handleTestSite = async (id: number) => {
    const api = (window as any).api;
    if (!api) return;
    setTestingId(id);
    try {
      const result = await api.testWebsite(id);
      if (result.success) {
        alert('WordPress connection verified successfully!');
      } else {
        alert(`WordPress connection failed: ${result.error}`);
      }
      fetchWebsites();
    } catch (err: any) {
      alert(`Error running connection test: ${err.message}`);
    } finally {
      setTestingId(null);
    }
  };

  const handleTestConfig = async () => {
    const api = (window as any).api;
    if (!api) return;
    if (!url || !username || !password) {
      setFormError('Please enter URL, Username, and Password to test connection.');
      return;
    }

    setFormTesting(true);
    setFormError('');
    try {
      const result = await api.testWebsiteConfig({ url, username, password });
      if (result.success) {
        alert('WordPress REST API handshake completed successfully!');
      } else {
        setFormError(`Handshake Failed: ${result.error}`);
      }
    } catch (err: any) {
      setFormError(`Test request failed: ${err.message}`);
    } finally {
      setFormTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = (window as any).api;
    if (!api) return;

    if (!name || !url || !username || !password) {
      setFormError('All fields are required.');
      return;
    }

    setFormTesting(true);
    setFormError('');

    try {
      // One-click connection: verify credentials before saving
      const verify = await api.testWebsiteConfig({ url, username, password });
      if (!verify.success) {
        setFormError(`Credentials failed verification: ${verify.error}`);
        setFormTesting(false);
        return;
      }

      const res = await api.addWebsite({ name, url, username, password });
      if (res.success) {
        setOpenAdd(false);
        setName('');
        setUrl('');
        setUsername('');
        setPassword('');
        fetchWebsites();
      }
    } catch (err: any) {
      setFormError(err.message || 'Error saving website configuration.');
    } finally {
      setFormTesting(false);
    }
  };

  const handleOneClickConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const api = (window as any).api;
    if (!api) return;

    if (!name || !url) {
      setFormError('Website Label and URL are required.');
      return;
    }

    setFormError('');
    setIsWaitingAuth(true);

    // Clean URL
    let cleanedUrl = url.trim();
    if (!cleanedUrl.startsWith('http://') && !cleanedUrl.startsWith('https://')) {
      cleanedUrl = 'https://' + cleanedUrl;
    }
    if (cleanedUrl.endsWith('/')) {
      cleanedUrl = cleanedUrl.slice(0, -1);
    }

    // Prepare authorization flow redirecting to the local express server
    const expressPort = await api.getExpressPort();
    const successUrl = `http://127.0.0.1:${expressPort}/api/wordpress/callback?site_name=${encodeURIComponent(name.trim())}`;
    const authUrl = `${cleanedUrl}/wp-admin/authorize-application.php?app_name=${encodeURIComponent('StackOrbitAI Bulk Writer Pro')}&success_url=${encodeURIComponent(successUrl)}`;

    try {
      await api.openExternal(authUrl);
    } catch (err: any) {
      setFormError(`Failed to open browser: ${err.message}`);
      setIsWaitingAuth(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this WordPress integration?')) return;
    const api = (window as any).api;
    if (!api) return;

    try {
      await api.deleteWebsite(id);
      fetchWebsites();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex-1 p-8 overflow-y-auto bg-zinc-950 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold font-outfit text-zinc-100 flex items-center">
            <Globe className="h-5 w-5 text-indigo-400 mr-2" />
            Connected WordPress Installations
          </h3>
          <p className="text-xs text-zinc-400">Manage API keys and target locations for automated publishing.</p>
        </div>
        <Button 
          onClick={() => setOpenAdd(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-outfit flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>Connect Website</span>
        </Button>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-xs py-10 text-center">Loading registered websites...</p>
      ) : websites.length === 0 ? (
        <div className="border border-dashed border-zinc-800 rounded-2xl p-16 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <h4 className="font-bold text-zinc-200">No websites connected</h4>
            <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
              You must register at least one WordPress site with an Application Password before running bulk posts.
            </p>
          </div>
          <Button 
            onClick={() => setOpenAdd(true)}
            className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-100"
          >
            Connect Site
          </Button>
        </div>
      ) : (
        <Card className="border-zinc-800/80">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/30 text-zinc-400 font-semibold uppercase tracking-wider">
                    <th className="p-4">Site Name</th>
                    <th className="p-4">URL</th>
                    <th className="p-4">Username</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {websites.map((site) => (
                    <tr key={site.id} className="hover:bg-zinc-900/10 text-zinc-300">
                      <td className="p-4 font-bold font-outfit text-zinc-200">{site.name}</td>
                      <td className="p-4 font-mono text-[11px] text-zinc-400">{site.url}</td>
                      <td className="p-4 text-zinc-400">{site.username}</td>
                      <td className="p-4">
                        {site.status === 'active' ? (
                          <Badge variant="success" className="flex items-center space-x-1 w-fit">
                            <CheckCircle2 className="h-3 w-3" />
                            <span>Connected</span>
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="flex items-center space-x-1 w-fit">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Verification Failed</span>
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={testingId === site.id}
                            onClick={() => handleTestSite(site.id)}
                            className="h-8 border-zinc-800 text-zinc-300 hover:bg-zinc-900/60"
                          >
                            <Activity className={`h-3.5 w-3.5 mr-1 ${testingId === site.id ? 'animate-spin text-indigo-400' : ''}`} />
                            <span>{testingId === site.id ? 'Testing...' : 'Test Connection'}</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(site.id)}
                            className="h-8 w-8 text-zinc-500 hover:text-red-400 hover:bg-red-500/5"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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

      {/* Add Website Dialog */}
      <Dialog open={openAdd} onOpenChange={(open) => {
        if (!open) {
          setIsWaitingAuth(false);
          setFormError('');
        }
        setOpenAdd(open);
      }}>
        <DialogContent onClose={() => {
          setIsWaitingAuth(false);
          setFormError('');
          setOpenAdd(false);
        }}>
          <DialogHeader>
            <DialogTitle>Connect WordPress Website</DialogTitle>
            <DialogDescription>
              {isWaitingAuth 
                ? 'Approve the integration in your web browser.' 
                : 'Connect your self-hosted WordPress site using One-Click authorize or manual credentials.'}
            </DialogDescription>
          </DialogHeader>

          {isWaitingAuth ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4 text-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-t-2 border-b-2 border-indigo-500 animate-spin flex items-center justify-center">
                  <Globe className="h-8 w-8 text-indigo-400 animate-pulse" />
                </div>
                <Activity className="absolute -bottom-1 -right-1 h-5 w-5 text-indigo-400 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-zinc-200">Waiting for WordPress Authorization</h4>
                <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                  We have opened the authorization page in your system browser. Please log in and click "Approve".
                </p>
              </div>
              {formError && (
                <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2 rounded-lg max-w-xs">
                  {formError}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWaitingAuth(false)}
                className="border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 mt-2"
              >
                Cancel Authentication
              </Button>
            </div>
          ) : (
            <form onSubmit={authMode === 'oneclick' ? handleOneClickConnect : handleSubmit} className="space-y-4 pt-2">
              {/* Tab Selector */}
              <div className="flex border border-zinc-800 bg-zinc-950/80 p-0.5 rounded-lg">
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    authMode === 'oneclick'
                      ? 'bg-zinc-900 text-indigo-400 font-bold border border-zinc-800/60 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  onClick={() => {
                    setAuthMode('oneclick');
                    setFormError('');
                  }}
                >
                  One-Click Connect
                </button>
                <button
                  type="button"
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    authMode === 'manual'
                      ? 'bg-zinc-900 text-indigo-400 font-bold border border-zinc-800/60 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  onClick={() => {
                    setAuthMode('manual');
                    setFormError('');
                  }}
                >
                  Manual Connection
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Website Label</label>
                <Input 
                  placeholder="My Tech Blog" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="bg-zinc-950 border-zinc-800"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">WordPress Site URL</label>
                <div className="relative">
                  <Link className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                  <Input 
                    placeholder="https://mywebsite.com" 
                    value={url} 
                    onChange={(e) => setUrl(e.target.value)} 
                    className="pl-10 bg-zinc-950 border-zinc-800"
                  />
                </div>
              </div>

              {authMode === 'manual' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Username / Email</label>
                    <Input 
                      placeholder="admin" 
                      value={username} 
                      onChange={(e) => setUsername(e.target.value)} 
                      className="bg-zinc-950 border-zinc-800"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Application Password</label>
                    <Input 
                      type="password" 
                      placeholder="xxxx xxxx xxxx xxxx" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="bg-zinc-950 border-zinc-800"
                    />
                  </div>
                </div>
              )}

              {formError && (
                <p className="text-xs text-red-400 bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg">
                  {formError}
                </p>
              )}

              <DialogFooter className="pt-4 border-t border-zinc-800/40">
                {authMode === 'manual' ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={formTesting}
                      onClick={handleTestConfig}
                      className="border-zinc-800 text-zinc-300 hover:bg-zinc-900"
                    >
                      {formTesting ? 'Verifying...' : 'Test Connection'}
                    </Button>
                    <Button
                      type="submit"
                      disabled={formTesting}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center space-x-1.5"
                    >
                      <Check className="h-4 w-4" />
                      <span>Save Site</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="submit"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center space-x-1.5"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Connect via WordPress</span>
                  </Button>
                )}
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Websites;
