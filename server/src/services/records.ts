// =============================================================================
// Motor do CRUD genérico: consulta (busca, filtros, período, ordenação, totais),
// gravação (validação, senhas, relações, hooks, log) e lixeira.
// As rotas (routes/crud.ts) só checam permissão e chamam estas funções, o que
// permite reaproveitar a mesma lógica em ações em lote e exportação.
// =============================================================================
import type { Knex } from 'knex';
import {
  computeFields,
  detailSums,
  getEntity,
  validateDetails,
  validateEntity,
  type AuthUser,
  type EntityDef,
  type FieldDef,
  type FieldErrors,
  type Row,
} from '@frame/shared';
import { hashPassword } from '../auth/password';
import { count, toDbValue, type Db, likeOp } from '../db/knex';
import { hooks } from '../hooks';
import { badRequest, HttpError } from '../utils/http';
import { generateCode, nowLocal } from '../utils/time';
import { deleteAnexosOf } from './anexos';
import { addLog, diffRecord, type Actor } from './logs';

/** Quem está operando (usuário logado) */
export interface OpCtx {
  db: Db;
  user: AuthUser;
  sessionId?: string;
  ip?: string;
  /** Não registra cada operação no log (ex.: importação, que grava um resumo) */
  semLog?: boolean;
}

export type Query = Record<string, unknown>;

const actorOf = (c: OpCtx): Actor => ({ id: c.user.id, nome: c.user.nome, ip: c.ip });
const RANGE_TYPES = new Set(['date', 'datetime', 'number', 'money', 'percent']);
const JSON_TYPES = new Set(['permissions', 'multiselect']);
export const TRASH_COLUMN = 'excluido_em';

/** Campos que podem ser usados em busca, filtro, ordenação e exportação (nunca senha) */
export const queryable = (ent: EntityDef) => ent.fields.filter((f) => f.type !== 'password');

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const values = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).map(str).filter((x): x is string => x !== '');

/** O que sai da API: sem senhas, com JSON já convertido */
/** 'AAAA-MM-DD' com dia além do fim do mês vira o último dia do mês; o resto passa igual */
export function dataValida(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(v);
  if (!m) return v;
  const ultimo = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return Number(m[3]) > ultimo ? `${m[1]}-${m[2]}-${String(ultimo).padStart(2, '0')}${m[4]}` : v;
}

export function present(ent: EntityDef, row: Row | undefined): Row | undefined {
  if (!row) return row;
  const out: Row = { ...row };
  // colunas `segredo_*` (2FA etc.) nunca saem da API, sejam ou não campos da entidade
  for (const k of Object.keys(out)) if (k.startsWith('segredo_')) delete out[k];
  for (const f of ent.fields) {
    if (f.type === 'password') delete out[f.name];
    // booleano sempre true/false na API (o SQLite guarda 0/1; o Postgres, boolean)
    if (f.type === 'boolean' && out[f.name] != null) out[f.name] = !!out[f.name];
    if (JSON_TYPES.has(f.type) && typeof out[f.name] === 'string') {
      try {
        out[f.name] = JSON.parse(out[f.name] as string);
      } catch {
        out[f.name] = f.type === 'multiselect' ? [] : {};
      }
    }
  }
  return out;
}

/** O que vai para o banco */
function serialize(db: Db, ent: EntityDef, data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const f = ent.fields.find((x) => x.name === k);
    out[k] = f && JSON_TYPES.has(f.type) && v != null ? JSON.stringify(v) : toDbValue(db, v);
  }
  return out;
}

/** SELECT com o "nome" de cada relação: cliente_id → cliente_id__label */
function selectWithLabels(db: Db, table: string, ent: EntityDef) {
  const qb = db(table).select(`${table}.*`);
  ent.fields
    .filter((f) => f.type === 'relation' && f.entity)
    .forEach((f, i) => {
      const rel = getEntity(f.entity)!;
      qb.leftJoin(`${f.entity} as j${i}`, `j${i}.id`, `${table}.${f.name}`).select(
        `j${i}.${rel.labelField} as ${f.name}__label`,
      );
      // colunas emprestadas desta relação (deRelacao)
      for (const v of ent.fields.filter((x) => x.deRelacao?.relacao === f.name))
        qb.select(`j${i}.${v.deRelacao!.campo} as ${v.name}`);
    });
  return qb;
}

