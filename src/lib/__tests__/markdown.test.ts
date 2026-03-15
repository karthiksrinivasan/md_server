import { describe, it, expect } from 'vitest';
import { extractHeadings } from '../markdown';

describe('extractHeadings', () => {
  it('extracts headings with correct levels', () => {
    const md = `# Title\n## Section 1\n### Subsection 1.1\n## Section 2`;
    const headings = extractHeadings(md);
    expect(headings).toEqual([
      { id: 'title', text: 'Title', level: 1 },
      { id: 'section-1', text: 'Section 1', level: 2 },
      { id: 'subsection-11', text: 'Subsection 1.1', level: 3 },
      { id: 'section-2', text: 'Section 2', level: 2 },
    ]);
  });

  it('returns empty array for no headings', () => {
    expect(extractHeadings('Just a paragraph.\nAnother line.')).toEqual([]);
  });

  it('handles trailing hashes in ATX headings', () => {
    expect(extractHeadings('## Heading ##')).toEqual([{ id: 'heading', text: 'Heading', level: 2 }]);
  });

  it('generates unique slugs for duplicate headings', () => {
    const headings = extractHeadings('## FAQ\n## FAQ\n## FAQ');
    expect(headings[0].id).toBe('faq');
    expect(headings[1].id).toBe('faq-1');
    expect(headings[2].id).toBe('faq-2');
  });

  it('handles h1 through h6', () => {
    const md = '# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6';
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(6);
    expect(headings.map((h) => h.level)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
