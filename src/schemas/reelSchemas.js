import { z } from 'zod';

export const reelSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'Title must be at least 2 characters.')
    .max(140, 'Keep the title under 140 characters.'),
  caption: z.string().trim().max(300, 'Keep the caption under 300 characters.').optional().or(z.literal('')),
  description: z.string().trim().max(2000, 'Keep the description under 2000 characters.').optional().or(z.literal('')),
  is_featured: z.boolean(),
  is_published: z.boolean(),
});
