import { describe, expect, test } from '@jest/globals';
import { escapeMdxSpecialChars } from '../src/markdown';

describe('escapeMdxSpecialChars', () => {
  test('leaves plain text without special chars untouched', () => {
    expect(escapeMdxSpecialChars('Hello world')).toBe('Hello world');
  });

  test('escapes stray < and > in plain text', () => {
    expect(escapeMdxSpecialChars('2 < 3 and 4 > 1')).toBe(
      '2 \\< 3 and 4 \\> 1',
    );
    expect(escapeMdxSpecialChars('Has <foo> in text')).toBe(
      'Has \\<foo\\> in text',
    );
  });

  test('escapes stray { and } for MDX safety', () => {
    expect(escapeMdxSpecialChars('Use {state} in JSX')).toBe(
      'Use \\{state\\} in JSX',
    );
    expect(escapeMdxSpecialChars('JSON: { "a": 1 }')).toBe(
      'JSON: \\{ "a": 1 \\}',
    );
  });

  test('preserves HTML tags emitted by notion-to-md', () => {
    expect(escapeMdxSpecialChars('<u>underline</u>')).toBe('<u>underline</u>');
    expect(
      escapeMdxSpecialChars('<details><summary>Click</summary>body</details>'),
    ).toBe('<details><summary>Click</summary>body</details>');
  });

  test('preserves CommonMark autolinks', () => {
    expect(escapeMdxSpecialChars('<https://example.com>')).toBe(
      '<https://example.com>',
    );
    expect(escapeMdxSpecialChars('<mailto:a@b.com>')).toBe('<mailto:a@b.com>');
    expect(escapeMdxSpecialChars('<a@b.com>')).toBe('<a@b.com>');
  });

  test('does not touch text inside inline code spans', () => {
    expect(escapeMdxSpecialChars('Inline `code <not> {escaped}` here')).toBe(
      'Inline `code <not> {escaped}` here',
    );
  });

  test('does not touch fenced code blocks', () => {
    const input = 'Code:\n```\nif (a < b) { /* skip */ }\n```\nDone <x> {y}';
    const expected =
      'Code:\n```\nif (a < b) { /* skip */ }\n```\nDone \\<x\\> \\{y\\}';
    expect(escapeMdxSpecialChars(input)).toBe(expected);
  });

  test('does not touch tilde-fenced code blocks', () => {
    const input = '~~~\n<x> {y}\n~~~\nafter <z>';
    const expected = '~~~\n<x> {y}\n~~~\nafter \\<z\\>';
    expect(escapeMdxSpecialChars(input)).toBe(expected);
  });

  test('does not touch block math fences', () => {
    const input = 'before <x>\n$$\nE = mc^{2}\n$$\nafter <y>';
    const expected = 'before \\<x\\>\n$$\nE = mc^{2}\n$$\nafter \\<y\\>';
    expect(escapeMdxSpecialChars(input)).toBe(expected);
  });

  test('preserves leading blockquote markers but escapes their content', () => {
    expect(escapeMdxSpecialChars('> blockquote with <foo>')).toBe(
      '> blockquote with \\<foo\\>',
    );
    expect(escapeMdxSpecialChars('> > nested <bar>')).toBe(
      '> > nested \\<bar\\>',
    );
  });

  test('handles empty/undefined input gracefully', () => {
    expect(escapeMdxSpecialChars('')).toBe('');
    expect(escapeMdxSpecialChars(undefined as unknown as string)).toBe(
      undefined as unknown as string,
    );
  });
});
