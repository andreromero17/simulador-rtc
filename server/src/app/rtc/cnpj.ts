// =============================================================================
// Consulta de CNPJ em base pública (dados abertos da Receita Federal via Minha Receita; BrasilAPI de reserva):
// razão social, UF, município, CNAE, a opção pelo Simples Nacional / MEI e o regime declarado na ECF (Lucro Real ou
// Presumido, publicado anualmente pela RFB; vem da Minha Receita). Sem ECF, infere por sinais fortes ou deixa
// "Regime normal (não identificado)".
// Fontes configuráveis por RTC_CNPJ_FONTES (URLs separadas por vírgula, com {cnpj}).
// =============================================================================
import { onlyDigits, type ResultadoConsultaCnpj as ResultadoConsulta } from '@frame/shared';
import type { Db } from '../../db/knex';
import { nowLocal } from '../../utils/time';

// Minha Receita primeiro: além do cadastro, traz o regime declarado na ECF (Lucro Real/Presumido) dos dados abertos da RFB
const FONTES_PADRAO = ['https://minhareceita.org/{cnpj}', 'https://brasilapi.com.br/api/cnpj/v1/{cnpj}'];
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
  regime:
    | 'Simples Nacional'
    | 'MEI'
    | 'Lucro Real'
    | 'Lucro Presumido'
    | 'Órgão público'
    | 'Regime normal (não identificado)';
  /** De onde veio o regime (mostrado no cadastro) */
  fonte: string;
  situacao: string | null;
}

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Campo por nome sem acento (a Minha Receita publica `regime_tributário`/`forma_de_tributação`) */
function campo(o: Record<string, unknown>, nome: string): unknown {
  const k = Object.keys(o).find((x) => semAcento(x) === nome);
  return k ? o[k] : undefined;
}

export interface RegimeEcf {
  ano: number;
  forma: string;
}

/** Forma de tributação mais recente declarada na ECF (dados abertos da RFB), se houver */
export function regimeDaEcf(j: Record<string, unknown>): RegimeEcf | null {
  const lista = campo(j, 'regime_tributario');
  if (!Array.isArray(lista)) return null;
  const itens = lista
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        ano: Number(o.ano) || 0,
        forma: String(campo(o, 'forma_de_tributacao') ?? '').trim(),
        scp: String(campo(o, 'cnpj_da_scp') ?? '').trim(),
      };
    })
    .filter((x) => x.ano && x.forma && !x.scp); // ignora sociedades em conta de participação
  if (!itens.length) return null;
  const ultimo = Math.max(...itens.map((x) => x.ano));
  const doAno = itens.filter((x) => x.ano === ultimo).map((x) => semAcento(x.forma));
  // no mesmo ano pode haver mais de uma (troca de regime): Real prevalece
  const forma = doAno.find((f) => f.includes('real')) ?? doAno[0]!;
  return { ano: ultimo, forma };
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

  const ecf = regimeDaEcf(j);

  let regime: DadosCnpj['regime'];
  let fonte: string;
  // situação atual do Simples/MEI prevalece; depois o regime declarado na ECF; depois as inferências
  if (mei) [regime, fonte] = ['MEI', 'Consulta do CNPJ: optante pelo MEI'];
  else if (simples) [regime, fonte] = ['Simples Nacional', 'Consulta do CNPJ: optante pelo Simples Nacional'];
  else if (ecf?.forma.includes('real'))
    [regime, fonte] = ['Lucro Real', `Receita Federal: ECF ${ecf.ano} no Lucro Real`];
  else if (ecf?.forma.includes('presumido'))
    [regime, fonte] = ['Lucro Presumido', `Receita Federal: ECF ${ecf.ano} no Lucro Presumido`];
  else if (ecf?.forma.includes('arbitrado'))
    [regime, fonte] = ['Regime normal (não identificado)', `Receita Federal: ECF ${ecf.ano} no Lucro Arbitrado`];
  else if (ecf && (ecf.forma.includes('imune') || ecf.forma.includes('isenta')))
    [regime, fonte] = [
      natureza >= 1000 && natureza < 2000 ? 'Órgão público' : 'Regime normal (não identificado)',
      `Receita Federal: ECF ${ecf.ano} como imune/isenta do IRPJ`,
    ];
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

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const nomeFonte = (url: string) =>
  url.includes('minhareceita') ? 'Minha Receita' : url.includes('brasilapi') ? 'BrasilAPI' : new URL(url).hostname;

export async function consultarCnpj(
  cnpj: string,
  busca: Busca = fetchComPrazo,
  esperaMs = 1_500,
): Promise<DadosCnpj | null> {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return null;
  for (const f of fontes()) {
    // limite de requisições (429) ou instabilidade (5xx): espera e tenta de novo antes de ir para a próxima fonte,
    // porque só a Minha Receita traz o regime da ECF
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const res = await busca(f.replace('{cnpj}', d));
        if (res.status === 404) return null;
        if (res.status === 429 || res.status >= 500) {
          if (esperaMs) await espera(esperaMs * (tentativa + 1));
          continue;
        }
        if (!res.ok) break;
        const dados = interpretar((await res.json()) as Record<string, unknown>);
        const via = nomeFonte(f);
        dados.fonte = `${dados.fonte} · via ${via}`.slice(0, 120);
        return dados;
      } catch {
        break; // erro de rede/prazo: próxima fonte
      }
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

/**
 * Consulta os CNPJs ainda não consultados (ou os `ids` pedidos), no máximo `limite` por chamada, e grava regime,
 * UF, município e CNAE. Não sobrescreve um regime já informado à mão como Lucro Real/Presumido, a menos que a
 * empresa conste no Simples/MEI.
 */
export async function atualizarParceiros(
  db: Db,
  opts: { ids?: number[]; limite?: number; intervaloMs?: number; busca?: Busca; esperaMs?: number } = {},
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
      dados = await consultarCnpj(p.documento, opts.busca, opts.esperaMs);
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
