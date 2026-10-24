// ShapeCoach Premium: Google Play subscriptions sold inside the ShapeCoach Android app.
//
// The Android app is a Trusted Web Activity: it opens this website in Chrome and lets the
// page reach Google Play Billing through the Digital Goods API (prices and owned purchases)
// and the Payment Request API (buying). Play refunds subscriptions that are not
// acknowledged within three days, and only the Play Developer API can acknowledge them, so
// each new purchase is sent to /api/verify-purchase (see api/verify-purchase.js).
//
// Each plan is its own Play subscription with a single base plan, because the Digital Goods
// API only exposes the first eligible base plan of a subscription.

export const PLAY_BILLING = 'https://play.google.com/billing';
export const ANDROID_PACKAGE = 'net.shapecoach.app';
export const VERIFY_URL = '/api/verify-purchase';

/** ShapeCoach Premium plans, best value first. listPrice is shown until Google Play answers. */
export const PLANS = [
  { id: 'shapecoach_premium_yearly', period: 'P1Y', listPrice: { currency: 'USD', value: '59.99' } },
  { id: 'shapecoach_premium', period: 'P1M', listPrice: { currency: 'USD', value: '9.99' } },
];
export const PLAN_IDS = PLANS.map((plan) => plan.id);
export const DEFAULT_PLAN = PLANS[0].id;

/** Google Play's subscription centre, opened on the given plan when there is one. */
export function manageUrl(planId) {
  const sku = PLAN_IDS.includes(planId) ? `sku=${planId}&` : '';
  return `https://play.google.com/store/account/subscriptions?${sku}package=${ANDROID_PACKAGE}`;
}

// The Android app opens app.html?source=android. Remember that for the rest of the visit so
// pages reached by links (for example the landing page and back) still know.
const APP_FLAG = 'shapecoach.androidApp';

/** True when this page is running inside the ShapeCoach Android app. */
export function inAndroidApp(win = globalThis.window) {
  try {
    const fromLaunch = new URLSearchParams(win.location.search).get('source') === 'android';
    const fromReferrer = String(win.document?.referrer ?? '').startsWith(`android-app://${ANDROID_PACKAGE}`);
    if (fromLaunch || fromReferrer) win.sessionStorage.setItem(APP_FLAG, '1');
    return fromLaunch || fromReferrer || win.sessionStorage.getItem(APP_FLAG) === '1';
  } catch {
    return false;
  }
}

/** "US$9.99" style price from a Digital Goods API price ({ currency, value }). */
export function formatPrice(price, locale) {
  if (!price?.currency || price.value === undefined) return null;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: price.currency }).format(Number(price.value));
  } catch {
    return `${price.value} ${price.currency}`;
  }
}

/** "a month" from an ISO 8601 period such as P1M; null when unknown. */
export function periodLabel(iso) {
  const match = /^P(\d+)([DWMY])$/.exec(String(iso ?? ''));
  if (!match) return null;
  const count = Number(match[1]);
  const unit = { D: 'day', W: 'week', M: 'month', Y: 'year' }[match[2]];
  return count === 1 ? `a ${unit}` : `every ${count} ${unit}s`;
}

/**
 * A free trial's length from an ISO 8601 period: P7D or P1W → { length: '7 days', short: '7-day' }.
 * null when there is no trial.
 */
export function trialLabel(iso) {
  const match = /^P(\d+)([DWM])$/.exec(String(iso ?? ''));
  if (!match || Number(match[1]) === 0) return null;
  const [count, unit] = match[2] === 'W' ? [Number(match[1]) * 7, 'day'] : [Number(match[1]), match[2] === 'D' ? 'day' : 'month'];
  return { length: `${count} ${unit}${count === 1 ? '' : 's'}`, short: `${count}-${unit}` };
}

/** Length of a P<n>M or P<n>Y period in months; null for other periods. */
function months(iso) {
  const match = /^P(\d+)([MY])$/.exec(String(iso ?? ''));
  return match ? Number(match[1]) * (match[2] === 'Y' ? 12 : 1) : null;
}

/**
 * The plans as the paywall shows them, with Google Play's prices where it gave them.
 * @returns {Array<{id: string, name: string, amount: string, period: string, perMonth: string|null, save: number|null, trial: {length: string, short: string}|null}>}
 */
