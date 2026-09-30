import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react';
import { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { CodeEditor } from '@/functionals/code-editor';
import { useCelLint } from '../hooks/use-cel-lint';
import { useCelMonaco } from '../hooks/use-cel-monaco';
import { useCelValidate } from '../hooks/use-cel-validate';
import {
  issueToMarker,
  isSyntaxIssue,
  LINT_MARKER_OWNER,
  SYNTAX_MARKER_OWNER,
  type CelMarker,
  type MarkerModel,
} from '../logic/cel-markers';
import type {
  CelContextNode,
  CelIssue,
  CelLinter,
} from '../types/cel-context.types';

interface MonacoEditorInstance {
  getModel: () => editor.ITextModel | null;
  getAction: (id: string) => { run: () => void } | null | undefined;
  getLayoutInfo: () => { contentLeft: number };
  setPosition: (position: { lineNumber: number; column: number }) => void;
  revealPositionInCenterIfOutsideViewport: (position: {
    lineNumber: number;
    column: number;
  }) => void;
  focus: () => void;
}

interface MonacoRuntime {
  MarkerSeverity: { Error: number };
  editor: {
    setModelMarkers: (
      model: MarkerModel,
      owner: string,
      markers: CelMarker[],
    ) => void;
  };
}

declare global {
  interface Window {
    __KAITEN_DISABLE_CEL_WASM_VALIDATION__?: boolean;
    __KAITEN_STORYBOOK_TEST__?: boolean;
  }
}

const EMPTY_ROOTS: CelContextNode[] = [];

// A rule is one expression, not a program: when it outgrows the box it should
// wrap, not hide its tail behind a horizontal scroll in a 150px-tall field.
const EDITOR_OPTIONS = { wordWrap: 'on' } as const;

export interface CelEditorHandle {
  format: () => void;
  /** Puts the caret at a 1-based position, scrolls it into view, focuses. */
  focusPosition: (line: number, column: number) => void;
}

interface CelEditorProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * What a rule may read, for completion and hover documentation. Supplied by
   * the caller rather than fetched here: this module knows how to edit CEL and
   * deliberately nothing about how Kaiten is served.
   */
  contextRoots?: CelContextNode[];
  /**
   * The authoritative check. Also the caller's to provide, for the same reason
   * — and because only the caller knows whether there is a server to ask.
   * Omitted, the editor still highlights, completes and reports syntax errors.
   */
  lint?: CelLinter;
  /**
   * An already-computed verdict, when the caller owns the checking — a form
   * whose validator runs the lint, say. Set (even to an empty array), it
   * replaces `lint` entirely and `isChecking` reports the caller's in-flight
   * state; the editor just draws.
   */
  issues?: CelIssue[];
  /** Whether the external verdict is still on its way. Read only with `issues`. */
  isChecking?: boolean;
  /** Ghost text shown while the editor is empty — a real example to start from. */
  placeholder?: string;
  height?: string | number;
  className?: string;
  ref?: Ref<CelEditorHandle>;
  /** Disable the local syntax check (useful in tests without the WASM build). */
  disableValidation?: boolean;
}

function isStorybookTestRuntime() {
  return (
    typeof window !== 'undefined' && window.__KAITEN_STORYBOOK_TEST__ === true
  );
}

function CelEditorTestFallback({
  value,
  onChange,
  height = '300px',
  className,
  ref,
}: CelEditorProps) {
  useImperativeHandle(ref, () => ({
    format: () => undefined,
    focusPosition: () => undefined,
  }));

  return (
    <CodeEditor
      className={className}
      height={height}
      language="cel"
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? '')}
    />
  );
}

CelEditorTestFallback.displayName = 'CelEditorTestFallback';

