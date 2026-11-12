/**
 * Return an ISO calendar date (YYYY-MM-DD) without timezone conversion.
 * Empty values are allowed so the date can be cleared on the client form.
 */
export function parseContractSignedOn(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('Data de assinatura inválida');
  const valueDate = new Date(raw + 'T12:00:00.000Z');
  if (!Number.isFinite(valueDate.getTime()) || valueDate.toISOString().slice(0, 10) !== raw) {
    throw new Error('Data de assinatura inválida');
  }
  return raw;
}
