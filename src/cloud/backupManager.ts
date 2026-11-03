import type { AppData } from '../engine/types';
import { exportAllData, parseImportFile } from '../io/io';
import type { ImportPreview } from '../io/io';
import * as drive from './drive';

export const isConfigured = drive.isConfigured;
export const signIn = drive.signIn;
export const signOut = drive.signOut;
export const isSignedIn = drive.isSignedIn;
export const getSignedInUser = drive.getSignedInUser;
export const deleteBackup = drive.deleteBackup;

const TIMEOUT_MS = 30000;

function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number, errorMessage: string): Promise<T> {
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new drive.DriveError('NETWORK', errorMessage));
    }, ms);
    Promise.resolve().then(() => operation(controller.signal)).then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}


function generateFilename(): string {
  const now = new Date();
  const YYYY = now.getFullYear();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const HH = String(now.getHours()).padStart(2, '0');
  const MIN = String(now.getMinutes()).padStart(2, '0');
  return `bakery-costing-backup-${YYYY}${MM}${DD}-${HH}${MIN}.json`;
}

export async function createBackup(appData: AppData): Promise<{ fileId: string; filename: string; size: number }> {
  return withTimeout(signal => _createBackup(appData, signal), TIMEOUT_MS, 'Operation timed out after 30 seconds');
}

async function _createBackup(appData: AppData, signal: AbortSignal): Promise<{ fileId: string; filename: string; size: number }> {
  const jsonStr = exportAllData(appData);
  const size = new Blob([jsonStr]).size;
  const filename = generateFilename();

  const meta = await drive.uploadBackup(jsonStr, filename, signal);
  await drive.pruneOldBackups(10);
  
  return {
    fileId: meta.id,
    filename: meta.name,
    size,
  };
}

export async function restoreBackup(fileId: string, currentData: AppData): Promise<ImportPreview> {
  return withTimeout(signal => _restoreBackup(fileId, currentData, signal), TIMEOUT_MS, 'Operation timed out after 30 seconds');
}

async function _restoreBackup(fileId: string, currentData: AppData, signal: AbortSignal): Promise<ImportPreview> {
  const jsonStr = await drive.downloadBackup(fileId, signal);
  return parseImportFile(jsonStr, currentData);
}

export async function getBackupHistory(): Promise<{ id: string; name: string; modifiedTime: string; size: number }[]> {
  return drive.listBackups();
}
