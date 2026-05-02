import { describe, expect, test } from '@jest/globals';
import * as path from 'path';
import {
  buildAssetMarkdownUrl,
  extractMarkdownImageUrls,
  isAwsSigV4PresignedUrl,
  isSafeAssetUrl,
  rewriteMarkdownImages,
  shouldAttachNotionAuthorization,
} from '../src/assets';

describe('extractMarkdownImageUrls', () => {
  test('collects unique https targets', () => {
    const md = `![a](https://a.com/x.png) text ![b](https://a.com/x.png)`;
    expect(extractMarkdownImageUrls(md)).toEqual(['https://a.com/x.png']);
  });

  test('ignores data URIs', () => {
    const md = '![](data:image/png;base64,abcd)';
    expect(extractMarkdownImageUrls(md)).toEqual([]);
  });
});

describe('isSafeAssetUrl', () => {
  test('allows public https', () => {
    expect(isSafeAssetUrl('https://example.com/a.png')).toBe(true);
  });

  test('blocks localhost', () => {
    expect(isSafeAssetUrl('http://localhost/foo')).toBe(false);
    expect(isSafeAssetUrl('http://127.0.0.1/foo')).toBe(false);
  });

  test('blocks RFC1918', () => {
    expect(isSafeAssetUrl('https://10.0.0.1/x')).toBe(false);
    expect(isSafeAssetUrl('https://192.168.1.1/x')).toBe(false);
    expect(isSafeAssetUrl('https://172.16.0.1/x')).toBe(false);
  });
});

describe('shouldAttachNotionAuthorization', () => {
  test('matches Notion file hosts', () => {
    expect(
      shouldAttachNotionAuthorization(
        'prod-files-secure.s3.us-west-2.amazonaws.com',
      ),
    ).toBe(true);
    expect(shouldAttachNotionAuthorization('www.notion.so')).toBe(true);
    expect(
      shouldAttachNotionAuthorization('attachment.notionusercontent.com'),
    ).toBe(true);
  });

  test('does not attach for arbitrary CDN', () => {
    expect(shouldAttachNotionAuthorization('images.unsplash.com')).toBe(false);
  });
});

describe('isAwsSigV4PresignedUrl', () => {
  test('true for Notion-style S3 presigned object URL', () => {
    const u =
      'https://prod-files-secure.s3.us-west-2.amazonaws.com/bucket/key.png?' +
      'X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=abc';
    expect(isAwsSigV4PresignedUrl(u)).toBe(true);
  });

  test('false for non-S3 hosts', () => {
    expect(
      isAwsSigV4PresignedUrl('https://example.com/a.png?X-Amz-Signature=x'),
    ).toBe(false);
  });

  test('false for S3 URL without SigV4 query params', () => {
    expect(
      isAwsSigV4PresignedUrl(
        'https://mybucket.s3.us-west-2.amazonaws.com/public/logo.png',
      ),
    ).toBe(false);
  });
});

describe('rewriteMarkdownImages', () => {
  test('replaces only mapped URLs', () => {
    const md = '![x](https://a.com/1.png) ![y](https://b.com/2.png)';
    const map = new Map([['https://a.com/1.png', 'images/p/abc.png']]);
    expect(rewriteMarkdownImages(md, map)).toBe(
      '![x](images/p/abc.png) ![y](https://b.com/2.png)',
    );
  });
});

