import { Marked, type Tokens } from 'marked';
import { withBase } from './paths';

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', colon: ':', Tab: '\t', NewLine: '\n',
  sol: '/', bsol: '\\', lpar: '(', rpar: ')', period: '.', comma: ',', excl: '!', num: '#', percnt: '%',
  plus: '+', equals: '=', quest: '?', semi: ';', commat: '@', lowbar: '_', hyphen: '-', dash: '-',
};

/** Decodes HTML character references: named (a known subset), decimal and hex. */
function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (match, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[ref] ?? match;
  });
}

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

/** Two leading slashes in any mix of '/' and backslash: browsers read a backslash as '/' in http(s) URLs. */
const PROTOCOL_RELATIVE_RE = /^[/\\]{2}/;

/**
 * Normalizes (decode entities, strip U+0000–U+0020 and U+007F) then classifies.
 * link: https|http|mailto kept; '//' (or backslash variants) -> null; '/x' -> withBase; '#', './', '../', bare path kept; other scheme -> null.
 * image: https kept; '/x' -> withBase; anything else -> null.
 */
export function sanitizeUrl(url: string, kind: 'link' | 'image'): string | null {
  // eslint-disable-next-line no-control-regex
  const normalized = decodeEntities(url).replace(/[\u0000- \u007f]/g, '');
  const scheme = SCHEME_RE.exec(normalized)?.[0].toLowerCase();
  if (kind === 'image') {
    if (scheme) return scheme === 'https:' ? normalized : null;
    if (normalized.startsWith('/') && !PROTOCOL_RELATIVE_RE.test(normalized)) return withBase(normalized);
    return null;
  }
  if (scheme) return scheme === 'https:' || scheme === 'http:' || scheme === 'mailto:' ? normalized : null;
  if (PROTOCOL_RELATIVE_RE.test(normalized)) return null;
  if (normalized.startsWith('/')) return withBase(normalized);
  return normalized;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeText(text);
    },
    link(token: Tokens.Link) {
      const inner = this.parser.parseInline(token.tokens);
      const href = sanitizeUrl(token.href, 'link');
      if (href === null) return inner;
      const title = token.title ? ` title="${escapeAttr(token.title)}"` : '';
      const rel = /^https?:/i.test(href) ? ' rel="noopener noreferrer"' : '';
      return `<a href="${escapeAttr(href)}"${title}${rel}>${inner}</a>`;
    },
    image(token: Tokens.Image) {
      const src = sanitizeUrl(token.href, 'image');
      if (src === null) return escapeText(token.text);
      const title = token.title ? ` title="${escapeAttr(token.title)}"` : '';
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(token.text)}"${title} loading="lazy" decoding="async">`;
    },
  },
});

/** Markdown -> HTML. Raw HTML is escaped; link/image URLs go through sanitizeUrl. */
export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false });
}
