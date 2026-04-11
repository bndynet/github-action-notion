import { describe, expect, test } from '@jest/globals';
import { buildFrontmatter, extractSlugFromUrl, yamlQuote } from '../src/notion';

describe('yamlQuote', () => {
  test('wraps plain string in single quotes', () => {
    expect(yamlQuote('hello')).toBe("'hello'");
  });

  test('doubles internal single quotes per YAML 1.2 spec', () => {
    expect(yamlQuote("it's a test")).toBe("'it''s a test'");
  });

  test('keeps YAML-significant punctuation safely escaped', () => {
    expect(yamlQuote('Title: with: colons')).toBe("'Title: with: colons'");
    expect(yamlQuote('a [b] c #d {e}')).toBe("'a [b] c #d {e}'");
  });

  test('handles empty string', () => {
    expect(yamlQuote('')).toBe("''");
  });
});

describe('buildFrontmatter', () => {
  test('emits a Docusaurus-compatible frontmatter block', () => {
    const out = buildFrontmatter({
      title: 'Hello World',
      slug: 'hello-world',
      date: '2026-04-25',
      tags: ['notion', 'release notes'],
      notion_url: 'https://www.notion.so/Hello-World-abcdef0123456789',
    });

    expect(out).toBe(
      [
        '---',
        "title: 'Hello World'",
        "slug: 'hello-world'",
        'date: 2026-04-25',
        "tags: ['notion', 'release notes']",
        "notion_url: 'https://www.notion.so/Hello-World-abcdef0123456789'",
        '---',
        '',
      ].join('\n'),
    );
  });

  test('quotes title with YAML-significant chars', () => {
    const out = buildFrontmatter({
      title: "TS 5.x: what's new?",
      slug: 'ts-5-x',
      date: '2026-04-25',
      tags: [],
      notion_url: 'https://example.com',
    });
    expect(out).toContain("title: 'TS 5.x: what''s new?'");
    expect(out).toContain('tags: []');
  });
});

describe('extractSlugFromUrl', () => {
  test('strips trailing 32-hex notion id and a leading dash', () => {
    expect(
      extractSlugFromUrl(
        'https://www.notion.so/My-Cool-Post-0123456789abcdef0123456789abcdef',
      ),
    ).toBe('my-cool-post');
  });

  test('decodes URL-encoded non-ASCII slugs', () => {
    expect(
      extractSlugFromUrl(
        'https://www.notion.so/' +
          encodeURIComponent('我的页面') +
          '-0123456789abcdef0123456789abcdef',
      ),
    ).toBe('我的页面');
  });

  test('returns empty for empty input', () => {
    expect(extractSlugFromUrl('')).toBe('');
  });
});
