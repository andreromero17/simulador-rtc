// Clientes e fornecedores. Padrão: só os da empresa ativa (os que aparecem nas receitas/custos dela), com os
// totais de 2026. "Cadastro geral" volta para a listagem genérica com todos.
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonGroup, Card, Spinner, Table } from 'react-bootstrap';
import { getEntity, type ParceiroDaEmpresa, type ResultadoConsultaCnpj } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import CrudList from '../../pages/CrudList';
import PageHeader from '../../components/PageHeader';
import ValueBadge from '../../components/ValueBadge';
import { BarraEmpresa } from './comum';
import { resumoConsulta } from './consulta';
import { brl, useEmpresaEscolhida, useEmpresas } from './util';

const CORES = getEntity('parceiros')?.fields.find((f) => f.name === 'regime')?.colors ?? {};

function useConsulta(aoTerminar: () => void) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [ultimo, setUltimo] = useState<ResultadoConsultaCnpj | null>(null);
  const consultar = async (ids?: number[]) => {
    setOcupado(true);
    try {
      const r = await api.post<ResultadoConsultaCnpj>('/rtc/parceiros/consultar', ids ? { ids } : {});
      setUltimo(r);
      if (r.problemas.length || r.falhas) toast.error(resumoConsulta(r));
      else toast.success(resumoConsulta(r));
      aoTerminar();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };
  return { ocupado, consultar, ultimo };
}

function Alternar({ modo, setModo }: { modo: 'empresa' | 'todos'; setModo: (m: 'empresa' | 'todos') => void }) {
  return (
    <ButtonGroup>
      <Button variant={modo === 'empresa' ? 'primary' : 'light'} onClick={() => setModo('empresa')}>
        <i className="bi bi-buildings me-1" /> Desta empresa
      </Button>
      <Button variant={modo === 'todos' ? 'primary' : 'light'} onClick={() => setModo('todos')}>
        <i className="bi bi-list-ul me-1" /> Cadastro geral
      </Button>
    </ButtonGroup>
  );
}

