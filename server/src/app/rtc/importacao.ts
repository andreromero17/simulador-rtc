// =============================================================================
// Importação das planilhas de 2026: uma pasta de trabalho (.xlsx) com as abas "Receitas" e "Custos".
// Cria sozinho os clientes e fornecedores pelo CNPJ/CPF (ou nome), liga as categorias pelo nome e grava
// cada linha pelas mesmas regras do cadastro manual (hooks: cClassTrib, reduções...).
// =============================================================================
import ExcelJS from 'exceljs';
import {
  REGIMES_PARCEIRO,
  getEntity,
  isValidCNPJ,
  isValidCPF,
  maskDocument,
  onlyDigits,
  parseMoney,
  type PreviaImportacao,
  type ResultadoImportacao,
} from '@frame/shared';
import type { Db } from '../../db/knex';
import { addLog } from '../../services/logs';
import { createRecord, type OpCtx } from '../../services/records';
import { HttpError } from '../../utils/http';
import { nowLocal } from '../../utils/time';

export const MAX_LINHAS = 20_000;

const norm = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Colunas aceitas (cabeçalho normalizado → campo) */
const COLUNAS_RECEITA: Record<string, string[]> = {
  competencia: ['competencia', 'mes', 'mesdecompetencia', 'data', 'dataemissao', 'emissao'],
  documento: [
    'cnpjcliente',
    'cpfcnpjcliente',
    'documentocliente',
    'cnpjcpfcliente',
    'cnpj',
    'cpfcnpj',
    'cnpjdotomador',
    'cnpjtomador',
  ],
  nome: ['cliente', 'nomecliente', 'razaosocialcliente', 'razaosocial', 'tomador', 'nometomador'],
  regime: ['regimecliente', 'regime'],
  uf: ['ufcliente', 'uf'],
  descricao: ['descricao', 'servico', 'descricaodoservico', 'discriminacao'],
  item_lc116: ['itemlc116', 'item', 'lc116', 'codigoservico', 'itemdalistadeservicos', 'subitem'],
  nbs: ['nbs', 'codigonbs'],
  cclasstrib: ['cclasstrib', 'classificacaotributaria'],
  valor: ['valor', 'valorbruto', 'valordoservico', 'valorservico', 'valortotal', 'faturamento'],
  aliquota_iss: ['aliquotaiss', 'iss', 'aliqiss'],
  exportacao: ['exportacao', 'exportacaodeservico', 'exterior'],
  documento_fiscal: [
    'nota',
    'numeronota',
    'nf',
    'nfse',
    'numerodanota',
    'documentofiscal',
    'numero',
    'ndanota',
    'nnota',
    'nodanota',
  ],
};
const COLUNAS_CUSTO: Record<string, string[]> = {
  competencia: ['competencia', 'mes', 'data', 'datapagamento', 'vencimento'],
  documento: ['cnpjfornecedor', 'cpfcnpjfornecedor', 'documentofornecedor', 'cnpj', 'cpfcnpj'],
  nome: ['fornecedor', 'nomefornecedor', 'razaosocialfornecedor', 'razaosocial', 'favorecido'],
  regime: ['regimefornecedor', 'regime'],
  uf: ['uffornecedor', 'uf'],
  categoria: ['categoria', 'tipo', 'conta', 'natureza', 'classificacao'],
  descricao: ['descricao', 'historico', 'item'],
  cclasstrib: ['cclasstrib'],
  valor: ['valor', 'valorpago', 'valortotal', 'valorbruto'],
  documento_fiscal: [
    'nota',
    'numeronota',
    'nf',
    'documento',
    'documentofiscal',
    'numero',
    'ndocumento',
    'ndanota',
    'nnota',
  ],
};

export interface LinhaImportacao {
  linha: number;
  aba: 'Receitas' | 'Custos';
  dados: Record<string, string>;
  erros: string[];
}

