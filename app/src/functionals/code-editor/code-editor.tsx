import type React from 'react';
import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

// Initialize Monaco Editor workers configuration
import '@/lib/monaco-workers';

// Global container ID for Monaco overflow widgets
const MONACO_WIDGETS_CONTAINER_ID = 'monaco-overflow-widgets';

// Create container immediately (singleton pattern)
let widgetsContainer: HTMLElement | null = null;

function getWidgetsContainer(): HTMLElement | undefined {
  if (typeof document === 'undefined') return undefined;

  if (!widgetsContainer) {
    widgetsContainer = document.getElementById(MONACO_WIDGETS_CONTAINER_ID);
    if (!widgetsContainer) {
      widgetsContainer = document.createElement('div');
      widgetsContainer.id = MONACO_WIDGETS_CONTAINER_ID;
      widgetsContainer.className = 'monaco-editor';
      document.body.appendChild(widgetsContainer);
    }
  }
  return widgetsContainer;
}

// Initialize container on module load
if (typeof document !== 'undefined') {
  getWidgetsContainer();
}

type CodeEditorMountHandler = (editor: unknown, monaco: unknown) => void;

type CodeEditorOptions = Record<string, unknown>;

declare global {
  interface Window {
    __KAITEN_STORYBOOK_TEST__?: boolean;
  }
}

interface CodeEditorProps {
  className?: string;
  height?: string | number;
  options?: CodeEditorOptions;
  onMount?: CodeEditorMountHandler;
  onChange?: (value: string | undefined, event: unknown) => void;
  [key: string]: unknown;
}

type MonacoEditorProps = {
  height?: string | number;
  theme?: string;
  options?: CodeEditorOptions;
  onMount?: CodeEditorMountHandler;
  onChange?: (value: string | undefined, event: unknown) => void;
  [key: string]: unknown;
};

const EMPTY_EDITOR_OPTIONS: CodeEditorOptions = {};

function isStorybookTestRuntime() {
  return (
    typeof window !== 'undefined' && window.__KAITEN_STORYBOOK_TEST__ === true
  );
}

function getReadonlyOption(options: CodeEditorOptions | undefined) {
  return Boolean(options && options.readOnly === true);
}

const CodeEditorTestFallback: React.FC<CodeEditorProps> = ({
  className,
  height = '300px',
  options,
  onChange,
  value,
  defaultValue,
}) => {
  const stringValue = typeof value === 'string' ? value : undefined;
  const stringDefaultValue =
    stringValue === undefined && typeof defaultValue === 'string'
      ? defaultValue
      : undefined;
  const readOnly =
    getReadonlyOption(options) || (stringValue !== undefined && !onChange);

  return (
    <div className={cn('border border-input rounded-md', className || '')}>
      <textarea
        aria-label="Code editor"
        className="h-full w-full resize-none rounded-md bg-background p-3 font-mono text-sm outline-none"
        style={{ height }}
        value={stringValue}
        defaultValue={stringDefaultValue}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.currentTarget.value, event)}
      />
    </div>
  );
};

const MonacoEditor = lazy(async () => {
  const [monaco, jsonContribution, module] = await Promise.all([
    import('monaco-editor/esm/vs/editor/editor.api'),
    import('monaco-editor/esm/vs/language/json/monaco.contribution'),
    import('@monaco-editor/react'),
  ]);

  // The full 'monaco-editor' barrel (editor.main.js) statically imports the
  // css/html/json/typescript contributions and wires each onto
  // `monaco.languages`. Each of those pulls in its own worker chunk
  // (ts.worker.js alone is ~7MB) even though monaco-workers.ts only ever
  // instantiates the json and base editor workers. We import just the editor
  // core plus json support -- the only built-in language this app renders --
  // and replicate that one line of wiring by hand.
  (monaco.languages as unknown as { json: typeof jsonContribution }).json =
    jsonContribution;

  module.loader.config({ monaco });

  return {
    default: module.default as React.ComponentType<MonacoEditorProps>,
  };
});

// Internal component with the actual Monaco Editor logic
const CodeEditorInternal: React.FC<CodeEditorProps> = ({
  className,
  height = '300px',
  options = EMPTY_EDITOR_OPTIONS,
  onMount,
  ...props
}) => {
  const { theme } = useTheme();
  const themeEditor = theme === 'dark' ? 'vs-dark' : 'light';

  // Update container theme class
  useEffect(() => {
    const container = getWidgetsContainer();
    if (container) {
      container.classList.remove('vs', 'vs-dark');
      container.classList.add(themeEditor === 'vs-dark' ? 'vs-dark' : 'vs');
    }
  }, [themeEditor]);

  const handleMount = useCallback(
    (editor: unknown, monaco: unknown) => {
      onMount?.(editor, monaco);
    },
    [onMount],
  );

  const defaultOptions: CodeEditorOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontSize: 14,
    fontFamily: "'Fira Code', Consolas, monospace",
    lineNumbers: 'on',
    renderLineHighlight: 'all',
    automaticLayout: true,
    fixedOverflowWidgets: true,
    overflowWidgetsDomNode: getWidgetsContainer(),
    // Hover settings - position below text to prevent flickering
    hover: {
      enabled: true,
      delay: 300,
      sticky: true,
      above: false,
    },
    ...options,
  };

  return (
    <div className={cn('border border-input rounded-md', className || '')}>
      <MonacoEditor
        height={height}
        theme={themeEditor}
        options={defaultOptions}
        onMount={handleMount}
        {...props}
      />
    </div>
  );
};

// Loading placeholder component
const CodeEditorLoadingPlaceholder: React.FC<{
  height?: string | number;
  className?: string;
}> = ({ height = '300px', className }) => (
  <div
    className={cn(
      'border border-input rounded-md flex items-center justify-center',
      className || '',
    )}
    style={{ height }}
  >
    <div className="text-muted-foreground text-sm">Loading editor...</div>
  </div>
);

// Exported component using real code-splitting for Monaco.
export const CodeEditor: React.FC<CodeEditorProps> = (props) => {
  if (isStorybookTestRuntime()) {
    return <CodeEditorTestFallback {...props} />;
  }

  return (
    <Suspense
      fallback={
        <CodeEditorLoadingPlaceholder
          height={props.height}
          className={props.className}
        />
      }
    >
      <CodeEditorInternal {...props} />
    </Suspense>
  );
};
