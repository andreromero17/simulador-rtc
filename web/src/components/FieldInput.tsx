import { Form, InputGroup } from 'react-bootstrap';
import { maskDocument, maskPhone, type FieldDef, type Permissions } from '@frame/shared';
import MoneyInput from './MoneyInput';
import NumberInput from './NumberInput';
import PasswordInput from './PasswordInput';
import PermissionMatrix from './PermissionMatrix';
import RelationSelect from './RelationSelect';
import ImageInput from './ImageInput';
import { fmtDate } from '../lib/format';

export type FormValue = string | number | boolean | null | undefined | Permissions | string[];
export interface Option {
  value: number | string;
  label: string;
}

interface Props {
  field: FieldDef;
  value: FormValue;
  onChange: (name: string, value: FormValue) => void;
  error?: string;
  options?: Option[];
  /** Desabilita (somente leitura, sem permissão de editar, disabledWhen...) */
  disabled?: boolean;
  /** Formulário de criação (senha obrigatória) ou edição (senha opcional) */
  isNew?: boolean;
  /** Valores do formulário inteiro (para campos que dependem de outros) */
  values?: Record<string, FormValue>;
  /** id do input (padrão: nome do campo); necessário quando o campo se repete, como nas sub-tabelas */
  inputId?: string;
  /** Só o controle, sem rótulo nem ajuda (células de sub-tabela) */
  bare?: boolean;
}

