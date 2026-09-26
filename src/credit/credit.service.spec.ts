import { CreditService, addDays, daysBetween } from './credit.service';
import { Receivable, ReceivableStatus } from './entities/receivable.entity';
import { CreditSettings } from './entities/credit-settings.entity';

const service = new CreditService({} as any, {} as any, {} as any, {} as any, {} as any);

const settings = (over: Partial<CreditSettings> = {}): CreditSettings =>
  ({ tenantId: 't', lateInterestMonthlyRate: 3, graceDays: 0, remindersEnabled: false, reminderDaysBefore: 3, overdueReminderEveryDays: 7, ...over }) as CreditSettings;

const receivable = (over: Partial<Receivable> = {}): Receivable =>
  ({
    id: 'r', tenantId: 't', customerId: 'c', customerName: 'Cliente', sourceType: 'SALE', sourceId: 's', documentCode: 'F-1',
    issueDate: '2026-09-01', dueDate: '2026-09-30', termDays: 29, amount: 300000, paidAmount: 0, balance: 300000,
    status: ReceivableStatus.PENDIENTE, voidReason: null, interestAccrued: 0, interestPaid: 0, interestCalcDate: null,
    lastReminderAt: null, reminderCount: 0, ...over,
  }) as Receivable;

describe('fechas', () => {
  it('suma días cruzando fin de mes', () => {
    expect(addDays('2026-09-26', 30)).toBe('2026-10-26');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('cuenta días entre fechas (negativo si ya pasó)', () => {
    expect(daysBetween('2026-09-26', '2026-10-26')).toBe(30);
    expect(daysBetween('2026-10-05', '2026-09-30')).toBe(-5);
  });
});

describe('interestPending (mora)', () => {
  it('no causa intereses antes del vencimiento', () => {
    expect(service.interestPending(receivable(), settings(), '2026-09-30')).toBe(0);
  });

  it('interés simple diario = tasa mensual / 30 sobre el saldo vencido', () => {
    // 300.000 × 3% / 30 × 10 días = 3.000
    expect(service.interestPending(receivable(), settings(), '2026-10-10')).toBe(3000);
  });

  it('respeta los días de gracia', () => {
    // vence 30-sep, gracia 5 → corre desde 5-oct: 5 días al 10-oct = 1.500
    expect(service.interestPending(receivable(), settings({ graceDays: 5 }), '2026-10-10')).toBe(1500);
  });

  it('tasa 0 = sin intereses', () => {
    expect(service.interestPending(receivable(), settings({ lateInterestMonthlyRate: 0 }), '2026-12-31')).toBe(0);
  });

  it('suma lo causado y congelado en un abono anterior más lo que corre desde ese abono', () => {
    // Abono el 10-oct dejó 1.000 de interés sin pagar y saldo 200.000; al 20-oct: 1.000 + 200.000×0,1%×10 = 3.000
    const r = receivable({ balance: 200000, interestAccrued: 3000, interestPaid: 2000, interestCalcDate: '2026-10-10' });
    expect(service.interestPending(r, settings(), '2026-10-20')).toBe(3000);
  });

  it('una cuenta pagada no causa intereses', () => {
    const r = receivable({ balance: 0, status: ReceivableStatus.PAGADA, interestAccrued: 500, interestPaid: 500 });
    expect(service.interestPending(r, settings(), '2026-12-31')).toBe(0);
  });
});
