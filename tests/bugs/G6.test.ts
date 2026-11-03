import { afterEach, describe, expect, it, vi } from 'vitest';
import * as drive from '../../src/cloud/drive';
import { createBackup } from '../../src/cloud/backupManager';
import { EMPTY_APP_DATA } from '../../src/engine/types';

function installSignedInGoogleToken() {
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id');
  vi.stubGlobal('window', {
    google: {
      accounts: {
        oauth2: {
          revoke: () => undefined,
          initTokenClient: ({ callback }: { callback: (response: { access_token: string }) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'test-token' }),
          }),
        },
      },
    },
  });
}

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Forbidden',
    json: async () => body,
  } as Response;
}

describe('G6 Google Drive errors and upload timeout', () => {
  afterEach(() => {
    drive.signOut();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('retains the token for a rate limit and reports storage quota separately', async () => {
    installSignedInGoogleToken();
    await drive.signIn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }))
      .mockResolvedValueOnce({ ...response(200, {}), json: async () => ({ files: [] }) })
      .mockResolvedValueOnce(response(403, { error: { errors: [{ reason: 'storageQuotaExceeded' }] } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(drive.listBackups()).rejects.toThrow(/try again shortly/i);
    expect(drive.isSignedIn()).toBe(true);
    await expect(drive.listBackups()).resolves.toEqual([]);

    await expect(drive.listBackups()).rejects.toMatchObject({
      code: 'QUOTA',
      message: expect.stringMatching(/storage quota/i),
    });
    expect(drive.isSignedIn()).toBe(true);
  });

  it('treats a permission 403 as an expired session and clears the token', async () => {
    installSignedInGoogleToken();
    await drive.signIn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      response(403, { error: { errors: [{ reason: 'insufficientPermissions' }] } }),
    ));

    await expect(drive.listBackups()).rejects.toThrow(/session expired/i);
    expect(drive.isSignedIn()).toBe(false);
  });

  it('aborts a never-resolving upload on timeout and clears the timeout timer', async () => {
    installSignedInGoogleToken();
    await drive.signIn();
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined;
      requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    })));

    const backup = createBackup(EMPTY_APP_DATA);
    const backupResult = expect(backup).rejects.toThrow(/timed out/i);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(30_000);
    await backupResult;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
