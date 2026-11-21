// Receitas e custos: listagem genérica sempre filtrada pela empresa ativa (filtro `empresa_id` da URL,
// que também preenche a empresa no "Novo")
import CrudList from '../../pages/CrudList';
import { BarraEmpresa } from './comum';
import { useEmpresaEscolhida, useEmpresas } from './util';

export function ListaDaEmpresa({ entity }: { entity: 'receitas' | 'custos' }) {
  const empresas = useEmpresas();
  const { id, escolher, params } = useEmpresaEscolhida(empresas, 'empresa_id', true);
  // só lista depois de a empresa estar na URL: nunca mostra, nem por um instante, dados de todas
  const pronto = !!id && params.get('empresa_id') === String(id);
  return pronto ? (
    <CrudList entity={entity} before={<BarraEmpresa empresas={empresas} valor={id} onChange={escolher} />} />
  ) : (
    <BarraEmpresa
      empresas={empresas}
      valor={id}
      onChange={escolher}
      texto={empresas && !empresas.length ? 'Cadastre uma empresa para começar.' : 'Carregando…'}
    />
  );
}

export const ReceitasDaEmpresa = () => <ListaDaEmpresa entity="receitas" />;
export const CustosDaEmpresa = () => <ListaDaEmpresa entity="custos" />;
