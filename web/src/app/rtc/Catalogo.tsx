// Consulta ao catálogo oficial da Receita: item da LC 116 → NBS → cClassTrib (com redução)
import { useEffect, useState } from 'react';
import { Badge, Card, Form, InputGroup, Spinner, Table } from 'react-bootstrap';
import type { ServicoDoCatalogo } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';

export default function Catalogo() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [itens, setItens] = useState<ServicoDoCatalogo[] | null>(null);
  const [meta, setMeta] = useState<{ versaoBase?: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusca(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setItens(null);
    api
      .get<{ meta: { versaoBase?: string }; servicos: ServicoDoCatalogo[] }>(
        `/rtc/catalogo?q=${encodeURIComponent(busca)}`,
      )
      .then((r) => {
        setItens(r.servicos);
        setMeta(r.meta);
      })
      .catch((e) => toast.error(errorMessage(e)));
  }, [busca, toast]);

  return (
    <>
      <PageHeader
        title="Catálogo de serviços (Receita Federal)"
        icon="book"
        subtitle="Item da LC 116 → NBS → classificação tributária do IBS/CBS, da calculadora oficial"
      />
      <Card className="card-app">
        <Card.Header>
          <InputGroup style={{ maxWidth: '32rem' }}>
            <InputGroup.Text>
              <i className="bi bi-search" />
            </InputGroup.Text>
            <Form.Control
              placeholder="Item (1.01), NBS (1.1502) ou palavras (software, consulta médica...)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoFocus
            />
          </InputGroup>
        </Card.Header>
        <Card.Body className="p-0">
          {!itens ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="rtc-tabela">
                <thead>
                  <tr>
                    <th>Item LC 116</th>
                    <th>NBS</th>
                    <th>Serviço (NBS)</th>
                    <th>cClassTrib possíveis</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((s) => (
                    <tr key={`${s.item}-${s.nbs}`}>
                      <td title={s.descricaoItem}>
                        <strong>{s.item}</strong>
                        <div className="small text-muted text-wrap" style={{ maxWidth: '16rem' }}>
                          {s.descricaoItem.slice(0, 90)}
                          {s.descricaoItem.length > 90 ? '…' : ''}
                        </div>
                      </td>
                      <td>{s.nbs.replace(/^(\d)(\d{4})(\d{2})(\d{2})$/, '$1.$2.$3.$4')}</td>
                      <td className="text-wrap" style={{ maxWidth: '28rem' }}>
                        {s.descricao}
                      </td>
                      <td className="text-wrap">
                        {s.classificacoes.map((c) => (
                          <div key={c.codigo} className="small mb-1" title={c.descricao}>
                            <code>{c.codigo}</code>{' '}
                            {c.reducao > 0 ? (
                              <Badge bg="success">−{c.reducao}%</Badge>
                            ) : (
                              <Badge bg="secondary">integral</Badge>
                            )}{' '}
                            <span className="text-muted">{c.descricao.slice(0, 60)}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {itens.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        Nada encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
        {meta?.versaoBase && <Card.Footer className="small text-muted">Base oficial: {meta.versaoBase}</Card.Footer>}
      </Card>
    </>
  );
}
