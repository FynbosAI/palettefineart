const isoFromLocalDate = (date: Date) => {
  const working = new Date(date.getTime());
  working.setSeconds(0, 0);
  const offsetMinutes = working.getTimezoneOffset();
  working.setMinutes(working.getMinutes() - offsetMinutes);
  return working.toISOString().split('T')[0];
};

export const getDefaultArrivalDate = () => {
  const invocationTimestamp = new Date();
  const date = new Date();
  date.setDate(date.getDate() + 14);
  const computed = isoFromLocalDate(date);
  if (typeof window !== 'undefined') {
    console.log('[SHIPMENT_DEBUG] getDefaultArrivalDate computed', {
      nowIso: invocationTimestamp.toISOString(),
      computed,
    });
  }
  return computed;
};

export const getTodayIsoDate = () => {
  const invocationTimestamp = new Date();
  const today = new Date();
  const computed = isoFromLocalDate(today);
  if (typeof window !== 'undefined') {
    console.log('[SHIPMENT_DEBUG] getTodayIsoDate computed', {
      nowIso: invocationTimestamp.toISOString(),
      computed,
    });
  }
  return computed;
};
