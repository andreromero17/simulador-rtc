// =============================================================================
// Motor de simulação da Reforma Tributária do Consumo para empresas de SERVIÇOS.
//
// Compara, sobre o mesmo volume de faturamento e custos de 2026, os tributos sobre o consumo de hoje
// (PIS, Cofins, ISS ou DAS do Simples) com os de cada ano da transição (CBS, IBS e o ISS residual),
// de 2027 a 2033. Função pura: roda no servidor e nos testes; a tela só exibe.
//
// Regras principais (fontes: LC 214/2025, EC 132/2023 e as calculadoras da Receita Federal):
//  • Base do IBS/CBS = valor do serviço − ISS (até 2032) — igual à "base de cálculo unificada da NFS-e".
//  • IBS/CBS "por fora"; reduções pelo cClassTrib (ex.: 30% profissões intelectuais, 60% saúde).
//  • 2027/2028: CBS = referência − 0,1 p.p.; IBS = 0,1%. 2029 a 2032: ISS a 90/80/70/60% e IBS a 10/20/30/40%.
//  • Regime regular: crédito amplo do IBS/CBS pago nas compras (exceto folha, uso pessoal etc.).
//  • Simples Nacional: DAS pelas novas tabelas; opção "híbrida" tira CBS/IBS do DAS e os apura por fora.
//  • Cliente contribuinte do regime regular credita o IBS/CBS destacado; do Simples puro, só o que está no DAS.
// =============================================================================
import {
  ANO_BASE,
  ANOS_SIMULACAO,
  PIS_COFINS,
  contribuinteRegular,
  pisCofinsDaEmpresa,
  regrasDoAno,
  type PisCofinsEmpresa,
  type AliquotasReferencia,
  type RegimeEmpresa,
  type RegrasAno,
} from './parametros';
import { calcularDas, type AnexoServico, type ResultadoDas, type TributoSN } from './simples';

// ---------------------------------------------------------------- entradas
export interface EmpresaMotor {
  regime: RegimeEmpresa | string;
  /** Alíquota de ISS do município (%) */
  aliquotaIss: number;
  /** III, IV, V ou "III ou V (fator R)" */
  anexoSimples?: string | null;
  /** Puro ou Híbrido (só Simples) */
  opcaoSimples?: string | null;
  /** Receita bruta 12 meses; vazio = calculada dos dados (anualizada) */
  rbt12?: number | null;
  /** PIS/Cofins de hoje: regime (Conforme o regime / Cumulativo / Não cumulativo) e alíquotas (%) — vazio = padrão */
  regimePisCofins?: string | null;
  aliquotaPis?: number | null;
  aliquotaCofins?: number | null;
}

export interface ReceitaMotor {
  competencia: string;
  /** Valor bruto faturado em 2026 (com ISS e PIS/Cofins embutidos) */
  valor: number;
  reducaoCbs: number;
  reducaoIbs: number;
  semIncidencia: boolean;
  exportacao: boolean;
  /** ISS específico desta receita (%); vazio = o da empresa */
  aliquotaIss?: number | null;
  clienteRegime: string;
  clienteId?: number | null;
  clienteNome?: string | null;
  cclasstrib?: string | null;
}

export interface CustoMotor {
  competencia: string;
  valor: number;
  categoria: string;
  creditaPisCofins: boolean;
  creditaIbsCbs: boolean;
  folha: boolean;
  reducaoCbs: number;
  reducaoIbs: number;
  fornecedorRegime: string;
  fornecedorId?: number | null;
  fornecedorNome?: string | null;
}

export type EstrategiaPreco = 'preco' | 'liquido';

export interface Premissas {
  /**
   * preco   = o cliente continua pagando o mesmo total (a empresa absorve a diferença na margem);
   * liquido = a empresa mantém a receita líquida de hoje (a diferença vai para o preço do cliente).
   */
  estrategiaPreco: EstrategiaPreco;
  /** Cliente do Lucro Real credita PIS/Cofins sobre o serviço comprado hoje (insumo) */
  clienteRealCreditaPisCofins: boolean;
  /** Fornecedor típico do Simples (para o crédito de quem compra dele): anexo e receita 12 meses */
  anexoFornecedorSimples: AnexoServico;
  rbt12FornecedorSimples: number;
}

export const PREMISSAS_PADRAO: Premissas = {
  estrategiaPreco: 'preco',
  clienteRealCreditaPisCofins: true,
  anexoFornecedorSimples: 'III',
  rbt12FornecedorSimples: 500_000,
};

