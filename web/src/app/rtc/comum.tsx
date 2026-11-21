// Componentes compartilhados pelas telas do simulador
import { Form } from 'react-bootstrap';
import type { Row } from '@frame/shared';

/** Texto colorido de variação: positivo bom (verde) ou ruim (vermelho), conforme `bomSe` */
export function Delta({
  valor,
  bomSe = 'menor',
  sufixo = '%',
}: {
  valor: number | null;
  bomSe?: 'maior' | 'menor';
  sufixo?: string;
}) {
  if (valor == null || !Number.isFinite(valor)) return <span className="text-muted">—</span>;
  const bom = bomSe === 'maior' ? valor >= 0 : valor <= 0;
  const txt = `${valor > 0 ? '+' : ''}${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${sufixo}`;
  return <span className={Math.abs(valor) < 0.05 ? 'text-muted' : bom ? 'rtc-pos' : 'rtc-neg'}>{txt}</span>;
}

export function SeletorEmpresa({
  empresas,
  valor,
  onChange,
}: {
  empresas: Row[];
  valor: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <Form.Select
      aria-label="Empresa"
      value={valor ?? ''}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ minWidth: '16rem' }}
    >
      {empresas.map((e) => (
        <option key={e.id} value={e.id}>
          {String(e.nome)} — {String(e.regime)}
        </option>
      ))}
    </Form.Select>
  );
}
