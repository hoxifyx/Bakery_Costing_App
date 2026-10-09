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

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new drive.DriveError('NETWORK', errorMessage)), ms))
  ]);
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
  return withTimeout(_createBackup(appData), TIMEOUT_MS, 'Operation timed out after 30 seconds');
}

async function _createBackup(appData: AppData): Promise<{ fileId: string; filename: string; size: number }> {
  const jsonStr = exportAllData(appData);
  const size = new Blob([jsonStr]).size;
  const filename = generateFilename();

  const meta = await drive.uploadBackup(jsonStr, filename);
  await drive.pruneOldBackups(10);
  
  return {
    fileId: meta.id,
    filename: meta.name,
    size,
  };
}

export async function restoreBackup(fileId: string, currentData: AppData): Promise<ImportPreview> {
  return withTimeout(_restoreBackup(fileId, currentData), TIMEOUT_MS, 'Operation timed out after 30 seconds');
}

async function _restoreBackup(fileId: string, currentData: AppData): Promise<ImportPreview> {
  const jsonStr = await drive.downloadBackup(fileId);
  return parseImportFile(jsonStr, currentData);
}

export async function getBackupHistory(): Promise<{ id: string; name: string; modifiedTime: string; size: number }[]> {
  return drive.listBackups();
}
