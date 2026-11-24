import type { Knex } from 'knex';

export const name = '20261123223328_regime_fonte';

export async function up(knex: Knex) {
  await knex.schema.alterTable('parceiros', (t) => {
    t.text('regime_fonte');
  });
}

export async function down(knex: Knex) {
  await knex.schema.alterTable('parceiros', (t) => {
    t.dropColumn('regime_fonte');
  });
}
