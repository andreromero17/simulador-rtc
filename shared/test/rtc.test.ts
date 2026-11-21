import { describe, expect, it } from 'vitest';
import {
  CENARIOS_PADRAO,
  calcularDas,
  cclasstrib,
  regrasDoAno,
  simular,
  tabelaSimples,
  type CustoMotor,
  type ReceitaMotor,
} from '../src';

const SERT = CENARIOS_PADRAO[0]!.anos;

const receita = (valor: number, extra: Partial<ReceitaMotor> = {}): ReceitaMotor => ({
  competencia: '2026-01',
  valor,
  reducaoCbs: 0,
  reducaoIbs: 0,
  semIncidencia: false,
  exportacao: false,
  clienteRegime: 'Lucro Real',
  clienteNome: 'Cliente A',
  ...extra,
});

const custo = (valor: number, extra: Partial<CustoMotor> = {}): CustoMotor => ({
  competencia: '2026-01',
  valor,
  categoria: 'Serviços de terceiros PJ (subcontratação)',
  creditaPisCofins: true,
  creditaIbsCbs: true,
  folha: false,
  reducaoCbs: 0,
  reducaoIbs: 0,
  fornecedorRegime: 'Lucro Presumido',
  ...extra,
});

describe('tabelas do Simples', () => {
  it('partilhas somam 100% em todas as faixas, anexos e anos', () => {
    for (const anexo of ['III', 'IV', 'V'] as const)
      for (let ano = 2026; ano <= 2034; ano++) {
        const tab = tabelaSimples(anexo, ano);
        tab.faixas.forEach((f, i) => {
          const soma = Object.values(f.partilha).reduce((a, b) => a + (b ?? 0), 0);
          expect(soma, `${anexo} ${ano} faixa ${i + 1}`).toBeCloseTo(100, 1);
        });
        if (tab.quinta) {
          const exc = Object.values(tab.quinta.excedente).reduce((a, b) => a + (b ?? 0), 0);
          expect(exc, `${anexo} ${ano} 5ª faixa`).toBeCloseTo(100, 1);
        }
      }
  });

  it('PIS+Cofins de 2026 viram CBS+IBS de 2027 na mesma proporção', () => {
    for (const anexo of ['III', 'IV', 'V'] as const)
      for (let i = 0; i < 5; i++) {
        const a = tabelaSimples(anexo, 2026).faixas[i]!.partilha;
        const b = tabelaSimples(anexo, 2027).faixas[i]!.partilha;
        // a lei arredonda alguns percentuais (ex.: Anexo III, 3ª faixa de 2027 soma 100,01%)
        expect((b.cbs ?? 0) + (b.ibs ?? 0)).toBeCloseTo((a.pis ?? 0) + (a.cofins ?? 0), 1);
      }
  });

  it('alíquota efetiva e repartição da 3ª faixa do Anexo III', () => {
    const d = calcularDas('III', 2026, 600_000);
    expect(d.faixa).toBe(3);
    expect(d.aliquotaEfetiva).toBeCloseTo(10.56, 4);
    expect(d.porTributo.iss).toBeCloseTo(10.56 * 0.325, 6);
  });

  it('5ª faixa do Anexo III: ISS fixo em 5% e o excedente repartido', () => {
    const d = calcularDas('III', 2026, 3_000_000);
    expect(d.aliquotaEfetiva).toBeCloseTo(16.812, 3);
    expect(d.porTributo.iss).toBe(5);
    expect(d.porTributo.irpj).toBeCloseTo(11.812 * 0.0602, 5);
    const soma = Object.values(d.porTributo).reduce((a, b) => a + (b ?? 0), 0);
    expect(soma).toBeCloseTo(d.aliquotaEfetiva, 6);
    // 2029: ISS 4,5% + IBS 0,5% fixos
    const d29 = calcularDas('III', 2029, 3_000_000);
    expect(d29.porTributo.iss).toBe(4.5);
    expect(d29.porTributo.ibs).toBe(0.5);
  });
});

describe('transição', () => {
  it('regras de cada ano', () => {
    const ref = { ano: 2027, cbs: 11.3, ibs: 18.7 };
    expect(regrasDoAno(2026, undefined)).toMatchObject({ pisCofins: true, cbs: 0, fatorIss: 1 });
    expect(regrasDoAno(2027, ref)).toMatchObject({ pisCofins: false, ibs: 0.1, fatorIss: 1 });
    expect(regrasDoAno(2027, ref).cbs).toBeCloseTo(11.2, 10);
    expect(regrasDoAno(2030, { ...ref, ano: 2030 })).toMatchObject({ fatorIss: 0.8 });
    expect(regrasDoAno(2030, { ...ref, ano: 2030 }).ibs).toBeCloseTo(3.74, 10);
    expect(regrasDoAno(2033, { ...ref, ano: 2033 })).toMatchObject({ fatorIss: 0, ibs: 18.7 });
  });

  it('cClassTrib oficial traz as reduções', () => {
    expect(cclasstrib('200052')?.reducaoCbs).toBe(30);
    expect(cclasstrib('200029')?.reducaoIbs).toBe(60);
    expect(cclasstrib('410004')?.semIncidencia).toBe(true);
  });
});

