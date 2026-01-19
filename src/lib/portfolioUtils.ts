import type { Portfolio } from './types';

export function getOwnedInPortfolios(symbol: string, portfolios: Portfolio[], exchange?: string) {
  if (!portfolios || portfolios.length === 0) return undefined;
  const owningPortfolios = portfolios.filter(p =>
    p.holdings && p.holdings.some(h => 
        h.ticker === symbol && 
        (!exchange || h.exchange === exchange)
    )
  );
  return owningPortfolios.length > 0 ? owningPortfolios.map(p => p.name) : undefined;
}
