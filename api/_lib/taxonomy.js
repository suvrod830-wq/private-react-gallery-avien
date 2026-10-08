// Taxonomy registry — the ONLY place table names are enumerated.
// Dynamic route params ([table]) are validated against this whitelist before
// they are ever interpolated into SQL, which keeps the dynamic queries safe.

export const TAXONOMIES = {
  categories: {
    entityName: 'Category',
    fields: ['description', 'cover_image_id'],
  },
  tags: {
    entityName: 'Tag',
    fields: [],
  },
  authors: {
    entityName: 'Author',
    fields: ['bio', 'avatar_url', 'website_url'],
  },
  albums: {
    entityName: 'Album',
    fields: ['description', 'cover_image_id'],
  },
};

/**
 * Resolve a route param to a taxonomy config, or null when invalid.
 * @param {string} table
 */
export function getTaxonomy(table) {
  if (typeof table !== 'string') return null;
  return TAXONOMIES[table] ?? null;
}