// ---------------------------------------------------------------- leitura
function texto(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getUTCFullYear()}-${p(v.getUTCMonth() + 1)}-${p(v.getUTCDate())}`;
  }
  if (typeof v === 'object') {
    if ('result' in v) return texto(v.result as ExcelJS.CellValue);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    return '';
  }
  return String(v).trim();
}

interface Aba {
  nome: 'Receitas' | 'Custos';
  linhas: { linha: number; dados: Record<string, string> }[];
  ignoradas: string[];
}

function lerAba(ws: ExcelJS.Worksheet, nome: Aba['nome'], mapa: Record<string, string[]>): Aba {
  // cabeçalho: primeira linha com ao menos 2 colunas reconhecidas (aceita títulos acima da tabela)
  let cab = 0;
  const colunas: Record<number, string> = {};
  const ignoradas: string[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, 15) && !cab; r++) {
    const row = ws.getRow(r);
    const achadas: Record<number, string> = {};
    for (let c = 1; c <= ws.columnCount; c++) {
      const h = norm(texto(row.getCell(c).value));
      const campo = Object.entries(mapa).find(([, aliases]) => aliases.includes(h))?.[0];
      if (campo && !Object.values(achadas).includes(campo)) achadas[c] = campo;
    }
    if (Object.keys(achadas).length >= 2) {
      cab = r;
      Object.assign(colunas, achadas);
      for (let c = 1; c <= ws.columnCount; c++) {
        const h = texto(row.getCell(c).value);
        if (h && !achadas[c]) ignoradas.push(`${nome}: ${h}`);
      }
    }
  }
  if (!cab) return { nome, linhas: [], ignoradas };
  const linhas: Aba['linhas'] = [];
  for (let r = cab + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const dados: Record<string, string> = {};
    for (const [c, campo] of Object.entries(colunas)) dados[campo] = texto(row.getCell(Number(c)).value);
    if (Object.values(dados).every((v) => !v)) continue;
    linhas.push({ linha: r, dados });
  }
  return { nome, linhas, ignoradas };
}

async function lerPasta(buf: Buffer) {
  if (!buf.length) throw new HttpError(422, 'Arquivo vazio');
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new HttpError(422, 'Não foi possível ler a planilha. Envie um arquivo .xlsx.');
  }
  const acha = (...prefixos: string[]) => wb.worksheets.find((w) => prefixos.some((p) => norm(w.name).startsWith(p)));
  const wsR = acha('receita', 'faturamento', 'vendas');
  const wsC = acha('custo', 'despesa', 'compras', 'pagamento');
  if (!wsR && !wsC)
    throw new HttpError(422, 'A planilha precisa de uma aba "Receitas" e/ou uma aba "Custos". Baixe o modelo.');
  const abas = [wsR && lerAba(wsR, 'Receitas', COLUNAS_RECEITA), wsC && lerAba(wsC, 'Custos', COLUNAS_CUSTO)].filter(
    Boolean,
  ) as Aba[];
  const total = abas.reduce((s, a) => s + a.linhas.length, 0);
  if (total > MAX_LINHAS) throw new HttpError(422, `Limite de ${MAX_LINHAS} linhas por importação`);
  return abas;
}

// ---------------------------------------------------------------- conversões
const MESES: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

/** 2026-01-15 · 15/01/2026 · 01/2026 · 2026-01 · jan/2026 · número de série do Excel → 2026-01-01 */
export function competenciaDe(v: string): string | null {
  const c = competenciaBruta(v);
  if (!c) return null;
  const mes = Number(c.slice(5, 7));
  return mes >= 1 && mes <= 12 ? c : null;
}

function competenciaBruta(v: string): string | null {
  const s = v.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-01`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-01`;
  m = /^(\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1]!.padStart(2, '0')}-01`;
  m = /^([a-zç]{3})[a-zç]*[/\-\s]*(\d{4})$/.exec(s);
  if (m && MESES[m[1]!]) return `${m[2]}-${String(MESES[m[1]!]).padStart(2, '0')}-01`;
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Math.round((Number(s) - 25569) * 86_400_000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }
  return null;
}

