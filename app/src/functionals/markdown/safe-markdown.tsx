import type { ComponentProps } from 'react';
import Markdown, { type Components, type UrlTransform } from 'react-markdown';
import { cn } from '@/lib/utils';
import { toSafeMarkdownHref } from './safe-markdown-url';

// The elements CommonMark produces, less `img`: an image would make the
// browser fetch a URL the author chose as soon as the page opens. Anything
// outside the list is dropped; with `unwrapDisallowed`, its text is kept.
const ALLOWED_ELEMENTS = [
  'a',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
];

// Only a link's href survives, and only when it is safe. Every other URL
// attribute (an image's src, a quote's cite) is removed.
const keepSafeHref: UrlTransform = (url, key) =>
  key === 'href' ? toSafeMarkdownHref(url) : undefined;

// A link whose href was refused keeps its text, and nothing to click. A link
// left with no content, such as one that only wrapped an image, is dropped
// rather than drawn as an empty anchor.
function SafeMarkdownLink({ children, href, title }: ComponentProps<'a'>) {
  if (children === undefined || children === null) {
    return null;
  }

  if (!href) {
    return <span>{children}</span>;
  }

  const opensElsewhere = !href.startsWith('mailto:');

  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target={opensElsewhere ? '_blank' : undefined}
      title={title}
    >
      {children}
    </a>
  );
}

// The markdown sits inside a page that has its own headings, so its levels
// start at h3: a note's `#` never competes with the page title.
const COMPONENTS: Components = {
  a: SafeMarkdownLink,
  h1: 'h3',
  h2: 'h4',
  h3: 'h5',
  h4: 'h6',
  h5: 'h6',
};

const PROSE_CLASSES = [
  'space-y-3 text-sm leading-relaxed break-words',
  '[&_a]:font-medium [&_a]:text-primary-subtle-foreground [&_a]:underline [&_a]:underline-offset-4',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_h3]:text-base [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-medium',
  '[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1',
];

type SafeMarkdownProps = {
  children: string;
  className?: string;
};

/**
 * Renders untrusted markdown as React elements, with no raw HTML, no images
 * and no link but `http:`, `https:` and `mailto:`. The console sends no
 * Content-Security-Policy, so this component is the only defence: keep
 * `rehype-raw` and any plugin that emits HTML out of it. See README.md.
 *
 * Raw HTML in the source stays the text it is (`skipHtml={false}`): with no
 * rehype-raw, react-markdown turns it into a text node, so `<script>` shows
 * as those characters and never reaches the DOM as an element.
 */
export function SafeMarkdown({ children, className }: SafeMarkdownProps) {
  return (
    <div data-slot="safe-markdown" className={cn(PROSE_CLASSES, className)}>
      <Markdown
        allowedElements={ALLOWED_ELEMENTS}
        components={COMPONENTS}
        skipHtml={false}
        unwrapDisallowed
        urlTransform={keepSafeHref}
      >
        {children}
      </Markdown>
    </div>
  );
}
