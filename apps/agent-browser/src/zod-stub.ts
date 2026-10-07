/**
 * Stub Zod pour le bundle MV3 (service worker).
 * Zod 4 tire des regex littéraux (currencyCode, html5Email…) qui cassent
 * le parseur du service worker Chrome (« Invalid regular expression: missing / »).
 * Ce stub laisse les schémas @acg/shared s'initialiser sans logique réelle.
 */
type Any = any;

function createChain(): Any {
  const fn = (..._args: unknown[]) => createChain();
  return new Proxy(fn, {
    get(_target, prop) {
      if (prop === "parse") return (data: unknown) => data;
      if (prop === "safeParse") return (data: unknown) => ({ success: true, data });
      // Évite qu'un await / thenable prenne le proxy pour une Promise
      if (prop === "then" || prop === "catch" || prop === "finally") return undefined;
      return createChain();
    },
    apply() {
      return createChain();
    },
  });
}

export const z = createChain();
export default z;