/** Renderiza o input adequado ao tipo do campo definido nas entidades */
export default function FieldInput({
  field: f,
  value,
  onChange,
  error,
  options = [],
  disabled,
  isNew = true,
  values,
  inputId,
  bare,
}: Props) {
  const id = inputId ?? f.name;
  const set = (v: FormValue) => onChange(f.name, v);
  const text = value == null || typeof value === 'object' ? '' : String(value);
  const isDisabled = disabled || f.readonly || !!f.compute;
  const required = !disabled && f.required && (f.type !== 'password' || isNew);
  const common = { id, isInvalid: !!error, disabled: isDisabled, required, ...(bare && { 'aria-label': f.label }) };
  let help = f.help;

  if (f.type === 'boolean') {
    return (
      <Form.Group>
        <Form.Check
          type="switch"
          id={id}
          label={bare ? undefined : f.label}
          aria-label={bare ? f.label : undefined}
          checked={!!value}
          disabled={isDisabled}
          onChange={(e) => set(e.target.checked)}
          className={bare ? '' : 'mt-md-4 pt-md-2 fw-semibold'}
        />
        {help && <Form.Text className="d-block">{help}</Form.Text>}
      </Form.Group>
    );
  }

  let input;
  /** campos compostos (grupo/vários elementos) mostram o erro fora do controle */
  let composite = false;
  switch (f.type) {
    case 'textarea':
      input = <Form.Control as="textarea" rows={4} value={text} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'select':
      input = (
        <Form.Select value={text} onChange={(e) => set(e.target.value)} {...common}>
          {!f.required && <option value="">—</option>}
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Form.Select>
      );
      break;
    case 'relation':
      input = (
        <RelationSelect
          id={id}
          value={text}
          options={options}
          onChange={(v) => set(v)}
          isInvalid={!!error}
          disabled={isDisabled}
          required={required}
          aria-label={bare ? f.label : undefined}
        />
      );
      composite = true;
      break;
    case 'money':
      input = (
        <MoneyInput
          id={id}
          value={value as number | null}
          onChange={set}
          isInvalid={!!error}
          disabled={isDisabled}
          allowNegative={f.min === undefined || f.min < 0}
        />
      );
      composite = true;
      break;
    case 'number':
      input = (
        <NumberInput
          id={id}
          value={value as number | string | null}
          onChange={set}
          isInvalid={!!error}
          disabled={isDisabled}
          required={required}
          aria-label={bare ? f.label : undefined}
        />
      );
      break;
    case 'percent':
      input = (
        <InputGroup hasValidation>
          <Form.Control
            type="number"
            step="any"
            min={f.min}
            max={f.max}
            className="text-end"
            value={text}
            onChange={(e) => set(e.target.value)}
            {...common}
          />
          <InputGroup.Text>%</InputGroup.Text>
        </InputGroup>
      );
      composite = true;
      break;
    case 'document':
      input = (
        <Form.Control
          inputMode="numeric"
          value={text}
          placeholder={
            f.docType === 'cnpj' ? '00.000.000/0000-00' : f.docType === 'cpf' ? '000.000.000-00' : 'CPF ou CNPJ'
          }
          onChange={(e) => set(maskDocument(e.target.value, f.docType))}
          {...common}
        />
      );
      break;
    case 'phone':
      input = (
        <Form.Control
          type="tel"
          inputMode="tel"
          value={text}
          placeholder="(00) 00000-0000"
          onChange={(e) => set(maskPhone(e.target.value))}
          {...common}
        />
      );
      break;
    case 'color':
      input = (
        <div className="d-flex gap-2">
          <Form.Control
            type="color"
            className="form-control-color flex-shrink-0"
            value={/^#[0-9a-f]{6}$/i.test(text) ? text : '#000000'}
            onChange={(e) => set(e.target.value)}
            disabled={isDisabled}
            aria-label={`${f.label} (seletor)`}
          />
          <Form.Control
            value={text}
            maxLength={7}
            className="font-monospace"
            placeholder="#RRGGBB"
            onChange={(e) => set(e.target.value)}
            {...common}
          />
        </div>
      );
      composite = true;
      break;
    case 'multiselect': {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      input = (
        <div className={`chip-select ${error ? 'is-invalid' : ''}`} role="group" aria-label={f.label} id={id}>
          {f.options?.map((o) => {
            const on = sel.includes(o);
            const cor = f.colors?.[o];
            return (
              <button
                type="button"
                key={o}
                disabled={isDisabled}
                aria-pressed={on}
                className={`chip-option ${on ? 'on' : ''}`}
                style={on && cor ? { background: cor, borderColor: cor } : undefined}
                onClick={() => set(on ? sel.filter((x) => x !== o) : [...sel, o])}
              >
                {on && <i className="bi bi-check-lg me-1" />}
                {o}
              </button>
            );
          })}
        </div>
      );
      composite = true;
      break;
    }
    case 'date':
      input = <Form.Control type="date" value={text} onChange={(e) => set(e.target.value)} {...common} />;
      break;
    case 'datetime':
      input = f.readonly ? (
        <Form.Control value={text ? fmtDate(text, true) : '—'} disabled id={id} />
      ) : (
        <Form.Control
          type="datetime-local"
          value={text.replace(' ', 'T').slice(0, 16)}
          onChange={(e) => set(e.target.value)}
          {...common}
        />
      );
      break;
    case 'password':
      if (!isNew) help = 'Preencha só se quiser definir uma nova senha.';
      input = (
        <PasswordInput
          id={id}
          value={text}
          onChange={set}
          isInvalid={!!error}
          error={error}
          disabled={isDisabled}
          placeholder={isNew ? '' : 'Manter a senha atual'}
          showRules={!!text}
        />
      );
      return (
        <Form.Group>
          <Label f={f} required={required} />
          {input}
          {help && !text && <Form.Text>{help}</Form.Text>}
        </Form.Group>
      );
    case 'image':
      input = (
        <ImageInput id={id} value={text} onChange={set} disabled={isDisabled} isInvalid={!!error} label={f.label} />
      );
      break;
    case 'permissions':
      return (
        <Form.Group>
          <Label f={f} required={required} />
          <PermissionMatrix
            value={value as Permissions}
            onChange={set}
            disabled={isDisabled}
            allGranted={!!(f.disabledWhen && values?.[f.disabledWhen])}
          />
          {error && <div className="invalid-feedback d-block">{error}</div>}
        </Form.Group>
      );
    default:
      input = (
        <Form.Control
          type={f.type === 'email' ? 'email' : 'text'}
          value={text}
          maxLength={f.maxLength}
          placeholder={f.readonly ? 'Gerado automaticamente' : ''}
          onChange={(e) => set(e.target.value)}
          {...common}
        />
      );
  }

  if (bare)
    return (
      <>
        {input}
        {error && <div className="invalid-feedback d-block small">{error}</div>}
      </>
    );

  return (
    <Form.Group>
      <Label f={f} required={required} id={id} />
      {input}
      {composite ? (
        error && <div className="invalid-feedback d-block">{error}</div>
      ) : (
        <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
      )}
      {help && <Form.Text>{help}</Form.Text>}
    </Form.Group>
  );
}

function Label({ f, required, id }: { f: FieldDef; required?: boolean; id?: string }) {
  return (
    <Form.Label htmlFor={id ?? f.name} className="fw-semibold small">
      {f.label} {required && <span className="text-danger">*</span>}
    </Form.Label>
  );
}
