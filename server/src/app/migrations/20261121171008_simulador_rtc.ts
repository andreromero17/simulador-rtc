import type { Knex } from 'knex';

export const name = '20261121171008_simulador_rtc';

export async function up(knex: Knex) {
  await knex.schema.createTable('empresas', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('cnpj');
    t.text('segmento');
    t.text('municipio');
    t.text('uf');
    t.text('regime');
    t.double('aliquota_iss');
    t.text('cclasstrib_padrao');
    t.text('anexo_simples');
    t.text('opcao_simples');
    t.decimal('rbt12', 15, 2);
    t.text('observacoes');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('parceiros', (t) => {
    t.increments('id');
    t.text('nome');
    t.text('documento');
    t.text('tipo');
    t.text('regime');
    t.text('uf');
    t.text('municipio');
    t.text('cnae');
    t.text('consultado_em');
    t.text('excluido_em');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('categorias_custo', (t) => {
    t.increments('id');
    t.text('nome');
    t.boolean('credita_pis_cofins');
    t.boolean('credita_ibs_cbs');
    t.boolean('folha');
    t.text('cclasstrib');
    t.text('observacao');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('receitas', (t) => {
    t.increments('id');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.date('competencia');
    t.text('documento_fiscal');
    t.integer('cliente_id').references('id').inTable('parceiros').onDelete('SET NULL');
    t.index(['cliente_id']);
    t.text('descricao');
    t.text('item_lc116');
    t.text('nbs');
    t.text('cclasstrib');
    t.double('reducao');
    t.boolean('exportacao');
    t.double('aliquota_iss');
    t.decimal('valor', 15, 2);
    t.double('reducao_cbs');
    t.double('reducao_ibs');
    t.text('excluido_em');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('custos', (t) => {
    t.increments('id');
    t.integer('empresa_id').references('id').inTable('empresas').onDelete('SET NULL');
    t.index(['empresa_id']);
    t.date('competencia');
    t.text('documento_fiscal');
    t.integer('fornecedor_id').references('id').inTable('parceiros').onDelete('SET NULL');
    t.index(['fornecedor_id']);
    t.integer('categoria_id').references('id').inTable('categorias_custo').onDelete('SET NULL');
    t.index(['categoria_id']);
    t.text('descricao');
    t.text('cclasstrib');
    t.decimal('valor', 15, 2);
    t.text('excluido_em');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('cenarios', (t) => {
    t.increments('id');
    t.text('nome');
    t.boolean('padrao');
    t.text('descricao');
    t.text('criado_em');
    t.text('atualizado_em');
  });

  await knex.schema.createTable('cenarios_anos', (t) => {
    t.increments('id');
    t.integer('cenario_id').references('id').inTable('cenarios').onDelete('CASCADE');
    t.index(['cenario_id']);
    t.double('ano');
    t.double('cbs');
    t.double('ibs');
    t.text('criado_em');
    t.text('atualizado_em');
  });
}

export async function down(knex: Knex) {
  await knex.schema.dropTableIfExists('cenarios_anos');

  await knex.schema.dropTableIfExists('cenarios');

  await knex.schema.dropTableIfExists('custos');

  await knex.schema.dropTableIfExists('receitas');

  await knex.schema.dropTableIfExists('categorias_custo');

  await knex.schema.dropTableIfExists('parceiros');

  await knex.schema.dropTableIfExists('empresas');
}
