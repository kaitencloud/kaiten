import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import { downloadLineReports } from '../queries';

/**
 * Saves every usage report a line was measured from as a CSV: a request like
 * another, with its own pending state. A refusal of the API is shown as it was
 * written, and the screen stays as it was.
 */
export function useExportLineReports() {
  return useMutation({
    mutationFn: ({
      invoiceId,
      lineId,
      lineSeq,
    }: {
      invoiceId: string;
      lineId: string;
      lineSeq: number;
    }) => downloadLineReports(invoiceId, lineId, lineSeq),
    onError: (error) => {
      toast.error(getApiErrorMessage(error));
    },
  });
}