const numero = (v: string) => (/^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : parseMoney(v));
const simNao = (v: string) => ['sim', 's', 'x', '1', 'true', 'verdadeiro', 'yes'].includes(norm(v));

function regimeDe(v: string): string | null {
  const n = norm(v);
  if (!n) return null;
  const direto = REGIMES_PARCEIRO.find((r) => norm(r) === n);
  if (direto) return direto;
  if (n.includes('simples')) return 'Simples Nacional';
  if (n === 'mei' || n.includes('microempreendedor')) return 'MEI';
  if (n.includes('real')) return 'Lucro Real';
  if (n.includes('presumido')) return 'Lucro Presumido';
  if (n.includes('fisica') || n === 'pf') return 'Pessoa física';
  if (n.includes('public') || n.includes('governo')) return 'Órgão público';
  if (n.includes('exterior') || n.includes('estrangeir')) return 'Exterior';
  return null;
}

// ---------------------------------------------------------------- processamento
interface Contexto {
  db: Db;
  empresaId: number;
  categorias: Map<string, number>;
  parceirosPorDoc: Map<string, { id: number; tipo: string }>;
  parceirosPorNome: Map<string, { id: number; tipo: string }>;
}

async function contexto(db: Db, empresaId: number): Promise<Contexto> {
  const emp = await db('empresas').where({ id: empresaId }).first('id');
  if (!emp) throw new HttpError(404, 'Empresa não encontrada');
  const categorias = new Map(
    (await db('categorias_custo').select('id', 'nome')).map((c) => [norm(c.nome), Number(c.id)] as const),
  );
  const parceiros = await db('parceiros').whereNull('excluido_em').select('id', 'nome', 'documento', 'tipo');
  return {
    db,
    empresaId,
    categorias,
    parceirosPorDoc: new Map(
      parceiros.filter((p) => p.documento).map((p) => [onlyDigits(p.documento), { id: Number(p.id), tipo: p.tipo }]),
    ),
    parceirosPorNome: new Map(parceiros.map((p) => [norm(p.nome), { id: Number(p.id), tipo: p.tipo }])),
  };
}

/** Acha a categoria pelo nome: igual, começo igual ou palavras-chave; senão "Outras despesas" */
function categoriaDe(ctx: Contexto, nome: string): number | undefined {
  const n = norm(nome);
  if (!n) return ctx.categorias.get(norm('Outras despesas'));
  if (ctx.categorias.has(n)) return ctx.categorias.get(n);
  for (const [k, id] of ctx.categorias) if (k.startsWith(n) || n.startsWith(k)) return id;
  const chaves: [RegExp, string][] = [
    [/salario|folha|prolabore|ferias|13|rescis/, 'Folha de pagamento e pró-labore'],
    [/inss|fgts|encargo|previdenc/, 'Encargos sobre a folha (INSS, FGTS)'],
    [/vale|beneficio|planodesaude|refeic|alimentac|odonto/, 'Benefícios a empregados (VR, VA, plano de saúde)'],
    [/terceir|subcontrat|freelanc|prestador|pj/, 'Serviços de terceiros PJ (subcontratação)'],
    [/software|licenc|nuvem|cloud|saas|aws|azure|google|hosped/, 'Software, licenças e nuvem'],
    [/aluguel|locacao|condominio/, 'Aluguel de imóvel'],
    [/energia|luz|telefon|internet|telecom|celular/, 'Energia, telecom e internet'],
    [/contab|juridic|advoc|consultor|auditor/, 'Contabilidade, jurídico e consultorias'],
    [/marketing|publicid|propaganda|anuncio|midia/, 'Marketing e publicidade'],
    [/viagem|hotel|hosped|passagem|uber|taxi|deslocam/, 'Viagens e hospedagem'],
    [/material|escritorio|limpeza|copa|consumo/, 'Material de escritório e consumo'],
    [/equipament|computador|notebook|imobiliz|movel|maquina/, 'Equipamentos e imobilizado'],
    [/imposto|tributo|taxa|iptu|ipva|das|darf/, 'Tributos e taxas'],
    [/juro|tarifa|banc|iof|financeir/, 'Despesas financeiras e tarifas'],
  ];
  for (const [re, cat] of chaves) if (re.test(n)) return ctx.categorias.get(norm(cat));
  return undefined;
}

