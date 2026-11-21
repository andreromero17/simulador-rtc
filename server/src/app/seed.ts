import { cclasstrib, maskDocument } from '@frame/shared';
import type { Db } from '../db/knex';
import { nowLocal } from '../utils/time';
import { normalizarItem, sugerirCClassTrib } from './rtc/catalogo';

/**
 * Dados de exemplo (npm run db:seed / db:reset; só desenvolvimento): cinco empresas de serviços de tipos e portes
 * diferentes, com faturamento, clientes, fornecedores e custos de 2026. A suíte de testes do frame espera um espaço
 * sem dados do sistema, então os testes chamam `seedExemplos` só quando precisam.
 */
export async function seedApp(db: Db): Promise<void> {
  if (process.env.VITEST) return;
  await seedExemplos(db);
}

// ---------------------------------------------------------------- gerador determinístico
function aleatorio(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** CNPJ válido a partir de 12 dígitos */
function cnpj(base: number) {
  const d = String(base).padStart(8, '0').slice(0, 8) + '0001';
  const dv = (s: string) => {
    const pesos = s.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = [...s].reduce((acc, ch, i) => acc + Number(ch) * pesos[i]!, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(d);
  const d2 = dv(d + d1);
  return maskDocument(`${d}${d1}${d2}`, 'cnpj');
}

type Parc = { nome: string; regime: string; peso: number; uf?: string };
type Custo = { categoria: string; pct: number; fornecedores?: Parc[]; cclasstrib?: string };

interface Exemplo {
  empresa: Record<string, unknown>;
  receitaMensal: number;
  servicos: { item: string; descricao: string; peso: number; cclasstrib?: string }[];
  clientes: Parc[];
  custos: Custo[];
}

const EXEMPLOS: Exemplo[] = [
  {
    empresa: {
      nome: 'Alfa Software Ltda (exemplo)',
      segmento: 'Desenvolvimento de software',
      municipio: 'Porto Alegre',
      uf: 'RS',
      regime: 'Lucro Presumido',
      aliquota_iss: 2,
      cclasstrib_padrao: '000001',
    },
    receitaMensal: 800_000,
    servicos: [
      { item: '1.01', descricao: 'Desenvolvimento de sistemas sob demanda', peso: 0.6 },
      { item: '1.07', descricao: 'Suporte técnico e sustentação', peso: 0.25 },
      { item: '1.05', descricao: 'Licenciamento de software', peso: 0.15 },
    ],
    clientes: [
      { nome: 'Banco Horizonte S.A.', regime: 'Lucro Real', peso: 0.3, uf: 'SP' },
      { nome: 'Varejo Sul Comércio S.A.', regime: 'Lucro Real', peso: 0.2, uf: 'RS' },
      { nome: 'Cooperativa Agro Vale', regime: 'Regime normal (não identificado)', peso: 0.15, uf: 'RS' },
      { nome: 'Logística Ágil Ltda', regime: 'Lucro Presumido', peso: 0.12, uf: 'SC' },
      { nome: 'Loja Bom Preço ME', regime: 'Simples Nacional', peso: 0.08, uf: 'RS' },
      { nome: 'Northwind Inc. (EUA)', regime: 'Exterior', peso: 0.1 },
      { nome: 'Prefeitura de Exemplo', regime: 'Órgão público', peso: 0.05, uf: 'RS' },
    ],
    custos: [
      { categoria: 'Folha de pagamento e pró-labore', pct: 0.4 },
      { categoria: 'Encargos sobre a folha (INSS, FGTS)', pct: 0.11 },
      {
        categoria: 'Benefícios a empregados (VR, VA, plano de saúde)',
        pct: 0.05,
        fornecedores: [{ nome: 'Benefícios Já S.A.', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Serviços de terceiros PJ (subcontratação)',
        pct: 0.14,
        fornecedores: [
          { nome: 'Dev Freela Tecnologia ME', regime: 'Simples Nacional', peso: 0.6 },
          { nome: 'QA Testes Ltda', regime: 'Lucro Presumido', peso: 0.4 },
        ],
      },
      {
        categoria: 'Software, licenças e nuvem',
        pct: 0.06,
        fornecedores: [{ nome: 'Nuvem Brasil Data Center S.A.', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Aluguel de imóvel',
        pct: 0.02,
        fornecedores: [{ nome: 'Imobiliária Centro Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Energia, telecom e internet',
        pct: 0.01,
        fornecedores: [{ nome: 'Energia RS S.A.', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Contabilidade, jurídico e consultorias',
        pct: 0.015,
        fornecedores: [{ nome: 'Contábil Precisão Ltda', regime: 'Simples Nacional', peso: 1 }],
      },
      {
        categoria: 'Marketing e publicidade',
        pct: 0.01,
        fornecedores: [{ nome: 'Estúdio Criativo ME', regime: 'Simples Nacional', peso: 1 }],
      },
    ],
  },
  {
    empresa: {
      nome: 'Clínica Bem Viver Ltda (exemplo)',
      segmento: 'Saúde',
      municipio: 'Curitiba',
      uf: 'PR',
      regime: 'Lucro Presumido',
      aliquota_iss: 3,
      cclasstrib_padrao: '200029',
    },
    receitaMensal: 300_000,
    servicos: [
      { item: '4.03', descricao: 'Consultas e procedimentos', peso: 0.7, cclasstrib: '200029' },
      { item: '4.02', descricao: 'Exames de imagem', peso: 0.3, cclasstrib: '200029' },
    ],
    clientes: [
      { nome: 'Pacientes particulares', regime: 'Pessoa física', peso: 0.55 },
      { nome: 'Plano Saúde Total S.A.', regime: 'Lucro Real', peso: 0.35, uf: 'PR' },
      { nome: 'Indústria Pinheiro S.A. (medicina do trabalho)', regime: 'Lucro Real', peso: 0.1, uf: 'PR' },
    ],
    custos: [
      { categoria: 'Folha de pagamento e pró-labore', pct: 0.35 },
      { categoria: 'Encargos sobre a folha (INSS, FGTS)', pct: 0.1 },
      {
        categoria: 'Serviços de terceiros PJ (subcontratação)',
        pct: 0.15,
        cclasstrib: '200029',
        fornecedores: [{ nome: 'Médicos Associados Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Material de escritório e consumo',
        pct: 0.08,
        fornecedores: [{ nome: 'Distribuidora Hospitalar S.A.', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Aluguel de imóvel',
        pct: 0.06,
        fornecedores: [{ nome: 'Sr. Proprietário (PF)', regime: 'Pessoa física', peso: 1 }],
      },
      {
        categoria: 'Equipamentos e imobilizado',
        pct: 0.04,
        fornecedores: [{ nome: 'Imagem Equipamentos Médicos S.A.', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Energia, telecom e internet',
        pct: 0.02,
        fornecedores: [{ nome: 'Energia PR S.A.', regime: 'Lucro Real', peso: 1 }],
      },
    ],
  },
  {
    empresa: {
      nome: 'Contabilidade Exata Ltda (exemplo)',
      segmento: 'Contabilidade',
      municipio: 'São Paulo',
      uf: 'SP',
      regime: 'Simples Nacional',
      aliquota_iss: 2,
      anexo_simples: 'III',
      opcao_simples: 'Puro (IBS/CBS no DAS)',
      cclasstrib_padrao: '000001',
    },
    receitaMensal: 75_000,
    servicos: [{ item: '17.19', descricao: 'Honorários contábeis', peso: 1 }],
    clientes: [
      { nome: 'Padaria Pão Quente ME', regime: 'Simples Nacional', peso: 0.35, uf: 'SP' },
      { nome: 'Transportes Rápido Ltda', regime: 'Lucro Presumido', peso: 0.25, uf: 'SP' },
      { nome: 'Metalúrgica Forte S.A.', regime: 'Lucro Real', peso: 0.25, uf: 'SP' },
      { nome: 'Clientes MEI diversos', regime: 'MEI', peso: 0.15, uf: 'SP' },
    ],
    custos: [
      { categoria: 'Folha de pagamento e pró-labore', pct: 0.38 },
      { categoria: 'Encargos sobre a folha (INSS, FGTS)', pct: 0.04 },
      {
        categoria: 'Software, licenças e nuvem',
        pct: 0.06,
        fornecedores: [{ nome: 'Sistema Contábil Online Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Aluguel de imóvel',
        pct: 0.06,
        fornecedores: [{ nome: 'Condomínio Empresarial Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Energia, telecom e internet',
        pct: 0.02,
        fornecedores: [{ nome: 'Telecom SP S.A.', regime: 'Lucro Real', peso: 1 }],
      },
    ],
  },
  {
    empresa: {
      nome: 'Estúdio Criativo Design ME (exemplo)',
      segmento: 'Design e publicidade',
      municipio: 'Florianópolis',
      uf: 'SC',
      regime: 'Simples Nacional',
      aliquota_iss: 3,
      anexo_simples: 'III ou V (fator R)',
      opcao_simples: 'Puro (IBS/CBS no DAS)',
      cclasstrib_padrao: '000001',
    },
    receitaMensal: 40_000,
    servicos: [
      { item: '17.06', descricao: 'Criação de campanhas e identidade visual', peso: 0.7 },
      { item: '23.01', descricao: 'Design gráfico', peso: 0.3 },
    ],
    clientes: [
      { nome: 'Rede Mercados Litoral S.A.', regime: 'Lucro Real', peso: 0.45, uf: 'SC' },
      { nome: 'Construtora Mar Azul Ltda', regime: 'Lucro Presumido', peso: 0.35, uf: 'SC' },
      { nome: 'Pousada Sol ME', regime: 'Simples Nacional', peso: 0.2, uf: 'SC' },
    ],
    custos: [
      { categoria: 'Folha de pagamento e pró-labore', pct: 0.2 },
      { categoria: 'Encargos sobre a folha (INSS, FGTS)', pct: 0.03 },
      {
        categoria: 'Serviços de terceiros PJ (subcontratação)',
        pct: 0.2,
        fornecedores: [
          { nome: 'Ilustra Freela MEI', regime: 'MEI', peso: 0.5 },
          { nome: 'Gráfica Expressa Ltda', regime: 'Lucro Presumido', peso: 0.5 },
        ],
      },
      {
        categoria: 'Software, licenças e nuvem',
        pct: 0.05,
        fornecedores: [{ nome: 'Adobe Systems (exterior)', regime: 'Exterior', peso: 1 }],
      },
    ],
  },
  {
    empresa: {
      nome: 'Engenharia Delta S.A. (exemplo)',
      segmento: 'Engenharia consultiva',
      municipio: 'Belo Horizonte',
      uf: 'MG',
      regime: 'Lucro Real',
      aliquota_iss: 5,
      cclasstrib_padrao: '200052',
    },
    receitaMensal: 2_000_000,
    servicos: [
      { item: '7.03', descricao: 'Projetos e estudos de engenharia', peso: 0.7, cclasstrib: '200052' },
      { item: '7.19', descricao: 'Acompanhamento e fiscalização de obras', peso: 0.3, cclasstrib: '200052' },
    ],
    clientes: [
      { nome: 'Mineradora Serra S.A.', regime: 'Lucro Real', peso: 0.45, uf: 'MG' },
      { nome: 'Concessionária Rodovias S.A.', regime: 'Lucro Real', peso: 0.25, uf: 'MG' },
      { nome: 'Departamento Estadual de Obras', regime: 'Órgão público', peso: 0.3, uf: 'MG' },
    ],
    custos: [
      { categoria: 'Folha de pagamento e pró-labore', pct: 0.38 },
      { categoria: 'Encargos sobre a folha (INSS, FGTS)', pct: 0.12 },
      {
        categoria: 'Serviços de terceiros PJ (subcontratação)',
        pct: 0.15,
        fornecedores: [
          { nome: 'Topografia Precisa Ltda', regime: 'Lucro Presumido', peso: 0.5 },
          { nome: 'Sondagens Geo ME', regime: 'Simples Nacional', peso: 0.5 },
        ],
      },
      {
        categoria: 'Viagens e hospedagem',
        pct: 0.04,
        fornecedores: [
          { nome: 'Hotel Executivo S.A.', regime: 'Lucro Real', peso: 0.5 },
          { nome: 'Locadora Veículos S.A.', regime: 'Lucro Real', peso: 0.5 },
        ],
      },
      {
        categoria: 'Software, licenças e nuvem',
        pct: 0.03,
        fornecedores: [{ nome: 'CAD Software do Brasil Ltda', regime: 'Lucro Real', peso: 1 }],
      },
      {
        categoria: 'Aluguel de imóvel',
        pct: 0.02,
        fornecedores: [{ nome: 'Torre Comercial Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Contabilidade, jurídico e consultorias',
        pct: 0.02,
        fornecedores: [{ nome: 'Advocacia Minas Ltda', regime: 'Lucro Presumido', peso: 1 }],
      },
      {
        categoria: 'Despesas financeiras e tarifas',
        pct: 0.01,
        fornecedores: [{ nome: 'Banco Mineiro S.A.', regime: 'Lucro Real', peso: 1 }],
      },
    ],
  },
];

export async function seedExemplos(db: Db) {
  if (await db('empresas').where('nome', 'like', '%(exemplo)%').first('id')) return;
  const criado_em = nowLocal();
  const rnd = aleatorio(2026);
  const categorias = new Map(
    (await db('categorias_custo').select('id', 'nome')).map((c) => [String(c.nome), Number(c.id)]),
  );
  const parceiros = new Map<string, number>();
  let base = 12_345_678;

  const parceiro = async (p: Parc, tipo: string) => {
    const existente = parceiros.get(p.nome);
    if (existente) {
      await db('parceiros')
        .where({ id: existente })
        .andWhere('tipo', '<>', tipo)
        .update({ tipo: 'Cliente e fornecedor' });
      return existente;
    }
    const doc = p.regime === 'Pessoa física' || p.regime === 'Exterior' ? null : cnpj((base += 7_919));
    const [ins] = await db('parceiros')
      .insert({
        nome: p.nome,
        documento: doc,
        tipo,
        regime: p.regime,
        uf: p.uf ?? null,
        consultado_em: null,
        criado_em,
      })
      .returning('id');
    const id = Number(typeof ins === 'object' ? ins.id : ins);
    parceiros.set(p.nome, id);
    return id;
  };

  for (const ex of EXEMPLOS) {
    const [ins] = await db('empresas')
      .insert({ ...ex.empresa, cnpj: cnpj((base += 7_919)), criado_em })
      .returning('id');
    const empresa_id = Number(typeof ins === 'object' ? ins.id : ins);
    let nota = 1000;
    for (let m = 1; m <= 12; m++) {
      const competencia = `2026-${String(m).padStart(2, '0')}-01`;
      const sazonal = 1 + 0.08 * Math.sin((m / 12) * 2 * Math.PI) + (rnd() - 0.5) * 0.06;
      const receitaMes = ex.receitaMensal * sazonal;
      for (const cl of ex.clientes) {
        const cliente_id = await parceiro(cl, 'Cliente');
        for (const sv of ex.servicos) {
          const valor = Math.round(receitaMes * cl.peso * sv.peso * 100) / 100;
          if (valor < 1) continue;
          const item = normalizarItem(sv.item);
          const cod = sv.cclasstrib ?? sugerirCClassTrib('', item, ex.empresa.cclasstrib_padrao as string);
          const ct = cclasstrib(cod)!;
          await db('receitas').insert({
            empresa_id,
            competencia,
            documento_fiscal: String(++nota),
            cliente_id,
            descricao: sv.descricao,
            item_lc116: item,
            cclasstrib: cod,
            reducao: ct.reducaoCbs,
            reducao_cbs: ct.reducaoCbs,
            reducao_ibs: ct.reducaoIbs,
            exportacao: cl.regime === 'Exterior',
            valor,
            criado_em,
          });
        }
      }
      for (const cu of ex.custos) {
        const categoria_id = categorias.get(cu.categoria);
        if (!categoria_id) continue;
        const totalCat = ex.receitaMensal * cu.pct * (1 + (rnd() - 0.5) * 0.1);
        const forns = cu.fornecedores ?? [null];
        for (const f of forns) {
          const fornecedor_id = f ? await parceiro(f, 'Fornecedor') : null;
          await db('custos').insert({
            empresa_id,
            competencia,
            fornecedor_id,
            categoria_id,
            descricao: `${cu.categoria}${f ? ` — ${f.nome}` : ''}`.slice(0, 200),
            cclasstrib: cu.cclasstrib ?? null,
            valor: Math.round(totalCat * (f?.peso ?? 1) * 100) / 100,
            criado_em,
          });
        }
      }
    }
  }
}