export function describePlans(details = [], locale) {
  const plans = PLANS.map((plan) => {
    const item = details.find((d) => d.itemId === plan.id);
    const fromPlay = item?.price?.currency && item.price.value !== undefined;
    return {
      id: plan.id,
      price: fromPlay ? item.price : plan.listPrice,
      period: (fromPlay && item.subscriptionPeriod) || plan.period,
      // Google Play reports a trial only to people eligible for it (new subscribers).
      trial: fromPlay ? trialLabel(item.freeTrialPeriod) : null,
    };
  });
  const monthly = plans.find((plan) => months(plan.period) === 1);
  return plans.map(({ id, price, period, trial }) => {
    const length = months(period);
    const perMonth = length > 1 ? formatPrice({ currency: price.currency, value: Number(price.value) / length }, locale) : null;
    // Saving against paying monthly for the same time, only when both prices share a currency.
    const save = length > 1 && monthly && monthly.price.currency === price.currency
      ? Math.round((1 - Number(price.value) / (Number(monthly.price.value) * length)) * 100)
      : null;
    return {
      id,
      name: length === 12 ? 'Yearly' : length === 1 ? 'Monthly' : `Every ${length} months`,
      amount: formatPrice(price, locale),
      period: periodLabel(period) ?? '',
      perMonth,
      save: save > 0 ? save : null,
      trial,
    };
  });
}

async function connect(win) {
  if (typeof win.getDigitalGoodsService !== 'function') return null;
  try {
    return (await win.getDigitalGoodsService(PLAY_BILLING)) ?? null;
  } catch {
    return null;
  }
}

/**
 * What Google Play says about ShapeCoach Premium on this device.
 * @returns {Promise<{billing: boolean, active: boolean, activePlan: string|null, plans: Array, purchases: Array}>}
 * `billing` is false when Google Play Billing can't be reached (e.g. outside the app).
 */
export async function premiumStatus(win = globalThis.window) {
  const service = await connect(win);
  if (!service) return { billing: false, active: false, activePlan: null, plans: describePlans(), purchases: [] };
  const [purchases, details] = await Promise.all([
    service.listPurchases().catch(() => []),
    service.getDetails(PLAN_IDS).catch(() => []),
  ]);
  const owned = purchases.filter((p) => PLAN_IDS.includes(p.itemId));
  return {
    billing: true,
    active: owned.length > 0,
    activePlan: owned[0]?.itemId ?? null,
    plans: describePlans(details),
    purchases: owned,
  };
}

/**
 * Ask our server to verify a purchase with Google Play and acknowledge it.
 * Resolves to the server's answer, or { ok: false } if it couldn't be reached.
 */
export async function verifyPurchase(purchaseToken, { productId = DEFAULT_PLAN, fetchImpl = globalThis.fetch } = {}) {
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ purchaseToken, productId, packageName: ANDROID_PACKAGE }),
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && body.ok === true, ...body };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * Open Google Play's purchase sheet for one ShapeCoach Premium plan.
 * @returns {Promise<{purchased: boolean, cancelled?: boolean, verified?: boolean}>}
 */
export async function subscribe(win = globalThis.window, { sku = DEFAULT_PLAN, fetchImpl = globalThis.fetch } = {}) {
  if (typeof win.PaymentRequest !== 'function') throw new Error('Google Play Billing is not available');
  if (!PLAN_IDS.includes(sku)) throw new Error(`Unknown plan ${sku}`);
  const request = new win.PaymentRequest(
    [{ supportedMethods: PLAY_BILLING, data: { sku } }],
    // Play shows and charges its own price; Payment Request just needs a total.
    { total: { label: 'ShapeCoach Premium', amount: { currency: 'USD', value: '0' } } },
  );
  let response;
  try {
    response = await request.show();
  } catch (error) {
    if (error?.name === 'AbortError') return { purchased: false, cancelled: true };
    throw error;
  }
  const token = response.details?.purchaseToken;
  const result = token ? await verifyPurchase(token, { productId: sku, fetchImpl }) : { ok: false };
  // Play has charged the user either way; the purchase shows up in listPurchases().
  await response.complete(token ? 'success' : 'fail');
  return { purchased: Boolean(token), verified: result.ok };
}

/**
 * Make sure every owned purchase has been acknowledged, in case the verification after
 * buying didn't get through (for example the connection dropped). Cheap and idempotent.
 */
export async function acknowledgeOwned(purchases, { fetchImpl = globalThis.fetch, storage } = {}) {
  for (const purchase of purchases) {
    const key = `shapecoach.ack.${purchase.purchaseToken}`;
    if (storage?.get(key, false)) continue;
    const result = await verifyPurchase(purchase.purchaseToken, { productId: purchase.itemId, fetchImpl });
    if (result.ok) storage?.set(key, true);
  }
}
