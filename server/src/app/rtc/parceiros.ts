// Clientes e fornecedores de UMA empresa (os que aparecem nas receitas ou nos custos dela), com os totais de 2026.
import type { ParceiroDaEmpresa } from '@frame/shared';
import type { Db } from '../../db/knex';

export async function parceirosDaEmpresa(db: Db, empresaId: number): Promise<ParceiroDaEmpresa[]> {
  const somar = async (tabela: 'receitas' | 'custos', campo: 'cliente_id' | 'fornecedor_id') =>
    new Map(
      (
        (await db(tabela)
          .where({ empresa_id: empresaId })
          .whereNull('excluido_em')
          .whereNotNull(campo)
          .groupBy(campo)
          .select(campo)
          .sum({ total: 'valor' })
          .count({ n: '*' })) as Record<string, unknown>[]
      ).map((r) => [Number(r[campo]), { total: Number(r.total) || 0, n: Number(r.n) || 0 }]),
    );
  const vendas = await somar('receitas', 'cliente_id');
  const compras = await somar('custos', 'fornecedor_id');
  const ids = [...new Set([...vendas.keys(), ...compras.keys()])];
  if (!ids.length) return [];
  const linhas = (await db('parceiros')
    .whereIn('id', ids)
    .select('id', 'nome', 'documento', 'tipo', 'regime', 'uf', 'consultado_em')) as Record<string, unknown>[];
  return linhas
    .map((p) => {
      const id = Number(p.id);
      return {
        id,
        nome: String(p.nome),
        documento: (p.documento as string) ?? null,
        tipo: String(p.tipo ?? ''),
        regime: String(p.regime ?? 'Não informado'),
        uf: (p.uf as string) ?? null,
        consultado: !!p.consultado_em,
        faturado: Math.round((vendas.get(id)?.total ?? 0) * 100) / 100,
        notas: vendas.get(id)?.n ?? 0,
        comprado: Math.round((compras.get(id)?.total ?? 0) * 100) / 100,
        lancamentos: compras.get(id)?.n ?? 0,
      };
    })
    .sort((a, b) => b.faturado + b.comprado - (a.faturado + a.comprado));
}
