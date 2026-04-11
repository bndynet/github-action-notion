/**
 * Markdown post-processing helpers for output produced by `notion-to-md`.
 *
 * Goals:
 * - Make the output safe to feed into Docusaurus (which parses `.md` files
 *   as MDX by default in v3.x). MDX treats stray `<`, `>`, `{`, `}` as JSX
 *   syntax and will throw compile errors on otherwise plain prose.
 * - Preserve markdown structures we *don't* want to touch: fenced code
 *   blocks, inline code spans, CommonMark autolinks, the small set of HTML
 *   tags that `notion-to-md` itself emits (`<u>`, `<details>`, `<summary>`),
 *   block-level math fences (`$$...$$`), and leading blockquote markers.
 */

const PLACEHOLDER_PREFIX = '\u0000NTM_ESC_';
const PLACEHOLDER_SUFFIX = '\u0000';

// HTML tags that `notion-to-md` itself emits and therefore must be kept.
// (See node_modules/notion-to-md/build/utils/md.js: underline `<u>` and
// toggle `<details>` / `<summary>`.)
const NOTION_TO_MD_HTML_TAG = /<\/?(?:u|details|summary)>/g;

// CommonMark autolinks: `<scheme:rest>` and `<email@host>`.
// Examples: <https://example.com>, <mailto:a@b.com>, <ftp://x>, <a@b.com>.
const AUTOLINK_URI = /<[a-zA-Z][a-zA-Z0-9+.\-]*:[^\s<>]+>/g;
const AUTOLINK_EMAIL = /<[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}>/g;

// Inline-code spans. notion-to-md uses single backticks via md.inlineCode,
// so we only need to handle single-backtick spans here. We deliberately
// stop at newlines so a stray opening backtick on one line cannot eat the
// rest of the document.
const INLINE_CODE = /`[^`\n]+`/g;

// Fenced code block opening/closing: ``` or ~~~, allowing up to 3 leading
// spaces per CommonMark.
const CODE_FENCE = /^(\s{0,3})(`{3,}|~{3,})/;

// Block math fence used by notion-to-md: a line of just `$$`.
const MATH_FENCE = /^\s{0,3}\$\$\s*$/;

// MDX-significant punctuation we need to backslash-escape in plain text.
const MDX_SPECIAL_CHARS = /[<>{}]/g;

interface Segment {
  text: string;
  isCode: boolean;
}

function splitByInlineCode(line: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  // Reset regex state on every call (INLINE_CODE has the /g flag).
  INLINE_CODE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CODE.exec(line)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: line.slice(lastIndex, match.index),
        isCode: false,
      });
    }
    segments.push({ text: match[0], isCode: true });
    lastIndex = INLINE_CODE.lastIndex;
  }
  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), isCode: false });
  }
  return segments;
}

function escapePlainText(text: string): string {
  if (!text) return text;

  const placeholders: string[] = [];
  const stash = (match: string): string => {
    const token = `${PLACEHOLDER_PREFIX}${placeholders.length}${PLACEHOLDER_SUFFIX}`;
    placeholders.push(match);
    return token;
  };

  let safe = text
    .replace(NOTION_TO_MD_HTML_TAG, stash)
    .replace(AUTOLINK_URI, stash)
    .replace(AUTOLINK_EMAIL, stash);

  safe = safe.replace(MDX_SPECIAL_CHARS, (ch) => `\\${ch}`);

  safe = safe.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'),
    (_full, idx: string) => placeholders[Number(idx)],
  );

  return safe;
}

function escapeLine(line: string): string {
  // Preserve any leading blockquote markers ("> ", "> > ", etc.) so that
  // they keep their structural meaning. Anything after the markers is
  // treated as content.
  const leadMatch = line.match(/^(\s*(?:>\s?)*)/);
  const lead = leadMatch ? leadMatch[0] : '';
  const rest = line.slice(lead.length);

  const processed = splitByInlineCode(rest)
    .map((seg) => (seg.isCode ? seg.text : escapePlainText(seg.text)))
    .join('');

  return lead + processed;
}

/**
 * Escape MDX-significant characters (`<`, `>`, `{`, `}`) that appear as
 * plain text in the given markdown, leaving fenced code blocks, inline
 * code, CommonMark autolinks, block math (`$$...$$`), and the HTML tags
 * emitted by `notion-to-md` (`<u>`, `<details>`, `<summary>`) untouched.
 *
 * The output is safe for both classic CommonMark renderers and Docusaurus
 * MDX (`.md` files parsed as MDX in v3.x by default).
 */
export function escapeMdxSpecialChars(markdown: string): string {
  if (!markdown) return markdown;

  const lines = markdown.split('\n');
  let inCodeFence = false;
  let codeFenceChar = '';
  let inMathFence = false;

  return lines
    .map((line) => {
      // Highest precedence: are we currently inside a code fence?
      const codeMatch = line.match(CODE_FENCE);
      if (codeMatch && !inMathFence) {
        const marker = codeMatch[2][0];
        if (!inCodeFence) {
          inCodeFence = true;
          codeFenceChar = marker;
          return line;
        }
        if (marker === codeFenceChar) {
          inCodeFence = false;
          return line;
        }
      }
      if (inCodeFence) return line;

      // Block math fence (`$$` on its own line).
      if (MATH_FENCE.test(line)) {
        inMathFence = !inMathFence;
        return line;
      }
      if (inMathFence) return line;

      return escapeLine(line);
    })
    .join('\n');
}
