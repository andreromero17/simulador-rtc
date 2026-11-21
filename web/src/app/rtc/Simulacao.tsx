// =============================================================================
// Simulação: tributos sobre o consumo hoje (2026) × cada ano da transição (2027–2033) para uma empresa.
// =============================================================================
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, ButtonGroup, Card, Col, Form, Row as BsRow, Spinner, Table } from 'react-bootstrap';
import type { ListResponse, RespostaSimulacao, ResultadoAno, Row } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import { Delta, SeletorEmpresa } from './comum';
import { brl, pct, useEmpresaEscolhida, useEmpresas, variacao } from './util';
import { GraficoComposicao, GraficoResultado } from './Graficos';

type Estrategia = 'preco' | 'liquido';

function Kpi({
  rotulo,
  valor,
  det,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  det?: ReactNode;
  destaque?: boolean;
}) {
  return (
    <div className={`rtc-kpi${destaque ? ' rtc-destaque' : ''}`}>
      <div className="rtc-kpi-rotulo">{rotulo}</div>
      <div className="rtc-kpi-valor">{valor}</div>
      {det && <div className="rtc-kpi-det">{det}</div>}
    </div>
  );
}

/** Linha da tabela ano a ano */
interface LinhaTab {
  rotulo: string;
  valor?: (a: ResultadoAno) => number;
  fmt?: (v: number) => string;
  tipo?: 'grupo' | 'total' | 'sub';
  ind?: boolean;
  ocultarSeZero?: boolean;
  delta?: 'maior' | 'menor';
  ajuda?: string;
}

const LINHAS: LinhaTab[] = [
  { rotulo: 'Vendas', tipo: 'grupo' },
  { rotulo: 'Faturamento de 2026 (volume base)', valor: (a) => a.receitaBase, tipo: 'sub' },
  {
    rotulo: 'Total pago pelos clientes',
    valor: (a) => a.receitaClientes,
    ajuda: 'Serviço + IBS/CBS destacados por fora',
  },
  { rotulo: 'Tributos sobre o consumo', tipo: 'grupo' },
  { rotulo: 'PIS', valor: (a) => a.debitos.pis, ind: true, ocultarSeZero: true },
  { rotulo: 'Cofins', valor: (a) => a.debitos.cofins, ind: true, ocultarSeZero: true },
  { rotulo: 'ISS', valor: (a) => a.debitos.iss, ind: true, ocultarSeZero: true },
  {
    rotulo: 'DAS — parte consumo (PIS/Cofins/ISS/CBS/IBS)',
    valor: (a) => a.debitos.dasConsumo,
    ind: true,
    ocultarSeZero: true,
  },
  { rotulo: 'CBS (débito)', valor: (a) => a.debitos.cbs, ind: true, ocultarSeZero: true },
  { rotulo: 'IBS (débito)', valor: (a) => a.debitos.ibs, ind: true, ocultarSeZero: true },
  { rotulo: '(−) Créditos de PIS/Cofins', valor: (a) => -a.creditos.pisCofins, ind: true, ocultarSeZero: true },
  { rotulo: '(−) Créditos de CBS', valor: (a) => -a.creditos.cbs, ind: true, ocultarSeZero: true },
  { rotulo: '(−) Créditos de IBS', valor: (a) => -a.creditos.ibs, ind: true, ocultarSeZero: true },
  { rotulo: '= Tributos sobre o consumo a pagar', valor: (a) => a.tributosConsumo, tipo: 'total', delta: 'menor' },
  { rotulo: 'Carga efetiva sobre o total pago', valor: (a) => a.cargaConsumo, fmt: (v) => pct(v), tipo: 'sub' },
  { rotulo: 'Resultado', tipo: 'grupo' },
  { rotulo: 'IRPJ/CSLL/CPP dentro do DAS', valor: (a) => a.outrosNoDas, ocultarSeZero: true },
  { rotulo: 'Receita líquida de tributos sobre consumo', valor: (a) => a.receitaLiquida },
  { rotulo: '(−) Custos e despesas', valor: (a) => -a.custos },
  { rotulo: '= Resultado antes do IRPJ/CSLL', valor: (a) => a.resultado, tipo: 'total', delta: 'maior' },
  { rotulo: 'Clientes', tipo: 'grupo' },
  { rotulo: 'Créditos que os clientes tomam', valor: (a) => a.creditoClientes },
  {
    rotulo: 'Custo líquido para os clientes',
    valor: (a) => a.custoClientes,
    tipo: 'total',
    delta: 'menor',
    ajuda: 'Total pago menos os créditos que os clientes aproveitam',
  },
];

