import { BadRequestException } from '@nestjs/common';
import {
  initialStatus, publicAuthorName, resolveReviewSettings, summarize, validateReviewInput, validateReviewUpdate,
} from './product-reviews-rules';

describe('Opiniones de productos', () => {
  const ok = { rating: 5, comment: 'Muy buena tela, el largo es perfecto', authorName: '  Ana   María  Gómez ', consentPublish: true };

  describe('validateReviewInput', () => {
    it('normaliza nombre, comentario y teléfono', () => {
      const r = validateReviewInput({ ...ok, comment: 'Línea 1\r\n\r\n\r\n\r\nLínea   2', authorPhone: '+57 300-123 4567' });
      expect(r).toEqual({ rating: 5, comment: 'Línea 1\n\nLínea 2', authorName: 'Ana María Gómez', authorPhone: '+573001234567' });
    });

    it('el teléfono es opcional', () => {
      expect(validateReviewInput(ok).authorPhone).toBeNull();
    });

    it.each([0, 6, 3.5, 'cinco', undefined])('rechaza la calificación %p', (rating) => {
      expect(() => validateReviewInput({ ...ok, rating })).toThrow(BadRequestException);
    });

    it('acepta la calificación como texto numérico', () => {
      expect(validateReviewInput({ ...ok, rating: '4' }).rating).toBe(4);
    });

    it('pide nombre, comentario y la aceptación de publicar', () => {
      expect(() => validateReviewInput({ ...ok, authorName: 'A' })).toThrow('Escribe tu nombre.');
      expect(() => validateReviewInput({ ...ok, comment: '  ' })).toThrow('Escribe tu opinión.');
      expect(() => validateReviewInput({ ...ok, consentPublish: 'true' })).toThrow(/aceptar/);
    });

    it('rechaza teléfonos muy cortos y recorta textos largos', () => {
      expect(() => validateReviewInput({ ...ok, authorPhone: '123' })).toThrow('El teléfono no es válido.');
      const r = validateReviewInput({ ...ok, comment: 'x'.repeat(2000), authorName: 'y'.repeat(100) });
      expect(r.comment).toHaveLength(1000);
      expect(r.authorName).toHaveLength(60);
    });
  });

  describe('configuración', () => {
    it('apagadas por defecto y solo true activa', () => {
      expect(resolveReviewSettings(null)).toEqual({ enabled: false, autoPublish: false });
      expect(resolveReviewSettings({ enabled: 'yes', autoPublish: 1 })).toEqual({ enabled: false, autoPublish: false });
      expect(resolveReviewSettings({ enabled: true, autoPublish: true })).toEqual({ enabled: true, autoPublish: true });
    });

    it('sin publicación automática, la opinión espera revisión', () => {
      expect(initialStatus({ enabled: true, autoPublish: false })).toBe('PENDING');
      expect(initialStatus({ enabled: true, autoPublish: true })).toBe('PUBLISHED');
    });
  });

  describe('validateReviewUpdate', () => {
    it('acepta estado y respuesta; respuesta vacía la borra', () => {
      expect(validateReviewUpdate({ status: 'PUBLISHED' })).toEqual({ status: 'PUBLISHED' });
      expect(validateReviewUpdate({ reply: '  ¡Gracias!  ' })).toEqual({ reply: '¡Gracias!' });
      expect(validateReviewUpdate({ reply: '' })).toEqual({ reply: null });
      expect(validateReviewUpdate({ reply: null })).toEqual({ reply: null });
    });

    it('rechaza estados inventados y cuerpos vacíos', () => {
      expect(() => validateReviewUpdate({ status: 'DELETED' })).toThrow(BadRequestException);
      expect(() => validateReviewUpdate({})).toThrow('No hay cambios.');
    });
  });

  it('summarize: promedio con un decimal', () => {
    expect(summarize([])).toEqual({ average: 0, count: 0 });
    expect(summarize([5, 4, 4])).toEqual({ average: 4.3, count: 3 });
    expect(summarize([5, 9, NaN])).toEqual({ average: 5, count: 1 });
  });

  it('publicAuthorName: primer nombre e inicial del apellido', () => {
    expect(publicAuthorName('María José Pérez')).toBe('María P.');
    expect(publicAuthorName('Lucía')).toBe('Lucía');
    expect(publicAuthorName('  ana  ruiz ')).toBe('ana R.');
    expect(publicAuthorName('')).toBe('Cliente');
  });
});
