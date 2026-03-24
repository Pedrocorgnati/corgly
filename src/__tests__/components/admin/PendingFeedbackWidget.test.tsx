import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PendingFeedbackWidget } from '@/components/admin/PendingFeedbackWidget';

// Mock next/link to render a plain anchor
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe('PendingFeedbackWidget', () => {
  it('renderiza estado vazio quando count e 0', () => {
    render(<PendingFeedbackWidget pendingFeedbacks={{ count: 0, items: [] }} />);
    expect(screen.getByText('Nenhum feedback pendente')).toBeInTheDocument();
  });

  it('renderiza itens com nomes dos alunos', () => {
    const items = [
      {
        sessionId: 'sess-1',
        completedAt: new Date().toISOString(),
        sessionDate: new Date().toISOString(),
        student: { id: 'u1', name: 'Maria Silva', email: 'maria@test.com' },
      },
      {
        sessionId: 'sess-2',
        completedAt: new Date().toISOString(),
        sessionDate: new Date().toISOString(),
        student: { id: 'u2', name: 'Joao Santos', email: 'joao@test.com' },
      },
    ];
    render(<PendingFeedbackWidget pendingFeedbacks={{ count: 2, items }} />);

    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
    expect(screen.getByText('Joao Santos')).toBeInTheDocument();
  });

  it('links apontam para as rotas corretas de feedback', () => {
    const items = [
      {
        sessionId: 'sess-abc',
        completedAt: new Date().toISOString(),
        sessionDate: new Date().toISOString(),
        student: { id: 'u1', name: 'Ana Costa', email: 'ana@test.com' },
      },
    ];
    render(<PendingFeedbackWidget pendingFeedbacks={{ count: 1, items }} />);

    const links = screen.getAllByRole('link');
    const feedbackLink = links.find((l) => l.getAttribute('href')?.includes('sess-abc'));
    expect(feedbackLink).toHaveAttribute('href', '/admin/feedback/sess-abc');
  });

  it('exibe badge com contagem quando ha itens', () => {
    const items = [
      {
        sessionId: 'sess-1',
        completedAt: new Date().toISOString(),
        sessionDate: new Date().toISOString(),
        student: { id: 'u1', name: 'Test', email: 't@t.com' },
      },
    ];
    render(<PendingFeedbackWidget pendingFeedbacks={{ count: 3, items }} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
