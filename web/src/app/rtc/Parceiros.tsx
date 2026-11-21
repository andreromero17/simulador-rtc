// Clientes e fornecedores: listagem genérica + botão de consulta do regime pelo CNPJ
import { useState } from 'react';
import { Button } from 'react-bootstrap';
import type { ResultadoConsultaCnpj } from '@frame/shared';
import { api, errorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import CrudList from '../../pages/CrudList';

export default function Parceiros() {
  const { can } = useAuth();
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);

  const consultar = async () => {
    setOcupado(true);
    try {
      const r = await api.post<ResultadoConsultaCnpj>('/rtc/parceiros/consultar', {});
      toast.success(
        `${r.atualizados} CNPJ(s) atualizado(s)` +
          (r.naoEncontrados ? `, ${r.naoEncontrados} não encontrado(s)` : '') +
          (r.falhas ? `, ${r.falhas} falha(s)` : '') +
          (r.restantes ? `. Faltam ${r.restantes}: clique de novo.` : '.'),
      );
      setVersao((v) => v + 1);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <CrudList
      key={versao}
      entity="parceiros"
      actions={
        can('parceiros', 'editar') ? (
          <Button
            variant="light"
            disabled={ocupado}
            onClick={() => void consultar()}
            title="Busca Simples/MEI, UF e CNAE em base pública"
          >
            <i className="bi bi-search me-1" /> {ocupado ? 'Consultando…' : 'Consultar CNPJs'}
          </Button>
        ) : null
      }
    />
  );
}
