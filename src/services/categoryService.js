import { createTaxonomyService } from './taxonomyService';

export const categoryService = createTaxonomyService({
  table: 'categories',
  entityName: 'Category',
  fields: ['description', 'cover_image_id'],
});