/**
 * Aplica busca e filtros vindos da URL:
 *   q=texto                    busca nos campos `search`
 *   campo=valor                igual (repetível: campo=a&campo=b → "a ou b"; multiselect: contém)
 *   campo__de / campo__ate     intervalo (datas e números)
 *   campo__contem=texto        texto contém
 *   lixeira=1                  só os registros na lixeira
 */
export function applyFilters(db: Db, qb: Knex.QueryBuilder, table: string, ent: EntityDef, query: Query) {
  const col = (f: FieldDef) => `${table}.${f.name}`;
  const fields = queryable(ent);
  const like = likeOp(db);

  if (ent.lixeira) {
    if (query.lixeira === '1' || query.lixeira === 'true') qb.whereNotNull(`${table}.${TRASH_COLUMN}`);
    else qb.whereNull(`${table}.${TRASH_COLUMN}`);
  }

  const term = str(query.q);
  const searchable = fields.filter((f) => f.search);
  if (term && searchable.length)
    qb.where((w) =>
      searchable.forEach((f) => {
        // relação (ou coluna emprestada dela): busca no nome e nos campos de busca do registro relacionado
        const relacao = f.deRelacao ? ent.fields.find((x) => x.name === f.deRelacao!.relacao) : f;
        const rel = relacao?.type === 'relation' ? getEntity(relacao.entity) : undefined;
        if (rel) {
          const campos = [...new Set([rel.labelField, ...rel.fields.filter((x) => x.search).map((x) => x.name)])];
          w.orWhereIn(
            `${table}.${relacao!.name}`,
            db(relacao!.entity!)
              .select('id')
              .where((s) => campos.forEach((c) => s.orWhere(c, like, `%${term}%`))),
          );
        } else w.orWhere(col(f), like, `%${term}%`);
      }),
    );

  for (const f of fields) {
    if (f.deRelacao) continue; // não é coluna da tabela
    const eq = values(query[f.name]);
    if (eq.length) {
      if (f.type === 'boolean') qb.where(col(f), toDbValue(db, eq[0] === '1' || eq[0] === 'true'));
      else if (f.type === 'multiselect')
        qb.where((w) => eq.forEach((v) => w.orWhere(col(f), like, `%${JSON.stringify(v)}%`)));
      else if (f.filtraDetalhe) {
        // o valor no próprio registro ou em alguma linha da sub-tabela (ex.: categoria de uma parte do rateio)
        const d = ent.details?.find((x) => x.entity === f.filtraDetalhe!.entidade);
        qb.where((w) => {
          w.whereIn(col(f), eq);
          if (d) w.orWhereIn(`${table}.id`, db(d.entity).select(d.field).whereIn(f.filtraDetalhe!.campo, eq));
        });
      } else if (eq.length > 1) qb.whereIn(col(f), eq);
      else qb.where(col(f), eq[0]);
    }

    if (RANGE_TYPES.has(f.type)) {
      const isNum = !['date', 'datetime'].includes(f.type);
      // "2026-11-31" (fim de mês calculado sem olhar o calendário) vira o último dia: o Postgres recusa data inválida
      const de = dataValida(str(query[`${f.name}__de`]));
      const ate = dataValida(str(query[`${f.name}__ate`]));
      if (de)
        qb.where(col(f), '>=', isNum ? Number(de) : f.type === 'datetime' && de.length === 10 ? `${de} 00:00:00` : de);
      if (ate)
        qb.where(
          col(f),
          '<=',
          isNum ? Number(ate) : f.type === 'datetime' && ate.length === 10 ? `${ate} 23:59:59` : ate,
        );
    }

    const contem = str(query[`${f.name}__contem`]);
    if (contem) qb.where(col(f), like, `%${contem}%`);
  }
  return qb;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  /** Sem paginação (exportação) — respeita o limite */
  all?: boolean;
  limit?: number;
  /** Só estes ids (escopo: ex. usuários = membros do espaço). null/undefined = sem restrição */
  somenteIds?: number[] | null;
}

/** Campo e direção de ordenação pedidos na URL (ou o padrão da entidade) */
function ordenacao(ent: EntityDef, query: Query) {
  const sortable = ['id', 'criado_em', 'atualizado_em', ...queryable(ent).map((f) => f.name)];
  const sortField = sortable.includes(str(query.sort)) ? str(query.sort) : (ent.defaultSort?.field ?? 'id');
  const dir: 'asc' | 'desc' =
    query.dir === 'asc' || query.dir === 'desc' ? query.dir : (ent.defaultSort?.dir ?? 'desc');
  return { sortField, dir };
}