export interface EntradaSimulacao {
  empresa: EmpresaMotor;
  receitas: ReceitaMotor[];
  custos: CustoMotor[];
  cenario: AliquotasReferencia[];
  premissas?: Partial<Premissas>;
  anos?: number[];
}

// ---------------------------------------------------------------- saídas
export interface Tributos {
  pis: number;
  cofins: number;
  iss: number;
  cbs: number;
  ibs: number;
  /** DAS total (Simples) */
  das: number;
  /** Parte do DAS que é tributo sobre consumo (PIS, Cofins, ISS, CBS, IBS) */
  dasConsumo: number;
  /** Parte do DAS que é IRPJ, CSLL e CPP */
  dasOutros: number;
}

export interface Creditos {
  pisCofins: number;
  cbs: number;
  ibs: number;
}

export interface LinhaCliente {
  chave: string;
  nome: string;
  regime: string;
  receitaHoje: number;
  /** Total pago pelo cliente no ano simulado */
  totalCliente: number;
  tributos: number;
  creditoCliente: number;
  custoLiquidoCliente: number;
  custoLiquidoHoje: number;
}

export interface LinhaCategoria {
  categoria: string;
  valor: number;
  creditoPisCofins: number;
  creditoIbsCbs: number;
}

export interface ResultadoAno {
  ano: number;
  atual: boolean;
  regras: RegrasAno;
  /** Regime usado no ano (Simples puro/híbrido ou regular) */
  modo: string;
  /** Faturamento de 2026 (base de volume) */
  receitaBase: number;
  /** Total pago pelos clientes (serviço + IBS/CBS por fora) */
  receitaClientes: number;
  debitos: Tributos;
  creditos: Creditos;
  /** Tributos sobre consumo efetivamente devidos (débitos − créditos, incluindo a parte de consumo do DAS) */
  tributosConsumo: number;
  /** tributosConsumo / receitaClientes (%) */
  cargaConsumo: number;
  /** IRPJ/CSLL/CPP dentro do DAS (Simples) */
  outrosNoDas: number;
  /** O que sobra para a empresa antes dos custos: receitaClientes − tributosConsumo − outrosNoDas */
  receitaLiquida: number;
  custos: number;
  /** receitaLiquida − custos (antes de IRPJ/CSLL fora do Simples) */
  resultado: number;
  /** Quanto os clientes desembolsam líquido dos créditos que tomam */
  custoClientes: number;
  creditoClientes: number;
  das?: ResultadoDas & { anexo: AnexoServico };
  porCliente: LinhaCliente[];
  porCategoria: LinhaCategoria[];
  porMes: { mes: string; receitaClientes: number; tributosConsumo: number }[];
}

export interface ResultadoSimulacao {
  base: {
    meses: number;
    receitaPeriodo: number;
    custosPeriodo: number;
    rbt12: number;
    folha12: number;
    fatorR: number | null;
    anexo: AnexoServico | null;
  };
  premissas: Premissas;
  anos: ResultadoAno[];
  alertas: string[];
}

// ---------------------------------------------------------------- utilitários
const PIS_COFINS_NC = (PIS_COFINS.naoCumulativo.pis + PIS_COFINS.naoCumulativo.cofins) / 100;
const zeroTributos = (): Tributos => ({
  pis: 0,
  cofins: 0,
  iss: 0,
  cbs: 0,
  ibs: 0,
  das: 0,
  dasConsumo: 0,
  dasOutros: 0,
});
const CONSUMO_SN: TributoSN[] = ['pis', 'cofins', 'iss', 'cbs', 'ibs'];
const r2 = (v: number) => Math.round(v * 100) / 100;
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function somaTributos(a: Tributos, b: Partial<Tributos>) {
  for (const k of Object.keys(a) as (keyof Tributos)[]) a[k] += b[k] ?? 0;
}

/** Fator R = folha 12 meses ÷ receita 12 meses; ≥ 28% → Anexo III */
export function anexoDaEmpresa(anexo: string | null | undefined, fatorR: number | null): AnexoServico {
  if (anexo === 'IV') return 'IV';
  if (anexo === 'V') return 'V';
  if (anexo === 'III') return 'III';
  return fatorR != null && fatorR >= 0.28 ? 'III' : 'V';
}

