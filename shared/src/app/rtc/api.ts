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
  categoriasNaoEncontradas: string[];
  colunasIgnoradas: string[];
  erros: { aba: string; linha: number; erro: string }[];
}

export interface ResultadoImportacao extends PreviaImportacao {
  importadas: { receitas: number; custos: number; parceiros: number; substituidas: number };
}

export interface ResultadoConsultaCnpj {
  consultados: number;
  atualizados: number;
  naoEncontrados: number;
  falhas: number;
  restantes: number;
}

export interface ServicoDoCatalogo {
  item: string;
  nbs: string;
  descricao: string;
  descricaoItem: string;
  cclasstrib: string[];
  classificacoes: { codigo: string; descricao: string; reducao: number }[];
}