/**
 * Listagem com as linhas extras da aplicação (hook `listExtras`) intercaladas na mesma ordenação.
 * Busca todos os registros filtrados (o período limita), junta, ordena e pagina em memória;
 * os totais continuam sendo só dos registros da entidade.
 */
export async function listWithExtras(db: Db, table: string, ent: EntityDef, query: Query, extras: Row[]) {
  if (!extras.length) return listRecords(db, table, ent, query);
  const base = await listRecords(db, table, ent, query, { all: true });
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(1000, Math.max(1, Number(query.pageSize) || 10));
  const { sortField, dir } = ordenacao(ent, query);
  const def = ent.fields.find((f) => f.name === sortField);
  const chave = def?.type === 'relation' ? `${sortField}__label` : sortField;
  const valor = (r: Row) => r[chave] as string | number | null | undefined;
  const sinal = dir === 'asc' ? 1 : -1;
  const todas = [...base.rows, ...extras];
  const ordem = new Map(todas.map((r, i) => [r, i]));
  todas.sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va !== vb) {
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      const c =
        typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
      if (c) return c * sinal;
    }
    // empate: registros da entidade na ordem do banco, extras depois deles
    return ordem.get(a)! - ordem.get(b)!;
  });
  return {
    rows: todas.slice((page - 1) * pageSize, page * pageSize),
    total: todas.length,
    extras: extras.length,
    page,
    pageSize,
    ...(base.totais && { totais: base.totais }),
  };
}

/** Lista com filtros, ordenação, paginação e totais das colunas com `total: 'sum'` */
export async function listRecords(db: Db, table: string, ent: EntityDef, query: Query, opts: ListOptions = {}) {
  const page = Math.max(1, opts.page ?? (Number(query.page) || 1));
  const pageSize = Math.min(1000, Math.max(1, opts.pageSize ?? (Number(query.pageSize) || 10)));
  const fields = queryable(ent);

  const { sortField, dir } = ordenacao(ent, query);
  const sortDef = fields.find((f) => f.name === sortField);
  // relação ordena pelo nome do registro relacionado, não pelo id
  const orderCol =
    sortDef?.type === 'relation' ? `${sortField}__label` : sortDef?.deRelacao ? sortField : `${table}.${sortField}`;

  const escopo = <T extends Knex.QueryBuilder>(qb: T): T =>
    (opts.somenteIds ? qb.whereIn(`${table}.id`, opts.somenteIds) : qb) as T;
  const total = await count(escopo(applyFilters(db, db(table), table, ent, query)));

  const totals: Record<string, number> = {};
  const summed = fields.filter((f) => f.total === 'sum');
  if (summed.length) {
    const qb = escopo(applyFilters(db, db(table), table, ent, query));
    summed.forEach((f) => qb.sum({ [f.name]: `${table}.${f.name}` }));
    const row = (await qb.first()) as Record<string, number | string | null> | undefined;
    for (const f of summed) totals[f.name] = Math.round(Number(row?.[f.name] ?? 0) * 100) / 100;
  }

  const qb = escopo(applyFilters(db, selectWithLabels(db, table, ent), table, ent, query))
    .orderBy(orderCol, dir)
    .orderBy(`${table}.id`, dir);
  if (opts.all) qb.limit(opts.limit ?? 50_000);
  else qb.limit(pageSize).offset((page - 1) * pageSize);
  const rows = ((await qb) as Row[]).map((r) => present(ent, r)!);

  return { rows, total, page, pageSize, ...(summed.length && { totais: totals }) };
}

/** Registro com o nome das relações e as linhas das sub-tabelas ({ [entidade]: linhas[] }) */
export async function getRecord(db: Db, table: string, ent: EntityDef, id: number) {
  const row = await selectWithLabels(db, table, ent).where(`${table}.id`, id).first();
  if (!row) throw new HttpError(404, 'Registro não encontrado');
  const out = present(ent, row)!;
  for (const d of ent.details ?? []) {
    const child = getEntity(d.entity);
    if (!child) continue;
    const rows = (await selectWithLabels(db, d.entity, child)
      .where(`${d.entity}.${d.field}`, id)
      .orderBy(`${d.entity}.id`, 'asc')) as Row[];
    out[d.entity] = rows.map((r) => present(child, r)!);
  }
  return out;
}

async function findRaw(db: Db, table: string, id: number) {
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'Registro não encontrado');
  const row = (await db(table).where({ id }).first()) as Row | undefined;
  if (!row) throw new HttpError(404, 'Registro não encontrado');
  return row;
}

