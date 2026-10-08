import { createTaxonomyService } from './taxonomyService';

export const tagService = createTaxonomyService({
  table: 'tags',
  entityName: 'Tag',
  fields: [],
});
