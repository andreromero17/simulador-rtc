// =============================================================================
// Carrega a empresa, as receitas e os custos de 2026 do banco do espaço e roda o motor (shared/app/rtc/motor).
// =============================================================================
import {
  ANO_BASE,
  OPCOES_SIMPLES,
  cclasstrib,
  simular,
  type AliquotasReferencia,
  type CustoMotor,
  type EntradaSimulacao,
  type Premissas,
  type ReceitaMotor,
  type RespostaSimulacao,
} from '@frame/shared';
import type { Db } from '../../db/knex';
import { HttpError } from '../../utils/http';

export interface PedidoSimulacao {
  empresaId: number;
  cenarioId?: number | null;
  premissas?: Partial<Premissas>;
  /** Força a opção do Simples (puro/híbrido) */
  opcaoSimples?: string | null;
}

const naoExcluido = (q: ReturnType<Db>, alias: string) => q.whereNull(`${alias}.excluido_em`);
const bool = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

export async function cenarioDe(db: Db, id?: number | null) {
  const c =
    (id ? await db('cenarios').where({ id }).first() : null) ??
    (await db('cenarios')
      .orderBy([{ column: 'padrao', order: 'desc' }, 'id'])
      .first());
  if (!c) throw new HttpError(422, 'Cadastre um cenário de alíquotas em Parâmetros → Cenários.');
  const anos = (await db('cenarios_anos').where({ cenario_id: c.id }).orderBy('ano')).map((a) => ({
    ano: Number(a.ano),
    cbs: Number(a.cbs),
    ibs: Number(a.ibs),
  }));
  return { id: Number(c.id), nome: String(c.nome), descricao: (c.descricao as string) ?? null, anos };
}

/** Preenche os anos que faltarem no cenário com o último ano informado */
function completarAnos(anos: AliquotasReferencia[]): AliquotasReferencia[] {
  const out: AliquotasReferencia[] = [];
  let ultimo: AliquotasReferencia | undefined;
  for (let ano = ANO_BASE + 1; ano <= 2033; ano++) {
    const a = anos.find((x) => x.ano === ano) ?? (ultimo ? { ...ultimo, ano } : undefined);
    if (a) out.push(a);
    ultimo = a ?? ultimo;
  }
  if (out.length < 7) throw new HttpError(422, 'O cenário precisa das alíquotas de referência de 2027 em diante.');
  return out;
}

export async function carregarEntrada(db: Db, empresaId: number) {
  const empresa = await db('empresas').where({ id: empresaId }).first();
  if (!empresa) throw new HttpError(404, 'Empresa não encontrada');

  const receitasDb = (await naoExcluido(
    db('receitas as r')
      .leftJoin('parceiros as p', 'p.id', 'r.cliente_id')
      .where('r.empresa_id', empresaId)
      .select('r.*', 'p.nome as cliente_nome', 'p.regime as cliente_regime'),
    'r',
  )) as Record<string, unknown>[];
  const custosDb = (await naoExcluido(
    db('custos as c')
      .leftJoin('parceiros as p', 'p.id', 'c.fornecedor_id')
      .leftJoin('categorias_custo as k', 'k.id', 'c.categoria_id')
      .where('c.empresa_id', empresaId)
      .select(
        'c.*',
        'p.nome as fornecedor_nome',
        'p.regime as fornecedor_regime',
        'k.nome as categoria_nome',
        'k.credita_pis_cofins',
        'k.credita_ibs_cbs',
        'k.folha',
        'k.cclasstrib as categoria_cclasstrib',
      ),
    'c',
  )) as Record<string, unknown>[];

  const receitas: ReceitaMotor[] = receitasDb.map((r) => ({
    competencia: String(r.competencia ?? ''),
    valor: Number(r.valor) || 0,
    reducaoCbs: Number(r.reducao_cbs) || 0,
    reducaoIbs: Number(r.reducao_ibs) || 0,
    semIncidencia: !!cclasstrib(r.cclasstrib as string)?.semIncidencia,
    exportacao: bool(r.exportacao) || r.cliente_regime === 'Exterior',
    aliquotaIss: r.aliquota_iss == null || r.aliquota_iss === '' ? null : Number(r.aliquota_iss),
    clienteRegime: (r.cliente_regime as string) || 'Não informado',
    clienteId: (r.cliente_id as number) ?? null,
    clienteNome: (r.cliente_nome as string) ?? null,
    cclasstrib: (r.cclasstrib as string) ?? null,
  }));

  const custos: CustoMotor[] = custosDb.map((c) => {
    const ct = cclasstrib(((c.cclasstrib as string) || (c.categoria_cclasstrib as string)) ?? '');
    const folha = bool(c.folha);
    return {
      competencia: String(c.competencia ?? ''),
      valor: Number(c.valor) || 0,
      categoria: (c.categoria_nome as string) || 'Sem categoria',
      creditaPisCofins: bool(c.credita_pis_cofins),
      creditaIbsCbs: bool(c.credita_ibs_cbs) && !ct?.semIncidencia,
      folha,
      reducaoCbs: ct?.reducaoCbs ?? 0,
      reducaoIbs: ct?.reducaoIbs ?? 0,
      // folha/encargos sem fornecedor: não importa; demais sem fornecedor = não informado (sem crédito)
      fornecedorRegime: (c.fornecedor_regime as string) || 'Não informado',
      fornecedorId: (c.fornecedor_id as number) ?? null,
      fornecedorNome: (c.fornecedor_nome as string) ?? null,
    };
  });

  return {
    empresa,
    receitas,
    custos,
    contagem: {
      receitas: receitas.length,
      custos: custos.length,
      semCliente: receitas.filter((r) => r.clienteId == null).length,
      semFornecedor: custos.filter((c) => c.fornecedorId == null && !c.folha).length,
    },
  };
}

export async function rodarSimulacao(db: Db, pedido: PedidoSimulacao): Promise<RespostaSimulacao> {
  const { empresa, receitas, custos, contagem } = await carregarEntrada(db, pedido.empresaId);
  const cenario = await cenarioDe(db, pedido.cenarioId);
  const anos = completarAnos(cenario.anos);
  const opcao = pedido.opcaoSimples || (empresa.opcao_simples as string) || OPCOES_SIMPLES[0];

  const entrada = (opcaoSimples: string): EntradaSimulacao => ({
    empresa: {
      regime: String(empresa.regime),
      aliquotaIss: Number(empresa.aliquota_iss ?? 5),
      anexoSimples: (empresa.anexo_simples as string) ?? null,
      opcaoSimples,
      rbt12: empresa.rbt12 == null ? null : Number(empresa.rbt12),
    },
    receitas,
    custos,
    cenario: anos,
    premissas: pedido.premissas,
  });

  const resultado = simular(entrada(opcao));
  const resp: RespostaSimulacao = { empresa, cenario: { ...cenario, anos }, resultado, contagem };
  if (empresa.regime === 'Simples Nacional') {
    const outra = OPCOES_SIMPLES.find((o) => o !== opcao)!;
    resp.alternativa = { opcao: outra, resultado: simular(entrada(outra)) };
  }
  return resp;
}