const ehSimples = (regime: string) => regime === 'Simples Nacional';
const ehHibrido = (opcao: string | null | undefined) => !!opcao && opcao.startsWith('Híbrido');

// ---------------------------------------------------------------- simulação
export function simular(entrada: EntradaSimulacao): ResultadoSimulacao {
  const prem: Premissas = { ...PREMISSAS_PADRAO, ...(entrada.premissas ?? {}) };
  const { empresa, receitas, custos } = entrada;
  const alertas: string[] = [];

  const meses = new Set(receitas.map((r) => r.competencia.slice(0, 7))).size || 1;
  const anualizar = 12 / meses;
  const receitaPeriodo = receitas.reduce((s, r) => s + num(r.valor), 0);
  const custosPeriodo = custos.reduce((s, c) => s + num(c.valor), 0);
  const rbt12 = num(empresa.rbt12) > 0 ? num(empresa.rbt12) : receitaPeriodo * anualizar;
  const folha12 = custos.filter((c) => c.folha).reduce((s, c) => s + num(c.valor), 0) * anualizar;
  const simples = ehSimples(empresa.regime);
  const fatorR = rbt12 > 0 ? folha12 / rbt12 : null;
  const anexo = simples ? anexoDaEmpresa(empresa.anexoSimples, fatorR) : null;
  const pisCofins = pisCofinsDaEmpresa(empresa);

  if (meses < 12)
    alertas.push(
      `Os dados cobrem ${meses} ${meses === 1 ? 'mês' : 'meses'}. Os resultados valem para esse período; ` +
        `a receita de 12 meses do Simples e o fator R foram anualizados.`,
    );
  if (simples && rbt12 > 4_800_000)
    alertas.push('Receita acima de R$ 4,8 milhões: a empresa seria excluída do Simples Nacional.');
  else if (simples && rbt12 > 3_600_000)
    alertas.push('Receita acima do sublimite de R$ 3,6 milhões: ISS (e IBS) recolhidos fora do DAS.');
  if (simples && empresa.anexoSimples?.includes('fator R'))
    alertas.push(
      `Fator R de ${((fatorR ?? 0) * 100).toFixed(1).replace('.', ',')}% → Anexo ${anexo}` +
        (anexo === 'V' ? ' (abaixo de 28%).' : ' (28% ou mais).'),
    );
  if (!simples && pisCofins.personalizado)
    alertas.push(
      `PIS/Cofins de hoje informado na empresa: ${pisCofins.naoCumulativo ? 'não cumulativo' : 'cumulativo'}, ` +
        `PIS ${fmtPct(pisCofins.pis)} + Cofins ${fmtPct(pisCofins.cofins)}` +
        (pisCofins.naoCumulativo ? ' (com crédito sobre os insumos).' : ' (sem crédito sobre os custos).'),
    );
  if (!simples && empresa.regime === 'Lucro Presumido' && empresa.regimePisCofins === 'Não cumulativo')
    alertas.push('Lucro Presumido é sempre cumulativo no PIS/Cofins: a opção "Não cumulativo" foi ignorada.');
  if (receitas.some((r) => r.clienteRegime === 'Órgão público'))
    alertas.push(
      'Há receitas de órgãos públicos: o redutor das compras governamentais (a ser fixado pelo Senado) não foi aplicado.',
    );
  const semRegime = receitas.filter((r) => !r.clienteRegime || r.clienteRegime === 'Não informado').length;
  if (semRegime)
    alertas.push(
      `${semRegime} receita(s) com cliente de regime não informado: tratadas como cliente que não toma crédito.`,
    );

  const anos = [ANO_BASE, ...(entrada.anos ?? ANOS_SIMULACAO)];
  const resultados = anos.map((ano) =>
    simularAno(ano, { empresa, receitas, custos, prem, rbt12, anexo, pisCofins, cenario: entrada.cenario }),
  );

  const saldoCredor = resultados.find((a) => a.tributosConsumo < 0);
  if (saldoCredor)
    alertas.push(
      `Em ${saldoCredor.ano} os créditos superam os débitos: a empresa ficaria com saldo credor (ressarcimento ou compensação).`,
    );

  return {
    base: {
      meses,
      receitaPeriodo: r2(receitaPeriodo),
      custosPeriodo: r2(custosPeriodo),
      rbt12: r2(rbt12),
      folha12: r2(folha12),
      fatorR,
      anexo,
    },
    premissas: prem,
    anos: resultados,
    alertas,
  };
}

