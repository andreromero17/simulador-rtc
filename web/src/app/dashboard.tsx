// =============================================================================
// Dashboard do simulador: uma linha por empresa com a carga sobre o consumo hoje, em 2027 e em 2033.
// =============================================================================
import { useEffect, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Card, Col, Row as BsRow, Spinner, Table } from 'react-bootstrap';
import type { RespostaSimulacao } from '@frame/shared';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader';
import { Delta } from './rtc/comum';
import { brl, pct, useEmpresas, variacao } from './rtc/util';
import './rtc/rtc.css';

function Painel() {
  const empresas = useEmpresas();
  const [sims, setSims] = useState<Record<number, RespostaSimulacao | 'erro'>>({});

  useEffect(() => {
    if (!empresas) return;
    for (const e of empresas.slice(0, 30))
      api
        .get<RespostaSimulacao>(`/rtc/simulacao?empresa_id=${e.id}`)
        .then((r) => setSims((s) => ({ ...s, [e.id]: r })))
        .catch(() => setSims((s) => ({ ...s, [e.id]: 'erro' })));
  }, [empresas]);

  return (
    <>
      <PageHeader
        title="Reforma tributária do consumo"
        icon="calculator"
        subtitle="Carga de PIS/Cofins/ISS hoje × CBS/IBS na transição (2027–2033), sobre o faturamento e os custos de 2026"
      >
        <Link to="/importar" className="btn btn-light">
          <i className="bi bi-file-earmark-spreadsheet me-1" /> Importar planilhas
        </Link>
        <Link to="/empresas/novo" className="btn btn-primary">
          <i className="bi bi-plus-lg me-1" /> Nova empresa
        </Link>
      </PageHeader>

      <BsRow className="g-3 mb-3">
        {[
          ['1', 'Cadastre a empresa', 'regime, ISS do município e, no Simples, o anexo', '/empresas'],
          [
            '2',
            'Importe as planilhas de 2026',
            'faturamento por cliente e custos por fornecedor, com CNPJ',
            '/importar',
          ],
          ['3', 'Compare os cenários', 'ano a ano, por cliente, puro × híbrido no Simples', '/simulacao'],
        ].map(([n, t, d, to]) => (
          <Col md={4} key={n}>
            <Link to={to!} className="rtc-empresa-card">
              <Card className="card-app h-100">
                <Card.Body>
                  <div className="d-flex gap-3 align-items-start">
                    <span className="badge rounded-pill bg-primary fs-6">{n}</span>
                    <div>
                      <div className="fw-bold">{t}</div>
                      <div className="small text-muted">{d}</div>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </Link>
          </Col>
        ))}
      </BsRow>

      <Card className="card-app">
        <Card.Header>
          <i className="bi bi-buildings" /> Empresas simuladas
          <span className="ms-auto small text-muted fw-normal">cenário padrão · cliente paga o mesmo preço</span>
        </Card.Header>
        <Card.Body className="p-0">
          {!empresas ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : empresas.length === 0 ? (
            <p className="text-center text-muted py-5 mb-0">Nenhuma empresa cadastrada ainda.</p>
          ) : (
            <div className="table-responsive">
              <Table hover className="rtc-tabela">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Regime</th>
                    <th className="num">Faturamento</th>
                    <th className="num">Carga hoje</th>
                    <th className="num">2027</th>
                    <th className="num">2033</th>
                    <th className="num">Resultado 2033 × hoje</th>
                    <th className="num">Custo dos clientes 2033</th>
                  </tr>
                </thead>
                <tbody>
                  {empresas.map((e) => {
                    const s = sims[e.id];
                    const anos = s && s !== 'erro' ? s.resultado.anos : null;
                    const hoje = anos?.[0];
                    const a27 = anos?.find((a) => a.ano === 2027);
                    const a33 = anos?.find((a) => a.ano === 2033);
                    return (
                      <tr key={e.id}>
                        <td>
                          <Link to={`/simulacao?empresa=${e.id}`} className="fw-semibold">
                            {String(e.nome)}
                          </Link>
                          {e.segmento ? <div className="small text-muted">{String(e.segmento)}</div> : null}
                        </td>
                        <td className="text-muted">{String(e.regime)}</td>
                        {!s ? (
                          <td colSpan={6} className="text-muted">
                            <Spinner size="sm" />
                          </td>
                        ) : s === 'erro' || !hoje || !a27 || !a33 ? (
                          <td colSpan={6} className="text-muted">
                            sem dados para simular
                          </td>
                        ) : (
                          <>
                            <td className="num">{brl(hoje.receitaBase)}</td>
                            <td className="num">{pct(hoje.cargaConsumo)}</td>
                            <td className="num">{pct(a27.cargaConsumo)}</td>
                            <td className="num fw-semibold">{pct(a33.cargaConsumo)}</td>
                            <td className="num">
                              <Delta valor={variacao(a33.resultado, hoje.resultado)} bomSe="maior" />
                            </td>
                            <td className="num">
                              <Delta valor={variacao(a33.custoClientes, hoje.custoClientes)} bomSe="menor" />
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </>
  );
}

export const AppDashboard: ComponentType | null = Painel;
