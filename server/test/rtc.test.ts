import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedExemplos } from '../src/app/seed';
import { atualizarParceiros, interpretar } from '../src/app/rtc/cnpj';
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

  it('valida parâmetros', async () => {
    expect((await ctx.admin.get('/api/rtc/simulacao')).status).toBe(422);
    expect((await ctx.admin.get('/api/rtc/simulacao?empresa_id=99999')).status).toBe(404);
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