interface Ctx {
  empresa: EmpresaMotor;
  receitas: ReceitaMotor[];
  custos: CustoMotor[];
  prem: Premissas;
  rbt12: number;
  anexo: AnexoServico | null;
  pisCofins: PisCofinsEmpresa;
  cenario: AliquotasReferencia[];
}

/** Tributos de hoje sobre uma receita (para o cálculo de "manter a receita líquida") */
function tributosHojeDaLinha(r: ReceitaMotor, ctx: Ctx, das2026: ResultadoDas | null) {
  const g = num(r.valor);
  const iss = r.exportacao ? 0 : (r.aliquotaIss ?? ctx.empresa.aliquotaIss) / 100;
  if (das2026) {
    const pc = das2026.porTributo;
    const exclui = r.exportacao ? (pc.pis ?? 0) + (pc.cofins ?? 0) + (pc.iss ?? 0) : 0;
    const fora = das2026.acimaSublimite && !r.exportacao ? g * iss : 0;
    return (g * (das2026.aliquotaEfetiva - exclui)) / 100 + fora;
  }
  const pc = ctx.pisCofins;
  return r.exportacao ? 0 : g * ((pc.pis + pc.cofins) / 100 + iss);
}

function simularAno(ano: number, ctx: Ctx): ResultadoAno {
  const { empresa, receitas, custos, prem, rbt12, anexo, pisCofins } = ctx;
  const regras = regrasDoAno(
    ano,
    ctx.cenario.find((c) => c.ano === ano),
  );
  const atual = ano <= ANO_BASE;
  const simples = ehSimples(empresa.regime);
  const hibrido = simples && !atual && ehHibrido(empresa.opcaoSimples);
  const regular = !simples || hibrido; // apura IBS/CBS por fora e toma créditos
  const das = simples && anexo ? calcularDas(anexo, ano, rbt12) : null;
  const das2026 = simples && anexo ? calcularDas(anexo, ANO_BASE, rbt12) : null;
  const modo = simples
    ? atual
      ? `Simples Nacional — Anexo ${anexo}`
      : hibrido
        ? `Simples híbrido — Anexo ${anexo}`
        : `Simples puro — Anexo ${anexo}`
    : atual
      ? `${empresa.regime} — PIS/Cofins ${pisCofins.naoCumulativo ? 'não cumulativo' : 'cumulativo'} + ISS`
      : `${empresa.regime} — regime regular de IBS/CBS`;

  const debitos = zeroTributos();
  const creditos: Creditos = { pisCofins: 0, cbs: 0, ibs: 0 };
  let receitaClientes = 0;
  let creditoClientes = 0;
  const clientes = new Map<string, LinhaCliente>();
  const mesesMap = new Map<string, { receitaClientes: number; tributosConsumo: number }>();
  const noMes = (comp: string) => {
    const m = comp.slice(0, 7);
    let e = mesesMap.get(m);
    if (!e) mesesMap.set(m, (e = { receitaClientes: 0, tributosConsumo: 0 }));
    return e;
  };

  // ------------------------------------------------------------ receitas
  for (const r of receitas) {
    const g = num(r.valor);
    if (!g) continue;
    const issCheio = r.exportacao ? 0 : num(r.aliquotaIss ?? empresa.aliquotaIss) / 100;
    const semIbsCbs = r.exportacao || r.semIncidencia;
    const t: Partial<Tributos> = {};
    let total = g;
    let creditoCliente = 0;
    const clienteCredita = contribuinteRegular(r.clienteRegime);

    if (atual) {
      if (das) {
        const pc = das.porTributo;
        const exclui = r.exportacao ? CONSUMO_SN.reduce((s, k) => s + (pc[k] ?? 0), 0) : 0;
        const ef = das.aliquotaEfetiva - exclui;
        const consumo = r.exportacao ? 0 : (pc.pis ?? 0) + (pc.cofins ?? 0) + (pc.iss ?? 0);
        t.das = (g * ef) / 100;
        t.dasConsumo = (g * consumo) / 100;
        t.dasOutros = t.das - t.dasConsumo;
        if (das.acimaSublimite) t.iss = g * issCheio;
      } else {
        const pc = pisCofins;
        if (!r.exportacao) {
          t.pis = (g * pc.pis) / 100;
          t.cofins = (g * pc.cofins) / 100;
          t.iss = g * issCheio;
        }
      }
      if (r.clienteRegime === 'Lucro Real' && prem.clienteRealCreditaPisCofins && !r.exportacao)
        creditoCliente = g * PIS_COFINS_NC;
    } else {
      const c = semIbsCbs ? 0 : (regras.cbs / 100) * (1 - num(r.reducaoCbs) / 100);
      const i = semIbsCbs ? 0 : (regras.ibs / 100) * (1 - num(r.reducaoIbs) / 100);
      const hoje = tributosHojeDaLinha(r, ctx, das2026);

      if (simples && !hibrido && das) {
        // Simples puro: CBS/IBS dentro do DAS; o preço não muda (o DAS praticamente não muda)
        const pc = das.porTributo;
        const exclui = r.exportacao ? CONSUMO_SN.reduce((s, k) => s + (pc[k] ?? 0), 0) : 0;
        const consumo = r.exportacao ? 0 : (pc.iss ?? 0) + (pc.cbs ?? 0) + (pc.ibs ?? 0);
        t.das = (g * (das.aliquotaEfetiva - exclui)) / 100;
        t.dasConsumo = (g * consumo) / 100;
        t.dasOutros = t.das - t.dasConsumo;
        if (das.acimaSublimite && !r.exportacao) {
          // 6ª faixa: ISS e IBS fora do DAS
          t.iss = g * issCheio * regras.fatorIss;
          t.ibs = g * (1 - issCheio * regras.fatorIss) * i;
        }
        if (clienteCredita) creditoCliente = (g * ((pc.cbs ?? 0) + (pc.ibs ?? 0))) / 100 + (t.ibs ?? 0);
      } else if (hibrido && das) {
        // Simples híbrido: DAS sem CBS/IBS; CBS/IBS por fora sobre (serviço − ISS do DAS)
        const pc = das.porTributo;
        const issDas = das.acimaSublimite ? 0 : (pc.iss ?? 0) / 100;
        const efH = (das.aliquotaEfetiva - (pc.cbs ?? 0) - (pc.ibs ?? 0)) / 100;
        const exclui = r.exportacao ? (pc.iss ?? 0) / 100 : 0;
        const issFora = das.acimaSublimite ? issCheio * regras.fatorIss : 0;
        const fatorBase = 1 - issDas - issFora;
        const v =
          prem.estrategiaPreco === 'liquido'
            ? (g - hoje) / Math.max(1 - (efH - exclui) - issFora, 0.01)
            : g / (1 + (c + i) * fatorBase);
        t.das = v * (efH - exclui);
        t.dasConsumo = r.exportacao ? 0 : v * issDas;
        t.dasOutros = t.das - t.dasConsumo;
        t.iss = v * issFora;
        t.cbs = v * fatorBase * c;
        t.ibs = v * fatorBase * i;
        total = v + t.cbs + t.ibs;
        if (clienteCredita) creditoCliente = t.cbs + t.ibs;
      } else {
        // Lucro Presumido / Real → regime regular de IBS/CBS
        const s = issCheio * regras.fatorIss;
        const v = prem.estrategiaPreco === 'liquido' ? (g - hoje) / Math.max(1 - s, 0.01) : g / (1 + (c + i) * (1 - s));
        t.iss = v * s;
        t.cbs = v * (1 - s) * c;
        t.ibs = v * (1 - s) * i;
        total = v + t.cbs + t.ibs;
        if (clienteCredita) creditoCliente = t.cbs + t.ibs;
      }
    }

    somaTributos(debitos, t);
    receitaClientes += total;
    creditoClientes += creditoCliente;
    const tribLinha = (t.pis ?? 0) + (t.cofins ?? 0) + (t.iss ?? 0) + (t.cbs ?? 0) + (t.ibs ?? 0) + (t.dasConsumo ?? 0);
    const m = noMes(r.competencia);
    m.receitaClientes += total;
    m.tributosConsumo += tribLinha;

    const chave = r.clienteId != null ? `id:${r.clienteId}` : `nome:${r.clienteNome ?? '—'}`;
    let cl = clientes.get(chave);
    if (!cl)
      clientes.set(
        chave,
        (cl = {
          chave,
          nome: r.clienteNome || 'Sem cliente',
          regime: r.clienteRegime || 'Não informado',
          receitaHoje: 0,
          totalCliente: 0,
          tributos: 0,
          creditoCliente: 0,
          custoLiquidoCliente: 0,
          custoLiquidoHoje: 0,
        }),
      );
    cl.receitaHoje += g;
    cl.totalCliente += total;
    cl.tributos += tribLinha;
    cl.creditoCliente += creditoCliente;
    cl.custoLiquidoCliente += total - creditoCliente;
    // custo líquido do cliente hoje (para comparar)
    const credHoje =
      r.clienteRegime === 'Lucro Real' && prem.clienteRealCreditaPisCofins && !r.exportacao ? g * PIS_COFINS_NC : 0;
    cl.custoLiquidoHoje += g - credHoje;
  }

  // ------------------------------------------------------------ créditos sobre custos
  const categorias = new Map<string, LinhaCategoria>();
  const credFornSimples = (() => {
    if (atual) return { cbs: 0, ibs: 0 };
    const d = calcularDas(prem.anexoFornecedorSimples, ano, prem.rbt12FornecedorSimples);
    return { cbs: (d.porTributo.cbs ?? 0) / 100, ibs: (d.porTributo.ibs ?? 0) / 100 };
  })();

  for (const cu of custos) {
    const v = num(cu.valor);
    if (!v) continue;
    let cat = categorias.get(cu.categoria);
    if (!cat)
      categorias.set(
        cu.categoria,
        (cat = { categoria: cu.categoria, valor: 0, creditoPisCofins: 0, creditoIbsCbs: 0 }),
      );
    cat.valor += v;
    let cPis = 0;
    let cCbs = 0;
    let cIbs = 0;
    const forn = cu.fornecedorRegime;
    if (atual) {
      // crédito só no não cumulativo, à alíquota da empresa
      if (!simples && pisCofins.naoCumulativo && cu.creditaPisCofins && forn !== 'Pessoa física' && forn !== 'Exterior')
        cPis = (v * (pisCofins.pis + pisCofins.cofins)) / 100;
    } else if (regular && cu.creditaIbsCbs) {
      if (contribuinteRegular(forn)) {
        // fornecedor mantém o preço total: o IBS/CBS sai de dentro do valor pago
        const c = (regras.cbs / 100) * (1 - num(cu.reducaoCbs) / 100);
        const i = (regras.ibs / 100) * (1 - num(cu.reducaoIbs) / 100);
        const base = v / (1 + c + i);
        cCbs = base * c;
        cIbs = base * i;
      } else if (forn === 'Simples Nacional') {
        cCbs = v * credFornSimples.cbs;
        cIbs = v * credFornSimples.ibs;
      }
    }
    creditos.pisCofins += cPis;
    creditos.cbs += cCbs;
    creditos.ibs += cIbs;
    cat.creditoPisCofins += cPis;
    cat.creditoIbsCbs += cCbs + cIbs;
    noMes(cu.competencia).tributosConsumo -= cPis + cCbs + cIbs;
  }

  const debConsumo = debitos.pis + debitos.cofins + debitos.iss + debitos.cbs + debitos.ibs + debitos.dasConsumo;
  const tributosConsumo = debConsumo - creditos.pisCofins - creditos.cbs - creditos.ibs;
  const custosTotal = custos.reduce((s, c) => s + num(c.valor), 0);
  const receitaLiquida = receitaClientes - tributosConsumo - debitos.dasOutros;

  const arred = <T extends object>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? r2(v) : v])) as T;

  return {
    ano,
    atual,
    regras,
    modo,
    receitaBase: r2(receitas.reduce((s, r) => s + num(r.valor), 0)),
    receitaClientes: r2(receitaClientes),
    debitos: arred(debitos),
    creditos: arred(creditos),
    tributosConsumo: r2(tributosConsumo),
    cargaConsumo: receitaClientes ? (tributosConsumo / receitaClientes) * 100 : 0,
    outrosNoDas: r2(debitos.dasOutros),
    receitaLiquida: r2(receitaLiquida),
    custos: r2(custosTotal),
    resultado: r2(receitaLiquida - custosTotal),
    custoClientes: r2(receitaClientes - creditoClientes),
    creditoClientes: r2(creditoClientes),
    das: das && anexo ? { ...das, anexo } : undefined,
    porCliente: [...clientes.values()].map(arred).sort((a, b) => b.receitaHoje - a.receitaHoje),
    porCategoria: [...categorias.values()].map(arred).sort((a, b) => b.valor - a.valor),
    porMes: [...mesesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, v]) => ({ mes, ...arred(v) })),
  };
}
