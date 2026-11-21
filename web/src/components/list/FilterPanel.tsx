import { useEffect, useState } from 'react';
import { Button, Col, Form, InputGroup, Offcanvas, Row as BsRow } from 'react-bootstrap';
import type { EntityDef, FieldDef } from '@frame/shared';
import type { Option } from '../FieldInput';
import { filterableFields, isRangeType, RESERVED } from '../../lib/listParams';

interface Props {
  show: boolean;
  onHide: () => void;
  ent: EntityDef;
  params: URLSearchParams;
  onApply: (next: URLSearchParams) => void;
  relOptions: Record<string, Option[]>;
}

type Draft = Record<string, string | string[]>;

const inputType = (f: FieldDef) => (f.type === 'date' ? 'date' : f.type === 'datetime' ? 'date' : 'number');

/** Painel lateral de filtros: monta os parâmetros da URL a partir dos campos da entidade */
export default function FilterPanel({ show, onHide, ent, params, onApply, relOptions }: Props) {
  const fields = filterableFields(ent).filter((f) => f.name !== ent.periodField);
  const [draft, setDraft] = useState<Draft>({});

  // ao abrir, parte dos filtros que já estão na URL
  useEffect(() => {
    if (!show) return;
    const d: Draft = {};
    for (const f of fields) {
      if (['select', 'multiselect', 'relation'].includes(f.type)) d[f.name] = params.getAll(f.name);
      else if (f.type === 'boolean') d[f.name] = params.get(f.name) ?? '';
      if (isRangeType(f)) {
        d[`${f.name}__de`] = params.get(`${f.name}__de`) ?? '';
        d[`${f.name}__ate`] = params.get(`${f.name}__ate`) ?? '';
      }
      if (['text', 'email', 'textarea', 'document', 'phone'].includes(f.type))
        d[`${f.name}__contem`] = params.get(`${f.name}__contem`) ?? '';
    }
    for (const x of ent.filtrosExtras ?? []) d[x.name] = params.get(x.name) ?? '';
    setDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const set = (k: string, v: string | string[]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggle = (k: string, v: string) => {
    const cur = (draft[k] as string[]) ?? [];
    set(k, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  const apply = (clear = false) => {
    const next = new URLSearchParams();
    // mantém o que não é filtro deste painel (busca, ordenação, período, lixeira...)
    const own = new Set(Object.keys(draft));
    for (const [k, v] of params)
      if (RESERVED.has(k) || (!own.has(k) && k.startsWith(`${ent.periodField}__`))) next.append(k, v);
    next.delete('page');
    if (!clear)
      for (const [k, v] of Object.entries(draft)) {
        if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
        else if (v !== '') next.set(k, v);
      }
    onApply(next);
    onHide();
  };

  const chips = (f: FieldDef, opts: { value: string; label: string; color?: string }[]) => (
    <div className="chip-select">
      {opts.map((o) => {
        const on = ((draft[f.name] as string[]) ?? []).includes(o.value);
        return (
          <button
            type="button"
            key={o.value}
            className={`chip-option${on ? ' on' : ''}`}
            style={on && o.color ? { background: o.color, borderColor: o.color } : undefined}
            onClick={() => toggle(f.name, o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <Offcanvas show={show} onHide={onHide} placement="end">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title className="fw-bold">
          <i className="bi bi-funnel me-2" />
          Filtros
        </Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body className="d-flex flex-column">
        <Form
          className="flex-grow-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          {fields.length === 0 && !ent.filtrosExtras?.length && (
            <p className="text-muted">Esta tela não tem filtros além da busca.</p>
          )}
          {fields.map((f) => (
            <Form.Group key={f.name} className="mb-3">
              <Form.Label className="fw-semibold small">{f.label}</Form.Label>
              {(f.type === 'select' || f.type === 'multiselect') &&
                chips(
                  f,
                  (f.options ?? []).map((o) => ({ value: o, label: o, color: f.colors?.[o] })),
                )}
              {f.type === 'relation' &&
                ((relOptions[f.name]?.length ?? 0) <= 12 ? (
                  chips(
                    f,
                    (relOptions[f.name] ?? []).map((o) => ({ value: String(o.value), label: o.label })),
                  )
                ) : (
                  <ListaComBusca
                    opcoes={relOptions[f.name]}
                    marcados={(draft[f.name] as string[]) ?? []}
                    onChange={(v) => set(f.name, v)}
                  />
                ))}
              {f.type === 'boolean' && (
                <Form.Select value={(draft[f.name] as string) ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                  <option value="">Todos</option>
                  <option value="1">Sim</option>
                  <option value="0">Não</option>
                </Form.Select>
              )}
              {isRangeType(f) && (
                <BsRow className="g-2">
                  {(['de', 'ate'] as const).map((k) => (
                    <Col key={k} xs={6}>
                      <InputGroup size="sm">
                        <InputGroup.Text>{k === 'de' ? 'De' : 'Até'}</InputGroup.Text>
                        <Form.Control
                          type={inputType(f)}
                          step="any"
                          value={(draft[`${f.name}__${k}`] as string) ?? ''}
                          onChange={(e) => set(`${f.name}__${k}`, e.target.value)}
                        />
                      </InputGroup>
                    </Col>
                  ))}
                </BsRow>
              )}
              {`${f.name}__contem` in draft && (
                <Form.Control
                  size="sm"
                  placeholder="Contém..."
                  value={(draft[`${f.name}__contem`] as string) ?? ''}
                  onChange={(e) => set(`${f.name}__contem`, e.target.value)}
                />
              )}
            </Form.Group>
          ))}
          {(ent.filtrosExtras ?? []).map((x) => (
            <Form.Group key={x.name} className="mb-3">
              <Form.Label className="fw-semibold small" htmlFor={`filtro-${x.name}`}>
                {x.label}
              </Form.Label>
              <Form.Select
                id={`filtro-${x.name}`}
                value={(draft[x.name] as string) ?? ''}
                onChange={(e) => set(x.name, e.target.value)}
              >
                <option value="">{x.padrao}</option>
                {x.opcoes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Form.Select>
              {x.help && <Form.Text className="text-muted">{x.help}</Form.Text>}
            </Form.Group>
          ))}
          <button type="submit" hidden />
        </Form>
        <div className="d-flex gap-2 pt-3 border-top">
          <Button variant="light" className="flex-grow-1" onClick={() => apply(true)}>
            Limpar
          </Button>
          <Button className="flex-grow-1" onClick={() => apply()}>
            Aplicar
          </Button>
        </div>
      </Offcanvas.Body>
    </Offcanvas>
  );
}

/**
 * Relação com muitas opções no filtro (0.31.0): busca + lista de marcação (antes, um select múltiplo sem busca que
 * pedia Ctrl/Cmd para marcar mais de um). Os marcados ficam no topo.
 */
function ListaComBusca({
  opcoes,
  marcados,
  onChange,
}: {
  opcoes: Option[];
  marcados: string[];
  onChange: (v: string[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const sem = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const t = sem(busca.trim());
  const visiveis = opcoes.filter((o) => !t || sem(o.label).includes(t));
  const ordenadas = [
    ...visiveis.filter((o) => marcados.includes(String(o.value))),
    ...visiveis.filter((o) => !marcados.includes(String(o.value))),
  ];
  const alternar = (v: string) => onChange(marcados.includes(v) ? marcados.filter((x) => x !== v) : [...marcados, v]);
  return (
    <div className="filtro-lista-busca">
      <Form.Control
        size="sm"
        type="search"
        placeholder="Buscar..."
        aria-label="Buscar nas opções"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-1"
      />
      <div className="filtro-lista-opcoes">
        {ordenadas.slice(0, 300).map((o) => (
          <Form.Check
            key={o.value}
            id={`filtro-${o.value}-${o.label}`}
            label={o.label}
            checked={marcados.includes(String(o.value))}
            onChange={() => alternar(String(o.value))}
          />
        ))}
        {!ordenadas.length && <div className="small text-muted">Nada encontrado.</div>}
      </div>
      {marcados.length > 0 && (
        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => onChange([])}>
          Limpar ({marcados.length})
        </button>
      )}
    </div>
  );
}
