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
          // We only requested the drive.appdata scope, so we have no way to
          // fetch the user's email/name. Use a placeholder instead of calling
          // the userinfo endpoint (which would require an identity scope).
          signedInUser = { email: 'Google Drive user' };
          resolve(signedInUser);
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

function googleErrorReason(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const response = error as { errors?: Array<{ reason?: unknown }>; status?: unknown };
  const reason = response.errors?.[0]?.reason ?? response.status;
  return typeof reason === 'string' ? reason : null;
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
    let errorBody: unknown = null;
    try {
      const errorResponse = typeof res.clone === 'function' ? res.clone() : res;
      errorBody = await errorResponse.json();
    } catch {
      errorBody = null;
    }
    const errorRecord = errorBody && typeof errorBody === 'object'
      ? errorBody as { error?: unknown }
      : null;
    const reason = googleErrorReason(errorRecord?.error);
    if (res.status === 401 || [
      'authError',
      'invalidCredentials',
      'insufficientPermissions',
      'insufficientFilePermissions',
      'forbidden',
      'appNotAuthorizedToFile',
    ].includes(reason ?? '')) {
      accessToken = null;
      signedInUser = null;
      throw new DriveError('AUTH', 'Your Google session expired. Please reconnect.');
    }
    if (reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded') {
      throw new DriveError('UNKNOWN', 'Google Drive is rate limited. Please try again shortly.');
    }
    if (reason === 'storageQuotaExceeded') {
      throw new DriveError('QUOTA', 'Google Drive storage quota exceeded. Free up Drive space or use another account.');
    }
    if (res.status === 404) {
      throw new DriveError('NOT_FOUND', 'File not found in Google Drive.');
    }
    throw new DriveError('UNKNOWN', `Google Drive API error: ${res.statusText}${reason ? ` (${reason})` : ''}`);
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

export async function uploadBackup(
  json: string,
  filename: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string; modifiedTime: string }> {
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
    signal,
  });

  return await res.json();
}

export async function downloadBackup(fileId: string, signal?: AbortSignal): Promise<string> {
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { signal });
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
