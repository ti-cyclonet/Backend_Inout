import { ConflictException } from '@nestjs/common';
import { duplicateMessage, normalizeReference, useLabel } from './payment-reference';
import { PaymentReferencesService } from './payment-references.service';

describe('Referencia única de los soportes de pago', () => {
  it('normaliza: mayúsculas, sin espacios ni signos, sin prefijos', () => {
    expect(normalizeReference(' m-8721 4093 ')).toBe('M87214093');
    expect(normalizeReference('Ref. M87214093')).toBe('M87214093');
    expect(normalizeReference('REF: 482913')).toBe('482913');
    expect(normalizeReference('No. 482913')).toBe('482913');
    expect(normalizeReference('# 482913')).toBe('482913');
    expect(normalizeReference('APROB 482913')).toBe('APROB482913');
    // Una referencia que empieza por "NO" sin separador no se recorta
    expect(normalizeReference('NOV12345')).toBe('NOV12345');
    // Muy cortas o vacías: no se comparan
    expect(normalizeReference('12')).toBe('');
    expect(normalizeReference(null)).toBe('');
  });

  it('mensaje con dónde se usó', () => {
    const msg = duplicateMessage('M87214093', { source: 'VENTA', id: 's1', label: useLabel('VENTA', 'SC-F-00231'), date: '2026-11-06T20:00:00Z' });
    expect(msg).toMatch(/referencia M87214093 está registrada en la venta SC-F-00231 del 6 de nov/);
  });

  describe('servicio', () => {
    const rowsBySource: Record<string, any[]> = {};
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      const key = sql.includes('FROM manufacturing.sales') ? 'VENTA'
        : sql.includes('order_payments') ? 'PEDIDO'
        : sql.includes('FROM manufacturing.receivable_payments') ? 'CARTERA'
        : sql.includes('FROM manufacturing.receivable_vouchers') ? 'COMPROBANTE_CARTERA' : 'RESERVA';
      return rowsBySource[key] || [];
    });
    const service = new PaymentReferencesService({ manager: { query } } as any);

    beforeEach(() => { Object.keys(rowsBySource).forEach((k) => delete rowsBySource[k]); query.mockClear(); });

    it('encuentra la referencia aunque esté escrita distinto', async () => {
      rowsBySource.PEDIDO = [{ id: 'p1', code: 'SC-PD-00012', date: null, ref: 'ref m 8721-4093' }];
      rowsBySource.VENTA = [{ id: 's9', code: 'SC-F-00001', date: null, ref: 'X87214093' }]; // termina igual, pero es otra
      const uses = await service.findUses('t1', 'M87214093');
      expect(uses).toEqual([{ source: 'PEDIDO', id: 'p1', label: 'un pago del pedido SC-PD-00012', date: null }]);
      expect(query.mock.calls[0][1]).toEqual(['t1', 'M87214093']);
    });

    it('excluye la misma transacción y bloquea las demás', async () => {
      rowsBySource.VENTA = [{ id: 's1', code: 'SC-F-00231', date: null, ref: 'APROB 482913' }];
      await expect(service.assertUnused('t1', 'aprob-482913', [{ source: 'VENTA', id: 's1' }])).resolves.toBeUndefined();
      await expect(service.assertUnused('t1', 'aprob-482913')).rejects.toBeInstanceOf(ConflictException);
      await expect(service.assertUnused('t1', 'aprob-482913')).rejects.toMatchObject({ response: { error: 'REFERENCE_USED', usedIn: 'la venta SC-F-00231' } });
    });

    it('sin referencia (o muy corta) no consulta', async () => {
      await expect(service.assertUnused('t1', '')).resolves.toBeUndefined();
      await expect(service.assertUnused('t1', 'ok')).resolves.toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    });
  });
});
