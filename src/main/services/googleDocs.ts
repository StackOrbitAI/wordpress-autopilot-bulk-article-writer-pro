import { google } from 'googleapis';
import http from 'http';
import url from 'url';

export interface GoogleAuthConfig {
  authType: 'oauth' | 'service_account';
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  serviceAccountJson?: string;
  folderId?: string;
  sharingMode?: 'private' | 'view' | 'edit';
}

class GoogleDocsService {
  private localServer: http.Server | null = null;

  /**
   * Starts a local HTTP server to listen for the Google OAuth callback.
   * Returns a promise that resolves with the OAuth tokens.
   */
  public startOAuthFlow(
    clientId: string,
    clientSecret: string
  ): Promise<{ authUrl: string; getTokens: () => Promise<string>, redirectUri: string }> {
    return new Promise((resolve, reject) => {
      let port = 8524;

      // If a local server is already running, close it
      if (this.localServer) {
        this.localServer.close();
      }

      let authCodePromiseResolve: (code: string) => void;
      const authCodePromise = new Promise<string>((res) => {
        authCodePromiseResolve = res;
      });

      this.localServer = http.createServer(async (req, res) => {
        const parsedUrl = url.parse(req.url || '', true);
        if (parsedUrl.pathname === '/oauth-callback') {
          const code = parsedUrl.query.code as string;
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #09090b; color: #f4f4f5; text-align: center;">
                  <h1 style="color: #6366f1;">Authentication Successful!</h1>
                  <p>You can close this tab and return to StackOrbitAI Bulk Writer Pro.</p>
                </body>
              </html>
            `);
            authCodePromiseResolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Authentication failed: missing auth code');
          }

          // Close server after response
          if (this.localServer) {
            this.localServer.close();
            this.localServer = null;
          }
        }
      });

      this.localServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[Google OAuth] Port ${port} is busy, trying ${port + 1}...`);
          port++;
          if (port > 8550) {
            reject(new Error('No available ports found for OAuth callback (tried 8524-8550).'));
          } else {
            this.localServer?.listen(port, '127.0.0.1');
          }
        } else {
          reject(err);
        }
      });

      this.localServer.on('listening', () => {
        console.log(`[Google OAuth] Local server listening on callback port: ${port}`);
        
        const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );

        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: [
            'https://www.googleapis.com/auth/documents',
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/userinfo.email'
          ]
        });

        // Expose a helper to exchange the code for tokens once received
        const getTokens = async () => {
          const code = await authCodePromise;
          const { tokens } = await oauth2Client.getToken(code);
          if (!tokens.refresh_token) {
            throw new Error(
              'No refresh token returned. If you are re-authenticating, please remove StackOrbitAI from your Google Account Authorized Apps first to force consent.'
            );
          }
          return tokens.refresh_token;
        };

        resolve({ authUrl, getTokens, redirectUri });
      });

      this.localServer.listen(port, '127.0.0.1');
    });
  }

  /**
   * Cancel any active listener
   */
  public stopOAuthListener() {
    if (this.localServer) {
      this.localServer.close();
      this.localServer = null;
      console.log('[Google OAuth] Stopped listening for callback.');
    }
  }

  /**
   * Authenticate and return client credentials auth object
   */
  private getAuthClient(config: GoogleAuthConfig) {
    if (config.authType === 'service_account') {
      if (!config.serviceAccountJson) {
        throw new Error('Google Service Account JSON key is missing');
      }
      const credentials = JSON.parse(config.serviceAccountJson);
      return new google.auth.JWT(
        credentials.client_email,
        undefined,
        credentials.private_key,
        [
          'https://www.googleapis.com/auth/documents',
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/spreadsheets'
        ]
      );
    } else {
      if (!config.clientId || !config.clientSecret || !config.refreshToken) {
        throw new Error('Google OAuth credentials (Client ID, Client Secret, or Refresh Token) are incomplete');
      }
      const oauth2Client = new google.auth.OAuth2(
        config.clientId,
        config.clientSecret,
        'http://127.0.0.1:8524/oauth-callback'
      );
      oauth2Client.setCredentials({
        refresh_token: config.refreshToken
      });
      return oauth2Client;
    }
  }

  /**
   * Test the Google API connection by listing files
   */
  public async testConnection(config: GoogleAuthConfig): Promise<{ success: boolean; email?: string }> {
    try {
      const auth = this.getAuthClient(config);
      const drive = google.drive({ version: 'v3', auth });

      if (config.authType === 'service_account') {
        const credentials = JSON.parse(config.serviceAccountJson || '{}');
        // Service account has a known email
        return { success: true, email: credentials.client_email };
      } else {
        // OAuth2 flow
        let email = 'Authenticated Account';
        try {
          const oauth2 = google.oauth2({ version: 'v2', auth });
          const userInfo = await oauth2.userinfo.get();
          email = userInfo.data.email || email;
        } catch (e: any) {
          console.warn('[Google API] Could not get user info (likely missing userinfo.email scope). Fallback to drive.files.list.', e.message);
          // Fallback test to ensure token is valid for Drive
          await drive.files.list({ pageSize: 1, fields: 'files(id)' });
        }
        return { success: true, email };
      }
    } catch (err: any) {
      console.error('[Google API] Connection test failed:', err);
      throw new Error(`Google connection failed: ${err.message}`);
    }
  }

  /**
   * List folders in Google Drive for folder picker selection
   */
  public async listFolders(config: GoogleAuthConfig): Promise<{ id: string; name: string }[]> {
    const auth = this.getAuthClient(config);
    const drive = google.drive({ version: 'v3', auth });

    const response = await drive.files.list({
      q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
      pageSize: 100,
      fields: 'files(id, name)',
      orderBy: 'name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });

    const files = response.data.files || [];
    return files.map(f => ({
      id: f.id || '',
      name: f.name || ''
    })).filter(f => f.id && f.name);
  }

  /**
   * Set public link sharing permissions for a file
   */
  public async setFileSharing(
    config: GoogleAuthConfig,
    fileId: string,
    sharingMode?: 'private' | 'view' | 'edit'
  ): Promise<void> {
    if (!sharingMode || sharingMode === 'private') {
      return; // Keep default private permissions
    }

    const auth = this.getAuthClient(config);
    const drive = google.drive({ version: 'v3', auth });
    const role = sharingMode === 'edit' ? 'writer' : 'reader';

    await drive.permissions.create({
      fileId,
      requestBody: {
        role,
        type: 'anyone',
      }
    });
  }

  /**
   * Create and upload article as a Google Doc (converting from HTML)
   */
  public async createGoogleDoc(
    config: GoogleAuthConfig,
    title: string,
    htmlContent: string
  ): Promise<{ id: string; url: string }> {
    const auth = this.getAuthClient(config);
    const drive = google.drive({ version: 'v3', auth });

    const folderId = config.folderId ? config.folderId.trim() : null;
    const parents = folderId ? [folderId] : undefined;

    // Wrapping HTML into simple document structure
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
          ${htmlContent}
        </body>
      </html>
    `;

    // Create a new document by uploading HTML and converting it
    const response = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: 'application/vnd.google-apps.document',
        parents: parents || undefined
      },
      media: {
        mimeType: 'text/html',
        body: fullHtml
      },
      fields: 'id,webViewLink'
    });

    const docId = response.data.id;
    const docUrl = response.data.webViewLink;

    if (!docId || !docUrl) {
      throw new Error('Failed to retrieve Document ID or URL from Google Drive API');
    }

    // Apply link sharing permissions if configured
    if (config.sharingMode && config.sharingMode !== 'private') {
      try {
        await this.setFileSharing(config, docId, config.sharingMode);
      } catch (shareErr) {
        console.error(`[Google Drive] Warning: failed to apply sharing permission to document ${docId}:`, shareErr);
      }
    }

    return { id: docId, url: docUrl };
  }

  /**
   * Create a new Google Sheets Tracker for a bulk task pipeline
   */
  public async createTrackerSheet(
    config: GoogleAuthConfig,
    taskName: string
  ): Promise<{ id: string; url: string }> {
    const auth = this.getAuthClient(config);
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const folderId = config.folderId ? config.folderId.trim() : null;
    const parents = folderId ? [folderId] : undefined;

    // Create spreadsheet
    const fileRes = await drive.files.create({
      requestBody: {
        name: `${taskName} - Content Tracker`,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: parents || undefined
      },
      fields: 'id,webViewLink'
    });

    const sheetId = fileRes.data.id;
    const sheetUrl = fileRes.data.webViewLink;

    if (!sheetId || !sheetUrl) {
      throw new Error('Failed to create Google Sheet Tracker');
    }

    // Apply link sharing permissions if configured
    if (config.sharingMode && config.sharingMode !== 'private') {
      try {
        await this.setFileSharing(config, sheetId, config.sharingMode);
      } catch (shareErr) {
        console.error(`[Google Drive] Warning: failed to apply sharing permission to sheet ${sheetId}:`, shareErr);
      }
    }

    // Write header cells
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: 'Sheet1!A1:G1',
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            'Keyword',
            'Article Title',
            'Word Count',
            'WordPress Post URL',
            'Google Doc URL',
            'Estimated Cost ($)',
            'Completed Date'
          ]
        ]
      }
    });

    return { id: sheetId, url: sheetUrl };
  }

  /**
   * Append a completed job row to the task tracker sheet
   */
  public async appendJobToTracker(
    config: GoogleAuthConfig,
    spreadsheetId: string,
    rowData: {
      keyword: string;
      title: string;
      wordCount: number;
      postUrl: string;
      googleDocUrl: string;
      estimatedCost: number;
    }
  ): Promise<void> {
    const auth = this.getAuthClient(config);
    const sheets = google.sheets({ version: 'v4', auth });

    const completedDate = new Date().toLocaleString();

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          [
            rowData.keyword,
            rowData.title,
            rowData.wordCount,
            rowData.postUrl || 'N/A',
            rowData.googleDocUrl || 'N/A',
            rowData.estimatedCost,
            completedDate
          ]
        ]
      }
    });
  }
}

export const googleDocsService = new GoogleDocsService();
