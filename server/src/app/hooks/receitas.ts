// Receita: normaliza item da LC 116 e NBS, sugere o cClassTrib e grava as reduções de alíquota.
import { cclasstrib } from '@frame/shared';
import type { EntityHooks } from '../../hooks/types';
import { badRequest } from '../../utils/http';
import { normalizarItem, normalizarNbs, sugerirCClassTrib } from '../rtc/catalogo';

export const receitasHooks: EntityHooks = {
  async beforeSave(data, ctx) {
    const v = { ...(ctx.current ?? {}), ...data } as Record<string, unknown>;
    if ('item_lc116' in data) data.item_lc116 = normalizarItem(data.item_lc116) || null;
    if ('nbs' in data) data.nbs = normalizarNbs(data.nbs) || null;
    const item = normalizarItem(v.item_lc116);
    const nbs = normalizarNbs(v.nbs);

    // cliente no exterior → exportação de serviço (na criação, se não informado)
    if (ctx.mode === 'create' && !data.exportacao && v.cliente_id) {
      const cli = await ctx.db('parceiros').where({ id: v.cliente_id }).first('regime');
      if (cli?.regime === 'Exterior') data.exportacao = true;
    }

    let codigo = String(v.cclasstrib ?? '').trim();
    if (!codigo) {
      const emp = v.empresa_id ? await ctx.db('empresas').where({ id: v.empresa_id }).first('cclasstrib_padrao') : null;
      codigo = sugerirCClassTrib(nbs, item, emp?.cclasstrib_padrao as string | undefined);
    }
    const ct = cclasstrib(codigo);
    if (!ct)
      throw badRequest('Verifique os campos', { cclasstrib: `cClassTrib ${codigo} não existe na tabela oficial` });
    data.cclasstrib = codigo;
    data.reducao_cbs = ct.semIncidencia ? 100 : ct.reducaoCbs;
    data.reducao_ibs = ct.semIncidencia ? 100 : ct.reducaoIbs;
    data.reducao = data.reducao_cbs;
  },
};