describe('Lucro Presumido', () => {
  const sim = (estrategiaPreco: 'preco' | 'liquido') =>
    simular({
      empresa: { regime: 'Lucro Presumido', aliquotaIss: 5 },
      receitas: [receita(100_000)],
      custos: [],
      cenario: SERT,
      premissas: { estrategiaPreco },
    });

  it('2026: PIS 0,65% + Cofins 3% + ISS', () => {
    const a = sim('preco').anos[0]!;
    expect(a.debitos).toMatchObject({ pis: 650, cofins: 3000, iss: 5000 });
    expect(a.tributosConsumo).toBe(8650);
    expect(a.custoClientes).toBe(90750); // cliente do Lucro Real credita 9,25%
  });

  it('2027 mantendo o preço: CBS/IBS por fora sobre (serviço − ISS)', () => {
    const a = sim('preco').anos.find((x) => x.ano === 2027)!;
    const v = 100_000 / (1 + 0.113 * 0.95);
    expect(a.receitaClientes).toBeCloseTo(100_000, 1);
    expect(a.debitos.iss).toBeCloseTo(v * 0.05, 1);
    expect(a.debitos.cbs).toBeCloseTo(v * 0.95 * 0.112, 1);
    expect(a.debitos.ibs).toBeCloseTo(v * 0.95 * 0.001, 1);
    expect(a.debitos.pis + a.debitos.cofins).toBe(0);
    expect(a.receitaLiquida).toBeCloseTo(v * 0.95, 0);
    expect(a.creditoClientes).toBeCloseTo(a.debitos.cbs + a.debitos.ibs, 1);
  });

  it('2027 mantendo a receita líquida: a diferença vai para o preço', () => {
    const r = sim('liquido');
    const a = r.anos.find((x) => x.ano === 2027)!;
    expect(a.receitaLiquida).toBeCloseTo(91_350, 0);
    expect(a.receitaClientes).toBeCloseTo(91_350 / 0.95 + 91_350 * 0.113, 0);
  });

  it('2033: só CBS e IBS cheios, sem ISS', () => {
    const a = sim('preco').anos.find((x) => x.ano === 2033)!;
    expect(a.debitos.iss).toBe(0);
    expect(a.cargaConsumo).toBeCloseTo((0.2791 / 1.2791) * 100, 2);
  });

  it('redução de 30% (profissões intelectuais) e exportação', () => {
    const r = simular({
      empresa: { regime: 'Lucro Presumido', aliquotaIss: 2 },
      receitas: [
        receita(100_000, { reducaoCbs: 30, reducaoIbs: 30 }),
        receita(50_000, { exportacao: true, clienteRegime: 'Exterior' }),
      ],
      custos: [],
      cenario: SERT,
    });
    const a = r.anos.find((x) => x.ano === 2033)!;
    const t = 0.2791 * 0.7;
    expect(a.debitos.cbs + a.debitos.ibs).toBeCloseTo((100_000 / (1 + t)) * t, 0);
    expect(r.anos[0]!.debitos.pis).toBe(650); // exportação sem PIS
  });

  it('créditos de IBS/CBS sobre fornecedores do regime regular e do Simples', () => {
    const r = simular({
      empresa: { regime: 'Lucro Presumido', aliquotaIss: 5 },
      receitas: [receita(100_000)],
      custos: [
        custo(10_000),
        custo(10_000, { fornecedorRegime: 'Simples Nacional' }),
        custo(30_000, { categoria: 'Folha de pagamento e pró-labore', creditaIbsCbs: false, folha: true }),
        custo(5_000, { fornecedorRegime: 'Pessoa física' }),
      ],
      cenario: SERT,
    });
    expect(r.anos[0]!.creditos.pisCofins).toBe(0); // Presumido não credita hoje
    const a = r.anos.find((x) => x.ano === 2033)!;
    const regular = (10_000 / 1.2791) * 0.2791;
    const sn = calcularDas('III', 2033, 500_000);
    const simplesPct = ((sn.porTributo.cbs ?? 0) + (sn.porTributo.ibs ?? 0)) / 100;
    expect(a.creditos.cbs + a.creditos.ibs).toBeCloseTo(regular + 10_000 * simplesPct, 1);
  });
});

describe('Lucro Real', () => {
  it('2026: PIS/Cofins não cumulativo com crédito de insumos', () => {
    const r = simular({
      empresa: { regime: 'Lucro Real', aliquotaIss: 5 },
      receitas: [receita(100_000)],
      custos: [custo(20_000), custo(10_000, { creditaPisCofins: false })],
      cenario: SERT,
    });
    const a = r.anos[0]!;
    expect(a.debitos.pis + a.debitos.cofins).toBeCloseTo(9_250, 6);
    expect(a.creditos.pisCofins).toBeCloseTo(1_850, 6);
    expect(a.tributosConsumo).toBeCloseTo(9_250 - 1_850 + 5_000, 6);
  });
});

