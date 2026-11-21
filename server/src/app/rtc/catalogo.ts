// =============================================================================
// Catálogo oficial de serviços (Receita Federal): item da LC 116 → NBS → cClassTrib possíveis.
// Extraído das migrações Flyway de github.com/ReceitaFederal/calculadora-rtc-regime-regular
// (tabela CLASSIF_NBS_INDOP_LC, vigente, operações onerosas no mercado interno).
// =============================================================================
import { CCLASSTRIB_PADRAO, cclasstrib, onlyDigits } from '@frame/shared';
import dados from './catalogo.json';

export interface ServicoCatalogo {
  item: string;
  nbs: string;
  descricao: string;
  cclasstrib: string[];
}

export const ITENS_LC116: { item: string; descricao: string }[] = dados.itensLc116;
export const SERVICOS: ServicoCatalogo[] = dados.servicos;
export const CATALOGO_META = dados.meta;

const porNbs = new Map<string, ServicoCatalogo[]>();
const porItem = new Map<string, ServicoCatalogo[]>();
for (const s of SERVICOS) {
  porNbs.set(s.nbs, [...(porNbs.get(s.nbs) ?? []), s]);
  porItem.set(s.item, [...(porItem.get(s.item) ?? []), s]);
}

/**
 * Item da LC 116 em qualquer formato usual → "1.01":
 *   "1.01", "01.01", "1.1", "101", "0101" e o código de tributação nacional da NFS-e com 6 dígitos
 *   ("010101", "01.01.01" — item, subitem e desdobramento; o desdobramento é ignorado).
 */
export function normalizarItem(v: unknown): string {
  const s = String(v ?? '')
    .trim()
    .replace(/,/g, '.')
    .replace(/\s*[-–].*$/, ''); // "010101 - Análise e desenvolvimento" → "010101"
  if (!s) return '';
  let m = /^(\d{1,2})\.(\d{1,2})(?:\.\d{1,2})?$/.exec(s);
  if (m) return `${Number(m[1])}.${m[2]!.padStart(2, '0')}`;
  m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${Number(m[1])}.${m[2]}`;
  m = /^(\d{1,2})(\d{2})$/.exec(s);
  if (m) return `${Number(m[1])}.${m[2]}`;
  return s;
}

/** NBS só com dígitos (9) */
export const normalizarNbs = (v: unknown) => onlyDigits(v);

export const descricaoItem = (item: string) => ITENS_LC116.find((i) => i.item === item)?.descricao;

/** cClassTrib possíveis para o serviço (pelo NBS, senão pelo item da LC 116) */
export function candidatos(nbs: string, item: string): string[] {
  const lista = (nbs && porNbs.get(nbs)) || (item && porItem.get(item)) || [];
  return [...new Set(lista.flatMap((s) => s.cclasstrib))];
}

/**
 * Sugere o cClassTrib: o padrão da empresa se for possível para o serviço; senão o único possível;
 * senão a tributação integral (000001) se estiver entre os possíveis; senão o primeiro.
 */
export function sugerirCClassTrib(nbs: string, item: string, padrao?: string | null): string {
  const pad = padrao && cclasstrib(padrao) ? padrao : CCLASSTRIB_PADRAO;
  const c = candidatos(nbs, item);
  if (!c.length) return pad;
  if (c.includes(pad)) return pad;
  if (c.length === 1) return c[0]!;
  if (c.includes(CCLASSTRIB_PADRAO)) return CCLASSTRIB_PADRAO;
  return c[0]!;
}

/** Busca no catálogo (tela de consulta): por item, NBS ou palavras da descrição */
export function buscarServicos(q: string, limite = 50) {
  const termo = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const item = normalizarItem(q);
  const nbs = normalizarNbs(q);
  const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const out = SERVICOS.filter(
    (s) =>
      !termo ||
      s.item === item ||
      (nbs.length >= 4 && s.nbs.startsWith(nbs)) ||
      termo.split(/\s+/).every((p) => sem(s.descricao).includes(p) || sem(descricaoItem(s.item) ?? '').includes(p)),
  );
  return out.slice(0, limite).map((s) => ({
    ...s,
    descricaoItem: descricaoItem(s.item) ?? '',
    classificacoes: s.cclasstrib.map((c) => {
      const ct = cclasstrib(c);
      return { codigo: c, descricao: ct?.descricao ?? '', reducao: ct?.reducaoCbs ?? 0 };
    }),
  }));
}
