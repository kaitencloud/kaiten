import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { SafeMarkdown } from '..';

function renderMarkdown(source: string) {
  return render(<SafeMarkdown>{source}</SafeMarkdown>).container;
}

// Every element the renderer drew, by tag, under its own wrapper.
function tagsIn(container: HTMLElement) {
  return [
    ...container.querySelectorAll('[data-slot="safe-markdown"] *'),
  ].map((element) => element.tagName.toLowerCase());
}

describe('SafeMarkdown', () => {
  it('renders CommonMark: headings, emphasis, lists, quotes and code', () => {
    const container = renderMarkdown(
      [
        '# Release 2.0',
        '',
        'Some **bold** and _italic_ text with `code`.',
        '',
        '- first',
        '- second',
        '',
        '1. one',
        '',
        '> quoted',
        '',
        '```',
        'block',
        '```',
      ].join('\n'),
    );

    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getByText('italic').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
    expect(screen.getByText('block').closest('pre')).not.toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(container.querySelector('blockquote')).toHaveTextContent('quoted');
  });

  it('starts headings at level 3, under the page that holds the markdown', () => {
    renderMarkdown('# Top\n\n## Second\n\n###### Deepest');

    expect(screen.getByRole('heading', { name: 'Top' }).tagName).toBe('H3');
    expect(screen.getByRole('heading', { name: 'Second' }).tagName).toBe('H4');
    expect(screen.getByRole('heading', { name: 'Deepest' }).tagName).toBe(
      'H6',
    );
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  describe('raw HTML', () => {
    it.each([
      ['a script block', '<script>alert(1)</script>', 'script'],
      ['an inline image with onerror', 'x <img src=x onerror="alert(1)"> y', 'img'],
      ['an iframe', '<iframe src="https://example.com"></iframe>', 'iframe'],
      ['an uppercase image', '<IMG SRC="https://example.com/x.png">', 'img'],
      ['a style block', '<style>body{display:none}</style>', 'style'],
      ['an svg with onload', '<svg onload="alert(1)"></svg>', 'svg'],
      ['a form', '<form action="https://example.com"><input></form>', 'form'],
    ])('renders %s as text, never as an element', (_, source, tag) => {
      const container = renderMarkdown(source);

      expect(container.querySelector(tag)).toBeNull();
      expect(container.querySelector('[onerror], [onload]')).toBeNull();
      expect(container).toHaveTextContent(source.replace(/^x | y$/g, ''));
    });

    it('does not turn an HTML anchor into a link', () => {
      const container = renderMarkdown(
        '<a href="javascript:alert(1)">click</a>',
      );

      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('[href]')).toBeNull();
    });
  });

  describe('links', () => {
    it.each([
      ['javascript:', '[click](javascript:alert(1))'],
      ['javascript: in another case', '[click](JaVaScRiPt:alert(1))'],
      ['javascript: as character references', '[click](&#106;avascript:alert(1))'],
      ['javascript: in an autolink', '<javascript:alert(1)>'],
      ['data:', '[click](data:text/html;base64,PHNjcmlwdD4=)'],
      ['vbscript:', '[click](vbscript:msgbox(1))'],
      ['a relative path', '[click](/settings)'],
      ['a protocol-relative URL', '[click](//example.com)'],
      ['a reference to an unsafe URL', '[click][ref]\n\n[ref]: javascript:alert(1)'],
    ])('keeps the text of a %s link but gives it no href', (_, source) => {
      const container = renderMarkdown(source);

      expect(container.querySelector('a')).toBeNull();
      expect(container.querySelector('[href]')).toBeNull();
      expect(container.textContent?.trim()).not.toBe('');
    });

    it('renders an https link that opens in a new tab without an opener', () => {
      renderMarkdown('See the [changelog](https://example.com/changelog).');

      const link = screen.getByRole('link', { name: 'changelog' });
      expect(link).toHaveAttribute('href', 'https://example.com/changelog');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders an http autolink', () => {
      renderMarkdown('<http://example.com/notes>');

      expect(screen.getByRole('link')).toHaveAttribute(
        'href',
        'http://example.com/notes',
      );
    });

    it('renders a mailto link in place', () => {
      renderMarkdown('[Write to us](mailto:releases@example.com)');

      const link = screen.getByRole('link', { name: 'Write to us' });
      expect(link).toHaveAttribute('href', 'mailto:releases@example.com');
      expect(link).not.toHaveAttribute('target');
    });
  });

  describe('images', () => {
    it.each([
      ['an inline image', '![x](https://example.com/x.png)'],
      ['a reference image', '![x][logo]\n\n[logo]: https://example.com/x.png'],
      ['an image inside a link', '[![x](https://example.com/x.png)](https://example.com)'],
    ])('draws no img for %s', (_, source) => {
      const container = renderMarkdown(source);

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('[src]')).toBeNull();
    });

    it('leaves no empty link behind when a link only wrapped an image', () => {
      const container = renderMarkdown(
        '[![build](https://example.com/badge.svg)](https://example.com/ci)',
      );

      expect(container.querySelector('a')).toBeNull();
    });
  });

  it('draws only the elements CommonMark text needs', () => {
    const container = renderMarkdown(
      '# A\n\n[x](https://example.com) ![y](https://example.com/y.png)\n\n<b>raw</b>\n\n---',
    );

    expect(tagsIn(container)).toEqual(['h3', 'p', 'a', 'p', 'hr']);
  });
});
