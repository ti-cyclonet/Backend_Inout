import { BadRequestException } from '@nestjs/common';

/**
 * Opiniones de los clientes sobre los ítems de la tienda en línea (producto,
 * material de reventa o combo). El cliente califica de 1 a 5 y comenta; el
 * negocio decide qué se publica en su tienda y puede responder.
 */

export const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'HIDDEN'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_LIMITS = {
  authorName: 60,
  comment: 1000,
  commentMin: 3,
  phone: 20,
  reply: 600,
  /** Opiniones publicadas que devuelve la tienda por ítem. */
  publicPage: 50,
  /** Por visitante (IP) y tienda, en 24 horas. */
  perVisitorPerDay: 5,
} as const;

/** Configuración de la tienda (marketplace_config.reviews). */
export interface ReviewSettings {
  /** La tienda muestra las opiniones y deja opinar. */
  enabled: boolean;
  /** Publicar sin revisión. Si no, cada opinión espera a que el negocio la apruebe. */
  autoPublish: boolean;
}

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings = { enabled: false, autoPublish: false };

export function resolveReviewSettings(raw: any): ReviewSettings {
  return {
    enabled: raw?.enabled === true,
    autoPublish: raw?.autoPublish === true,
  };
}

export interface ReviewInput {
  rating?: unknown;
  comment?: unknown;
  authorName?: unknown;
  authorPhone?: unknown;
  /** Aceptó que su nombre y su opinión se publiquen en la tienda. */
  consentPublish?: unknown;
}

export interface CleanReview {
  rating: number;
  comment: string;
  authorName: string;
  authorPhone: string | null;
}

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** El comentario conserva sus saltos de línea (máximo dos seguidos). */
const cleanMultiline = (v: unknown, max: number) =>
  String(v ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

/** Valida y normaliza lo que envía el cliente desde la tienda. */
export function validateReviewInput(input: ReviewInput): CleanReview {
  const rating = Number(input?.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new BadRequestException('Elige una calificación de 1 a 5 estrellas.');
  }
  const authorName = clean(input?.authorName, REVIEW_LIMITS.authorName);
  if (authorName.length < 2) throw new BadRequestException('Escribe tu nombre.');
  const comment = cleanMultiline(input?.comment, REVIEW_LIMITS.comment);
  if (comment.length < REVIEW_LIMITS.commentMin) throw new BadRequestException('Escribe tu opinión.');
  if (input?.consentPublish !== true) {
    throw new BadRequestException('Debes aceptar que tu nombre y tu opinión se publiquen en la tienda.');
  }
  const phone = String(input?.authorPhone ?? '').replace(/[^\d+]/g, '').slice(0, REVIEW_LIMITS.phone);
  if (phone && phone.replace(/\D/g, '').length < 7) throw new BadRequestException('El teléfono no es válido.');
  return { rating, comment, authorName, authorPhone: phone || null };
}

/** Estado inicial de una opinión nueva según la configuración de la tienda. */
export function initialStatus(settings: ReviewSettings): ReviewStatus {
  return settings.autoPublish ? 'PUBLISHED' : 'PENDING';
}

/** Cambio que pide el negocio desde su panel (estado y/o respuesta). */
export interface ReviewUpdate {
  status?: ReviewStatus;
  /** null o '' borra la respuesta. */
  reply?: string | null;
}

export function validateReviewUpdate(body: any): ReviewUpdate {
  const out: ReviewUpdate = {};
  if (body?.status !== undefined) {
    if (!REVIEW_STATUSES.includes(body.status)) {
      throw new BadRequestException(`Estado no válido. Usa: ${REVIEW_STATUSES.join(', ')}.`);
    }
    out.status = body.status;
  }
  if (body?.reply !== undefined) {
    out.reply = body.reply === null ? null : cleanMultiline(body.reply, REVIEW_LIMITS.reply) || null;
  }
  if (out.status === undefined && out.reply === undefined) throw new BadRequestException('No hay cambios.');
  return out;
}

export interface RatingSummary {
  average: number;
  count: number;
}

/** Promedio (un decimal) y número de opiniones publicadas. */
export function summarize(ratings: number[]): RatingSummary {
  const valid = ratings.filter((r) => Number.isFinite(r) && r >= 1 && r <= 5);
  if (!valid.length) return { average: 0, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return { average: Math.round(avg * 10) / 10, count: valid.length };
}

/**
 * Nombre que se muestra en la tienda: primer nombre e inicial del apellido
 * ("María José Pérez" → "María P."), para no exponer el nombre completo.
 */
export function publicAuthorName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Cliente';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
