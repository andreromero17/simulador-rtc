// Cliente/fornecedor: CNPJ/CPF único e regime sugerido pelo tipo de documento.
import { onlyDigits } from '@frame/shared';
import type { EntityHooks } from '../../hooks/types';
import { conflict } from '../../utils/http';

export const parceirosHooks: EntityHooks = {
  async beforeSave(data, ctx) {
    const doc = (data.documento ?? ctx.current?.documento) as string | null | undefined;
    if (doc && 'documento' in data) {
      const outro = await ctx
        .db('parceiros')
        .where({ documento: doc })
        .whereNot('id', ctx.current?.id ?? 0)
        .whereNull('excluido_em')
        .first('nome');
      if (outro) throw conflict(`Já existe um cadastro com este documento: ${outro.nome}`);
    }
    const regime = data.regime ?? ctx.current?.regime;
    if ((!regime || regime === 'Não informado') && doc && onlyDigits(doc).length === 11) data.regime = 'Pessoa física';
  },
};