/** Relações apontam para registros existentes (e compatíveis com o campo do qual dependem) */
export async function checkRelations(db: Db, ent: EntityDef, data: Record<string, unknown>, current?: Row) {
  const errors: Record<string, string> = {};
  for (const f of ent.fields) {
    if (f.type !== 'relation' || !f.entity) continue;
    const touched = f.name in data || (f.dependsOn && f.dependsOn.field in data);
    const id = f.name in data ? data[f.name] : current?.[f.name];
    if (!touched || id == null) continue;
    const target = getEntity(f.entity);
    const rel = await db(f.entity).where({ id }).first();
    if (!rel || (target?.lixeira && rel[TRASH_COLUMN] && f.name in data)) {
      errors[f.name] = 'Registro selecionado não existe';
      continue;
    }
    if (f.dependsOn) {
      const parent = f.dependsOn.field in data ? data[f.dependsOn.field] : current?.[f.dependsOn.field];
      const param = f.dependsOn.param ?? f.dependsOn.field;
      if (parent != null && String(rel[param]) !== String(parent)) {
        const parentLabel = ent.fields.find((x) => x.name === f.dependsOn!.field)?.label ?? f.dependsOn.field;
        errors[f.name] = `Não combina com o campo ${parentLabel}`;
      }
    }
  }
  if (Object.keys(errors).length) throw badRequest('Verifique os campos', errors);
}

/** Valida, gera hash das senhas, confere relações e roda o hook beforeSave */
async function prepare(
  c: OpCtx,
  table: string,
  ent: EntityDef,
  body: unknown,
  mode: 'create' | 'update',
  current?: Row,
) {
  const input = (body ?? {}) as Record<string, unknown>;
  const v = validateEntity(ent, input, mode);
  const det = validateDetails(ent, input);
  if (!v.ok || !det.ok) throw badRequest('Verifique os campos', { ...(!v.ok && v.errors), ...(!det.ok && det.errors) });
  const data = v.data;
  for (const f of ent.fields) {
    if (f.type !== 'password') continue;
    if (data[f.name]) data[f.name] = await hashPassword(String(data[f.name]));
    else delete data[f.name];
  }
  // calculados e somas das sub-tabelas sempre vêm do servidor
  Object.assign(data, computeFields(ent, { ...current, ...data }), detailSums(ent, det.data));
  await checkRelations(c.db, ent, data, current);
  const ctx = { db: c.db, actor: c.user, sessionId: c.sessionId, mode, current };
  await hooks[table]?.beforeSave?.(data, ctx);
  return { data, ctx, details: det.data };
}

const prefixErrors = (fields: FieldErrors, prefix: string) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [`${prefix}${k}`, v]));

/**
 * Grava as linhas das sub-tabelas: atualiza as que vieram com id, cria as novas e
 * apaga as que sumiram. Cada linha passa pelas regras (hooks, log) da sua entidade.
 */
async function saveDetails(
  c: OpCtx,
  ent: EntityDef,
  parentId: number,
  details: Record<string, Record<string, unknown>[]>,
) {
  for (const d of ent.details ?? []) {
    const rows = details[d.entity];
    const child = getEntity(d.entity);
    if (!rows || !child) continue;
    const existentes = (await c.db(d.entity).where(d.field, parentId).select('id')).map((r) => Number(r.id));
    const manter = new Set(rows.map((r) => Number(r.id)).filter((id) => existentes.includes(id)));
    for (const id of existentes) if (!manter.has(id)) await removeRecord(c, d.entity, child, id);
    for (const [i, r] of rows.entries()) {
      const { id, ...vals } = r;
      const body = { ...vals, [d.field]: parentId };
      try {
        if (manter.has(Number(id))) await updateRecord(c, d.entity, child, Number(id), body);
        else await createRecord(c, d.entity, child, body);
      } catch (err) {
        if (err instanceof HttpError && err.fields)
          throw new HttpError(err.status, err.message, prefixErrors(err.fields, `${d.entity}.${i}.`));
        throw err;
      }
    }
  }
}

/** Com sub-tabelas, o registro e as linhas são gravados juntos (tudo ou nada) */
const inTransaction = <T>(c: OpCtx, ent: EntityDef, fn: (c: OpCtx) => Promise<T>) =>
  ent.details?.length ? c.db.transaction((trx) => fn({ ...c, db: trx })) : fn(c);

