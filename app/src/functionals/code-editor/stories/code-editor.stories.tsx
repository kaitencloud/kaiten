import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CodeEditor } from '../code-editor';

// Production only ships json + a custom cel language (see code-editor.tsx) to
// keep the unused typescript/css/html workers out of the app bundle. These
// stories showcase a wider language surface, so register JS/TS here --
// Storybook has its own build and never touches the app's route chunks.
import 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
import 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
import 'monaco-editor/esm/vs/language/typescript/monaco.contribution';

const meta = {
  title: 'Functionals/CodeEditor',
  component: CodeEditor,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CodeEditor>;

export default meta;
type Story = StoryObj<typeof CodeEditor>;

const javascriptCode = `function greet(name) {
  console.log(\`Hello, \${name}!\`);
}

greet('World');`;

const typescriptCode = `interface User {
  id: number;
  name: string;
  email: string;
}

const user: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com'
};`;

const jsonCode = `{
  "name": "my-app",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.0.0",
    "typescript": "^5.0.0"
  }
}`;

type ControlledCodeEditorProps = {
  initialValue: string;
  language: string;
  height?: string;
};

function ControlledCodeEditor({
  initialValue,
  language,
  height,
}: ControlledCodeEditorProps) {
  const [code, setCode] = useState<string | null>(null);
  const value = code ?? initialValue;

  return (
    <div className="w-full max-w-3xl">
      <CodeEditor
        language={language}
        value={value}
        onChange={(value) => setCode(value || '')}
        height={height}
      />
    </div>
  );
}

export const JavaScript: Story = {
  render: () => (
    <ControlledCodeEditor initialValue={javascriptCode} language="javascript" />
  ),
};

export const TypeScript: Story = {
  render: () => (
    <ControlledCodeEditor initialValue={typescriptCode} language="typescript" />
  ),
};

export const JsonEditor: Story = {
  render: () => (
    <ControlledCodeEditor initialValue={jsonCode} language="json" />
  ),
};

export const ReadOnly: Story = {
  render: () => (
    <div className="w-full max-w-3xl">
      <CodeEditor
        language="javascript"
        defaultValue={javascriptCode}
        options={{ readOnly: true }}
      />
    </div>
  ),
};

export const CustomHeight: Story = {
  render: () => (
    <ControlledCodeEditor
      initialValue={javascriptCode}
      language="javascript"
      height="500px"
    />
  ),
};
