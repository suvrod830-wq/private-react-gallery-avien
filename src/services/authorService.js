import { createTaxonomyService } from './taxonomyService';

export const authorService = createTaxonomyService({
  table: 'authors',
  entityName: 'Author',
  fields: ['bio', 'avatar_url', 'website_url'],
});
