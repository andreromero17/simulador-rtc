// Telas próprias do simulador
import { registerPage, registerScreens } from '../lib/screens';
import Catalogo from './rtc/Catalogo';
import Importar from './rtc/Importar';
import { CustosDaEmpresa, ReceitasDaEmpresa } from './rtc/ListaDaEmpresa';
import Parceiros from './rtc/Parceiros';
import Simulacao from './rtc/Simulacao';
import './rtc/rtc.css';

export function registerAppScreens() {
  registerScreens('parceiros', { list: Parceiros });
  registerScreens('receitas', { list: ReceitasDaEmpresa });
  registerScreens('custos', { list: CustosDaEmpresa });
  registerPage({ path: 'simulacao', component: Simulacao, perm: ['receitas', 'ver'] });
  registerPage({ path: 'importar', component: Importar, perm: ['receitas', 'criar'] });
  registerPage({ path: 'catalogo', component: Catalogo, perm: ['receitas', 'ver'] });
}
