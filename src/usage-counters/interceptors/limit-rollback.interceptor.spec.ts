import { BadRequestException, CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { LimitRollbackInterceptor } from './limit-rollback.interceptor';

function contexto(request: any, tipo = 'http'): ExecutionContext {
  return { getType: () => tipo, switchToHttp: () => ({ getRequest: () => request }) } as any;
}
const handler = (obs: any): CallHandler => ({ handle: () => obs });

describe('LimitRollbackInterceptor', () => {
  let decrement: jest.Mock;
  let interceptor: LimitRollbackInterceptor;

  beforeEach(() => {
    decrement = jest.fn().mockResolvedValue(undefined);
    interceptor = new LimitRollbackInterceptor({ decrement } as any);
  });

  it('devuelve el cupo reservado cuando la operación falla y conserva el error', async () => {
    const request = { limitReservation: { tenantId: 't1', variableName: 'nVentas' } };
    const error = new BadRequestException('Stock insuficiente');

    await expect(firstValueFrom(interceptor.intercept(contexto(request), handler(throwError(() => error))))).rejects.toBe(error);

    expect(decrement).toHaveBeenCalledWith('t1', 'nVentas');
    expect(request.limitReservation).toBeNull();
  });

  it('no toca el contador si la operación sale bien', async () => {
    const request = { limitReservation: { tenantId: 't1', variableName: 'nVentas' } };

    await expect(firstValueFrom(interceptor.intercept(contexto(request), handler(of({ id: 1 }))))).resolves.toEqual({ id: 1 });

    expect(decrement).not.toHaveBeenCalled();
  });

  it('sin reserva (rutas sin límite o límite alcanzado) solo propaga el error', async () => {
    const error = new BadRequestException('cualquier cosa');

    await expect(firstValueFrom(interceptor.intercept(contexto({}), handler(throwError(() => error))))).rejects.toBe(error);

    expect(decrement).not.toHaveBeenCalled();
  });

  it('si devolver el cupo falla, igual responde con el error original', async () => {
    decrement.mockRejectedValue(new Error('BD caída'));
    const request = { limitReservation: { tenantId: 't1', variableName: 'nPedidos' } };
    const error = new BadRequestException('Datos inválidos');

    await expect(firstValueFrom(interceptor.intercept(contexto(request), handler(throwError(() => error))))).rejects.toBe(error);
  });
});
