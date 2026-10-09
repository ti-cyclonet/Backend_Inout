import { DEFAULT_THANKS_MESSAGES, resolveThanksMessages } from './thanks-messages';

describe('resolveThanksMessages', () => {
  it('sin configurar → textos por defecto y activa', () => {
    expect(resolveThanksMessages(null)).toEqual(DEFAULT_THANKS_MESSAGES);
  });

  it('respeta los textos de la tienda, recorta y usa el defecto en los vacíos', () => {
    const r = resolveThanksMessages({ title: '  ¡Mil gracias, {nombre}!  ', message: '', signature: 'x'.repeat(500), extra: 'ignorado' });
    expect(r.title).toBe('¡Mil gracias, {nombre}!');
    expect(r.message).toBe(DEFAULT_THANKS_MESSAGES.message);
    expect(r.signature).toHaveLength(120);
    expect((r as any).extra).toBeUndefined();
  });

  it('guarda el estilo de la tarjeta; uno desconocido vuelve al clásico', () => {
    expect(resolveThanksMessages({ style: 'postal' }).style).toBe('postal');
    expect(resolveThanksMessages({ style: 'nocturno' }).style).toBe('nocturno');
    expect(resolveThanksMessages({ style: 'neón' }).style).toBe('clasico');
    expect(resolveThanksMessages({}).style).toBe('clasico');
  });

  it('se puede apagar', () => {
    expect(resolveThanksMessages({ enabled: false }).enabled).toBe(false);
  });
});
