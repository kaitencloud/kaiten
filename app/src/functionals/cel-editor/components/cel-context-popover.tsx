import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Braces } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { CelContextNode } from '../types/cel-context.types';

/**
 * The served context tree, browsable without touching the editor.
 *
 * Autocomplete only teaches what a rule can read to someone already typing a
 * rule; this is for the author who opens the form not yet knowing what there
 * is to target on. Same data as the completion — the tree the server serves —
 * so the two cannot tell different stories.
 */
export function CelContextPopover({ roots }: { roots: CelContextNode[] }) {
  const { t } = useTranslation();

  if (roots.length === 0) return null;

  return (
    // modal, because this popover lives inside a modal dialog: the dialog's
    // scroll lock blocks wheel events on anything portaled outside its own
    // subtree, which left this list scrollable only by dragging the bar. A
    // modal popover takes the lock over while open and allowlists its own
    // scrollables.
    <Popover modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground h-6 gap-1 px-1.5 text-xs"
        >
          <Braces className="h-3.5 w-3.5" />
          {t('Functionals.CelEditor.context')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">
            {t('Functionals.CelEditor.contextTitle')}
          </p>
          <p className="text-muted-foreground text-xs">
            {t('Functionals.CelEditor.contextOpenWorld')}
          </p>
        </div>
        <ScrollArea className="h-72">
          <div className="p-2">
            {roots.map((root) => (
              <ContextNode key={root.name} node={root} depth={0} />
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function ContextNode({ node, depth }: { node: CelContextNode; depth: number }) {
  const { t } = useTranslation();
  const children = node.fields ?? [];

  return (
    <div style={{ paddingLeft: depth * 12 }}>
      <div className="rounded px-1.5 py-1">
        <div className="flex items-baseline gap-2">
          <code className="text-xs font-medium">{node.name}</code>
          <span className="text-muted-foreground text-[10px]">
            {node.type}
            {node.optional &&
              ` · ${t('Functionals.CelEditor.contextMayBeAbsent')}`}
          </span>
        </div>
        {node.description && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {node.description}
          </p>
        )}
        {node.knownKeys && node.knownKeys.length > 0 && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t('Functionals.CelEditor.contextCurrentKeys')}{' '}
            {node.knownKeys.map((key) => (
              <code key={key} className="bg-muted mr-1 rounded px-1">
                {key}
              </code>
            ))}
          </p>
        )}
      </div>
      {children.map((child) => (
        <ContextNode key={child.name} node={child} depth={depth + 1} />
      ))}
      {/* A map's entries all share one shape; show it once, below the keys. */}
      {node.values?.fields?.map((child) => (
        <ContextNode key={child.name} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
