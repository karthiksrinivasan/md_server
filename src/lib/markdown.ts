import GithubSlugger from 'github-slugger';
import type { PluggableList } from 'unified';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function extractHeadings(markdown: string): HeadingItem[] {
  const slugger = new GithubSlugger();
  const headings: HeadingItem[] = [];

  // Match ATX-style headings: # Heading or ## Heading ## (trailing hashes)
  const headingRegex = /^(#{1,6})\s+(.+?)(?:\s+#+\s*)?$/gm;

  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    const id = slugger.slug(text);
    headings.push({ id, text, level });
  }

  return headings;
}

export const remarkPlugins: PluggableList = [remarkFrontmatter, remarkGfm, remarkMath];

export const rehypePlugins: PluggableList = [
  rehypeHighlight,
  rehypeKatex,
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: 'wrap',
      properties: {
        className: ['anchor-link'],
        ariaHidden: true,
        tabIndex: -1,
      },
    },
  ],
];