describe('PIS/Cofins parametrizado na empresa', () => {
  it('Lucro Real com receita de TI no cumulativo: 3,65% e sem crédito sobre os custos', () => {
    const r = simular({
      empresa: { regime: 'Lucro Real', aliquotaIss: 2, regimePisCofins: 'Cumulativo' },
      receitas: [receita(100_000)],
      custos: [custo(20_000)],
      cenario: SERT,
    });
    const a = r.anos[0]!;
    expect(a.debitos.pis).toBeCloseTo(650, 6);
    expect(a.debitos.cofins).toBeCloseTo(3_000, 6);
    expect(a.creditos.pisCofins).toBe(0);
    expect(a.modo).toContain('cumulativo');
    expect(r.alertas.some((x) => x.includes('PIS/Cofins de hoje informado'))).toBe(true);
  });

  it('alíquotas reduzidas informadas valem no débito, no crédito e na receita líquida mantida', () => {
    const r = simular({
      empresa: { regime: 'Lucro Real', aliquotaIss: 5, aliquotaPis: 0.5, aliquotaCofins: 2 },
      receitas: [receita(100_000)],
      custos: [custo(10_000)],
      cenario: SERT,
      premissas: { estrategiaPreco: 'liquido' },
    });
    const hoje = r.anos[0]!;
    expect(hoje.debitos.pis + hoje.debitos.cofins).toBeCloseTo(2_500, 6);
    expect(hoje.creditos.pisCofins).toBeCloseTo(250, 6); // 10.000 × 2,5%
    // receita líquida das vendas mantida: 100.000 − 2.500 − 5.000
    const a27 = r.anos[1]!;
    expect((a27.debitos.iss / 0.05) * 0.95).toBeCloseTo(92_500, 0);
  });

  it('Lucro Presumido ignora "não cumulativo"', () => {
    const r = simular({
      empresa: { regime: 'Lucro Presumido', aliquotaIss: 5, regimePisCofins: 'Não cumulativo' },
      receitas: [receita(100_000)],
      custos: [custo(10_000)],
      cenario: SERT,
    });
    expect(r.anos[0]!.debitos.pis).toBe(650);
    expect(r.anos[0]!.creditos.pisCofins).toBe(0);
    expect(r.alertas.some((x) => x.includes('sempre cumulativo'))).toBe(true);
  });
});

describe('Simples Nacional', () => {
  const base = (opcao: string, regime = 'Lucro Real') =>
    simular({
      empresa: { regime: 'Simples Nacional', aliquotaIss: 5, anexoSimples: 'III', opcaoSimples: opcao },
      receitas: Array.from({ length: 12 }, (_, m) =>
        receita(50_000, { competencia: `2026-${String(m + 1).padStart(2, '0')}`, clienteRegime: regime }),
      ),
      custos: [custo(60_000)],
      cenario: SERT,
    });

  it('puro: DAS pela tabela e crédito do cliente limitado ao CBS/IBS do DAS', () => {
    const r = base('Puro (IBS/CBS no DAS)');
    expect(r.base.rbt12).toBe(600_000);
    const hoje = r.anos[0]!;
    expect(hoje.debitos.das).toBeCloseTo(600_000 * 0.1056, 2);
    const a = r.anos.find((x) => x.ano === 2027)!;
    const d = calcularDas('III', 2027, 600_000);
    expect(a.debitos.das).toBeCloseTo(600_000 * (d.aliquotaEfetiva / 100), 2);
    expect(a.creditoClientes).toBeCloseTo((600_000 * ((d.porTributo.cbs ?? 0) + (d.porTributo.ibs ?? 0))) / 100, 2);
    expect(a.creditos.cbs).toBe(0); // Simples puro não toma crédito
  });

  it('híbrido: DAS sem CBS/IBS, CBS/IBS por fora e crédito das compras', () => {
    const puro = base('Puro (IBS/CBS no DAS)').anos.find((x) => x.ano === 2033)!;
    const hib = base('Híbrido (IBS/CBS por fora)').anos.find((x) => x.ano === 2033)!;
    expect(hib.debitos.cbs).toBeGreaterThan(0);
    expect(hib.creditos.cbs).toBeGreaterThan(0);
    expect(hib.debitos.das).toBeLessThan(puro.debitos.das);
    // cliente do regime regular credita muito mais no híbrido
    expect(hib.creditoClientes).toBeGreaterThan(puro.creditoClientes * 1.5);
  });

  it('fator R escolhe o Anexo III ou V', () => {
    const r = (folha: number) =>
      simular({
        empresa: { regime: 'Simples Nacional', aliquotaIss: 5, anexoSimples: 'III ou V (fator R)', rbt12: 1_000_000 },
        receitas: [receita(1_000_000)],
        custos: [custo(folha, { folha: true, creditaIbsCbs: false })],
        cenario: SERT,
      }).base.anexo;
    // um mês de dados → folha anualizada × 12
    expect(r(30_000)).toBe('III');
    expect(r(20_000)).toBe('V');
  });
});
