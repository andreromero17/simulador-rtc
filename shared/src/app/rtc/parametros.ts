// =============================================================================
// Parâmetros da transição (EC 132/2023, LC 214/2025) e listas usadas pelo motor e pelas telas.
// =============================================================================
import dados from './cclasstrib.json';

export const ANO_BASE = 2026;
export const ANOS_SIMULACAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033] as const;

/** PIS/Cofins atuais (em %) */
export const PIS_COFINS = {
  cumulativo: { pis: 0.65, cofins: 3 },
  naoCumulativo: { pis: 1.65, cofins: 7.6 },
} as const;

export const REGIMES_PIS_COFINS = ['Conforme o regime', 'Cumulativo', 'Não cumulativo'] as const;

export interface PisCofinsEmpresa {
  pis: number;
  cofins: number;
  /** Não cumulativo: débito sobre a receita e crédito sobre os insumos */
  naoCumulativo: boolean;
  /** Alíquotas ou regime diferentes do padrão do regime tributário */
  personalizado: boolean;
}

/**
 * PIS/Cofins de hoje da empresa. Padrão: Lucro Presumido = cumulativo (0,65% + 3%); Lucro Real = não cumulativo
 * (1,65% + 7,6%). A empresa pode informar o regime (ex.: Lucro Real com receita de TI no cumulativo) e as alíquotas
 * (ex.: benefício de alíquota reduzida). Lucro Presumido é sempre cumulativo.
 */
