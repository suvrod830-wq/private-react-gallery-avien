// Taxonomy data access (categories / tags / authors / albums) through /api.
// The API enforces admin authorization and computes unique slugs server-side.

import { apiRequest } from '../lib/api';
import { isConfigured } from '../lib/env';
import { ensureConfigured } from './notConfigured';

/**
 * Factory for the four taxonomy services.
 * Keeps the CRUD logic in one place (spec §73 Rule 3 — no duplicated logic).
 *
 * @param {object} cfg
 * @param {string} cfg.table       API segment + table name (whitelisted server-side)
 * @param {string} cfg.entityName  Human label for errors ("Category")
 * @param {string[]} cfg.fields    Editable columns besides name
 */
export function createTaxonomyService(cfg) {
  const { table, entityName, fields = [] } = cfg;
  const base = `/taxonomy/${table}`;

  /** Index pages: each entry with published image count + cover. */
  async function listWithCounts() {
    if (!isConfigured) ensureConfigured();
    return apiRequest(base);
  }

  /** Plain list for form dropdowns (fast, no counts). */
  async function listAll() {
    if (!isConfigured) ensureConfigured();
    return apiRequest(base, { query: { plain: '1' } });
  }

  async function getBySlug(slug) {
    if (!isConfigured) ensureConfigured();
    try {
      return await apiRequest(`${base}/slug/${encodeURIComponent(slug)}`);
    } catch (err) {
      if (err?.status === 404) return null;
      throw err;
    }
  }

  async function create(input) {
    if (!isConfigured) ensureConfigured();
    const name = String(input?.name ?? '').trim();
    if (!name) throw new Error(`${entityName} name is required.`);

    const body = { name };
    for (const f of fields) if (input[f] !== undefined) body[f] = input[f] ?? null;

    try {
      return await apiRequest(base, { method: 'POST', body });
    } catch (err) {
      if (err?.status === 409) {
        throw new Error(
          `A ${entityName.toLowerCase()} named "${name}" already exists. Choose a different name.`,
        );
      }
      throw err;
    }
  }

  async function update(id, input) {
    if (!isConfigured) ensureConfigured();

    const body = {};
    if (input.name !== undefined) body.name = input.name;
    for (const f of fields) if (input[f] !== undefined) body[f] = input[f] ?? null;

    try {
      return await apiRequest(`${base}/${id}`, { method: 'PATCH', body });
    } catch (err) {
      if (err?.status === 404) {
        throw new Error(`${entityName} not found. It may have been deleted.`);
      }
      throw err;
    }
  }

  async function remove(id) {
    if (!isConfigured) ensureConfigured();
    try {
      await apiRequest(`${base}/${id}`, { method: 'DELETE' });
    } catch (err) {
      if (err?.status === 404) return; // already gone — treat as success
      throw err;
    }
  }

  return { listWithCounts, listAll, getBySlug, create, update, remove };
}
