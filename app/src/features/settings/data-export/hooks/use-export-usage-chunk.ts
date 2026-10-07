import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadUsageChunk } from '../queries/download-usage-chunk';
import type { UsageChunk } from '../utils/usage-chunks';

/**
 * Saves one month of usage as a CSV: a request like another, with its own pending
 * state, which the row that offers it reads (`variables` is the month on its way).
 * A refusal of the API is shown as it was written, and nothing else changes: an
 * export reads and changes nothing.
 */
export function useExportUsageChunk() {
  return useMutation({
    mutationFn: (chunk: UsageChunk) => downloadUsageChunk(chunk),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
