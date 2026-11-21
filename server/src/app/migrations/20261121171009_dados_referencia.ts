// Dados de referência do simulador: categorias de custo e cenários de alíquotas (editáveis em Parâmetros),
// mais índices das consultas da simulação.
import type { Knex } from 'knex';
import { CATEGORIAS_PADRAO, CENARIOS_PADRAO } from '@frame/shared';

export const name = '20261121171009_dados_referencia';

const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

export async function up(knex: Knex) {
  await knex.schema.alterTable('receitas', (t) => t.index(['empresa_id', 'competencia']));
  await knex.schema.alterTable('custos', (t) => t.index(['empresa_id', 'competencia']));
  await knex.schema.alterTable('parceiros', (t) => t.index(['documento']));

  const criado_em = agora();
  for (const c of CATEGORIAS_PADRAO)
    await knex('categorias_custo').insert({
      nome: c.nome,
      credita_pis_cofins: c.creditaPisCofins,
      credita_ibs_cbs: c.creditaIbsCbs,
      folha: c.folha,
      cclasstrib: c.cclasstrib ?? null,
      observacao: c.observacao,
      criado_em,
    });
  for (const [i, c] of CENARIOS_PADRAO.entries()) {
    const [ins] = await knex('cenarios')
      .insert({ nome: c.nome, descricao: c.descricao, padrao: i === 0, criado_em })
      .returning('id');
    const id = typeof ins === 'object' ? ins.id : ins;
    for (const a of c.anos)
      await knex('cenarios_anos').insert({ cenario_id: id, ano: a.ano, cbs: a.cbs, ibs: a.ibs, criado_em });
  }
}

export async function down(knex: Knex) {
  await knex('cenarios_anos').del();
  await knex('cenarios').del();
  await knex('categorias_custo').del();
  await knex.schema.alterTable('receitas', (t) => t.dropIndex(['empresa_id', 'competencia']));
  await knex.schema.alterTable('custos', (t) => t.dropIndex(['empresa_id', 'competencia']));
  await knex.schema.alterTable('parceiros', (t) => t.dropIndex(['documento']));
}