function CelEditorInternal({
  value,
  onChange,
  contextRoots = EMPTY_ROOTS,
  lint,
  issues: externalIssues,
  isChecking: externalChecking = false,
  placeholder,
  height = '300px',
  className,
  ref,
  disableValidation = false,
}: CelEditorProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<MonacoRuntime | null>(null);
  // Read from the Monaco callbacks, which outlive any single render.
  const latestValueRef = useRef(value);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);
  const isValidationDisabled =
    disableValidation ||
    (typeof window !== 'undefined' &&
      window.__KAITEN_DISABLE_CEL_WASM_VALIDATION__ === true);

  const { isReady, validate: validateSyntax } = useCelValidate({
    enabled: !isValidationDisabled,
  });

  // The monaco instance comes from CodeEditor's onMount, NOT from
  // useMonaco(): that hook fires loader.init() before CodeEditor's lazy
  // factory has run loader.config({ monaco }), so @monaco-editor/loader
  // falls back to fetching Monaco from the jsdelivr CDN — a hidden network
  // dependency that hangs the page load when the CDN is slow (and breaks
  // hermetic e2e runs).
  const [monaco, setMonaco] = useState<Monaco | null>(null);
  const [model, setModel] = useState<editor.ITextModel | null>(null);
  const [contentLeft, setContentLeft] = useState(66);
  useCelMonaco(monaco, model, contextRoots);

  // An external verdict (even an empty one) means the caller owns the
  // checking; only without one does the editor run its own.
  const own = useCelLint(
    value,
    externalIssues === undefined ? lint : undefined,
  );
  const issues = externalIssues ?? own.issues;
  const isChecking =
    externalIssues === undefined ? own.isChecking : externalChecking;

  useImperativeHandle(ref, () => ({
    format: () => {
      if (editorRef.current) {
        editorRef.current.getAction('editor.action.formatDocument')?.run();
      }
    },
    focusPosition: (line: number, column: number) => {
      const mounted = editorRef.current;
      if (!mounted) return;

      const position = { lineNumber: line, column };
      mounted.setPosition(position);
      mounted.revealPositionInCenterIfOutsideViewport(position);
      mounted.focus();
    },
  }));

  const draw = useCallback((owner: string, drawn: CelIssue[]) => {
    const monaco = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!monaco || !model) return;

    monaco.editor.setModelMarkers(
      model,
      owner,
      drawn.map((issue) =>
        issueToMarker(issue, model, monaco.MarkerSeverity.Error),
      ),
    );
  }, []);

  /*
  The local engine is asked for syntax alone, which is the only thing it can be
  right about here.

  It is given no context on purpose. Handed one, it reports every name outside
  it as undeclared — and a rule may target on attributes the caller sends,
  which the server accepts and this cannot know. Without one it objects to
  every name instead, and isSyntaxIssue drops exactly those objections, leaving
  the parse errors it is genuinely authoritative on. Whether a name means
  anything is answered by the lint, over the wire, with the catalogue in hand.

  An empty rule is skipped: "no expression provided" on a form nobody has
  typed into yet is noise, and the lint owns the empty-rule verdict once the
  author has actually started.
  */
  const checkSyntax = useCallback(
    (code: string) => {
      if (isValidationDisabled || !isReady || code.trim() === '') {
        draw(SYNTAX_MARKER_OWNER, []);
        return;
      }

      const result = validateSyntax(code);
      const syntaxIssues = (result.errors ?? [])
        .filter((error) => isSyntaxIssue(error.message))
        .map((error) => ({
          message: error.message,
          line: error.line ?? 1,
          column: error.column ?? 1,
        }));

      draw(SYNTAX_MARKER_OWNER, syntaxIssues);
    },
    [draw, isReady, isValidationDisabled, validateSyntax],
  );

  // Re-check once the engine finishes loading, and whenever the rule changes.
  useEffect(() => {
    checkSyntax(latestValueRef.current);
  }, [checkSyntax, value]);

  useEffect(() => {
    draw(LINT_MARKER_OWNER, issues);
  }, [draw, issues]);

  const handleEditorDidMount = (edtr: unknown, monacoInstance: unknown) => {
    const mounted = edtr as MonacoEditorInstance;
    editorRef.current = mounted;
    monacoRef.current = monacoInstance as MonacoRuntime;
    setMonaco(monacoInstance as Monaco);
    setModel(mounted.getModel());
    setContentLeft(mounted.getLayoutInfo().contentLeft);
    checkSyntax(latestValueRef.current);
    draw(LINT_MARKER_OWNER, issues);
  };

  const handleChange = (val: string | undefined) => {
    onChange(val || '');
  };

  return (
    <div className="relative">
      <CodeEditor
        className={className}
        height={height}
        language="cel"
        value={value}
        options={EDITOR_OPTIONS}
        onMount={handleEditorDidMount}
        onChange={handleChange}
      />
      {/* Ghost text while the editor is empty: a real example to start from,
          where a blank dark box says nothing. Aligned to where the code goes
          (past the line numbers, measured off the editor's own layout) and
          gone at the first character. */}
      {placeholder && value === '' && (
        <span
          aria-hidden
          className="text-muted-foreground/50 pointer-events-none absolute top-0 z-10 truncate pt-px text-sm leading-[19px]"
          style={{
            left: contentLeft,
            maxWidth: `calc(100% - ${contentLeft + 16}px)`,
            fontFamily: "'Fira Code', Consolas, monospace",
          }}
        >
          {placeholder}
        </span>
      )}
      {/* The verdict takes a debounce plus a round trip; this is the quiet
          admission that it is still on its way, sized to be findable when
          looked for and invisible when not. Decorative only — the outcome
          itself arrives as markers, which assistive tech already surfaces. */}
      {isChecking && (
        <span
          aria-hidden
          className="bg-muted-foreground/40 absolute right-3 bottom-2 z-10 h-1.5 w-1.5 animate-pulse rounded-full"
        />
      )}
    </div>
  );
}

CelEditorInternal.displayName = 'CelEditorInternal';

export function CelEditor(props: CelEditorProps) {
  if (isStorybookTestRuntime()) {
    return <CelEditorTestFallback {...props} />;
  }

  return <CelEditorInternal {...props} />;
}

CelEditor.displayName = 'CelEditor';