function TabelaAnos({ anos }: { anos: ResultadoAno[] }) {
  const base = anos[0]!;
  const visiveis = LINHAS.filter((l) => !l.ocultarSeZero || anos.some((a) => Math.abs(l.valor!(a)) >= 0.5));
  return (
    <div className="table-responsive">
      <Table hover className="rtc-tabela">
        <thead>
          <tr>
            <th className="rtc-rotulo">R$</th>
            {anos.map((a) => (
              <th key={a.ano} className={`num${a.atual ? ' rtc-atual' : ''}`}>
                {a.atual ? `${a.ano} (hoje)` : a.ano}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((l) =>
            l.tipo === 'grupo' ? (
              <tr key={l.rotulo} className="rtc-grupo">
                <td className="rtc-rotulo" colSpan={anos.length + 1}>
                  {l.rotulo}
                </td>
              </tr>
            ) : (
              <tr key={l.rotulo} className={l.tipo === 'total' ? 'rtc-total' : l.tipo === 'sub' ? 'rtc-sub' : ''}>
                <td className={`rtc-rotulo${l.ind ? ' rtc-ind' : ''}`} title={l.ajuda}>
                  {l.rotulo}
                  {l.ajuda && <i className="bi bi-info-circle ms-1 text-muted" />}
                </td>
                {anos.map((a) => {
                  const v = l.valor!(a);
                  return (
                    <td key={a.ano} className={`num${a.atual ? ' rtc-atual' : ''}`}>
                      {(l.fmt ?? ((x: number) => brl(x)))(v)}
                      {l.delta && !a.atual && (
                        <div className="small">
                          <Delta valor={variacao(v, l.valor!(base))} bomSe={l.delta} />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </Table>
    </div>
  );
}

function PorCliente({ ano }: { ano: ResultadoAno }) {
  const linhas = ano.porCliente.slice(0, 50);
  return (
    <div className="table-responsive" style={{ maxHeight: '28rem' }}>
      <Table hover size="sm" className="rtc-tabela">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Regime</th>
            <th className="num">Faturado em 2026</th>
            <th className="num">Paga em {ano.ano}</th>
            <th className="num">Crédito do cliente</th>
            <th className="num">Custo líquido hoje</th>
            <th className="num">Custo líquido {ano.ano}</th>
            <th className="num">Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((c) => (
            <tr key={c.chave}>
              <td>{c.nome}</td>
              <td className="text-muted">{c.regime}</td>
              <td className="num">{brl(c.receitaHoje)}</td>
              <td className="num">{brl(c.totalCliente)}</td>
              <td className="num">{brl(c.creditoCliente)}</td>
              <td className="num">{brl(c.custoLiquidoHoje)}</td>
              <td className="num">{brl(c.custoLiquidoCliente)}</td>
              <td className="num">
                <Delta valor={variacao(c.custoLiquidoCliente, c.custoLiquidoHoje)} bomSe="menor" />
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {ano.porCliente.length > 50 && (
        <p className="small text-muted px-2">Mostrando os 50 maiores de {ano.porCliente.length} clientes.</p>
      )}
    </div>
  );
}

function PorCategoria({ ano, hoje }: { ano: ResultadoAno; hoje: ResultadoAno }) {
  const total = ano.porCategoria.reduce((s, c) => s + c.valor, 0) || 1;
  return (
    <div className="table-responsive">
      <Table hover size="sm" className="rtc-tabela">
        <thead>
          <tr>
            <th>Categoria</th>
            <th className="num">Valor</th>
            <th className="num">% dos custos</th>
            <th className="num">Crédito PIS/Cofins hoje</th>
            <th className="num">Crédito IBS/CBS {ano.ano}</th>
          </tr>
        </thead>
        <tbody>
          {ano.porCategoria.map((c) => (
            <tr key={c.categoria}>
              <td>{c.categoria}</td>
              <td className="num">{brl(c.valor)}</td>
              <td className="num">
                <div className="d-flex align-items-center gap-2 justify-content-end">
                  {pct((c.valor / total) * 100, 1)}
                  <div className="rtc-barra" style={{ width: '4rem' }}>
                    <span style={{ width: `${(c.valor / total) * 100}%` }} />
                  </div>
                </div>
              </td>
              <td className="num">
                {brl(hoje.porCategoria.find((h) => h.categoria === c.categoria)?.creditoPisCofins ?? 0)}
              </td>
              <td className="num">{brl(c.creditoIbsCbs)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function ComparativoSimples({
  atual,
  alt,
  opcaoAtual,
  opcaoAlt,
}: {
  atual: ResultadoAno[];
  alt: ResultadoAno[];
  opcaoAtual: string;
  opcaoAlt: string;
}) {
  const anos = [2027, 2029, 2033];
  const linha = (rotulo: string, f: (a: ResultadoAno) => number, bom: 'maior' | 'menor') => (
    <tr>
      <td>{rotulo}</td>
      {anos.map((ano) => {
        const a = atual.find((x) => x.ano === ano)!;
        const b = alt.find((x) => x.ano === ano)!;
        return [
          <td key={`${ano}a`} className="num">
            {brl(f(a))}
          </td>,
          <td key={`${ano}b`} className="num">
            {brl(f(b))}{' '}
            <div className="small">
              <Delta valor={variacao(f(b), f(a))} bomSe={bom} />
            </div>
          </td>,
        ];
      })}
    </tr>
  );
  return (
    <div className="table-responsive">
      <Table size="sm" className="rtc-tabela">
        <thead>
          <tr>
            <th />
            {anos.map((ano) => [
              <th key={`${ano}a`} className="num">
                {ano} · {opcaoAtual.split(' ')[0]}
              </th>,
              <th key={`${ano}b`} className="num">
                {ano} · {opcaoAlt.split(' ')[0]}
              </th>,
            ])}
          </tr>
        </thead>
        <tbody>
          {linha('Tributos sobre consumo a pagar', (a) => a.tributosConsumo, 'menor')}
          {linha('Resultado antes do IR', (a) => a.resultado, 'maior')}
          {linha('Créditos que os clientes tomam', (a) => a.creditoClientes, 'maior')}
          {linha('Custo líquido para os clientes', (a) => a.custoClientes, 'menor')}
        </tbody>
      </Table>
    </div>
  );
}

export default function Simulacao() {
  const toast = useToast();
  const empresas = useEmpresas();
  const { id: empresaId, escolher } = useEmpresaEscolhida(empresas);
  const [cenarios, setCenarios] = useState<Row[]>([]);
  const [cenarioId, setCenarioId] = useState<number | null>(null);
  const [estrategia, setEstrategia] = useState<Estrategia>('preco');
  const [clienteRealCredita, setClienteRealCredita] = useState(true);
  const [opcaoSimples, setOpcaoSimples] = useState<string | null>(null);
  const [dados, setDados] = useState<RespostaSimulacao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [anoDetalhe, setAnoDetalhe] = useState(2033);

  useEffect(() => {
    api
      .get<ListResponse>('/cenarios?pageSize=100&sort=nome&dir=asc')
      .then((r) => setCenarios(r.rows))
      .catch((e) => toast.error(errorMessage(e)));
  }, [toast]);

  useEffect(() => {
    setOpcaoSimples(null);
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    const qs = new URLSearchParams({
      empresa_id: String(empresaId),
      estrategia,
      cliente_real_credita: clienteRealCredita ? '1' : '0',
    });
    if (cenarioId) qs.set('cenario_id', String(cenarioId));
    if (opcaoSimples) qs.set('opcao_simples', opcaoSimples);
    setCarregando(true);
    setErro(null);
    api
      .get<RespostaSimulacao>(`/rtc/simulacao?${qs}`)
      .then(setDados)
      .catch((e) => {
        setDados(null);
        setErro(errorMessage(e));
      })
      .finally(() => setCarregando(false));
  }, [empresaId, cenarioId, estrategia, clienteRealCredita, opcaoSimples]);

  const r = dados?.resultado;
  const anos = r?.anos ?? [];
  const hoje = anos[0];
  const a27 = anos.find((a) => a.ano === 2027);
  const a33 = anos.find((a) => a.ano === 2033);
  const detalhe = anos.find((a) => a.ano === anoDetalhe) ?? a33;
  const simples = dados?.empresa.regime === 'Simples Nacional';
  const opcaoAtual = (opcaoSimples ?? (dados?.empresa.opcao_simples as string)) || 'Puro (IBS/CBS no DAS)';
  const cenarioAtual = useMemo(() => dados?.cenario, [dados]);

  if (empresas && !empresas.length)
    return (
      <>
        <PageHeader title="Simulação da reforma tributária" icon="calculator" />
        <Card className="card-app">
          <Card.Body className="text-center py-5">
            <p className="mb-3">Cadastre a empresa e importe as planilhas de 2026 para simular.</p>
            <Link to="/empresas/novo" className="btn btn-primary me-2">
              <i className="bi bi-buildings me-1" /> Cadastrar empresa
            </Link>
            <Link to="/importar" className="btn btn-light">
              <i className="bi bi-file-earmark-spreadsheet me-1" /> Importar planilhas
            </Link>
          </Card.Body>
        </Card>
      </>
    );

  return (
    <>
      <PageHeader
        title="Simulação da reforma tributária"
        icon="calculator"
        subtitle={
          dados
            ? `${String(dados.empresa.nome)} · ${String(dados.empresa.regime)} · cenário ${dados.cenario.nome}`
            : undefined
        }
      >
        <Button variant="light" className="rtc-nao-imprimir" onClick={() => window.print()}>
          <i className="bi bi-printer me-1" /> Imprimir
        </Button>
      </PageHeader>

      <Card className="card-app mb-3 rtc-nao-imprimir">
        <Card.Body className="rtc-filtros">
          <Form.Group>
            <Form.Label>Empresa</Form.Label>
            {empresas ? (
              <SeletorEmpresa empresas={empresas} valor={empresaId} onChange={escolher} />
            ) : (
              <Spinner size="sm" />
            )}
          </Form.Group>
          <Form.Group>
            <Form.Label>Cenário de alíquotas</Form.Label>
            <Form.Select
              value={cenarioId ?? dados?.cenario.id ?? ''}
              onChange={(e) => setCenarioId(Number(e.target.value))}
            >
              {cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {String(c.nome)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
          <Form.Group>
            <Form.Label>Preço a partir de 2027</Form.Label>
            <div>
              <ButtonGroup>
                <Button variant={estrategia === 'preco' ? 'primary' : 'light'} onClick={() => setEstrategia('preco')}>
                  Cliente paga o mesmo
                </Button>
                <Button
                  variant={estrategia === 'liquido' ? 'primary' : 'light'}
                  onClick={() => setEstrategia('liquido')}
                >
                  Empresa mantém a receita líquida
                </Button>
              </ButtonGroup>
            </div>
          </Form.Group>
          {simples && (
            <Form.Group>
              <Form.Label>IBS/CBS no Simples</Form.Label>
              <div>
                <ButtonGroup>
                  {['Puro (IBS/CBS no DAS)', 'Híbrido (IBS/CBS por fora)'].map((o) => (
                    <Button key={o} variant={opcaoAtual === o ? 'primary' : 'light'} onClick={() => setOpcaoSimples(o)}>
                      {o.split(' (')[0]}
                    </Button>
                  ))}
                </ButtonGroup>
              </div>
            </Form.Group>
          )}
          <Form.Check
            type="switch"
            id="cliente-real"
            className="mb-2"
            label="Cliente do Lucro Real credita PIS/Cofins hoje"
            checked={clienteRealCredita}
            onChange={(e) => setClienteRealCredita(e.target.checked)}
          />
          {carregando && <Spinner size="sm" className="mb-2" />}
        </Card.Body>
      </Card>

      {erro && <Alert variant="warning">{erro}</Alert>}
      {!r && !erro && (
        <div className="text-center py-5">
          <Spinner />
        </div>
      )}

      {r && hoje && a27 && a33 && (
        <>
          {dados.contagem.receitas === 0 ? (
            <Alert variant="info">
              Esta empresa ainda não tem receitas de 2026.{' '}
              <Link to={`/importar?empresa=${empresaId}`}>Importe as planilhas</Link> ou cadastre em{' '}
              <Link to="/receitas">Receitas</Link>.
            </Alert>
          ) : null}

          <BsRow className="g-3 mb-3">
            <Col sm={6} xl={3}>
              <Kpi
                rotulo="Carga sobre consumo hoje"
                valor={pct(hoje.cargaConsumo)}
                det={`${brl(hoje.tributosConsumo)} em ${r.base.meses} ${r.base.meses === 1 ? 'mês' : 'meses'}`}
              />
            </Col>
            <Col sm={6} xl={3}>
              <Kpi
                rotulo="Carga em 2027 (CBS cheia)"
                valor={pct(a27.cargaConsumo)}
                det={
                  <>
                    {brl(a27.tributosConsumo)} · <Delta valor={variacao(a27.tributosConsumo, hoje.tributosConsumo)} />
                  </>
                }
              />
            </Col>
            <Col sm={6} xl={3}>
              <Kpi
                rotulo="Carga em 2033 (modelo final)"
                valor={pct(a33.cargaConsumo)}
                det={
                  <>
                    {brl(a33.tributosConsumo)} · <Delta valor={variacao(a33.tributosConsumo, hoje.tributosConsumo)} />
                  </>
                }
                destaque
              />
            </Col>
            <Col sm={6} xl={3}>
              <Kpi
                rotulo={estrategia === 'preco' ? 'Resultado em 2033 × hoje' : 'Preço ao cliente em 2033 × hoje'}
                valor={
                  estrategia === 'preco' ? (
                    <Delta valor={variacao(a33.resultado, hoje.resultado)} bomSe="maior" />
                  ) : (
                    <Delta valor={variacao(a33.receitaClientes, hoje.receitaClientes)} bomSe="menor" />
                  )
                }
                det={
                  estrategia === 'preco'
                    ? `${brl(a33.resultado - hoje.resultado)} no resultado antes do IR`
                    : `custo líquido dos clientes ${variacao(a33.custoClientes, hoje.custoClientes)! > 0 ? 'sobe' : 'cai'} ${pct(Math.abs(variacao(a33.custoClientes, hoje.custoClientes) ?? 0), 1)}`
                }
              />
            </Col>
          </BsRow>

          {r.alertas.length > 0 && (
            <Alert variant="light" className="rtc-alerta border">
              {r.alertas.map((a) => (
                <div key={a}>
                  <i className="bi bi-exclamation-circle me-1 text-warning" /> {a}
                </div>
              ))}
            </Alert>
          )}

          <BsRow className="g-3 mb-3">
            <Col xl={7}>
              <Card className="card-app h-100">
                <Card.Header>
                  <i className="bi bi-bar-chart" /> Tributos sobre o consumo por ano
                </Card.Header>
                <Card.Body>
                  <GraficoComposicao anos={anos} />
                </Card.Body>
              </Card>
            </Col>
            <Col xl={5}>
              <Card className="card-app h-100">
                <Card.Header>
                  <i className="bi bi-graph-up" /> Resultado antes do IRPJ/CSLL
                </Card.Header>
                <Card.Body>
                  <GraficoResultado
                    anos={anos}
                    alternativa={
                      dados.alternativa
                        ? { nome: dados.alternativa.opcao.split(' (')[0]!, anos: dados.alternativa.resultado.anos }
                        : undefined
                    }
                  />
                  <p className="small text-muted mb-0 mt-2">
                    {estrategia === 'preco'
                      ? 'Preço total ao cliente mantido: a diferença de tributos e créditos cai na margem.'
                      : 'Receita líquida das vendas mantida: a diferença vai para o preço; o ganho de margem vem dos créditos das compras.'}
                  </p>
                </Card.Body>
              </Card>
            </Col>
          </BsRow>

          <Card className="card-app mb-3">
            <Card.Header>
              <i className="bi bi-table" /> Ano a ano
              <span className="ms-auto small text-muted fw-normal">{r.anos[1]?.modo}</span>
            </Card.Header>
            <Card.Body className="p-0">
              <TabelaAnos anos={anos} />
            </Card.Body>
          </Card>

          {simples && dados.alternativa && (
            <Card className="card-app mb-3">
              <Card.Header>
                <i className="bi bi-signpost-split" /> Simples puro × híbrido
              </Card.Header>
              <Card.Body className="p-0">
                <ComparativoSimples
                  atual={anos}
                  alt={dados.alternativa.resultado.anos}
                  opcaoAtual={opcaoAtual}
                  opcaoAlt={dados.alternativa.opcao}
                />
                <p className="small text-muted px-3 pb-3 mb-0">
                  No híbrido a empresa recolhe IBS/CBS por fora do DAS, com alíquota cheia, mas toma crédito das compras
                  e o cliente do regime regular credita o valor destacado. A opção é semestral (setembro e março).
                </p>
              </Card.Body>
            </Card>
          )}

          <Card className="card-app mb-3">
            <Card.Header className="flex-wrap">
              <i className="bi bi-zoom-in" /> Detalhe do ano
              <ButtonGroup size="sm" className="ms-auto rtc-nao-imprimir">
                {anos
                  .filter((a) => !a.atual)
                  .map((a) => (
                    <Button
                      key={a.ano}
                      className="rtc-ano-btn"
                      variant={detalhe?.ano === a.ano ? 'primary' : 'light'}
                      onClick={() => setAnoDetalhe(a.ano)}
                    >
                      {a.ano}
                    </Button>
                  ))}
              </ButtonGroup>
            </Card.Header>
            {detalhe && (
              <Card.Body>
                <BsRow className="g-3 mb-3">
                  <Col md={3}>
                    <Kpi rotulo="CBS cobrada" valor={pct(detalhe.regras.cbs)} det="alíquota cheia, antes de reduções" />
                  </Col>
                  <Col md={3}>
                    <Kpi rotulo="IBS cobrado" valor={pct(detalhe.regras.ibs)} det="estadual + municipal" />
                  </Col>
                  <Col md={3}>
                    <Kpi
                      rotulo="ISS que ainda vale"
                      valor={pct(detalhe.regras.fatorIss * 100, 0)}
                      det="da alíquota do município"
                    />
                  </Col>
                  <Col md={3}>
                    <Kpi
                      rotulo={detalhe.das ? `DAS — ${detalhe.das.faixa}ª faixa` : 'Créditos sobre compras'}
                      valor={
                        detalhe.das
                          ? pct(detalhe.das.aliquotaEfetiva)
                          : brl(detalhe.creditos.cbs + detalhe.creditos.ibs)
                      }
                      det={detalhe.das ? `alíquota efetiva · Anexo ${detalhe.das.anexo}` : 'CBS + IBS das aquisições'}
                    />
                  </Col>
                </BsRow>
                <h6 className="fw-bold mt-2">Impacto por cliente</h6>
                <PorCliente ano={detalhe} />
                {detalhe.porCategoria.length > 0 && (
                  <>
                    <h6 className="fw-bold mt-4">Custos e créditos por categoria</h6>
                    <PorCategoria ano={detalhe} hoje={hoje} />
                  </>
                )}
              </Card.Body>
            )}
          </Card>

          <Card className="card-app mb-3">
            <Card.Header>
              <i className="bi bi-journal-text" /> Premissas desta simulação
            </Card.Header>
            <Card.Body className="small">
              <ul className="rtc-premissas mb-3">
                <li>
                  Volume de 2026 repetido em todos os anos ({r.base.meses} {r.base.meses === 1 ? 'mês' : 'meses'} de
                  dados; receita {brl(r.base.receitaPeriodo)}, custos {brl(r.base.custosPeriodo)}). Só tributos sobre o
                  consumo mudam; IRPJ/CSLL fora do Simples não estão no resultado.
                </li>
                <li>
                  Base do IBS/CBS = valor do serviço − ISS (até 2032), como na calculadora oficial da NFS-e. IBS/CBS são
                  destacados por fora; reduções pelo cClassTrib de cada receita.
                </li>
                <li>
                  Transição: 2027–2028 CBS = referência − 0,1 p.p. e IBS 0,1%; 2029–2032 ISS a 90/80/70/60% e IBS a
                  10/20/30/40%; 2033 só IBS e CBS. 2026 em teste (CBS 0,9% e IBS 0,1% compensáveis) é tratado como hoje.
                </li>
                <li>
                  Créditos: regime regular credita o IBS/CBS das compras de fornecedores do regime regular (preço total
                  mantido) e, de fornecedores do Simples, só a parcela de CBS/IBS do DAS. Folha, encargos, tributos e
                  despesas financeiras não geram crédito; o resto segue as categorias de custo.
                </li>
                <li>
                  Clientes: quem é do regime regular credita o IBS/CBS destacado; Simples puro, MEI, pessoa física,
                  órgão público e regime não informado não creditam.
                  {r.base.fatorR != null &&
                    r.base.anexo &&
                    ` Fator R: ${pct(r.base.fatorR * 100, 1)} (Anexo ${r.base.anexo}).`}
                </li>
              </ul>
              {cenarioAtual && (
                <>
                  <div className="fw-semibold">Cenário: {cenarioAtual.nome}</div>
                  <div className="text-muted mb-2">{cenarioAtual.descricao}</div>
                  <Table size="sm" className="rtc-tabela w-auto">
                    <thead>
                      <tr>
                        <th>Referência</th>
                        {cenarioAtual.anos.map((a) => (
                          <th key={a.ano} className="num">
                            {a.ano}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>CBS</td>
                        {cenarioAtual.anos.map((a) => (
                          <td key={a.ano} className="num">
                            {pct(a.cbs)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td>IBS</td>
                        {cenarioAtual.anos.map((a) => (
                          <td key={a.ano} className="num">
                            {pct(a.ibs)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </Table>
                </>
              )}
              <p className="text-muted mb-0">
                Simulação para planejamento, não substitui a análise do contador: alíquotas de 2027 em diante dependem
                de resolução do Senado e o enquadramento de cada operação deve ser confirmado.
              </p>
            </Card.Body>
          </Card>
        </>
      )}
    </>
  );
}
