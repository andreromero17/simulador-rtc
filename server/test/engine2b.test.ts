import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupDemo } from '../src/demo/setup';
import { computeDiff, renderMigration } from '../src/db/diff';
import { purgeTrash } from '../src/services/records';
import { parseCsv } from '../src/services/import';
import { entities } from '@frame/shared';
import { makeTestApp, type TestCtx } from './helpers';

// Fase 2B: master-detail, anexos e importação (com o módulo de demonstração)
let ctx: TestCtx;
let clienteId: number;
beforeAll(async () => {
  ctx = await makeTestApp();
  await setupDemo(ctx.db);
  clienteId = (await ctx.db('demo_clientes').first('id')).id;
});
afterAll(() => ctx.db.destroy());

const novoOrcamento = (itens: unknown[]) => ({
  cliente_id: clienteId,
  data: '2026-11-08',
  status: 'Rascunho',
  total: 999_999, // ignorado: soma dos itens
  demo_orcamento_itens: itens,
});

describe('master-detail', () => {
  it('cria o registro com as linhas, calcula cada linha e soma no pai', async () => {
    const res = await ctx.admin.post('/api/demo_orcamentos').send(
      novoOrcamento([
        { descricao: 'Consultoria', quantidade: 2, preco: '150,50', valor: 1 },
        { descricao: 'Licença', quantidade: '1', preco: 490 },
      ]),
    );
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(791);
    const get = await ctx.admin.get(`/api/demo_orcamentos/${res.body.id}`);
    const itens = get.body.demo_orcamento_itens;
    expect(itens.map((i: { valor: number }) => i.valor)).toEqual([301, 490]);
    expect(itens.every((i: { orcamento_id: number }) => i.orcamento_id === res.body.id)).toBe(true);
  });

  it('erros das linhas vêm indexados e nada é gravado', async () => {
    const antes = await ctx.db('demo_orcamentos').count({ n: '*' }).first();
    const res = await ctx.admin.post('/api/demo_orcamentos').send(
      novoOrcamento([
        { descricao: 'Ok', quantidade: 1, preco: 10 },
        { descricao: '', quantidade: 0, preco: 10 },
      ]),
    );
    expect(res.status).toBe(422);
    expect(res.body.errors['demo_orcamento_itens.1.descricao']).toBeTruthy();
    expect(res.body.errors['demo_orcamento_itens.1.quantidade']).toBeTruthy();
    const vazio = await ctx.admin.post('/api/demo_orcamentos').send(novoOrcamento([]));
    expect(vazio.body.errors.demo_orcamento_itens).toMatch(/ao menos 1/);
    expect(await ctx.db('demo_orcamentos').count({ n: '*' }).first()).toEqual(antes);
  });

  it('edição atualiza, inclui e remove linhas; sem a lista, não mexe nelas', async () => {
    const { body: orc } = await ctx.admin.post('/api/demo_orcamentos').send(
      novoOrcamento([
        { descricao: 'A', quantidade: 1, preco: 100 },
        { descricao: 'B', quantidade: 1, preco: 50 },
      ]),
    );
    const { body: atual } = await ctx.admin.get(`/api/demo_orcamentos/${orc.id}`);
    const [a, b] = atual.demo_orcamento_itens;
    const put = await ctx.admin.put(`/api/demo_orcamentos/${orc.id}`).send({
      demo_orcamento_itens: [
        { ...a, quantidade: 3 },
        { descricao: 'C', quantidade: 2, preco: 10 },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.body.total).toBe(320);
    const itens = await ctx.db('demo_orcamento_itens').where({ orcamento_id: orc.id }).orderBy('id');
    expect(itens.map((i) => i.descricao)).toEqual(['A', 'C']);
    expect(itens[0].id).toBe(a.id); // mesma linha, atualizada
    expect(await ctx.db('demo_orcamento_itens').where({ id: b.id }).first()).toBeUndefined();

    await ctx.admin.put(`/api/demo_orcamentos/${orc.id}`).send({ status: 'Enviado' });
    expect(await ctx.db('demo_orcamento_itens').where({ orcamento_id: orc.id })).toHaveLength(2);
  });

  it('exclusão definitiva (e lixeira vencida) leva as linhas junto', async () => {
    const { body: orc } = await ctx.admin
      .post('/api/demo_orcamentos')
      .send(novoOrcamento([{ descricao: 'X', quantidade: 1, preco: 1 }]));
    await ctx.admin.delete(`/api/demo_orcamentos/${orc.id}`);
    expect(await ctx.db('demo_orcamento_itens').where({ orcamento_id: orc.id })).toHaveLength(1);
    await ctx.admin.delete(`/api/demo_orcamentos/${orc.id}?definitivo=1`);
    expect(await ctx.db('demo_orcamento_itens').where({ orcamento_id: orc.id })).toHaveLength(0);

    const { body: velho } = await ctx.admin
      .post('/api/demo_orcamentos')
      .send(novoOrcamento([{ descricao: 'Y', quantidade: 1, preco: 1 }]));
    await ctx.db('demo_orcamentos').where({ id: velho.id }).update({ excluido_em: '2000-01-01 00:00:00' });
    await purgeTrash(ctx.db, entities, 30);
    expect(await ctx.db('demo_orcamento_itens').where({ orcamento_id: velho.id })).toHaveLength(0);
  });

  it('sub-tabela fica fora do dashboard e da matriz de permissões', async () => {
    const { body } = await ctx.admin.get('/api/dashboard/resumo');
    expect(body.totais.map((t: { entidade: string }) => t.entidade)).not.toContain('demo_orcamento_itens');
  });

  it('db:diff cria a chave do pai com CASCADE', async () => {
    const diff = await computeDiff(ctx.db, { demo_x_itens: { ...entities.demo_orcamento_itens } });
    expect(renderMigration(diff, 't')).toContain("inTable('demo_orcamentos').onDelete('CASCADE')");
  });
});

describe('selects: inativos e data padrão', () => {
  it('registro inativo some das opções, menos com ?todos=1 ou quando é o valor atual', async () => {
    const inativo = await ctx.db('demo_clientes').where({ ativo: 0 }).first('id', 'nome');
    const ids = (r: { body: { value: number }[] }) => r.body.map((o) => o.value);
    expect(ids(await ctx.admin.get('/api/demo_clientes/opcoes'))).not.toContain(inativo.id);
    expect(ids(await ctx.admin.get('/api/demo_clientes/opcoes?todos=1'))).toContain(inativo.id);
    expect(ids(await ctx.admin.get(`/api/demo_clientes/opcoes?incluir=${inativo.id}`))).toContain(inativo.id);
  });

  it('opções em ordem alfabética do português (sem separar maiúsculas, minúsculas e acentos) — 0.31.0', async () => {
    const nomes = ['Zeta Ltda', 'e-Core', 'Ágil Tech', 'Agile', 'beta', 'Eficaz', 'item 10', 'item 9'];
    for (const nome of nomes) await ctx.db('demo_clientes').insert({ nome, ativo: 1 });
    const labels = ((await ctx.admin.get('/api/demo_clientes/opcoes')).body as { label: string }[])
      .map((o) => o.label)
      .filter((l) => nomes.includes(l));
    expect(labels).toEqual(['Ágil Tech', 'Agile', 'beta', 'e-Core', 'Eficaz', 'item 9', 'item 10', 'Zeta Ltda']);
    await ctx.db('demo_clientes').whereIn('nome', nomes).del();
  });

  it("data com default 'hoje' é preenchida na criação", async () => {
    const { body } = await ctx.admin.post('/api/demo_orcamentos').send({
      cliente_id: clienteId,
      status: 'Rascunho',
      demo_orcamento_itens: [{ descricao: 'A', quantidade: 1, preco: 1 }],
    });
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(body.data).toBe(hoje);
  });
});

describe('anexos', () => {
  const url = (id: number) => `/api/demo_clientes/${id}/anexos`;

  it('envia, lista, baixa e exclui', async () => {
    const up = await ctx.admin
      .post(`${url(clienteId)}?nome=${encodeURIComponent('../../contrato assinado.pdf')}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('%PDF-1.4 teste'));
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ nome: 'contrato assinado.pdf', tipo: 'application/pdf', tamanho: 14 });
    // gravado com nome aleatório dentro da pasta da entidade
    const arquivos = fs.readdirSync(path.join(ctx.uploadDir, 'demo_clientes'));
    expect(arquivos).toHaveLength(1);
    expect(arquivos[0]).not.toContain('contrato');

    const lista = await ctx.admin.get(url(clienteId));
    expect(lista.body[0].usuario_nome).toBeTruthy();

    const down = await ctx.admin.get(`${url(clienteId)}/${up.body.id}`).buffer(true);
    expect(down.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''contrato%20assinado\.pdf/);
    const inline = await ctx.admin.get(`${url(clienteId)}/${up.body.id}?inline=1`);
    expect(inline.headers['content-disposition']).toMatch(/^inline/);

    expect((await ctx.admin.delete(`${url(clienteId)}/${up.body.id}`)).status).toBe(204);
    expect(fs.readdirSync(path.join(ctx.uploadDir, 'demo_clientes'))).toHaveLength(0);
    const logs = await ctx.db('logs').where({ entidade: 'demo_clientes', registro_id: clienteId }).pluck('acao');
    expect(logs).toEqual(expect.arrayContaining(['anexo incluído', 'anexo excluído']));
  });

  it('HTML e SVG nunca abrem no navegador; limite de tamanho; anexo de outro registro dá 404', async () => {
    const html = await ctx.admin
      .post(`${url(clienteId)}?nome=x.html`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('<script>alert(1)</script>'));
    expect(html.body.tipo).toBe('application/octet-stream');
    const r = await ctx.admin.get(`${url(clienteId)}/${html.body.id}?inline=1`);
    expect(r.headers['content-disposition']).toMatch(/^attachment/);

    const grande = await ctx.admin
      .post(`${url(clienteId)}?nome=g.bin`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(1024 * 1024 + 10));
    expect(grande.status).toBe(413);

    const outro = (await ctx.db('demo_clientes').where('id', '!=', clienteId).first('id')).id;
    expect((await ctx.admin.get(`${url(outro)}/${html.body.id}`)).status).toBe(404);
    expect((await ctx.admin.get('/api/demo_categorias/1/anexos')).status).toBe(404);
  });

  it('sem permissão de editar não envia; exclusão definitiva apaga os arquivos', async () => {
    const semPerm = await ctx.leitura
      .post(`${url(clienteId)}?nome=a.txt`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('a'));
    expect(semPerm.status).toBe(403);

    const { body: c } = await ctx.admin.post('/api/demo_clientes').send({ nome: 'Temporário', tipo_pessoa: 'Física' });
    await ctx.admin
      .post(`${url(c.id)}?nome=a.txt`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('a'));
    expect(await ctx.db('anexos').where({ entidade: 'demo_clientes', registro_id: c.id })).toHaveLength(1);
    await ctx.admin.delete(`/api/demo_clientes/${c.id}`);
    await ctx.admin.delete(`/api/demo_clientes/${c.id}?definitivo=1`);
    expect(await ctx.db('anexos').where({ entidade: 'demo_clientes', registro_id: c.id })).toHaveLength(0);
  });
});

describe('importação', () => {
  const csv = [
    'Descrição;Data;Tipo;Categoria;Valor;Pago;Coluna extra',
    'Conta de luz;05/11/2026;despesa;Aluguel;-150,90;sim;x',
    '"Salário; novembro";10/11/2026;Receita;Salário;5.000,00;Não;',
    'Sem categoria;10/11/2026;Despesa;Inexistente;10;;',
    'Tipo errado;10/11/2026;Despesa;Salário;10;;',
    ';;;;;;',
  ].join('\r\n');
  const post = (query: string, body: string | Buffer = csv) =>
    ctx.admin
      .post(`/api/demo_movimentos/importar?nome=mov.csv&${query}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8'));

  it('lê CSV com aspas e detecta o separador', () => {
    expect(parseCsv('a,b\n"x, y",2')).toEqual([
      ['a', 'b'],
      ['x, y', '2'],
    ]);
    expect(parseCsv('a;b\r\n"diz ""oi""";2\r\n')).toEqual([
      ['a', 'b'],
      ['diz "oi"', '2'],
    ]);
  });

  it('prévia: sugere o mapeamento, converte formato BR e aponta erros por linha', async () => {
    const res = await post('previa=1');
    expect(res.status).toBe(200);
    expect(res.body.mapa).toMatchObject({ Descrição: 'descricao', Valor: 'valor', 'Coluna extra': '' });
    expect(res.body).toMatchObject({ total: 4, validas: 2, invalidas: 2 });
    const [l1, , l3, l4] = res.body.linhas;
    expect(l1).toMatchObject({ linha: 2, erros: {} });
    expect(l3.erros.categoria_id).toMatch(/Inexistente.*não encontrado/);
    expect(l4.erros.categoria_id).toMatch(/Não combina com o campo Tipo/);
  });

  it('importa as válidas (com regras do cadastro) e devolve os erros por linha', async () => {
    const antes = Number((await ctx.db('demo_movimentos').count({ n: '*' }).first())!.n);
    const res = await post('');
    expect(res.body.importados).toBe(2);
    expect(res.body.erros.map((e: { linha: number }) => e.linha)).toEqual([4, 5]);
    expect(res.body.erros[1].error).toMatch(/Categoria: Não combina/);
    const luz = await ctx.db('demo_movimentos').where({ descricao: 'Conta de luz' }).first();
    expect(luz).toMatchObject({ data: '2026-11-05', tipo: 'Despesa', valor: -150.9 });
    expect(!!luz.pago).toBe(true);
    expect(luz.codigo).toMatch(/^MOV/);
    expect(Number((await ctx.db('demo_movimentos').count({ n: '*' }).first())!.n)).toBe(antes + 2);
    const log = await ctx.db('logs').where({ entidade: 'demo_movimentos', acao: 'importação' }).first();
    expect(log.detalhe).toBe('2 registro(s) de mov.csv');
  });

  it('mapeamento escolhido na tela e planilha .xlsx', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('x');
    ws.addRow(['Nome do cliente', 'Nascimento']);
    ws.addRow(['Cliente Planilha', new Date(Date.UTC(2026, 0, 31))]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await ctx.admin
      .post(
        `/api/demo_clientes/importar?nome=c.xlsx&mapa=${encodeURIComponent(JSON.stringify({ 'Nome do cliente': 'nome' }))}`,
      )
      .set('Content-Type', 'application/octet-stream')
      .send(buf);
    expect(res.body).toEqual({ importados: 1, erros: [] });
    expect(await ctx.db('demo_clientes').where({ nome: 'Cliente Planilha' }).first()).toBeTruthy();
  });

  it('modelo, permissões e entidades sem importação', async () => {
    const modelo = await ctx.admin.get('/api/demo_movimentos/importar/modelo').buffer(true);
    expect(modelo.headers['content-type']).toContain('spreadsheetml');
    expect((await ctx.leitura.post('/api/demo_movimentos/importar?previa=1').send(Buffer.from(csv))).status).toBe(403);
    expect((await ctx.admin.get('/api/usuarios/importar/modelo')).status).toBe(404);
    expect((await ctx.admin.get('/api/demo_orcamento_itens/importar/modelo')).status).toBe(404);
    expect((await post('previa=1', 'só cabeçalho')).body).toMatchObject({ total: 0 });
  });

  it('relação: nome repetido é ambíguo; chavesImportacao aceita outro campo único (ex.: código)', async () => {
    await ctx.db('demo_categorias').insert([
      { nome: 'Dupla', tipo: 'Despesa', cor: '#111111' },
      { nome: 'Dupla', tipo: 'Despesa', cor: '#222222' },
    ]);
    const linhas = [
      'Descrição;Data;Tipo;Categoria;Valor',
      'a;10/11/2026;Despesa;Dupla;10',
      'b;10/11/2026;Despesa;#222222;10',
    ];
    let res = await post('previa=1', linhas.join('\n'));
    expect(res.body.linhas[0].erros.categoria_id).toMatch(/mais de um registro/);
    expect(res.body.linhas[1].erros.categoria_id).toMatch(/não encontrado/);
    const cat = entities.demo_categorias;
    cat.chavesImportacao = ['cor'];
    try {
      res = await post('previa=1', linhas.join('\n'));
      expect(res.body.linhas[1].erros).toEqual({});
      const id = (await ctx.db('demo_categorias').where({ cor: '#222222' }).first()).id;
      expect(res.body.linhas[1].dados?.categoria_id ?? id).toBe(id);
    } finally {
      delete cat.chavesImportacao;
    }
  });
});

describe('coluna emprestada da relação (deRelacao) e busca pela relação', () => {
  it('mostra, ordena e busca pelo campo do registro relacionado; não vira coluna nem campo do formulário', async () => {
    const ent = entities.demo_movimentos;
    const original = ent.fields;
    const rel = ent.fields.find((f) => f.name === 'categoria_id')!;
    ent.fields = [
      ...original.map((f) => (f.name === 'categoria_id' ? { ...f, search: true } : f)),
      { name: 'categoria_cor', label: 'Cor', type: 'text', list: true, deRelacao: { relacao: rel.name, campo: 'cor' } },
    ];
    try {
      const cat = (await ctx.db('demo_categorias').whereNotNull('cor').first()) as {
        id: number;
        nome: string;
        cor: string;
      };
      const r = await ctx.admin.get(`/api/demo_movimentos?categoria_id=${cat.id}&pageSize=3`).expect(200);
      expect(r.body.rows[0].categoria_cor).toBe(cat.cor);
      // ordena pela coluna emprestada
      await ctx.admin.get('/api/demo_movimentos?sort=categoria_cor&dir=desc&pageSize=3').expect(200);
      // busca pelo nome da categoria (relação com search)
      const b = await ctx.admin.get(`/api/demo_movimentos?q=${encodeURIComponent(cat.nome)}&pageSize=500`).expect(200);
      expect(b.body.rows.length).toBeGreaterThan(0);
      expect(
        b.body.rows.every((x: { categoria_id__label: string; descricao: string }) =>
          [x.categoria_id__label, x.descricao].some((t) => String(t).toLowerCase().includes(cat.nome.toLowerCase())),
        ),
      ).toBe(true);
      // não é coluna da tabela
      const diff = await computeDiff(ctx.db, { demo_movimentos: ent });
      expect(diff.addColumns.map((c) => c.field.name)).not.toContain('categoria_cor');
      // e não é gravada
      const id = r.body.rows[0].id;
      await ctx.admin
        .put(`/api/demo_movimentos/${id}`)
        .send({ ...r.body.rows[0], categoria_cor: 'x' })
        .expect(200);
    } finally {
      ent.fields = original;
    }
  });
});
