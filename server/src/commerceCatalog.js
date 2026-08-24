export const COMMERCE_CATALOG = Object.freeze([
  {
    id: "plus-monthly",
    type: "subscription",
    name: "Neon Academy Plus",
    description: "Energia infinita, histórico ampliado do tutor e personalização Plus.",
    amountCents: 12990,
    currency: "brl",
    interval: "month",
  },
  {
    id: "energy-50",
    type: "energy",
    name: "50 Cubic Energy",
    description: "Pacote com 50 unidades de energia comprada.",
    energy: 50,
    amountCents: 1499,
    compareAtCents: 3999,
    currency: "brl",
  },
  {
    id: "energy-150",
    type: "energy",
    name: "150 Cubic Energy",
    description: "Pacote com 150 unidades de energia comprada.",
    energy: 150,
    amountCents: 3990,
    compareAtCents: 5999,
    currency: "brl",
  },
  {
    id: "energy-500",
    type: "energy",
    name: "500 Cubic Energy",
    description: "Pacote com 500 unidades de energia comprada.",
    energy: 500,
    amountCents: 5990,
    compareAtCents: 7999,
    currency: "brl",
  },
  {
    id: "energy-1000",
    type: "energy",
    name: "1000 Cubic Energy",
    description: "Pacote com 1000 unidades de energia comprada.",
    energy: 1000,
    amountCents: 9990,
    compareAtCents: 12999,
    currency: "brl",
  },
]);

export function findCommerceProduct(productId) {
  return COMMERCE_CATALOG.find((product) => product.id === productId) ?? null;
}

export function stripePriceMatchesProduct(product, price) {
  if (!product || !price || price.active !== true) return false;
  if (price.currency !== product.currency || price.unit_amount !== product.amountCents) return false;
  if (product.type === "subscription") {
    return price.type === "recurring" && price.recurring?.interval === product.interval;
  }
  return price.type === "one_time";
}
