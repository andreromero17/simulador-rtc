// =============================================================================
// Consulta de CNPJ em base pública (dados abertos da Receita Federal via BrasilAPI; Minha Receita de reserva):
// razão social, UF, município, CNAE e — o que importa aqui — a opção pelo Simples Nacional / MEI.
// O Lucro Real × Presumido não é público: fica "Regime normal (não identificado)" até alguém informar.
// Fontes configuráveis por RTC_CNPJ_FONTES (URLs separadas por vírgula, com {cnpj}).
// =============================================================================
import { onlyDigits, type ResultadoConsultaCnpj as ResultadoConsulta } from '@frame/shared';
import type { Db } from '../../db/knex';
import { nowLocal } from '../../utils/time';

const FONTES_PADRAO = ['https://brasilapi.com.br/api/cnpj/v1/{cnpj}', 'https://minhareceita.org/{cnpj}'];
function fontes() {
  const env = (process.env.RTC_CNPJ_FONTES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return env.length ? env : FONTES_PADRAO;
}

export interface DadosCnpj {
  nome: string | null;
  uf: string | null;
  municipio: string | null;
  cnae: string | null;
  regime: 'Simples Nacional' | 'MEI' | 'Regime normal (não identificado)';
  situacao: string | null;
}

type Busca = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** Converte a resposta (formato BrasilAPI/Minha Receita) */
export function interpretar(j: Record<string, unknown>): DadosCnpj {
  const simples = j.opcao_pelo_simples === true || j.opcao_pelo_simples === 'S';
  const mei = j.opcao_pelo_mei === true || j.opcao_pelo_mei === 'S';
  const cnaeCod = j.cnae_fiscal ? String(j.cnae_fiscal) : null;
  const cnaeDesc = (j.cnae_fiscal_descricao as string) ?? null;
  return {
    nome: (j.razao_social as string) ?? null,
    uf: (j.uf as string) ?? null,
    municipio: (j.municipio as string) ?? null,
    cnae: cnaeCod ? `${cnaeCod}${cnaeDesc ? ` — ${cnaeDesc}` : ''}`.slice(0, 200) : null,
    regime: mei ? 'MEI' : simples ? 'Simples Nacional' : 'Regime normal (não identificado)',
    situacao: (j.descricao_situacao_cadastral as string) ?? null,
  };
}

export async function consultarCnpj(cnpj: string, busca: Busca = fetchComPrazo): Promise<DadosCnpj | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;
  for (const f of fontes()) {
    try {
      const res = await busca(f.replace('{cnpj}', d));
      if (res.status === 404) return null;
      if (!res.ok) continue;
      return interpretar((await res.json()) as Record<string, unknown>);
    } catch {
      // tenta a próxima fonte
    }
  }
  throw new Error('Serviço de consulta de CNPJ indisponível');
}

async function fetchComPrazo(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8_000);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
  } finally {
    clearTimeout(t);
  }
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Consulta os CNPJs ainda não consultados (ou os `ids` pedidos), no máximo `limite` por chamada, e grava regime,
 * UF, município e CNAE. Não sobrescreve um regime já informado à mão como Lucro Real/Presumido, a menos que a
 * empresa conste no Simples/MEI.
 */
export async function atualizarParceiros(
  db: Db,
  opts: { ids?: number[]; limite?: number; intervaloMs?: number; busca?: Busca } = {},
): Promise<ResultadoConsulta> {
  const limite = Math.min(opts.limite ?? 30, 100);
  const base = db('parceiros').whereNull('excluido_em').whereNotNull('documento');
  const q = opts.ids?.length ? base.clone().whereIn('id', opts.ids) : base.clone().whereNull('consultado_em');
  const todos = (await q.select('id', 'documento', 'regime', 'nome', 'uf', 'municipio')).filter(
    (p) => onlyDigits(p.documento).length === 14,
  );
  const lote = todos.slice(0, limite);
  const r: ResultadoConsulta = {
    consultados: 0,
    atualizados: 0,
    naoEncontrados: 0,
    falhas: 0,
    restantes: todos.length - lote.length,
  };
  for (const [i, p] of lote.entries()) {
    if (i && opts.intervaloMs !== 0) await espera(opts.intervaloMs ?? 400);
    r.consultados++;
    let dados: DadosCnpj | null;
    try {
      dados = await consultarCnpj(p.documento, opts.busca);
    } catch {
      r.falhas++;
      continue;
    }
    if (!dados) {
      r.naoEncontrados++;
      await db('parceiros').where({ id: p.id }).update({ consultado_em: nowLocal() });
      continue;
    }
    const manual = p.regime === 'Lucro Real' || p.regime === 'Lucro Presumido' || p.regime === 'Órgão público';
    const regime = dados.regime !== 'Regime normal (não identificado)' || !manual ? dados.regime : p.regime;
    await db('parceiros')
      .where({ id: p.id })
      .update({
        regime,
        uf: p.uf || dados.uf,
        municipio: p.municipio || dados.municipio,
        cnae: dados.cnae,
        consultado_em: nowLocal(),
        atualizado_em: nowLocal(),
      });
    r.atualizados++;
  }
  return r;
}