/** Apaga o que depende dos registros: linhas das sub-tabelas e anexos */
export async function deleteDependents(db: Db, table: string, ent: EntityDef, ids: number[]) {
  if (!ids.length) return;
  for (const d of ent.details ?? []) {
    const child = getEntity(d.entity);
    if (!child) continue;
    const childIds = (await db(d.entity).whereIn(d.field, ids).select('id')).map((r) => Number(r.id));
    await deleteDependents(db, d.entity, child, childIds);
    await db(d.entity).whereIn(d.field, ids).del();
  }
  if (ent.anexos) await deleteAnexosOf(db, table, ids);
}

export function createRecord(c: OpCtx, table: string, ent: EntityDef, body: unknown) {
  return inTransaction(c, ent, (c) => createOne(c, table, ent, body));
}

async function createOne(c: OpCtx, table: string, ent: EntityDef, body: unknown) {
  const { data, ctx, details } = await prepare(c, table, ent, body, 'create');
  const record: Record<string, unknown> = { ...data, criado_em: nowLocal() };
  for (const f of ent.fields) if (f.auto === 'code') record[f.name] = generateCode(f.prefix);

  const [inserted] = await c
    .db(table)
    .insert(serialize(c.db, ent, record))
    .returning('id');
  const id = typeof inserted === 'object' ? inserted.id : inserted;
  await saveDetails(c, ent, id, details);
  const row = (await c.db(table).where({ id }).first()) as Row;
  await hooks[table]?.afterSave?.(row, data, ctx);
  if (!c.semLog)
    await addLog(
      c.db,
      {
        entidade: table,
        registro_id: id,
        acao: 'criação',
        detalhe: String(record[ent.labelField] ?? ''),
        alteracoes: diffRecord(ent, null, record),
      },
      actorOf(c),
    );
  return present(ent, row)!;
}

export function updateRecord(c: OpCtx, table: string, ent: EntityDef, id: number, body: unknown) {
  return inTransaction(c, ent, (c) => updateOne(c, table, ent, id, body));
}

async function updateOne(c: OpCtx, table: string, ent: EntityDef, id: number, body: unknown) {
  const current = await findRaw(c.db, table, id);
  if (ent.lixeira && current[TRASH_COLUMN])
    throw new HttpError(409, 'Registro está na lixeira. Restaure antes de editar.');
  const { data, ctx, details } = await prepare(c, table, ent, body, 'update', current);

  const alteracoes = diffRecord(ent, current, data);
  if (Object.keys(alteracoes).length) {
    await c
      .db(table)
      .where({ id })
      .update(serialize(c.db, ent, { ...data, atualizado_em: nowLocal() }));
  }
  await saveDetails(c, ent, id, details);
  const row = (await c.db(table).where({ id }).first()) as Row;
  await hooks[table]?.afterSave?.(row, data, ctx);
  if (Object.keys(alteracoes).length && !c.semLog) {
    await addLog(
      c.db,
      { entidade: table, registro_id: id, acao: 'alteração', detalhe: String(row[ent.labelField] ?? ''), alteracoes },
      actorOf(c),
    );
  }
  return present(ent, row)!;
}

/**
 * Exclui. Com lixeira: a primeira exclusão só marca `excluido_em`; `definitivo`
 * apaga de vez (só para quem já está na lixeira). Sem lixeira: apaga direto.
 */
export async function removeRecord(c: OpCtx, table: string, ent: EntityDef, id: number, definitivo = false) {
  const current = await findRaw(c.db, table, id);
  const naLixeira = !!(ent.lixeira && current[TRASH_COLUMN]);
  const label = String(current[ent.labelField] ?? '');

  if (ent.lixeira && !definitivo) {
    if (naLixeira) throw new HttpError(409, 'Registro já está na lixeira');
    await hooks[table]?.beforeDelete?.(current, { db: c.db, actor: c.user, sessionId: c.sessionId });
    await c
      .db(table)
      .where({ id })
      .update({ [TRASH_COLUMN]: nowLocal() });
    await addLog(c.db, { entidade: table, registro_id: id, acao: 'enviado à lixeira', detalhe: label }, actorOf(c));
    return 'lixeira' as const;
  }
  if (ent.lixeira && !naLixeira) throw new HttpError(409, 'Envie para a lixeira antes de excluir definitivamente');
  if (!ent.lixeira) await hooks[table]?.beforeDelete?.(current, { db: c.db, actor: c.user, sessionId: c.sessionId });

  await deleteDependents(c.db, table, ent, [id]);
  await c.db(table).where({ id }).del();
  await addLog(
    c.db,
    {
      entidade: table,
      registro_id: id,
      acao: ent.lixeira ? 'exclusão definitiva' : 'exclusão',
      detalhe: label,
      alteracoes: diffRecord(ent, current, null),
    },
    actorOf(c),
  );
  return 'excluido' as const;
}

