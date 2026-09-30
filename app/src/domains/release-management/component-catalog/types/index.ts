import type { Component } from '@/api-client';
import type { ComponentFormValues } from '../schemas';

export type ComponentFormProps = {
  componentSlug?: string;
  initialValues?: Partial<ComponentFormValues>;
  mode?: 'create' | 'edit';
  onSuccess?: (component: Component) => void;
};

export type { ComponentFormValues };
