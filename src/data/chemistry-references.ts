/** Reference facts, not calculated eigenvalues. Source: OpenStax Chemistry 2e §8.4. */
export const DIATOMIC_REFERENCES: Readonly<Record<string, { bondOrder: number; unpaired: number; piBelowSigma: boolean | null; sourceId: string }>> = {
  H: { bondOrder: 1, unpaired: 0, piBelowSigma: null, sourceId: 'openstax-mo' },
  He: { bondOrder: 0, unpaired: 0, piBelowSigma: null, sourceId: 'openstax-mo' },
  C: { bondOrder: 2, unpaired: 0, piBelowSigma: true, sourceId: 'openstax-mo' },
  N: { bondOrder: 3, unpaired: 0, piBelowSigma: true, sourceId: 'openstax-mo' },
  O: { bondOrder: 2, unpaired: 2, piBelowSigma: false, sourceId: 'openstax-mo' },
  F: { bondOrder: 1, unpaired: 0, piBelowSigma: false, sourceId: 'openstax-mo' },
};
