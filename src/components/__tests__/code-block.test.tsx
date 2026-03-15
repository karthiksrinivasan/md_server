// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CodeBlock } from '../code-block';

describe('CodeBlock', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders language label', () => {
    render(<CodeBlock language="typescript" rawCode="const x = 1;"><code>const x = 1;</code></CodeBlock>);
    expect(screen.getByText('typescript')).toBeDefined();
  });

  it('renders "text" when no language provided', () => {
    render(<CodeBlock rawCode="hello"><code>hello</code></CodeBlock>);
    expect(screen.getByText('text')).toBeDefined();
  });

  it('copies code to clipboard and shows "Copied!" text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<CodeBlock language="js" rawCode="console.log('hi')"><code>console.log('hi')</code></CodeBlock>);
    fireEvent.click(screen.getByTestId('copy-button'));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("console.log('hi')");
      expect(screen.getByText('Copied!')).toBeDefined();
    });
  });
});
