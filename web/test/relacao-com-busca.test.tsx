import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { FieldDef } from '@frame/shared';
import FieldInput from '../src/components/FieldInput';

// 0.31.0: campo de relação com busca (RelationSelect)
const campo: FieldDef = { name: 'empresa_id', label: 'Empresa', type: 'relation', entity: 'empresas' };
const opcoes = [
  { value: 1, label: 'Ágil Tech' },
  { value: 2, label: 'Cadmus' },
  { value: 3, label: 'e-Core' },
  { value: 4, label: 'Grupo Taking' },
];

describe('RelationSelect', () => {
  it('mostra o nome do valor atual e filtra ao digitar (sem acento e maiúsculas)', () => {
    const onChange = vi.fn();
    render(<FieldInput field={campo} value={2} onChange={onChange} options={opcoes} />);
    const input = screen.getByLabelText(/Empresa/);
    expect(input).toHaveValue('Cadmus');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'agil' } });
    const itens = screen.getAllByRole('option');
    expect(itens.map((i) => i.textContent)).toEqual(['Ágil Tech']);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('empresa_id', '1');
  });

  it('setas andam na lista; clique escolhe; "—" limpa quando não é obrigatório', () => {
    const onChange = vi.fn();
    render(<FieldInput field={campo} value="" onChange={onChange} options={opcoes} />);
    const input = screen.getByLabelText(/Empresa/);
    fireEvent.focus(input);
    expect(screen.getAllByRole('option').map((i) => i.textContent)).toEqual([
      '—',
      'Ágil Tech',
      'Cadmus',
      'e-Core',
      'Grupo Taking',
    ]);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('empresa_id', '2');
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole('option', { name: '—' }));
    expect(onChange).toHaveBeenLastCalledWith('empresa_id', '');
  });

  it('obrigatório: sem a opção vazia; nada encontrado avisa', () => {
    render(<FieldInput field={{ ...campo, required: true }} value="" onChange={() => {}} options={opcoes} />);
    const input = screen.getByLabelText(/Empresa/);
    fireEvent.focus(input);
    expect(screen.queryByRole('option', { name: '—' })).toBeNull();
    fireEvent.change(input, { target: { value: 'xyz' } });
    expect(screen.getByText(/Nada encontrado/)).toBeInTheDocument();
  });
});