describe('buildAssetMarkdownUrl (generated image links)', () => {
  const cwd = () => process.cwd();

  describe('default: site root /{postBase}/{filename} (no asset-link-base)', () => {
    test('assets-dir ./static/ only affects disk; URL is /slug/file (Docusaurus static/ convention)', () => {
      const root = cwd();
      const assetsDir = path.join(root, 'static');
      const mdPath = path.join(root, 'blog', '2026-01-01-a.md');
      const postBase = '2026-01-01-a';
      const fn = 'abc123.png';
      expect(
        buildAssetMarkdownUrl({
          linkBase: undefined,
          assetsDir,
          markdownFilePath: mdPath,
          postBase,
          filename: fn,
          absoluteAssetFile: path.join(assetsDir, postBase, fn),
        }),
      ).toBe(`/${postBase}/${fn}`);
    });

    test('URL does not include blog/ or nested assets-dir segments', () => {
      const root = cwd();
      const assetsDir = path.join(root, 'docs', 'site', 'static');
      const mdPath = path.join(root, 'blog', 'deep', 'post.md');
      const postBase = '2026-05-11-hello';
      const fn = 'x.webp';
      expect(
        buildAssetMarkdownUrl({
          linkBase: undefined,
          assetsDir,
          markdownFilePath: mdPath,
          postBase,
          filename: fn,
          absoluteAssetFile: path.join(assetsDir, postBase, fn),
        }),
      ).toBe('/2026-05-11-hello/x.webp');
    });

    test('only-whitespace linkBase is treated like unset', () => {
      expect(
        buildAssetMarkdownUrl({
          linkBase: '   \t  ',
          assetsDir: path.join(cwd(), 'static'),
          markdownFilePath: path.join(cwd(), 'blog', 'a.md'),
          postBase: '2026-01-01-a',
          filename: 'x.png',
        }),
      ).toBe('/2026-01-01-a/x.png');
    });
  });

  describe('explicit asset-link-base', () => {
    test('typical: assets-dir ./static + asset-link-base /static/ → /static/{postBase}/{filename}', () => {
      expect(
        buildAssetMarkdownUrl({
          linkBase: '/static/',
          assetsDir: path.join(cwd(), 'static'),
          markdownFilePath: path.join(cwd(), 'blog', 'x.md'),
          postBase: '2026-01-01-a',
          filename: 'face.png',
          absoluteAssetFile: path.join(
            cwd(),
            'static',
            '2026-01-01-a',
            'face.png',
          ),
        }),
      ).toBe('/static/2026-01-01-a/face.png');
    });

    test('strips trailing slashes on path base', () => {
      expect(
        buildAssetMarkdownUrl({
          linkBase: '/static/',
          assetsDir: path.join(cwd(), 'static'),
          markdownFilePath: path.join(cwd(), 'blog', '2026-01-01-a.md'),
          postBase: '2026-01-01-a',
          filename: 'abc123.png',
          absoluteAssetFile: path.join(
            cwd(),
            'static',
            '2026-01-01-a',
            'abc123.png',
          ),
        }),
      ).toBe('/static/2026-01-01-a/abc123.png');
    });

    test('HTTPS CDN base + post folder + filename', () => {
      expect(
        buildAssetMarkdownUrl({
          linkBase: 'https://cdn.example.com/blog-assets/',
          assetsDir: path.join(cwd(), 'any'),
          markdownFilePath: path.join(cwd(), 'blog', 'x.md'),
          postBase: '2026-05-11-hello',
          filename: 'deadbeef01.png',
          absoluteAssetFile: path.join(cwd(), 'static', 'x.png'),
        }),
      ).toBe(
        'https://cdn.example.com/blog-assets/2026-05-11-hello/deadbeef01.png',
      );
    });

    test('base without leading slash is concatenated as-is', () => {
      expect(
        buildAssetMarkdownUrl({
          linkBase: 'img/notion',
          assetsDir: path.join(cwd(), 'any'),
          markdownFilePath: path.join(cwd(), 'blog', 'x.md'),
          postBase: '2026-01-01-a',
          filename: 'f.webp',
          absoluteAssetFile: path.join(cwd(), 's', 'f.webp'),
        }),
      ).toBe('img/notion/2026-01-01-a/f.webp');
    });
  });

  describe('rewriteMarkdownImages with generated link strings', () => {
    test('default URL appears in markdown', () => {
      const root = cwd();
      const assetsDir = path.join(root, 'static');
      const mdPath = path.join(root, 'blog', 'p.md');
      const postBase = '2026-01-01-a';
      const fn = 'h.png';
      const link = buildAssetMarkdownUrl({
        linkBase: undefined,
        assetsDir,
        markdownFilePath: mdPath,
        postBase,
        filename: fn,
        absoluteAssetFile: path.join(assetsDir, postBase, fn),
      });
      const md = `![cap](https://notion.example/file.png)`;
      const map = new Map([['https://notion.example/file.png', link]]);
      expect(rewriteMarkdownImages(md, map)).toBe(`![cap](${link})`);
      expect(link).toBe('/2026-01-01-a/h.png');
    });
  });
});