export async function restoreRecord(c: OpCtx, table: string, ent: EntityDef, id: number) {
  if (!ent.lixeira) throw new HttpError(400, 'Esta entidade não usa lixeira');
  const current = await findRaw(c.db, table, id);
  if (!current[TRASH_COLUMN]) throw new HttpError(409, 'Registro não está na lixeira');
  await c
    .db(table)
    .where({ id })
    .update({ [TRASH_COLUMN]: null });
  await addLog(
    c.db,
    { entidade: table, registro_id: id, acao: 'restauração', detalhe: String(current[ent.labelField] ?? '') },
    actorOf(c),
  );
  return getRecord(c.db, table, ent, id);
}

const ORDEM_ALFABETICA = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * Opções de select (id + nome), com filtros de igualdade (selects dependentes).
 * Sem os inativos (`activeField`), a não ser com ?todos=1 (filtros da listagem).
 */
export async function relationOptions(
  db: Db,
  table: string,
  ent: EntityDef,
  query: Query,
  somenteIds?: number[] | null,
) {
  const qb = db(table).select('id', `${ent.labelField} as label`);
  if (ent.lixeira) qb.whereNull(TRASH_COLUMN);
  const todos = query.todos === '1' || query.todos === 'true';
  if (ent.activeField && !todos) qb.where(ent.activeField, toDbValue(db, true));
  for (const f of queryable(ent)) {
    const v = values(query[f.name]);
    if (v.length) qb.whereIn(f.name, f.type === 'boolean' ? v.map((x) => toDbValue(db, x === '1' || x === 'true')) : v);
  }
  // inclui o valor atual do formulário mesmo que esteja filtrado/na lixeira
  const incluir = Number(query.incluir);
  if (incluir > 0) qb.orWhere('id', incluir);
  // escopo por fora (subconsulta): o `orWhere` do valor atual não pode escapar dele
  const rows = await (
    somenteIds
      ? db.from(qb.as('o')).whereIn('id', somenteIds).orderBy('label', 'asc')
      : qb.orderBy(ent.labelField, 'asc')
  ).limit(5000);
  // ordem alfabética do português (o banco ordena maiúsculas antes de minúsculas e acentos no fim — SQLite — ou
  // conforme a collation do Postgres): "e-Core" junto de "Eficaz", "Ágil" junto de "Agile"
  return rows
    .map((r) => ({ value: r.id as number, label: String(r.label ?? r.id) }))
    .sort((a, b) => ORDEM_ALFABETICA.compare(a.label, b.label));
}

/** Esvazia a lixeira de uma entidade agora (botão "Esvaziar lixeira"): apaga de vez, com um log de resumo. */
export async function emptyTrash(c: OpCtx, table: string, ent: EntityDef) {
  if (!ent.lixeira) throw new HttpError(400, 'Esta entidade não usa lixeira');
  return inTransaction(c, ent, async (c) => {
    const ids = (await c.db(table).whereNotNull(TRASH_COLUMN).select('id')).map((r) => Number(r.id));
    if (!ids.length) return 0;
    for (let i = 0; i < ids.length; i += 500) await deleteDependents(c.db, table, ent, ids.slice(i, i + 500));
    await c.db(table).whereNotNull(TRASH_COLUMN).del();
    await addLog(
      c.db,
      { entidade: table, acao: 'lixeira esvaziada', detalhe: `${ids.length} registro(s) apagado(s) de vez` },
      actorOf(c),
    );
    return ids.length;
  });
}

/** Esvazia da lixeira o que está lá há mais de `dias` (0 = nunca). Retorna quantos apagou. */
export async function purgeTrash(db: Db, entities: Record<string, EntityDef>, dias: number) {
  if (!dias) return 0;
  const limite = nowLocal(new Date(Date.now() - dias * 86_400_000));
  let n = 0;
  for (const [table, ent] of Object.entries(entities)) {
    if (!ent.lixeira) continue;
    const vencidos = () => db(table).whereNotNull(TRASH_COLUMN).where(TRASH_COLUMN, '<', limite);
    const ids = (await vencidos().select('id')).map((r) => Number(r.id));
    await deleteDependents(db, table, ent, ids);
    n += await vencidos().del();
  }
  return n;
}
