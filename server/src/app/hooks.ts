// Regras de negócio das entidades do simulador (beforeSave, afterSave, beforeDelete).
import type { EntityHooks } from '../hooks/types';
import { badRequest, conflict } from '../utils/http';
import { parceirosHooks } from './hooks/parceiros';
import { receitasHooks } from './hooks/receitas';
import { cclasstrib } from '@frame/shared';

const cclasstribValido = (campo: string): EntityHooks => ({
  async beforeSave(data) {
    const v = data[campo];
    if (v == null || v === '') return;
    if (!cclasstrib(String(v).trim()))
      throw badRequest('Verifique os campos', { [campo]: `cClassTrib ${v} não existe na tabela oficial` });
    data[campo] = String(v).trim();
  },
});

export const appHooks: Record<string, EntityHooks> = {
  receitas: receitasHooks,
  parceiros: parceirosHooks,
  custos: cclasstribValido('cclasstrib'),
  categorias_custo: cclasstribValido('cclasstrib'),
  empresas: {
    async beforeSave(data) {
      const v = data.cclasstrib_padrao;
      if (v && !cclasstrib(String(v)))
        throw badRequest('Verifique os campos', { cclasstrib_padrao: `cClassTrib ${v} não existe na tabela oficial` });
    },
    async beforeDelete(current, ctx) {
      const n = await ctx.db('receitas').where({ empresa_id: current.id }).count({ n: '*' }).first();
      if (Number(n?.n ?? 0)) throw conflict('A empresa tem receitas cadastradas. Exclua-as antes.');
    },
  },
  cenarios: {
    // só um cenário padrão
    async afterSave(row, data, ctx) {
      if (data.padrao) await ctx.db('cenarios').whereNot('id', row.id).update({ padrao: false });
    },
  },
};
