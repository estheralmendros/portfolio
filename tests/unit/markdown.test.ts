import { describe, expect, it } from 'vitest';
import { isSafeUrl, renderMarkdown, sanitizeUrl } from '../../src/lib/markdown';

describe('renderMarkdown basics', () => {
  it('renders headings and lists', () => {
    const html = renderMarkdown('## Why\n\n- a\n- b');
    expect(html).toContain('<h2');
    expect(html).toContain('<li>a</li>');
  });
  it('escapes raw HTML instead of rendering it', () => {
    const html = renderMarkdown("<script>alert('x')</script>\n\nText <b>bold</b>");
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<b>');
  });
  it('adds rel to http(s) links', () => {
    expect(renderMarkdown('[a](https://x.com)')).toContain('<a href="https://x.com" rel="noopener noreferrer">a</a>');
    expect(renderMarkdown('[a](http://x.com)')).toContain('rel="noopener noreferrer"');
    expect(renderMarkdown('[a](mailto:a@b.co)')).not.toContain('rel=');
  });
});

describe('renderMarkdown drops unsafe links', () => {
  it.each([
    '[x](javascript:alert(1))',
    '[x](JaVaScRiPt:alert(1))',
    '[x]( javascript:alert(1))',
    '[x](&#106;avascript:alert(1))',
    '[x](&#x6A;avascript:alert(1))',
    '[x](java&#x09;script:alert(1))',
    '[x](data:text/html,<script>alert(1)</script>)',
    '[x](vbscript:msgbox(1))',
    '[x](//evil.com)',
    '<javascript:alert(1)>',
    '[x][r]\n\n[r]: javascript:alert(1)',
  ])('%s renders no <a> or href', (md) => {
    const html = renderMarkdown(md);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });
  it('keeps the link text as plain text', () => expect(renderMarkdown('[click me](javascript:alert(1))')).toContain('click me'));
});

describe('renderMarkdown keeps safe links unchanged', () => {
  it.each([
    ['[x](https://example.com/a?b=1)', 'https://example.com/a?b=1'],
    ['[x](http://example.com)', 'http://example.com'],
    ['[x](mailto:a@b.co)', 'mailto:a@b.co'],
    ['[x](#anchor)', '#anchor'],
    ['[x](./rel)', './rel'],
    ['[x](../up)', '../up'],
    ['[x](bare/path)', 'bare/path'],
  ])('%s keeps href %s', (md, href) => expect(renderMarkdown(md)).toContain(`href="${href}"`));
});

describe('renderMarkdown images', () => {
  it.each(['![a](data:image/png;base64,AAAA)', '![a](http://x.com/a.png)', '![a](//evil.com/x.png)', '![a](javascript:alert(1))', '![a](./rel.png)'])(
    '%s renders no <img>',
    (md) => {
      const html = renderMarkdown(md);
      expect(html).not.toContain('<img');
      expect(html).toContain('a');
    },
  );
  it('renders https images', () => expect(renderMarkdown('![alt](https://x.com/a.png)')).toContain('<img src="https://x.com/a.png" alt="alt"'));
});

describe('base path and escaping', () => {
  it('prefixes root-relative links and images', () => {
    expect(renderMarkdown('[a](/abs)')).toContain('href="/portfolio/abs"');
    expect(renderMarkdown('![i](/images/x.png)')).toContain('src="/portfolio/images/x.png"');
    expect(renderMarkdown('[CV](/uploads/cv.pdf)')).toContain('href="/portfolio/uploads/cv.pdf"');
  });
  it('attribute-escapes & and " and cannot break out', () => {
    const html = renderMarkdown('[a](https://x.com/?a=1&b=2 "t\\"itle")');
    expect(html).toContain('href="https://x.com/?a=1&amp;b=2"');
    expect(html).toContain('title="t&quot;itle"');
    const html2 = renderMarkdown('[a](<https://x.com/"onmouseover="alert(1)>)');
    expect(html2).not.toMatch(/"\s*onmouseover=/);
    expect(html2).toContain('&quot;');
  });
});

describe('sanitizeUrl', () => {
  it.each([
    ['https://a.com', 'link', 'https://a.com'],
    ['/x', 'link', '/portfolio/x'],
    ['#f', 'link', '#f'],
    ['./x', 'link', './x'],
    ['//a.com', 'link', null],
    ['javascript:x', 'link', null],
    ['\u0000javascript:x', 'link', null],
    ['java\nscript:x', 'link', null],
    ['&#0000106;avascript:x', 'link', null],
    ['&#x6a;avascript:x', 'link', null],
    ['javascript&colon;x', 'link', null],
    ['https://a.com/i.png', 'image', 'https://a.com/i.png'],
    ['/i.png', 'image', '/portfolio/i.png'],
    ['//a.com/i.png', 'image', null],
    ['i.png', 'image', null],
    ['mailto:a@b.co', 'image', null],
  ] as const)('%j (%s) -> %j', (url, kind, out) => expect(sanitizeUrl(url, kind)).toBe(out));
  it('isSafeUrl mirrors sanitizeUrl', () => {
    expect(isSafeUrl('https://a.com', 'link')).toBe(true);
    expect(isSafeUrl('javascript:x', 'link')).toBe(false);
  });
});
