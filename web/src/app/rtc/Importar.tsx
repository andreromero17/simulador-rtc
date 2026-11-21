// Importação das planilhas de 2026 (abas Receitas e Custos) para uma empresa
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Col, Form, Row as BsRow, Spinner, Table } from 'react-bootstrap';
import type { PreviaImportacao, ResultadoConsultaCnpj, ResultadoImportacao } from '@frame/shared';
import { api, download, errorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import PageHeader from '../../components/PageHeader';
import { SeletorEmpresa } from './comum';
import { brl, useEmpresaEscolhida, useEmpresas } from './util';

function Resumo({ p }: { p: PreviaImportacao }) {
  const bloco = (titulo: string, r: PreviaImportacao['receitas']) => (
    <Col md={6}>
      <div className="rtc-kpi">
        <div className="rtc-kpi-rotulo">{titulo}</div>
        <div className="rtc-kpi-valor">{brl(r.total, 2)}</div>
        <div className="rtc-kpi-det">
          {r.validas} de {r.linhas} linha(s) válidas
          {r.competencias.length > 0 && ` · ${r.competencias[0]} a ${r.competencias[r.competencias.length - 1]}`}
        </div>
      </div>
    </Col>
  );
  return (
    <>
      <BsRow className="g-3 mb-3">
        {bloco('Receitas', p.receitas)}
        {bloco('Custos e despesas', p.custos)}
      </BsRow>
      <p className="small mb-2">
        <i className="bi bi-people me-1" />
        {p.parceirosNovos} cliente(s)/fornecedor(es) novo(s) e {p.parceirosExistentes} já cadastrado(s).
      </p>
      {p.categoriasNaoEncontradas.length > 0 && (
        <Alert variant="warning" className="small py-2">
          Categorias não reconhecidas (irão para "Outras despesas"): {p.categoriasNaoEncontradas.join(', ')}
        </Alert>
      )}
      {p.colunasIgnoradas.length > 0 && (
        <p className="small text-muted">Colunas ignoradas: {p.colunasIgnoradas.join(', ')}</p>
      )}
      {p.erros.length > 0 && (
        <>
          <h6 className="fw-bold mt-3">Linhas com problema ({p.erros.length})</h6>
          <div className="table-responsive" style={{ maxHeight: '18rem' }}>
            <Table size="sm" className="rtc-tabela">
              <thead>
                <tr>
                  <th>Aba</th>
                  <th>Linha</th>
                  <th>Problema</th>
                </tr>
              </thead>
              <tbody>
                {p.erros.slice(0, 300).map((e) => (
                  <tr key={`${e.aba}${e.linha}`}>
                    <td>{e.aba}</td>
                    <td>{e.linha}</td>
                    <td className="text-wrap">{e.erro}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}

export default function Importar() {
  const toast = useToast();
  const empresas = useEmpresas();
  const { id: empresaId, escolher } = useEmpresaEscolhida(empresas);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null);
  const [substituir, setSubstituir] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [consulta, setConsulta] = useState<ResultadoConsultaCnpj | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const escolherArquivo = async (f: File | null) => {
    setArquivo(f);
    setPrevia(null);
    setResultado(null);
    if (!f || !empresaId) return;
    setOcupado(true);
    try {
      setPrevia(await api.upload<PreviaImportacao>(`/rtc/importar?empresa_id=${empresaId}&previa=1`, f));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const importar = async () => {
    if (!arquivo || !empresaId) return;
    setOcupado(true);
    try {
      const r = await api.upload<ResultadoImportacao>(
        `/rtc/importar?empresa_id=${empresaId}&substituir=${substituir ? 1 : 0}&nome=${encodeURIComponent(arquivo.name)}`,
        arquivo,
      );
      setResultado(r);
      setPrevia(null);
      toast.success(`${r.importadas.receitas} receita(s) e ${r.importadas.custos} custo(s) importados`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const consultar = async () => {
    setOcupado(true);
    try {
      const r = await api.post<ResultadoConsultaCnpj>('/rtc/parceiros/consultar', {});
      setConsulta(r);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <>
      <PageHeader title="Importar planilhas de 2026" icon="file-earmark-spreadsheet">
        <Button variant="light" onClick={() => download('/rtc/importar/modelo')}>
          <i className="bi bi-download me-1" /> Planilha modelo
        </Button>
      </PageHeader>

      <BsRow className="g-3">
        <Col lg={8}>
          <Card className="card-app mb-3">
            <Card.Header>
              <i className="bi bi-1-circle" /> Empresa e arquivo
            </Card.Header>
            <Card.Body>
              {empresas && !empresas.length ? (
                <p>
                  Cadastre a empresa primeiro: <Link to="/empresas/novo">nova empresa</Link>.
                </p>
              ) : (
                <BsRow className="g-3 align-items-end">
                  <Col md={6}>
                    <Form.Label className="small text-muted">Empresa</Form.Label>
                    {empresas ? (
                      <SeletorEmpresa
                        empresas={empresas}
                        valor={empresaId}
                        onChange={(id) => {
                          escolher(id);
                          setPrevia(null);
                          setArquivo(null);
                          if (input.current) input.current.value = '';
                        }}
                      />
                    ) : (
                      <Spinner size="sm" />
                    )}
                  </Col>
                  <Col md={6}>
                    <Form.Label className="small text-muted">Planilha (.xlsx com abas Receitas e Custos)</Form.Label>
                    <Form.Control
                      ref={input}
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => void escolherArquivo((e.target as HTMLInputElement).files?.[0] ?? null)}
                    />
                  </Col>
                </BsRow>
              )}
              {ocupado && (
                <div className="mt-3">
                  <Spinner size="sm" className="me-2" /> Processando…
                </div>
              )}
            </Card.Body>
          </Card>

          {previa && (
            <Card className="card-app mb-3">
              <Card.Header>
                <i className="bi bi-2-circle" /> Prévia
              </Card.Header>
              <Card.Body>
                <Resumo p={previa} />
                <Form.Check
                  className="mt-3"
                  id="substituir"
                  type="switch"
                  checked={substituir}
                  onChange={(e) => setSubstituir(e.target.checked)}
                  label="Substituir receitas e custos já cadastrados desta empresa nos meses do arquivo (evita duplicar ao reimportar)"
                />
                <Button
                  className="mt-3"
                  disabled={ocupado || previa.receitas.validas + previa.custos.validas === 0}
                  onClick={() => void importar()}
                >
                  <i className="bi bi-upload me-1" /> Importar {previa.receitas.validas + previa.custos.validas}{' '}
                  linha(s)
                </Button>
              </Card.Body>
            </Card>
          )}

          {resultado && (
            <Card className="card-app mb-3">
              <Card.Header>
                <i className="bi bi-check2-circle text-success" /> Importação concluída
              </Card.Header>
              <Card.Body>
                <p>
                  {resultado.importadas.receitas} receita(s), {resultado.importadas.custos} custo(s) e{' '}
                  {resultado.importadas.parceiros} cliente(s)/fornecedor(es) novos
                  {resultado.importadas.substituidas
                    ? ` · ${resultado.importadas.substituidas} lançamento(s) substituído(s)`
                    : ''}
                  .
                </p>
                {resultado.erros.length > 0 && (
                  <Resumo p={{ ...resultado, receitas: resultado.receitas, custos: resultado.custos }} />
                )}
                <div className="d-flex flex-wrap gap-2 mt-3">
                  <Link className="btn btn-primary" to={`/simulacao?empresa=${empresaId}`}>
                    <i className="bi bi-calculator me-1" /> Ver a simulação
                  </Link>
                  <Button variant="light" disabled={ocupado} onClick={() => void consultar()}>
                    <i className="bi bi-search me-1" /> Consultar regime dos CNPJs
                  </Button>
                </div>
              </Card.Body>
            </Card>
          )}

          {consulta && (
            <Alert variant="light" className="border">
              CNPJs consultados: {consulta.consultados} · atualizados: {consulta.atualizados} · não encontrados:{' '}
              {consulta.naoEncontrados}
              {consulta.falhas > 0 && ` · falhas: ${consulta.falhas}`}
              {consulta.restantes > 0 && (
                <>
                  {' '}
                  · faltam {consulta.restantes}.{' '}
                  <Button size="sm" variant="link" className="p-0 align-baseline" onClick={() => void consultar()}>
                    Consultar mais
                  </Button>
                </>
              )}
              <div className="small text-muted mt-1">
                A consulta pública mostra Simples e MEI. Lucro Real × Presumido não é público: ajuste em{' '}
                <Link to="/parceiros">Clientes e fornecedores</Link> os mais relevantes.
              </div>
            </Alert>
          )}
        </Col>

        <Col lg={4}>
          <Card className="card-app">
            <Card.Header>
              <i className="bi bi-info-circle" /> Como montar a planilha
            </Card.Header>
            <Card.Body className="small">
              <ol className="ps-3 mb-3">
                <li className="mb-2">
                  Baixe a <strong>planilha modelo</strong> ou use a sua: o sistema reconhece cabeçalhos como
                  "Competência", "CNPJ cliente", "Cliente", "Item LC 116", "Valor".
                </li>
                <li className="mb-2">
                  <strong>Receitas:</strong> uma linha por nota (ou por cliente/mês), com o item da LC 116 — ele define
                  o NBS e a classificação tributária (cClassTrib) pela tabela oficial da Receita.
                </li>
                <li className="mb-2">
                  <strong>Custos:</strong> inclua folha, pró-labore e encargos (sem fornecedor) — eles pesam porque não
                  geram crédito — e as compras com CNPJ do fornecedor.
                </li>
                <li className="mb-2">
                  Depois de importar, <strong>consulte os CNPJs</strong> para trazer quem é do Simples/MEI e marque à
                  mão os clientes do Lucro Real.
                </li>
              </ol>
              <p className="text-muted mb-0">Limite de 20 mil linhas por arquivo.</p>
            </Card.Body>
          </Card>
        </Col>
      </BsRow>
    </>
  );
}
