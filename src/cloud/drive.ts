// window.google is injected by the GIS script at runtime.
// We use (window as any).google throughout to avoid `declare global` interface
// merging, which is forbidden under erasableSyntaxOnly (TS 5.5+).
// DriveError uses explicit field assignment instead of constructor parameter
// properties for the same reason.

export class DriveError extends Error {
  code: 'AUTH' | 'NETWORK' | 'NOT_FOUND' | 'QUOTA' | 'UNKNOWN';
  override cause?: unknown;

  constructor(
    code: 'AUTH' | 'NETWORK' | 'NOT_FOUND' | 'QUOTA' | 'UNKNOWN',
    message: string,
    cause?: unknown
  ) {
    super(message);
    this.name = 'DriveError';
    this.code = code;
    this.cause = cause;
  }
}

let accessToken: string | null = null;
let signedInUser: { email: string; name?: string } | null = null;
let gisLoadedPromise: Promise<void> | null = null;

export function isConfigured(): boolean {
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
}

export function isSignedIn(): boolean {
  return accessToken !== null;
}

export function getSignedInUser(): { email: string; name?: string } | null {
  return signedInUser;
}

function loadGisScript(): Promise<void> {
  if (gisLoadedPromise) return gisLoadedPromise;

  gisLoadedPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoadedPromise = null;
      reject(new DriveError('NETWORK', 'Failed to load Google Identity Services script. Check your connection or ad blocker.'));
    };
    document.body.appendChild(script);
  });

  return gisLoadedPromise;
}

export async function signIn(): Promise<{ email: string; name?: string }> {
  if (!isConfigured()) {
    throw new DriveError('UNKNOWN', 'Cloud backup is not configured.');
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const goog = (window as any).google;
      const client = goog.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.appdata',
        callback: async (response: any) => {
          if (response.error !== undefined) {
            reject(new DriveError('AUTH', 'Authentication failed: ' + response.error));
            return;
          }
          accessToken = response.access_token;

          // Try to fetch basic profile info using the token
          try {
            const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (userInfoRes.ok) {
              const info = await userInfoRes.json();
              signedInUser = { email: info.email, name: info.name };
            } else {
              signedInUser = { email: 'Unknown User' };
            }
          } catch (e) {
            signedInUser = { email: 'Unknown User' };
          }

          resolve(signedInUser!);
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      reject(new DriveError('AUTH', 'Failed to initialize Google Auth.', err));
    }
  });
}

export function signOut(): void {
  const goog = (window as any).google;
  if (accessToken && goog?.accounts?.oauth2) {
    goog.accounts.oauth2.revoke(accessToken, () => {});
  }
  accessToken = null;
  signedInUser = null;
}

async function driveFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (!accessToken) {
    throw new DriveError('AUTH', 'Not signed in.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (err) {
    throw new DriveError('NETWORK', 'Network error connecting to Google Drive.', err);
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      accessToken = null;
      signedInUser = null;
      throw new DriveError('AUTH', 'Your Google session expired. Please reconnect.');
    }
    if (res.status === 404) {
      throw new DriveError('NOT_FOUND', 'File not found in Google Drive.');
    }
    throw new DriveError('UNKNOWN', `Google Drive API error: ${res.statusText}`);
  }

  return res;
}

export async function listBackups(): Promise<{ id: string; name: string; modifiedTime: string; size: number }[]> {
  const url = 'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc';
  const res = await driveFetch(url);
  const data = await res.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    modifiedTime: f.modifiedTime,
    size: parseInt(f.size || '0', 10),
  }));
}

export async function uploadBackup(json: string, filename: string): Promise<{ id: string; name: string; modifiedTime: string }> {
  const metadata = {
    name: filename,
    parents: ['appDataFolder'],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([json], { type: 'application/json' }));

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';
  const res = await driveFetch(url, {
    method: 'POST',
    body: form,
  });

  return await res.json();
}

export async function downloadBackup(fileId: string): Promise<string> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
  return await res.text();
}

export async function deleteBackup(fileId: string): Promise<void> {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE' });
}

export async function pruneOldBackups(keep: number): Promise<number> {
  const backups = await listBackups();
  if (backups.length <= keep) return 0;

  const toDelete = backups.slice(keep);
  let deletedCount = 0;
  for (const b of toDelete) {
    try {
      await deleteBackup(b.id);
      deletedCount++;
    } catch {
      // Ignore errors for individual file deletions during prune
    }
  }
  return deletedCount;
}