export function pisCofinsDaEmpresa(e: {
  regime: string;
  regimePisCofins?: string | null;
  aliquotaPis?: number | null;
  aliquotaCofins?: number | null;
}): PisCofinsEmpresa {
  const pedido = e.regimePisCofins;
  const naoCumulativo = e.regime === 'Lucro Real' ? pedido !== 'Cumulativo' : false;
  const padrao = naoCumulativo ? PIS_COFINS.naoCumulativo : PIS_COFINS.cumulativo;
  const num = (v: number | null | undefined) => (v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const pis = num(e.aliquotaPis) ?? padrao.pis;
  const cofins = num(e.aliquotaCofins) ?? padrao.cofins;
  return {
    pis,
    cofins,
    naoCumulativo,
    personalizado:
      pis !== padrao.pis || cofins !== padrao.cofins || (e.regime === 'Lucro Real' && pedido === 'Cumulativo'),
  };
}

export const REGIMES_EMPRESA = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'] as const;
export type RegimeEmpresa = (typeof REGIMES_EMPRESA)[number];

/** Regime do cliente/fornecedor: decide quem toma crédito */
export const REGIMES_PARCEIRO = [
  'Lucro Real',
  'Lucro Presumido',
  'Regime normal (não identificado)',
  'Simples Nacional',
  'MEI',
  'Pessoa física',
  'Órgão público',
  'Exterior',
  'Não informado',
] as const;
export type RegimeParceiro = (typeof REGIMES_PARCEIRO)[number];

export const ANEXOS_SIMPLES = ['III', 'IV', 'V', 'III ou V (fator R)'] as const;
export const OPCOES_SIMPLES = ['Puro (IBS/CBS no DAS)', 'Híbrido (IBS/CBS por fora)'] as const;

/** Contribuinte do IBS/CBS no regime regular a partir de 2027 (toma crédito do que compra) */
export const contribuinteRegular = (r: string | null | undefined) =>
  r === 'Lucro Real' || r === 'Lucro Presumido' || r === 'Regime normal (não identificado)';

// ---------------------------------------------------------------- cClassTrib
export interface CClassTrib {
  codigo: string;
  cst: string;
  descricao: string;
  tipoAliquota: string;
  /** Redução de alíquota em % (60 = paga 40% da alíquota) */
  reducaoCbs: number;
  reducaoIbs: number;
  /** Sem incidência (exportação, imunidade, isenção...) */
  semIncidencia: boolean;
}

export const CCLASSTRIB: CClassTrib[] = dados.cclasstrib;
export const CCLASSTRIB_META = dados.meta;
const porCodigo = new Map(CCLASSTRIB.map((c) => [c.codigo, c]));
export const cclasstrib = (codigo: string | null | undefined) => (codigo ? porCodigo.get(codigo.trim()) : undefined);
export const CCLASSTRIB_PADRAO = '000001';
export const CCLASSTRIB_EXPORTACAO = '410004';

// ---------------------------------------------------------------- cenários de alíquotas
/** Alíquotas de REFERÊNCIA de um ano (%): CBS e IBS total (estadual + municipal) */
export interface AliquotasReferencia {
  ano: number;
  cbs: number;
  ibs: number;
}

export interface CenarioPadrao {
  nome: string;
  descricao: string;
  anos: AliquotasReferencia[];
}

const anos = (cbs2728: number, cbs: number, ibs: number) =>
  [2027, 2028, 2029, 2030, 2031, 2032, 2033].map((ano) => ({ ano, cbs: ano <= 2028 ? cbs2728 : cbs, ibs }));

/** Cenários que o sistema traz prontos (editáveis no cadastro de cenários) */
export const CENARIOS_PADRAO: CenarioPadrao[] = [
  {
    nome: 'SERT/CGIBS — 27,91%',
    descricao:
      'CBS de referência de 11,3% em 2027/2028 (cálculo do TCU, out/2026, pendente de resolução do Senado). A partir de 2029, ' +
      'alíquota-padrão total de 27,91% citada na Resolução CGIBS nº 14/2026 (IBS 18,70% + CBS 9,21%).',
    anos: anos(11.3, 9.21, 18.7),
  },
  {
    nome: 'Teto da LC 214 — 26,5%',
    descricao:
      'CBS de 11,3% em 2027/2028 (TCU) e, a partir de 2029, a soma limitada a 26,5% (CBS 8,8% + IBS 17,7%), ' +
      'referência usada nas estimativas oficiais anteriores.',
    anos: anos(11.3, 8.8, 17.7),
  },
  {
    nome: 'Conservador — CBS 11,3% mantida',
    descricao:
      'Estresse: CBS de 11,3% (TCU) em todos os anos e IBS de 18,70% (CGIBS). Soma de 30% ao fim da transição.',
    anos: anos(11.3, 11.3, 18.7),
  },
];

/** Regras da transição para um ano, a partir das alíquotas de referência do cenário */
export interface RegrasAno {
  ano: number;
  /** PIS/Cofins ainda cobrados (até 2026) */
  pisCofins: boolean;
  /** Alíquotas cheias aplicáveis no ano (%) */
  cbs: number;
  ibs: number;
  /** Fração do ISS que ainda vale (1 = integral; 0,9 em 2029...; 0 em 2033) */
  fatorIss: number;
  /** Fração do IBS de referência aplicada (2029: 10% ... 2033: 100%) */
  fatorIbs: number;
}

export function regrasDoAno(ano: number, ref: AliquotasReferencia | undefined): RegrasAno {
  if (ano <= ANO_BASE) return { ano, pisCofins: true, cbs: 0, ibs: 0, fatorIss: 1, fatorIbs: 0 };
  if (!ref) throw new Error(`Cenário sem alíquotas de referência para ${ano}`);
  // 2027 e 2028: CBS de referência − 0,1 p.p.; IBS de 0,05% estadual + 0,05% municipal (art. 125-127 ADCT)
  if (ano <= 2028) return { ano, pisCofins: false, cbs: ref.cbs - 0.1, ibs: 0.1, fatorIss: 1, fatorIbs: 0 };
  // 2029 a 2032: ISS reduzido em 10%, 20%, 30% e 40%; IBS cresce na mesma proporção; 2033: só IBS
  const fatorIbs = ano >= 2033 ? 1 : (ano - 2028) / 10;
  return { ano, pisCofins: false, cbs: ref.cbs, ibs: ref.ibs * fatorIbs, fatorIss: 1 - fatorIbs, fatorIbs };
}

// ---------------------------------------------------------------- categorias de custo
export interface CategoriaPadrao {
  nome: string;
  /** Gera crédito de PIS/Cofins hoje (Lucro Real, não cumulativo) */
  creditaPisCofins: boolean;
  /** Gera crédito de IBS/CBS no novo sistema (regime regular) */
  creditaIbsCbs: boolean;
  /** Entra na folha do fator R (Simples) */
  folha: boolean;
  /** cClassTrib típico do que se compra (define redução de alíquota e, portanto, o crédito) */
  cclasstrib?: string;
  observacao: string;
}

export const CATEGORIAS_PADRAO: CategoriaPadrao[] = [
  {
    nome: 'Folha de pagamento e pró-labore',
    creditaPisCofins: false,
    creditaIbsCbs: false,
    folha: true,
    observacao:
      'Folha não gera crédito em nenhum dos dois sistemas: é o principal ponto de atenção das empresas de serviços.',
  },
  {
    nome: 'Encargos sobre a folha (INSS, FGTS)',
    creditaPisCofins: false,
    creditaIbsCbs: false,
    folha: true,
    observacao: 'Entra no fator R; sem crédito.',
  },
  {
    nome: 'Benefícios a empregados (VR, VA, plano de saúde)',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    observacao:
      'A LC 214 trata como não sendo de uso pessoal alguns benefícios fornecidos aos empregados; confirme o enquadramento de cada benefício com o contador.',
  },
  {
    nome: 'Serviços de terceiros PJ (subcontratação)',
    creditaPisCofins: true,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'Insumo típico: crédito hoje (Lucro Real) e no novo sistema.',
  },
  {
    nome: 'Software, licenças e nuvem',
    creditaPisCofins: true,
    creditaIbsCbs: true,
    folha: false,
    observacao:
      'Fornecedor no exterior: importação de serviço, tributada e creditada pelo próprio adquirente (efeito nulo).',
  },
  {
    nome: 'Aluguel de imóvel',
    creditaPisCofins: true,
    creditaIbsCbs: true,
    folha: false,
    cclasstrib: '200027',
    observacao:
      'Locação com redução de 70%: o crédito acompanha a alíquota reduzida. Locador pessoa física não gera crédito.',
  },
  {
    nome: 'Energia, telecom e internet',
    creditaPisCofins: true,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'Energia já gera crédito de PIS/Cofins; telecom depende do caso.',
  },
  {
    nome: 'Contabilidade, jurídico e consultorias',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    cclasstrib: '200052',
    observacao: 'Profissões intelectuais com redução de 30%.',
  },
  {
    nome: 'Marketing e publicidade',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'Crédito amplo no novo sistema.',
  },
  {
    nome: 'Viagens e hospedagem',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    cclasstrib: '200048',
    observacao: 'Hotelaria com redução de 40%.',
  },
  {
    nome: 'Material de escritório e consumo',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'Itens de uso pessoal não geram crédito.',
  },
  {
    nome: 'Equipamentos e imobilizado',
    creditaPisCofins: true,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'No novo sistema o crédito é imediato (hoje vem pela depreciação).',
  },
  {
    nome: 'Tributos e taxas',
    creditaPisCofins: false,
    creditaIbsCbs: false,
    folha: false,
    observacao: 'Sem crédito.',
  },
  {
    nome: 'Despesas financeiras e tarifas',
    creditaPisCofins: false,
    creditaIbsCbs: false,
    folha: false,
    observacao: 'Serviços financeiros têm regime específico; o simulador não considera crédito.',
  },
  {
    nome: 'Outras despesas',
    creditaPisCofins: false,
    creditaIbsCbs: true,
    folha: false,
    observacao: 'Revise o enquadramento das despesas relevantes.',
  },
];
