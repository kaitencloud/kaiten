# Markdown

`SafeMarkdown` renders markdown that a user wrote, such as the release notes of a release, as React elements. The text is untrusted and the console sends no Content-Security-Policy, so this renderer is the only thing between that text and the page. It is a deliberately generic primitive, shared before its second consumer as "Extract late" allows: any screen that shows user-written markdown uses it rather than a renderer of its own.

```tsx
import { SafeMarkdown } from '@/functionals/markdown';

<SafeMarkdown>{release.releaseNote}</SafeMarkdown>;
```

## What it renders

CommonMark, through [`react-markdown`](https://github.com/remarkjs/react-markdown), with no remark or rehype plugin: paragraphs, headings, emphasis, lists, block quotes, code, rules and links. GitHub's extensions (tables, task lists, strikethrough) are not parsed. A heading starts at level 3, since the markdown sits under the page's own title and cards: `#` draws an `h3`, `######` an `h6`.

## The rules

Each one is tested in `__tests__/`.

| Input | Result |
| --- | --- |
| Raw HTML: `<script>`, `<img onerror>`, `<iframe>`, `<a href>` | Shown as the text it is. No `rehype-raw`, so react-markdown turns it into a text node and it never becomes an element. |
| A link to `http:`, `https:` or `mailto:` | An `<a>`, with `rel="noopener noreferrer"`. An `http:` or `https:` link opens in a new tab. |
| Any other link: `javascript:`, `data:`, `vbscript:`, a relative or protocol-relative URL | Its text, with no `href`: nothing to click. `toSafeMarkdownHref` decides, on the URL parser's own reading of the URL, and the href drawn is that parser's serialization. |
| An image, inline or by reference | Not drawn: no `<img>`, so no request to a URL the author chose. A link that only wrapped an image is dropped with it. |
| Any other element or URL attribute | Dropped. `ALLOWED_ELEMENTS` lists what may be drawn, and only an `href` survives the URL transform. |

## Changing it

- Never add `rehype-raw`, nor any plugin that emits HTML or adds URL attributes.
- Adding an element to `ALLOWED_ELEMENTS`, a plugin (`remark-gfm` included) or a scheme to `toSafeMarkdownHref` widens what untrusted text can draw. Add a test that proves the new rule, next to the ones above.