interface Preparada {
  aba: Aba['nome'];
  linha: number;
  registro: Record<string, unknown>;
  parceiro: { documento: string | null; nome: string; regime: string | null; uf: string | null } | null;
}

function preparar(ctx: Contexto, abas: Aba[], previa: PreviaImportacao): Preparada[] {
  const out: Preparada[] = [];
  const faltaCategoria = new Set<string>();
  for (const aba of abas) {
    const resumo = aba.nome === 'Receitas' ? previa.receitas : previa.custos;
    const comps = new Set<string>();
    for (const { linha, dados } of aba.linhas) {
      resumo.linhas++;
      const erros: string[] = [];
      const competencia = competenciaDe(dados.competencia ?? '');
      if (!competencia) erros.push('competência inválida ou vazia (use 01/2026 ou 2026-01)');
      const valor = numero(dados.valor ?? '');
      if (!Number.isFinite(valor) || !dados.valor) erros.push('valor inválido ou vazio');
      else if (valor < 0) erros.push('valor negativo (lance devoluções/estornos como redução do valor)');
      const dig = onlyDigits(dados.documento);
      let documento: string | null = null;
      if (dig) {
        if ((dig.length === 14 && isValidCNPJ(dig)) || (dig.length === 11 && isValidCPF(dig)))
          documento = maskDocument(dig, dig.length === 14 ? 'cnpj' : 'cpf');
        else if (dig.length <= 11 && dig.length >= 9 && isValidCNPJ(dig.padStart(14, '0')))
          documento = maskDocument(dig.padStart(14, '0'), 'cnpj'); // Excel comeu os zeros à esquerda
        else if (dig.length < 11 && isValidCPF(dig.padStart(11, '0')))
          documento = maskDocument(dig.padStart(11, '0'), 'cpf');
        else erros.push(`CNPJ/CPF inválido: ${dados.documento}`);
      }
      const nome = (dados.nome ?? '').trim();
      const parceiro =
        documento || nome
          ? {
              documento,
              nome: nome || documento!,
              regime: regimeDe(dados.regime ?? ''),
              uf: dados.uf?.slice(0, 2).toUpperCase() || null,
            }
          : null;

      const registro: Record<string, unknown> = {
        empresa_id: ctx.empresaId,
        competencia,
        valor: Math.round(valor * 100) / 100,
        documento_fiscal: dados.documento_fiscal || null,
        cclasstrib: dados.cclasstrib?.trim() || null,
      };
      if (aba.nome === 'Receitas') {
        registro.descricao =
          dados.descricao || (dados.item_lc116 ? `Serviço ${dados.item_lc116}` : 'Receita de serviço');
        registro.item_lc116 = dados.item_lc116 || null;
        registro.nbs = dados.nbs || null;
        registro.exportacao = simNao(dados.exportacao ?? '');
        if (dados.aliquota_iss) {
          const a = numero(dados.aliquota_iss.replace('%', ''));
          registro.aliquota_iss = a > 0 && a < 1 ? a * 100 : a;
        }
      } else {
        const cat = categoriaDe(ctx, dados.categoria ?? '');
        if (!cat) {
          faltaCategoria.add(dados.categoria ?? '');
          registro.categoria_id = ctx.categorias.get(norm('Outras despesas'));
        } else registro.categoria_id = cat;
        if (!registro.categoria_id) erros.push(`categoria não encontrada: ${dados.categoria}`);
        registro.descricao = dados.descricao || dados.categoria || 'Custo/despesa';
      }
      if (erros.length) {
        previa.erros.push({ aba: aba.nome, linha, erro: erros.join('; ') });
        continue;
      }
      resumo.validas++;
      resumo.total += registro.valor as number;
      comps.add(String(competencia).slice(0, 7));
      out.push({ aba: aba.nome, linha, registro, parceiro });
    }
    resumo.competencias = [...comps].sort();
    resumo.total = Math.round(resumo.total * 100) / 100;
  }
  previa.categoriasNaoEncontradas = [...faltaCategoria].filter(Boolean);
  // parceiros novos × existentes
  const vistos = new Set<string>();
  for (const p of out) {
    if (!p.parceiro) continue;
    const k = p.parceiro.documento ? `d:${onlyDigits(p.parceiro.documento)}` : `n:${norm(p.parceiro.nome)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const existe = p.parceiro.documento
      ? ctx.parceirosPorDoc.has(onlyDigits(p.parceiro.documento))
      : ctx.parceirosPorNome.has(norm(p.parceiro.nome));
    if (existe) previa.parceirosExistentes++;
    else previa.parceirosNovos++;
  }
  return out;
}

const vazia = (): PreviaImportacao => ({
  receitas: { linhas: 0, validas: 0, total: 0, competencias: [] },
  custos: { linhas: 0, validas: 0, total: 0, competencias: [] },
  parceirosNovos: 0,
  parceirosExistentes: 0,
  categoriasNaoEncontradas: [],
  colunasIgnoradas: [],
  erros: [],
});

export async function previaImportacao(db: Db, empresaId: number, buf: Buffer): Promise<PreviaImportacao> {
  const abas = await lerPasta(buf);
  const ctx = await contexto(db, empresaId);
  const previa = vazia();
  previa.colunasIgnoradas = abas.flatMap((a) => a.ignoradas);
  preparar(ctx, abas, previa);
  return previa;
}

/**
 * Grava. `substituir` apaga antes as receitas/custos da empresa nas competências presentes no arquivo
 * (para reimportar o mesmo período sem duplicar).
 */
export async function importar(
  c: OpCtx,
  empresaId: number,
  buf: Buffer,
  nomeArquivo: string,
  substituir: boolean,
): Promise<ResultadoImportacao> {
  const abas = await lerPasta(buf);
  const previa = vazia();
  previa.colunasIgnoradas = abas.flatMap((a) => a.ignoradas);
  const entParceiro = getEntity('parceiros')!;
  const entReceita = getEntity('receitas')!;
  const entCusto = getEntity('custos')!;
  const importadas = { receitas: 0, custos: 0, parceiros: 0, substituidas: 0 };

  await c.db.transaction(async (trx) => {
    const op: OpCtx = { ...c, db: trx, semLog: true };
    const ctx = await contexto(trx, empresaId);
    const linhas = preparar(ctx, abas, previa);

    if (substituir) {
      const agora = nowLocal();
      for (const [tabela, comps] of [
        ['receitas', previa.receitas.competencias],
        ['custos', previa.custos.competencias],
      ] as const) {
        if (!comps.length) continue;
        importadas.substituidas += await trx(tabela)
          .where({ empresa_id: empresaId })
          .whereNull('excluido_em')
          .whereIn(
            'competencia',
            comps.map((m) => `${m}-01`),
          )
          .update({ excluido_em: agora });
      }
    }

    const parceiroId = async (p: Preparada['parceiro'], papel: 'Cliente' | 'Fornecedor') => {
      if (!p) return null;
      const achado = p.documento
        ? ctx.parceirosPorDoc.get(onlyDigits(p.documento))
        : ctx.parceirosPorNome.get(norm(p.nome));
      if (achado) {
        if (achado.tipo !== papel && achado.tipo !== 'Cliente e fornecedor') {
          await trx('parceiros').where({ id: achado.id }).update({ tipo: 'Cliente e fornecedor' });
          achado.tipo = 'Cliente e fornecedor';
        }
        return achado.id;
      }
      const novo = await createRecord(op, 'parceiros', entParceiro, {
        nome: p.nome.slice(0, 150),
        documento: p.documento,
        tipo: papel,
        regime: p.regime ?? (p.documento && onlyDigits(p.documento).length === 11 ? 'Pessoa física' : 'Não informado'),
        uf: p.uf,
      });
      const ref = { id: Number(novo.id), tipo: papel as string };
      if (p.documento) ctx.parceirosPorDoc.set(onlyDigits(p.documento), ref);
      ctx.parceirosPorNome.set(norm(p.nome), ref);
      importadas.parceiros++;
      return ref.id;
    };

    for (const l of linhas) {
      try {
        if (l.aba === 'Receitas') {
          const cliente_id = await parceiroId(l.parceiro, 'Cliente');
          await createRecord(op, 'receitas', entReceita, { ...l.registro, cliente_id });
          importadas.receitas++;
        } else {
          const fornecedor_id = await parceiroId(l.parceiro, 'Fornecedor');
          await createRecord(op, 'custos', entCusto, { ...l.registro, fornecedor_id });
          importadas.custos++;
        }
      } catch (err) {
        if (!(err instanceof HttpError)) throw err;
        const det = err.fields ? Object.values(err.fields).join('; ') : err.message;
        previa.erros.push({ aba: l.aba, linha: l.linha, erro: det });
      }
    }
    await addLog(
      trx,
      {
        entidade: 'receitas',
        acao: 'importação',
        detalhe:
          `${importadas.receitas} receita(s), ${importadas.custos} custo(s) e ${importadas.parceiros} cliente(s)/fornecedor(es) ` +
          `de ${nomeArquivo}${importadas.substituidas ? ` (${importadas.substituidas} substituída(s))` : ''}`,
      },
      { id: c.user.id, nome: c.user.nome, ip: c.ip },
    );
  });
  return { ...previa, importadas };
}

// ---------------------------------------------------------------- modelo
export async function modeloPlanilha(categorias: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const cab = (ws: ExcelJS.Worksheet) => {
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F6FED' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };
  const r = wb.addWorksheet('Receitas');
  r.columns = [
    { header: 'Competência', key: 'c', width: 13 },
    { header: 'Nº da nota', key: 'n', width: 11 },
    { header: 'CNPJ cliente', key: 'd', width: 20 },
    { header: 'Cliente', key: 'cl', width: 32 },
    { header: 'Regime cliente', key: 'rg', width: 22 },
    { header: 'Descrição', key: 'ds', width: 36 },
    { header: 'Item LC 116', key: 'i', width: 12 },
    { header: 'NBS', key: 'nbs', width: 12 },
    { header: 'cClassTrib', key: 'ct', width: 11 },
    { header: 'Alíquota ISS', key: 'iss', width: 12 },
    { header: 'Exportação', key: 'ex', width: 11 },
    { header: 'Valor bruto', key: 'v', width: 14 },
  ];
  cab(r);
  r.addRow([
    '01/2026',
    '1001',
    '11.222.333/0001-81',
    'Cliente Exemplo S.A.',
    'Lucro Real',
    'Desenvolvimento de sistema',
    '1.01',
    '',
    '',
    '',
    'Não',
    85000,
  ]);
  r.addRow([
    '01/2026',
    '1002',
    '',
    'Cliente no exterior Inc.',
    'Exterior',
    'Licença de software',
    '1.05',
    '',
    '',
    '',
    'Sim',
    20000,
  ]);
  r.getColumn('v').numFmt = '#,##0.00';

  const c = wb.addWorksheet('Custos');
  c.columns = [
    { header: 'Competência', key: 'c', width: 13 },
    { header: 'Nº documento', key: 'n', width: 13 },
    { header: 'CNPJ fornecedor', key: 'd', width: 20 },
    { header: 'Fornecedor', key: 'f', width: 32 },
    { header: 'Regime fornecedor', key: 'rg', width: 22 },
    { header: 'Categoria', key: 'cat', width: 40 },
    { header: 'Descrição', key: 'ds', width: 36 },
    { header: 'cClassTrib', key: 'ct', width: 11 },
    { header: 'Valor', key: 'v', width: 14 },
  ];
  cab(c);
  c.addRow(['01/2026', '', '', '', '', 'Folha de pagamento e pró-labore', 'Salários de janeiro', '', 42000]);
  c.addRow([
    '01/2026',
    '552',
    '11.444.777/0001-61',
    'Nuvem Exemplo Ltda',
    'Lucro Real',
    'Software, licenças e nuvem',
    'Hospedagem',
    '',
    6500,
  ]);
  c.getColumn('v').numFmt = '#,##0.00';
  const listaCat = wb.addWorksheet('Listas');
  listaCat.columns = [
    { header: 'Categorias de custo', key: 'a', width: 48 },
    { header: 'Regimes de clientes/fornecedores', key: 'b', width: 34 },
  ];
  listaCat.getRow(1).font = { bold: true };
  const n = Math.max(categorias.length, REGIMES_PARCEIRO.length);
  for (let i = 0; i < n; i++) listaCat.addRow([categorias[i] ?? '', REGIMES_PARCEIRO[i] ?? '']);
  for (let i = 2; i <= 2000; i++) {
    c.getCell(`F${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Listas!$A$2:$A$${categorias.length + 1}`],
    };
    c.getCell(`E${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Listas!$B$2:$B$${REGIMES_PARCEIRO.length + 1}`],
    };
    r.getCell(`E${i}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`Listas!$B$2:$B$${REGIMES_PARCEIRO.length + 1}`],
    };
  }

  const info = wb.addWorksheet('Instruções');
  info.columns = [
    { header: 'Coluna', key: 'a', width: 22 },
    { header: 'Como preencher', key: 'b', width: 100 },
  ];
  info.getRow(1).font = { bold: true };
  const linhas: [string, string][] = [
    [
      'Abas',
      'Uma aba "Receitas" (faturamento de 2026) e uma aba "Custos" (custos e despesas de 2026). Pode enviar só uma delas.',
    ],
    ['Competência', 'Mês de competência: 01/2026, 2026-01, jan/2026 ou uma data qualquer do mês.'],
    [
      'CNPJ / CPF',
      'Com ou sem pontuação. Clientes e fornecedores são criados sozinhos; depois use "Consultar CNPJs" para trazer o regime (Simples/MEI).',
    ],
    [
      'Regime',
      'Opcional. Lucro Real, Lucro Presumido, Simples Nacional, MEI, Pessoa física, Órgão público ou Exterior. Decide quem toma crédito.',
    ],
    [
      'Item LC 116',
      'Subitem da lista de serviços da NFS-e (ex.: 1.01, 17.01, 4.03). Com ele o sistema acha o NBS e a classificação tributária (cClassTrib).',
    ],
    ['NBS / cClassTrib', 'Opcionais: se informados, prevalecem sobre a sugestão automática.'],
    ['Alíquota ISS', 'Opcional, em % (2 a 5). Vazio = a da empresa.'],
    [
      'Exportação',
      'Sim para serviço exportado (sem ISS, PIS/Cofins, IBS e CBS). Cliente com regime "Exterior" já é tratado como exportação.',
    ],
    ['Valor', 'Valor bruto da nota (receitas) ou valor pago (custos), em reais: 1.234,56.'],
    [
      'Categoria',
      'Uma das categorias da aba Listas (ou parecida: "Salários", "AWS", "Aluguel" são reconhecidos). Define o crédito de PIS/Cofins e de IBS/CBS.',
    ],
    [
      'Folha',
      'Lance folha, pró-labore e encargos como custos (sem fornecedor): entram no fator R do Simples e mostram o peso do que não gera crédito.',
    ],
  ];
  for (const l of linhas) info.addRow(l);
  info.getColumn('b').alignment = { wrapText: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
