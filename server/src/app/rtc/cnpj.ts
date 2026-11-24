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

type Busca = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export interface DadosCnpj {
  nome: string | null;
  uf: string | null;
  municipio: string | null;
  cnae: string | null;
  regime: 'Simples Nacional' | 'MEI' | 'Lucro Real' | 'Órgão público' | 'Regime normal (não identificado)';
  /** De onde veio o regime (mostrado no cadastro) */
  fonte: string;
  situacao: string | null;
}

/** Capital social a partir do qual a empresa é tratada como provável Lucro Real */
export const CAPITAL_PROVAVEL_LUCRO_REAL = 50_000_000;

/**
 * Converte a resposta (formato BrasilAPI/Minha Receita). A base pública mostra Simples e MEI; Lucro Real × Presumido
 * não é público, então o regime é inferido quando há um sinal forte:
 *  • administração pública (natureza jurídica 1xxx) → Órgão público;
 *  • S.A. de capital aberto (2046) → Lucro Real;
 *  • bancos, cooperativas de crédito, seguradoras e afins (CNAE 64 e 65) → Lucro Real (obrigatório por lei);
 *  • capital social a partir de R$ 50 milhões → Lucro Real (provável).
 */
export function interpretar(j: Record<string, unknown>): DadosCnpj {
  const simples = j.opcao_pelo_simples === true || j.opcao_pelo_simples === 'S';
  const mei = j.opcao_pelo_mei === true || j.opcao_pelo_mei === 'S';
  const cnaeCod = j.cnae_fiscal ? String(j.cnae_fiscal).padStart(7, '0') : null;
  const cnaeDesc = (j.cnae_fiscal_descricao as string) ?? null;
  const natureza = Number(j.codigo_natureza_juridica ?? 0);
  const capital = Number(j.capital_social ?? 0) || 0;
  const divisao = cnaeCod ? Number(cnaeCod.slice(0, 2)) : 0;
  const situacao = (j.descricao_situacao_cadastral as string) ?? null;

  let regime: DadosCnpj['regime'];
  let fonte: string;
  if (mei) [regime, fonte] = ['MEI', 'Consulta do CNPJ: optante pelo MEI'];
  else if (simples) [regime, fonte] = ['Simples Nacional', 'Consulta do CNPJ: optante pelo Simples Nacional'];
  else if (natureza >= 1000 && natureza < 2000)
    [regime, fonte] = ['Órgão público', 'Consulta do CNPJ: administração pública'];
  else if (natureza === 2046) [regime, fonte] = ['Lucro Real', 'Inferido: S.A. de capital aberto'];
  else if (divisao === 64 || divisao === 65)
    [regime, fonte] = ['Lucro Real', 'Inferido: instituição financeira ou seguradora (Lucro Real obrigatório)'];
  else if (capital >= CAPITAL_PROVAVEL_LUCRO_REAL)
    [regime, fonte] = ['Lucro Real', 'Inferido: capital social acima de R$ 50 milhões (provável Lucro Real)'];
  else
    [regime, fonte] = [
      'Regime normal (não identificado)',
      'Consulta do CNPJ: fora do Simples; Lucro Real ou Presumido não é público',
    ];
  if (situacao && situacao.toUpperCase() !== 'ATIVA') fonte += ` · situação cadastral: ${situacao}`;
  return {
    nome: (j.razao_social as string) ?? null,
    uf: (j.uf as string) ?? null,
    municipio: (j.municipio as string) ?? null,
    cnae: cnaeCod ? `${cnaeCod}${cnaeDesc ? ` — ${cnaeDesc}` : ''}`.slice(0, 200) : null,
    regime,
    fonte: fonte.slice(0, 120),
    situacao,
  };
}

/** Regime definido por alguém (à mão ou na planilha): a consulta não troca */
export function regimeManual(p: { regime?: unknown; regime_fonte?: unknown }) {
  const fonte = String(p.regime_fonte ?? '');
  if (fonte.startsWith('Informado')) return true;
  // cadastros antigos, sem origem: Real/Presumido/Órgão público só podiam ter vindo de alguém
  return !fonte && ['Lucro Real', 'Lucro Presumido', 'Órgão público'].includes(String(p.regime ?? ''));
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
  const limite = Math.min(opts.limite ?? (opts.ids?.length ? 100 : 30), 100);
  const base = db('parceiros').whereNull('excluido_em').whereNotNull('documento');
  const q = opts.ids?.length ? base.clone().whereIn('id', opts.ids) : base.clone().whereNull('consultado_em');
  const todos = (await q.select('id', 'documento', 'regime', 'regime_fonte', 'nome', 'uf', 'municipio')).filter(
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
    // regime informado à mão ou na planilha não é trocado pela consulta, exceto quando a base pública mostra
    // Simples/MEI (fato cadastral, não inferência)
    const fato = dados.regime === 'Simples Nacional' || dados.regime === 'MEI';
    const manter = regimeManual(p) && !fato;
    await db('parceiros')
      .where({ id: p.id })
      .update({
        regime: manter ? p.regime : dados.regime,
        regime_fonte: manter ? p.regime_fonte || 'Informado à mão' : dados.fonte,
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
