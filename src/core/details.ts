import type { DealStore } from "./store/index.js";
import type { Deal, Merchant } from "./types/deal.js";

/**
 * Resolve a deal by either its id, its full URL, or its slug. URLs are
 * matched exactly because that's what the data layer stores; ids are
 * the slug (the last URL path segment).
 */
export function resolveDeal(
  store: DealStore,
  idOrUrl: string,
): Deal | null {
  const trimmed = idOrUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return store.getDealByUrl(trimmed);
  }
  // Could be a bare id, or a URL fragment like "/deals/foo-bar"
  if (trimmed.startsWith("/")) {
    const segments = trimmed.split("/").filter(Boolean);
    return store.getDealById(segments[segments.length - 1] ?? trimmed);
  }
  return store.getDealById(trimmed);
}

export interface DealDetails {
  deal: Deal;
  merchant: Merchant | null;
}

export function getDealDetails(store: DealStore, idOrUrl: string): DealDetails | null {
  const deal = resolveDeal(store, idOrUrl);
  if (!deal) return null;
  const merchant = deal.merchantId ? store.getMerchant(deal.merchantId) : null;
  return { deal, merchant };
}
