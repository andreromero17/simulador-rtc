// Tipos das rotas próprias do simulador (/api/rtc/*), usados pelo servidor e pelas telas.
import type { AliquotasReferencia } from './parametros';
import type { ResultadoSimulacao } from './motor';

export interface RespostaSimulacao {
  empresa: Record<string, unknown>;
  cenario: { id: number; nome: string; descricao: string | null; anos: AliquotasReferencia[] };
  resultado: ResultadoSimulacao;
  /** Só no Simples: a mesma simulação com a outra opção (puro × híbrido) */
  alternativa?: { opcao: string; resultado: ResultadoSimulacao };
  contagem: { receitas: number; custos: number; semCliente: number; semFornecedor: number };
}

export interface PreviaImportacao {
  receitas: { linhas: number; validas: number; total: number; competencias: string[] };
  custos: { linhas: number; validas: number; total: number; competencias: string[] };
  parceirosNovos: number;
  parceirosExistentes: number;
  /** Já cadastrados sem CNPJ/CPF que vão receber o documento da planilha */
  parceirosCompletados: number;
  categoriasNaoEncontradas: string[];
  colunasIgnoradas: string[];
  /** Observações da leitura (ex.: aba única lida como Receitas) */
  avisos: string[];
  erros: { aba: string; linha: number; erro: string }[];
}

export interface ResultadoImportacao extends PreviaImportacao {
  importadas: {
    receitas: number;
    custos: number;
    parceiros: number;
    parceirosCompletados: number;
    substituidas: number;
  };
}

export interface ResultadoConsultaCnpj {
  consultados: number;
  atualizados: number;
  naoEncontrados: number;
  falhas: number;
  restantes: number;
  /** Quantas respostas vieram de cada serviço (ex.: { 'Minha Receita': 38, BrasilAPI: 2 }) */
  porFonte: Record<string, number>;
  /** Quantos tiveram o regime pela ECF */
  comEcf: number;
  /** Problemas encontrados nas fontes (ex.: "Minha Receita: HTTP 403"), sem repetição */
  problemas: string[];
}

export interface ServicoDoCatalogo {
  item: string;
  nbs: string;
  descricao: string;
  descricaoItem: string;
  cclasstrib: string[];
  classificacoes: { codigo: string; descricao: string; reducao: number }[];
}

/** Cliente/fornecedor de uma empresa, com os totais de 2026 (GET /api/rtc/parceiros?empresa_id=) */
export interface ParceiroDaEmpresa {
  id: number;
  nome: string;
  documento: string | null;
  tipo: string;
  regime: string;
  /** De onde veio o regime (consulta, inferência, planilha, à mão) */
  regimeFonte: string | null;
  uf: string | null;
  /** Já passou pela consulta de CNPJ */
  consultado: boolean;
  faturado: number;
  notas: number;
  comprado: number;
  lancamentos: number;
}
