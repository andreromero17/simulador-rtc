import type { Knex } from 'knex';

export const name = '20261121184754_pis_cofins_empresa';

export async function up(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.text('regime_pis_cofins');
    t.double('aliquota_pis');
    t.double('aliquota_cofins');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('empresas', (t) => {
    t.dropColumn('regime_pis_cofins');
    t.dropColumn('aliquota_pis');
    t.dropColumn('aliquota_cofins');
  });
}
