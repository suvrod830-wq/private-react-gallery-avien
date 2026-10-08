import { apiRequest } from '../lib/api';
import { isConfigured } from '../lib/env';
import { ensureConfigured } from './notConfigured';

export async function getSettings() {
  if (!isConfigured) ensureConfigured();
  return apiRequest('/settings');
}

export async function updateSettings(patch) {
  if (!isConfigured) ensureConfigured();
  // The server records the activity-log entry itself.
  const { id: _id, ...body } = patch;
  return apiRequest('/settings', { method: 'PATCH', body });
}
