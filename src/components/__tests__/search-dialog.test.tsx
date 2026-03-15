// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchDialog } from '../search-dialog';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => '/',
}));

const mockResults = [
  { path: 'docs/intro.md', title: 'Introduction', snippets: ['Hello world'] },
  { path: 'docs/guide.md', title: 'Guide', snippets: ['Step by step'] },
  { path: 'api/reference.md', title: 'API Reference', snippets: ['Functions'] },
];

function makeFetchMock(data: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  });
}

describe('SearchDialog', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when closed', () => {
    const onClose = vi.fn();
    render(<SearchDialog open={false} onClose={onClose} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders dialog with input when open', () => {
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('textbox', { name: /search query/i })).toBeDefined();
  });

  it('shows empty state when no results', async () => {
    global.fetch = makeFetchMock([]);
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: /search query/i });
    fireEvent.change(input, { target: { value: 'noresults' } });

    await waitFor(
      () => {
        expect(screen.getByText(/No results for/i)).toBeDefined();
      },
      { timeout: 2000 }
    );
  });

  it('Escape key closes the dialog', () => {
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: /search query/i });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('displays results and allows arrow key navigation', async () => {
    global.fetch = makeFetchMock(mockResults);
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: /search query/i });
    fireEvent.change(input, { target: { value: 'intro' } });

    await waitFor(
      () => {
        expect(screen.getByText('Introduction')).toBeDefined();
      },
      { timeout: 2000 }
    );

    // Initial selection is index 0
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');
    expect(options[1].getAttribute('aria-selected')).toBe('false');

    // Arrow down moves selection
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');
    expect(options[0].getAttribute('aria-selected')).toBe('false');

    // Arrow up moves selection back
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('Enter key navigates to selected result', async () => {
    global.fetch = makeFetchMock(mockResults);
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: /search query/i });
    fireEvent.change(input, { target: { value: 'intro' } });

    await waitFor(
      () => {
        expect(screen.getByText('Introduction')).toBeDefined();
      },
      { timeout: 2000 }
    );

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockPush).toHaveBeenCalledWith('/docs/intro');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking a result navigates and closes', async () => {
    global.fetch = makeFetchMock(mockResults);
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    const input = screen.getByRole('textbox', { name: /search query/i });
    fireEvent.change(input, { target: { value: 'guide' } });

    await waitFor(
      () => {
        expect(screen.getByText('Guide')).toBeDefined();
      },
      { timeout: 2000 }
    );

    // Click the guide result
    fireEvent.click(screen.getByText('Guide'));

    expect(mockPush).toHaveBeenCalledWith('/docs/guide');
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking backdrop closes dialog', () => {
    const onClose = vi.fn();
    render(<SearchDialog open={true} onClose={onClose} />);

    // The backdrop div is the one with aria-hidden
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(backdrop).toBeDefined();
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });
});
