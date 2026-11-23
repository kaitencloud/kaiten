import { describe, expect, it } from 'vite-plus/test';
import { toSafeMarkdownHref } from '..';

describe('toSafeMarkdownHref', () => {
  it.each([
    ['https://example.com/notes', 'https://example.com/notes'],
    ['http://example.com', 'http://example.com/'],
    ['HTTPS://Example.com/a?b=c#d', 'https://example.com/a?b=c#d'],
    ['  https://example.com/padded  ', 'https://example.com/padded'],
    ['mailto:releases@example.com', 'mailto:releases@example.com'],
  ])('keeps %s as %s', (url, expected) => {
    expect(toSafeMarkdownHref(url)).toBe(expected);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'java\nscript:alert(1)',
    '\u0000javascript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com/file',
    'blob:https://example.com/uuid',
    'tel:+15551234567',
    '/admin',
    './relative',
    '../up',
    '//example.com/protocol-relative',
    '#fragment',
    '?query=1',
    'example.com',
    '',
    '   ',
  ])('refuses %j', (url) => {
    expect(toSafeMarkdownHref(url)).toBeUndefined();
  });
});