function DaEmpresa({ alternar }: { alternar: React.ReactNode }) {
  const toast = useToast();
  const { can } = useAuth();
  const empresas = useEmpresas();
  const { id, escolher } = useEmpresaEscolhida(empresas);
  const [linhas, setLinhas] = useState<ParceiroDaEmpresa[] | null>(null);

  const carregar = useCallback(() => {
    if (!id) return;
    setLinhas(null);
    api
      .get<ParceiroDaEmpresa[]>(`/rtc/parceiros?empresa_id=${id}`)
      .then(setLinhas)
      .catch((e) => toast.error(errorMessage(e)));
  }, [id, toast]);
  useEffect(carregar, [carregar]);
  const { ocupado, consultar, ultimo } = useConsulta(carregar);
  // sem regime confirmado: nunca consultado, não identificado/não informado ou só inferido (sem ECF)
  const aConsultar = (linhas ?? [])
    .filter(
      (p) =>
        p.documento &&
        p.documento.length > 14 &&
        !(p.regimeFonte ?? '').startsWith('Informado') &&
        (!p.consultado ||
          p.regime === 'Não informado' ||
          p.regime === 'Regime normal (não identificado)' ||
          (p.regimeFonte ?? '').startsWith('Inferido')),
    )
    .map((p) => p.id);

  return (
    <>
      <PageHeader title="Clientes e fornecedores" icon="people">
        {alternar}
        {can('parceiros', 'editar') && aConsultar.length > 0 && (
          <Button
            variant="light"
            disabled={ocupado}
            onClick={() => void consultar(aConsultar)}
            title="Consulta os CNPJs ainda sem regime confirmado (os informados à mão ou na planilha são mantidos)"
          >
            <i className="bi bi-search me-1" /> {ocupado ? 'Consultando…' : `Consultar CNPJs (${aConsultar.length})`}
          </Button>
        )}
      </PageHeader>
      <BarraEmpresa empresas={empresas} valor={id} onChange={escolher} />
      {ocupado && (
        <div className="small mb-2">
          <Spinner size="sm" className="me-2" />
          Consultando os CNPJs um a um (pode levar alguns minutos)…
        </div>
      )}
      {ultimo && !ocupado && (
        <div className={`small mb-2 ${ultimo.problemas.length || ultimo.falhas ? 'rtc-neg' : ''}`}>
          <i className="bi bi-info-circle me-1" />
          {resumoConsulta(ultimo)}
        </div>
      )}
      <Card className="card-app">
        <Card.Body className="p-0">
          {!linhas ? (
            <div className="text-center py-5">
              <Spinner />
            </div>
          ) : linhas.length === 0 ? (
            <p className="text-center text-muted py-5 mb-0">
              Nenhum cliente ou fornecedor nas receitas e custos desta empresa.{' '}
              <Link to={`/importar?empresa=${id}`}>Importar planilhas</Link>
            </p>
          ) : (
            <div className="table-responsive">
              <Table hover className="rtc-tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>CNPJ/CPF</th>
                    <th>Tipo</th>
                    <th>Regime</th>
                    <th>UF</th>
                    <th className="num">Faturado em 2026</th>
                    <th className="num">Comprado em 2026</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link to={`/parceiros/${p.id}`} className="fw-semibold">
                          {p.nome}
                        </Link>
                      </td>
                      <td className="text-muted">{p.documento ?? '—'}</td>
                      <td>{p.tipo}</td>
                      <td>
                        <ValueBadge value={p.regime} colors={CORES} />
                        {p.documento && !p.consultado && (
                          <i className="bi bi-question-circle ms-1 text-muted" title="CNPJ ainda não consultado" />
                        )}
                        {p.regimeFonte && (
                          <div className="small text-muted text-wrap" style={{ maxWidth: '22rem' }}>
                            {p.regimeFonte}
                          </div>
                        )}
                      </td>
                      <td>{p.uf ?? '—'}</td>
                      <td className="num">
                        {p.faturado ? brl(p.faturado, 2) : '—'}
                        {p.notas > 0 && <div className="small text-muted">{p.notas} lançamento(s)</div>}
                      </td>
                      <td className="num">
                        {p.comprado ? brl(p.comprado, 2) : '—'}
                        {p.lancamentos > 0 && <div className="small text-muted">{p.lancamentos} lançamento(s)</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="fw-bold">
                    <td colSpan={5}>{linhas.length} cliente(s)/fornecedor(es)</td>
                    <td className="num">
                      {brl(
                        linhas.reduce((s, p) => s + p.faturado, 0),
                        2,
                      )}
                    </td>
                    <td className="num">
                      {brl(
                        linhas.reduce((s, p) => s + p.comprado, 0),
                        2,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
      <p className="small text-muted mt-2">
        O regime decide quem toma crédito na simulação. A consulta de CNPJ traz Simples e MEI (situação atual) e o Lucro
        Real ou Presumido declarado na ECF do último ano publicado pela Receita. Sem ECF, identifica Lucro Real por
        sinais fortes (S.A. aberta, instituição financeira, capital acima de R$ 50 mi). O resto fica "Regime normal (não
        identificado)": a partir de 2027 ele toma crédito do IBS/CBS como Real ou Presumido; só a comparação com hoje
        (crédito de PIS/Cofins do Lucro Real) depende de ajustar à mão.
      </p>
    </>
  );
}

function CadastroGeral({ alternar }: { alternar: React.ReactNode }) {
  const { can } = useAuth();
  const [versao, setVersao] = useState(0);
  const { ocupado, consultar } = useConsulta(() => setVersao((v) => v + 1));
  return (
    <CrudList
      key={versao}
      entity="parceiros"
      actions={
        <>
          {alternar}
          {can('parceiros', 'editar') && (
            <Button
              variant="light"
              disabled={ocupado}
              onClick={() => void consultar()}
              title="Busca Simples/MEI, UF e CNAE em base pública"
            >
              <i className="bi bi-search me-1" /> {ocupado ? 'Consultando…' : 'Consultar CNPJs'}
            </Button>
          )}
        </>
      }
    />
  );
}

export default function Parceiros() {
  const [modo, setModo] = useState<'empresa' | 'todos'>('empresa');
  const alternar = <Alternar modo={modo} setModo={setModo} />;
  return modo === 'empresa' ? <DaEmpresa alternar={alternar} /> : <CadastroGeral alternar={alternar} />;
}
