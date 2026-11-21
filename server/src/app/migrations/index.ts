// Migrações da APLICAÇÃO, em ordem de aplicação (as do núcleo ficam em src/db/migrations).
// `npm run db:diff -- descricao` cria o arquivo nesta pasta e o registra aqui sozinho.
// Migração já aplicada não se edita: crie uma nova.
import type { Migration } from '../../db/migrator';
import * as m20261121171008 from './20261121171008_simulador_rtc';
import * as m20261121171009 from './20261121171009_dados_referencia';
// @diff:imports

export const appMigrations: Migration[] = [
  m20261121171008,
  m20261121171009,
  // @diff:list
];
