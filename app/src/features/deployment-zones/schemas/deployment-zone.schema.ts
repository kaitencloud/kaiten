import { z } from 'zod';
import { zDeploymentZoneWritable } from '@/api-client/zod.gen';

// Accept an empty string so the optional slug can be left blank in the form.
const optionalField = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  schema.or(z.literal(''));

export const deploymentZoneFormSchema = zDeploymentZoneWritable.extend({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1, 'Type is required'),
  description: z.string().min(1, 'Description is required'),
  metadata: z.record(z.string(), z.unknown()).optional(),
  releaseId: z.string().nullish(),
  // Optional — may be absent or left empty; the API then generates the slug.
  slug: optionalField(zDeploymentZoneWritable.shape.slug.unwrap()).optional(),
});

export type DeploymentZoneFormValues = z.infer<typeof deploymentZoneFormSchema>;
