import sanitizeHtml from 'sanitize-html';

const STYLED_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'mark', 'td', 'th', 'li', 'blockquote'];

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i];

/**
 * Allow-list for editor HTML. Anything else (scripts, handlers, iframes, arbitrary CSS) is dropped.
 * Only the inline styles a word processor needs survive: font, size, colours, alignment, spacing.
 */
const options: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'code', 'pre', 'span', 'mark',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt'],
    th: ['colspan', 'rowspan', 'style'],
    td: ['colspan', 'rowspan', 'style'],
    ...Object.fromEntries(STYLED_TAGS.filter((tag) => tag !== 'td' && tag !== 'th').map((tag) => [tag, ['style']])),
  },
  allowedStyles: {
    '*': {
      color: COLOR,
      'background-color': COLOR,
      'font-family': [/^[\w\s,"'.-]{1,120}$/],
      'font-size': [/^\d{1,3}(\.\d+)?(px|pt)$/],
      'text-align': [/^(left|right|center|justify)$/],
      'line-height': [/^\d{1,3}(\.\d+)?(px|pt|%)?$/],
    },
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['data', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  // An <img> whose src was rejected (for example a javascript: URL) has nothing left to show.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
};

export function sanitizeEditorHtml(html: string): string {
  return sanitizeHtml(html, options);
}
