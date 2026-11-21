// Menu do simulador (entre "Dashboard" e "Administração")
import type { MenuItem } from '../config/menu';

export const appMenu: MenuItem[] = [
  { label: 'Simulação', icon: 'calculator', to: '/simulacao', perm: ['receitas', 'ver'], tab: true },
  {
    label: 'Dados de 2026',
    icon: 'folder2-open',
    children: [
      { label: 'Empresas', icon: 'buildings', to: '/empresas', perm: ['empresas', 'ver'] },
      { label: 'Receitas', icon: 'arrow-up-circle', to: '/receitas', perm: ['receitas', 'ver'], tab: true },
      { label: 'Custos e despesas', icon: 'arrow-down-circle', to: '/custos', perm: ['custos', 'ver'] },
      { label: 'Clientes/fornecedores', icon: 'people', to: '/parceiros', perm: ['parceiros', 'ver'] },
      { label: 'Importar planilhas', icon: 'file-earmark-spreadsheet', to: '/importar', perm: ['receitas', 'criar'] },
    ],
  },
  {
    label: 'Parâmetros',
    icon: 'sliders2',
    children: [
      { label: 'Cenários de alíquotas', icon: 'sliders', to: '/cenarios', perm: ['cenarios', 'ver'] },
      { label: 'Categorias de custo', icon: 'tags', to: '/categorias_custo', perm: ['categorias_custo', 'ver'] },
      { label: 'Catálogo de serviços', icon: 'book', to: '/catalogo', perm: ['receitas', 'ver'] },
    ],
  },
];
