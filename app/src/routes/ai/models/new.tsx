import { createFileRoute } from '@tanstack/react-router';
import { ModelForm } from '@/features/ai';
export const Route = createFileRoute('/ai/models/new')({
  component: ModelForm,
});
