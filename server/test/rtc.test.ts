import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedExemplos } from '../src/app/seed';
import { atualizarParceiros, consultarCnpj, interpretar } from '../src/app/rtc/cnpj';
import { competenciaDe } from '../src/app/rtc/importacao';
import { normalizarItem, sugerirCClassTrib } from '../src/app/rtc/catalogo';
import { makeTestApp, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await makeTestApp();
});
afterAll(() => ctx.db.destroy());

const empresa = async (dados: Record<string, unknown> = {}) => {
  const r = await ctx.admin
    .post('/api/empresas')
    .send({ nome: `Empresa ${Math.random()}`, regime: 'Lucro Presumido', aliquota_iss: 5, ...dados });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as number;
};

async function planilha(receitas: unknown[][], custos: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const r = wb.addWorksheet('Receitas');
  r.addRow(['Competência', 'CNPJ cliente', 'Cliente', 'Regime cliente', 'Descrição', 'Item LC 116', 'Valor bruto']);
  receitas.forEach((l) => r.addRow(l));
  const c = wb.addWorksheet('Custos');
  c.addRow(['Competência', 'CNPJ fornecedor', 'Fornecedor', 'Categoria', 'Descrição', 'Valor']);
  custos.forEach((l) => c.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('dados de referência', () => {
  it('migração traz categorias e cenários', async () => {
    expect(Number((await ctx.db('categorias_custo').count({ n: '*' }).first())?.n)).toBeGreaterThan(10);
    const cen = await ctx.db('cenarios').where({ padrao: true }).first();
    expect(cen?.nome).toContain('27,91');
    expect(await ctx.db('cenarios_anos').where({ cenario_id: cen.id })).toHaveLength(7);
  });

  it('catálogo: normaliza item e sugere cClassTrib', () => {
    expect(normalizarItem('01.01')).toBe('1.01');
    expect(normalizarItem('1701')).toBe('17.01');
    // código de tributação nacional da NFS-e (6 dígitos: item, subitem, desdobramento)
    expect(normalizarItem('010101')).toBe('1.01');
    expect(normalizarItem('01.01.01')).toBe('1.01');
    expect(normalizarItem('170101')).toBe('17.01');
    expect(normalizarItem('040301 - Hospitais e clínicas')).toBe('4.03');
    expect(sugerirCClassTrib('', '1.01', '000001')).toBe('000001');
    expect(sugerirCClassTrib('', '4.03', '000001')).toBe('200029');
  });

  it('competência em vários formatos', () => {
    expect(competenciaDe('01/2026')).toBe('2026-01-01');
    expect(competenciaDe('2026-03')).toBe('2026-03-01');
    expect(competenciaDe('15/02/2026')).toBe('2026-02-01');
    expect(competenciaDe('jan/2026')).toBe('2026-01-01');
    expect(competenciaDe('46023')).toBe('2026-01-01');
    expect(competenciaDe('xyz')).toBeNull();
  });
});

describe('receitas', () => {
  it('hook sugere o cClassTrib pelo item e grava as reduções', async () => {
    const empresa_id = await empresa({ cclasstrib_padrao: '000001' });
    const r = await ctx.admin
      .post('/api/receitas')
      .send({ empresa_id, competencia: '2026-01-01', descricao: 'Consulta', item_lc116: '04.03', valor: 1000 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body).toMatchObject({ item_lc116: '4.03', cclasstrib: '200029', reducao: 60 });
    const bad = await ctx.admin
      .post('/api/receitas')
      .send({ empresa_id, competencia: '2026-01-01', descricao: 'X', cclasstrib: '999999', valor: 10 });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.cclasstrib).toContain('999999');
  });
});

describe('importação', () => {
  it('prévia, importação com criação de clientes/fornecedores e substituição', async () => {
    const empresa_id = await empresa();
    const buf = await planilha(
      [
        ['01/2026', '11.222.333/0001-81', 'Cliente Real S.A.', 'Lucro Real', 'Sistema', '1.01', 10000],
        ['02/2026', '11222333000181', 'Cliente Real S.A.', '', 'Sistema', '1.01', '12.000,50'],
        ['02/2026', '', 'Cliente sem doc', '', 'Suporte', '1.07', 500],
        ['13/2026', '', 'Ruim', '', 'x', '1.01', 1],
      ],
      [
        ['01/2026', '', '', 'Salários', 'Folha', 4000],
        ['01/2026', '11.444.777/0001-61', 'Fornecedor Nuvem', 'AWS', 'Servidores', 800],
      ],
    );
    const previa = await ctx.admin
      .post(`/api/rtc/importar?empresa_id=${empresa_id}&previa=1`)
      .set('Content-Type', 'application/octet-stream')
      .send(buf);
    expect(previa.status, JSON.stringify(previa.body)).toBe(200);
    expect(previa.body.receitas).toMatchObject({ linhas: 4, validas: 3 });
    expect(previa.body.custos).toMatchObject({ linhas: 2, validas: 2 });
    expect(previa.body.parceirosNovos).toBe(3);
    expect(previa.body.erros[0]).toMatchObject({ aba: 'Receitas', linha: 5 });

    const imp = await ctx.admin
      .post(`/api/rtc/importar?empresa_id=${empresa_id}&nome=teste.xlsx`)
      .set('Content-Type', 'application/octet-stream')
      .send(buf);
    expect(imp.status, JSON.stringify(imp.body)).toBe(200);
    expect(imp.body.importadas).toMatchObject({ receitas: 3, custos: 2, parceiros: 3 });
    const cli = await ctx.db('parceiros').where({ documento: '11.222.333/0001-81' }).first();
    expect(cli).toMatchObject({ regime: 'Lucro Real', tipo: 'Cliente' });
    const folha = await ctx
      .db('custos as c')
      .join('categorias_custo as k', 'k.id', 'c.categoria_id')
      .where({ 'c.empresa_id': empresa_id, 'c.valor': 4000 })
      .first('k.nome');
    expect(folha.nome).toBe('Folha de pagamento e pró-labore');
    const aws = await ctx
      .db('custos as c')
      .join('categorias_custo as k', 'k.id', 'c.categoria_id')
      .where({ 'c.empresa_id': empresa_id, 'c.valor': 800 })
      .first('k.nome');
    expect(aws.nome).toBe('Software, licenças e nuvem');

    // reimportar o mesmo período com "substituir" não duplica
    const de_novo = await ctx.admin
      .post(`/api/rtc/importar?empresa_id=${empresa_id}&substituir=1`)
      .set('Content-Type', 'application/octet-stream')
      .send(buf);
    expect(de_novo.body.importadas).toMatchObject({ receitas: 3, parceiros: 0, substituidas: 5 });
    const ativas = await ctx.db('receitas').where({ empresa_id }).whereNull('excluido_em').count({ n: '*' }).first();
    expect(Number(ativas?.n)).toBe(3);
  });

  it('clientes e fornecedores só da empresa, com totais', async () => {
    const outra = await empresa();
    const r = await ctx.admin.get(`/api/rtc/parceiros?empresa_id=${outra}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
    const emp = (await ctx.db('receitas').orderBy('id', 'desc').first('empresa_id')).empresa_id;
    const lista = (await ctx.admin.get(`/api/rtc/parceiros?empresa_id=${emp}`)).body;
    const real = lista.find((p: { nome: string }) => p.nome === 'Cliente Real S.A.');
    expect(real).toMatchObject({ faturado: 22000.5, notas: 2, comprado: 0 });
    expect(lista.find((p: { nome: string }) => p.nome === 'Fornecedor Nuvem')).toMatchObject({ comprado: 800 });
    expect((await ctx.admin.get('/api/rtc/parceiros')).status).toBe(422);
  });

  it('arquivo de aba única (exportação do ERP) sem CNPJ: cria clientes pelo nome', async () => {
    const empresa_id = await empresa();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Resultado da pesquisa');
    ws.addRow([
      'Empresa',
      'Tipo',
      'Competência',
      'Cliente',
      'Nº da nota',
      'Valor bruto',
      'Valor líquido',
      'Memorando',
      'Item LC 116',
      'Exportação de serviço',
      'Descrição',
    ]);
    ws.addRow([
      'Minha empresa',
      'Fatura',
      '2026-04-30',
      'Iron Mountain',
      'INV44',
      41664,
      40000,
      'memo',
      '010101',
      'Não',
      'Desenvolvimento de Software',
    ]);
    ws.addRow([
      'Minha empresa',
      'Fatura',
      '2026-04-30',
      'UOL',
      'INV50',
      5748.08,
      5500,
      '',
      '1.01',
      'Não',
      'Desenvolvimento de Software',
    ]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const url = `/api/rtc/importar?empresa_id=${empresa_id}&aba=receitas`;
    const previa = await ctx.admin.post(`${url}&previa=1`).set('Content-Type', 'application/octet-stream').send(buf);
    expect(previa.status, JSON.stringify(previa.body)).toBe(200);
    expect(previa.body.receitas).toMatchObject({ linhas: 2, validas: 2, total: 47412.08 });
    expect(previa.body.avisos[0]).toContain('Resultado da pesquisa');
    expect(previa.body.parceirosNovos).toBe(2);
    const imp = await ctx.admin.post(url).set('Content-Type', 'application/octet-stream').send(buf);
    expect(imp.body.importadas).toMatchObject({ receitas: 2, parceiros: 2 });
    const r = await ctx.db('receitas').where({ empresa_id, documento_fiscal: 'INV44' }).first();
    // "Descrição" ganha de "Memorando"; o código nacional 010101 vira o item 1.01
    expect(r).toMatchObject({
      descricao: 'Desenvolvimento de Software',
      item_lc116: '1.01',
      competencia: '2026-04-01',
    });
  });

  it('reimportar com CNPJ completa o cadastro feito antes só pelo nome (sem duplicar)', async () => {
    const empresa_id = await empresa();
    const arquivo = async (comDoc: boolean) => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Planilha1');
      ws.addRow(['Competência', 'CNPJ do cliente', 'Cliente', 'Regime cliente', 'Item LC 116', 'Valor bruto']);
      ws.addRow([
        '04/2026',
        comDoc ? '06.990.590/0001-23' : '',
        'Provedor Web S.A.',
        comDoc ? 'Lucro Real' : '',
        '1.01',
        1000,
      ]);
      return Buffer.from(await wb.xlsx.writeBuffer());
    };
    const url = `/api/rtc/importar?empresa_id=${empresa_id}&substituir=1`;
    await ctx.admin
      .post(url)
      .set('Content-Type', 'application/octet-stream')
      .send(await arquivo(false));
    const antes = await ctx.db('parceiros').where({ nome: 'Provedor Web S.A.' });
    expect(antes).toHaveLength(1);
    expect(antes[0]).toMatchObject({ documento: null, regime: 'Não informado' });

    const buf = await arquivo(true);
    const previa = await ctx.admin.post(`${url}&previa=1`).set('Content-Type', 'application/octet-stream').send(buf);
    expect(previa.body).toMatchObject({ parceirosNovos: 0, parceirosExistentes: 1, parceirosCompletados: 1 });
    const imp = await ctx.admin.post(url).set('Content-Type', 'application/octet-stream').send(buf);
    expect(imp.body.importadas).toMatchObject({ parceiros: 0, parceirosCompletados: 1 });
    const depois = await ctx.db('parceiros').where({ nome: 'Provedor Web S.A.' });
    expect(depois).toHaveLength(1);
    expect(depois[0]).toMatchObject({ documento: '06.990.590/0001-23', regime: 'Lucro Real' });
  });

  it('modelo e permissões', async () => {
    const m = await ctx.admin
      .get('/api/rtc/importar/modelo')
      .buffer(true)
      .parse((res, cb) => {
        const partes: Buffer[] = [];
        res.on('data', (p: Buffer) => partes.push(p));
        res.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(m.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(m.body);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Receitas', 'Custos', 'Listas', 'Instruções']);
    expect((await ctx.leitura.post('/api/rtc/importar?empresa_id=1&previa=1').send(Buffer.from('x'))).status).toBe(403);
  });
});

describe('simulação', () => {
  it('roda sobre os exemplos (Presumido, Real e Simples com alternativa)', async () => {
    await seedExemplos(ctx.db);
    const empresas = await ctx.db('empresas').where('nome', 'like', '%(exemplo)%').select('id', 'regime', 'nome');
    expect(empresas).toHaveLength(5);
    for (const e of empresas) {
      const r = await ctx.admin.get(`/api/rtc/simulacao?empresa_id=${e.id}`);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.resultado.anos.map((a: { ano: number }) => a.ano)).toEqual([
        2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033,
      ]);
      expect(r.body.resultado.base.meses).toBe(12);
      if (e.regime === 'Simples Nacional') expect(r.body.alternativa.opcao).toContain('Híbrido');
      else expect(r.body.alternativa).toBeUndefined();
    }
    const alfa = empresas.find((e) => e.nome.startsWith('Alfa'))!;
    const liq = await ctx.admin.get(`/api/rtc/simulacao?empresa_id=${alfa.id}&estrategia=liquido`);
    const a2027 = liq.body.resultado.anos[1];
    const a2026 = liq.body.resultado.anos[0];
    // receita líquida das vendas igual à de hoje; o ganho vem só dos créditos das compras
    const cred = a2027.creditos.cbs + a2027.creditos.ibs;
    expect(a2027.receitaLiquida - cred).toBeCloseTo(a2026.receitaLiquida, -1);
  });

  it('usa o PIS/Cofins informado na empresa', async () => {
    const empresa_id = await empresa({ regime: 'Lucro Real', regime_pis_cofins: 'Cumulativo', aliquota_cofins: 2 });
    await ctx.admin
      .post('/api/receitas')
      .send({ empresa_id, competencia: '2026-01-01', descricao: 'Software', item_lc116: '1.01', valor: 10000 });
    const r = await ctx.admin.get(`/api/rtc/simulacao?empresa_id=${empresa_id}`);
    expect(r.body.resultado.anos[0].debitos).toMatchObject({ pis: 65, cofins: 200 });
  });

  it('valida parâmetros', async () => {
    expect((await ctx.admin.get('/api/rtc/simulacao')).status).toBe(422);
    expect((await ctx.admin.get('/api/rtc/simulacao?empresa_id=99999')).status).toBe(404);
  });
});

describe('inferência do regime pela consulta de CNPJ', () => {
  it('Simples/MEI, órgão público, S.A. aberta, financeira e capital alto', () => {
    expect(interpretar({ codigo_natureza_juridica: 1031 }).regime).toBe('Órgão público');
    expect(interpretar({ codigo_natureza_juridica: 2046, capital_social: 1000 })).toMatchObject({
      regime: 'Lucro Real',
      fonte: 'Inferido: S.A. de capital aberto',
    });
    // cooperativa de crédito (CNAE 6424-7/03)
    expect(interpretar({ codigo_natureza_juridica: 2143, cnae_fiscal: 6424703 }).regime).toBe('Lucro Real');
    expect(interpretar({ codigo_natureza_juridica: 2062, capital_social: 80_000_000 }).regime).toBe('Lucro Real');
    expect(
      interpretar({ codigo_natureza_juridica: 2062, capital_social: 1_000_000, cnae_fiscal: 6201501 }).regime,
    ).toBe('Regime normal (não identificado)');
    // regime declarado na ECF (campos com acento, como publica a Minha Receita); o ano mais recente vale
    const ecf = (forma: string, ano = 2024) => ({
      ano,
      cnpj_da_scp: null,
      forma_de_tributação: forma,
      quantidade_de_escrituracoes: 1,
    });
    expect(
      interpretar({
        capital_social: 300_000,
        regime_tributário: [ecf('LUCRO PRESUMIDO', 2022), ecf('LUCRO REAL', 2024)],
      }),
    ).toMatchObject({ regime: 'Lucro Real', fonte: 'Receita Federal: ECF 2024 no Lucro Real' });
    // ECF vence a inferência pelo capital
    expect(
      interpretar({
        capital_social: 90_000_000,
        regime_tributario: [{ ano: 2024, forma_de_tributacao: 'LUCRO PRESUMIDO' }],
      }).regime,
    ).toBe('Lucro Presumido');
    // Simples (situação atual) vence a ECF
    expect(interpretar({ opcao_pelo_simples: true, regime_tributario: [ecf('LUCRO PRESUMIDO')] }).regime).toBe(
      'Simples Nacional',
    );
    // Simples vence a inferência
    expect(interpretar({ opcao_pelo_simples: true, capital_social: 80_000_000 }).regime).toBe('Simples Nacional');
    expect(interpretar({ descricao_situacao_cadastral: 'BAIXADA' }).fonte).toContain('BAIXADA');
  });

  it('regime informado à mão é mantido; inferido é atualizado', async () => {
    const [a] = await ctx
      .db('parceiros')
      .insert({ nome: 'Manual', documento: '33.000.167/0001-01', tipo: 'Cliente', regime: 'Não informado' })
      .returning('id');
    const idManual = typeof a === 'object' ? a.id : a;
    // edição no formulário marca a origem
    const ed = await ctx.admin
      .put(`/api/parceiros/${idManual}`)
      .send({ nome: 'Manual', tipo: 'Cliente', regime: 'Lucro Presumido' });
    expect(ed.status, JSON.stringify(ed.body)).toBe(200);
    expect((await ctx.db('parceiros').where({ id: idManual }).first()).regime_fonte).toBe('Informado à mão');

    const [b] = await ctx
      .db('parceiros')
      .insert({
        nome: 'Inferido',
        documento: '60.746.948/0001-12',
        tipo: 'Cliente',
        regime: 'Regime normal (não identificado)',
      })
      .returning('id');
    const idInferido = typeof b === 'object' ? b.id : b;
    const busca = async () => ({ ok: true, status: 200, json: async () => ({ codigo_natureza_juridica: 2046 }) });
    await atualizarParceiros(ctx.db, { ids: [idManual, idInferido], busca, intervaloMs: 0 });
    expect(await ctx.db('parceiros').where({ id: idManual }).first()).toMatchObject({
      regime: 'Lucro Presumido',
      regime_fonte: 'Informado à mão',
    });
    const inferido = await ctx.db('parceiros').where({ id: idInferido }).first();
    expect(inferido.regime).toBe('Lucro Real');
    expect(inferido.regime_fonte).toBe('Inferido: S.A. de capital aberto · via Minha Receita');
  });
});

describe('fontes da consulta de CNPJ', () => {
  it('espera e repete na Minha Receita quando há limite de requisições; registra a fonte', async () => {
    const chamadas: string[] = [];
    let n = 0;
    const busca = async (url: string) => {
      chamadas.push(url);
      if (url.includes('minhareceita') && n++ === 0) return { ok: false, status: 429, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({ regime_tributario: [{ ano: 2024, forma_de_tributacao: 'LUCRO REAL' }] }),
      };
    };
    const d = await consultarCnpj('00.603.226/0001-87', busca, 0);
    expect(d).toMatchObject({
      regime: 'Lucro Real',
      fonte: 'Receita Federal: ECF 2024 no Lucro Real · via Minha Receita',
    });
    expect(chamadas.every((u) => u.includes('minhareceita'))).toBe(true);
    expect(chamadas).toHaveLength(2);
  });

  it('cai para a BrasilAPI quando a Minha Receita está fora', async () => {
    const busca = async (url: string) =>
      url.includes('minhareceita')
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ opcao_pelo_simples: false }) };
    const d = await consultarCnpj('00.603.226/0001-87', busca, 0);
    expect(d?.fonte).toContain('via BrasilAPI');
  });
});

describe('consulta de CNPJ', () => {
  it('interpreta Simples/MEI e atualiza o regime', async () => {
    expect(interpretar({ opcao_pelo_simples: true, razao_social: 'X' }).regime).toBe('Simples Nacional');
    expect(interpretar({ opcao_pelo_mei: true }).regime).toBe('MEI');
    expect(interpretar({ opcao_pelo_simples: false }).regime).toBe('Regime normal (não identificado)');

    const [ins] = await ctx
      .db('parceiros')
      .insert({ nome: 'Para consultar', documento: '11.555.999/0001-08', tipo: 'Fornecedor', regime: 'Não informado' })
      .returning('id');
    const id = typeof ins === 'object' ? ins.id : ins;
    const busca = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ opcao_pelo_simples: true, uf: 'RS', municipio: 'PORTO ALEGRE', cnae_fiscal: 6201501 }),
    });
    const r = await atualizarParceiros(ctx.db, { ids: [id], busca, intervaloMs: 0 });
    expect(r).toMatchObject({ consultados: 1, atualizados: 1 });
    const p = await ctx.db('parceiros').where({ id }).first();
    expect(p).toMatchObject({ regime: 'Simples Nacional', uf: 'RS', municipio: 'PORTO ALEGRE' });
    expect(p.consultado_em).toBeTruthy();
  });
});
