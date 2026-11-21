// Campo de relação com busca (0.31.0): digitar filtra a lista (sem diferenciar acento e maiúsculas), setas e Enter
// escolhem, Esc fecha. A lista abre por cima de tudo (posição fixa), então funciona também dentro das sub-tabelas.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Dropdown, Form } from 'react-bootstrap';
import type { Option } from './FieldInput';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const LIMITE = 200; // itens desenhados de uma vez (a busca alcança todos)

interface Props {
  id: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  isInvalid?: boolean;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}

export default function RelationSelect({
  id,
  value,
  options,
  onChange,
  isInvalid,
  disabled,
  required,
  placeholder = 'Selecione ou digite para buscar...',
  'aria-label': ariaLabel,
}: Props) {
  const listaId = useId();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLDivElement>(null);
  const atual = options.find((o) => String(o.value) === value);

  const filtradas = useMemo(() => {
    const t = semAcento(busca.trim());
    const todas = [...(required ? [] : [{ value: '', label: '—' } as Option]), ...options];
    return t ? todas.filter((o) => o.value !== '' && semAcento(o.label).includes(t)) : todas;
  }, [busca, options, required]);

  useEffect(() => {
    if (!aberto) return;
    const i = filtradas.findIndex((o) => String(o.value) === value);
    setAtivo(busca ? 0 : Math.max(0, i));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, busca]);
  useEffect(() => {
    const item = listaRef.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`);
    if (item && typeof item.scrollIntoView === 'function') item.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto]);

  const escolher = (o: Option) => {
    onChange(String(o.value));
    setAberto(false);
    setBusca('');
  };
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) return setAberto(true);
      const n = Math.min(filtradas.length, LIMITE);
      setAtivo((a) => (n ? (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n : 0));
    } else if (e.key === 'Enter') {
      if (aberto && filtradas[ativo]) {
        e.preventDefault();
        escolher(filtradas[ativo]);
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.stopPropagation();
        setAberto(false);
        setBusca('');
      }
    } else if (e.key === 'Tab') {
      setAberto(false);
      setBusca('');
    }
  };

  return (
    <Dropdown
      show={aberto}
      onToggle={(abrir, meta) => {
        // o campo não é um Dropdown.Toggle: o clique nele chega como "clique fora" e fecharia a lista que o próprio
        // clique acabou de abrir
        const alvo = meta?.originalEvent?.target as Node | undefined;
        if (!abrir && alvo && campoRef.current?.contains(alvo)) return;
        setAberto(abrir);
        if (!abrir) setBusca('');
      }}
      className="relation-select"
    >
      <div className="relation-select-campo" ref={campoRef}>
        <Form.Control
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          isInvalid={isInvalid}
          disabled={disabled}
          placeholder={atual ? undefined : placeholder}
          value={aberto ? busca : (atual?.label ?? '')}
          onChange={(e) => {
            setBusca(e.target.value);
            setAberto(true);
          }}
          onFocus={() => !disabled && setAberto(true)}
          onClick={() => !disabled && setAberto(true)}
          onKeyDown={teclas}
        />
        {aberto && atual && !busca && <span className="relation-select-atual">{atual.label}</span>}
        <i className="bi bi-chevron-down relation-select-seta" aria-hidden />
      </div>
      <Dropdown.Menu
        id={listaId}
        role="listbox"
        ref={listaRef}
        className="relation-select-menu"
        popperConfig={{ strategy: 'fixed' }}
      >
        {filtradas.slice(0, LIMITE).map((o, i) => (
          <Dropdown.Item
            key={`${o.value}`}
            as="button"
            type="button"
            role="option"
            data-i={i}
            aria-selected={String(o.value) === value}
            active={i === ativo}
            className={String(o.value) === value ? 'fw-semibold' : undefined}
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setAtivo(i)}
            onClick={() => escolher(o)}
          >
            {o.label}
          </Dropdown.Item>
        ))}
        {!filtradas.length && <div className="px-3 py-2 small text-muted">Nada encontrado para “{busca}”.</div>}
        {filtradas.length > LIMITE && (
          <div className="px-3 py-2 small text-muted">
            Mostrando {LIMITE} de {filtradas.length}: digite para encontrar os outros.
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
