import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getTickerData, getTickersDataset, fetchTickerHistory, getVerifiedYahooSymbol, type TickerData } from '../fetching';
import { fetchHolding, getMetadataValue, syncDividends, fetchDividends } from '../sheets';
import { Exchange, parseExchange, toGoogleFinanceExchangeCode, type Holding, type Portfolio } from '../types';
import { formatPrice, toILS, normalizeCurrency } from '../currency';
import { useLanguage } from '../i18n';
import { getOwnedInPortfolios } from '../portfolioUtils';
import type { Dividend } from '../fetching/types';
import { Currency } from '../types';

export interface TickerDetailsProps {
    sheetId: string;
    ticker?: string;
    exchange?: string;
    numericId?: string;
    initialName?: string;
    initialNameHe?: string;
    onClose?: () => void;
    portfolios?: Portfolio[];
    isPortfoliosLoading?: boolean;
}

interface TickerDetailsRouteParams extends Record<string, string | undefined> {
    exchange: string;
    ticker: string;
    numericId?: string;
}

export const useTickerDetails = ({ sheetId, ticker: propTicker, exchange: propExchange, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, portfolios = [] }: TickerDetailsProps) => {
    const params = useParams<TickerDetailsRouteParams>();
    const navigate = useNavigate();
    const location = useLocation();
    const state = location.state as { from?: string, numericId?: string, initialName?: string, initialNameHe?: string, returnState?: any } | null;

    const ticker = propTicker || params.ticker;
    const exchange = parseExchange(propExchange || params.exchange || '');
    const explicitNumericId = propNumericId || params.numericId || state?.numericId;
    const [derivedNumericId, setDerivedNumericId] = useState<string | undefined>(undefined);
    const numericId = explicitNumericId || derivedNumericId;
    const initialName = propInitialName || state?.initialName;
    const initialNameHe = propInitialNameHe || state?.initialNameHe;

    const [data, setData] = useState<TickerData | null>(null);
    const [holdingData, setHoldingData] = useState<Holding | null>(null);
    const [historicalData, setHistoricalData] = useState<{ date: Date; price: number; adjClose?: number }[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [sheetRebuildTime, setSheetRebuildTime] = useState<string | null>(null);

    const { t, language } = useLanguage();

    const mergeDividends = useCallback((apiDivs: Dividend[] = [], sheetDivs: Dividend[] = []): Dividend[] => {
        const seen = new Set<string>();
        const merged: Dividend[] = [];
        [...apiDivs, ...sheetDivs].forEach(div => {
            const key = `${div.date.toISOString().split('T')[0]}:${Number(div.amount).toFixed(6)}`;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(div);
            }
        });
        return merged.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, []);

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!ticker || !exchange) {
            setError(t('Missing ticker or exchange information.', 'חסר מידע על סימול או בורסה.'));
            setLoading(false);
            return;
        }
        if (!forceRefresh) setLoading(true);
        setError(null);

        try {
            let currentNumericId = numericId;
            if (!currentNumericId && (exchange === Exchange.TASE || exchange === Exchange.GEMEL || exchange === Exchange.PENSION)) {
                const dataset = await getTickersDataset();
                const tickerNum = parseInt(ticker, 10);
                const foundItem = Object.values(dataset).flat().find(item =>
                    item.exchange === exchange &&
                    (item.symbol === ticker || (!isNaN(tickerNum) && item.securityId === tickerNum))
                );

                if (foundItem) {
                    if (foundItem.securityId) {
                        currentNumericId = foundItem.securityId.toString();
                        setDerivedNumericId(currentNumericId);
                    }
                    if (foundItem.symbol && foundItem.symbol !== ticker) {
                        navigate(`/ticker/${exchange}/${foundItem.symbol}`, { replace: true, state: { ...state, numericId: currentNumericId } });
                        return;
                    }
                }
            }
            if (!currentNumericId && (exchange === Exchange.TASE || exchange === Exchange.GEMEL || exchange === Exchange.PENSION)) {
                console.warn(`Could not find numeric ID for ${ticker}.`);
            }
            const numericIdVal = currentNumericId ? parseInt(currentNumericId, 10) : null;

            const [tickerData, holding, sheetRebuild, sheetDividends] = await Promise.all([
                getTickerData(ticker, exchange, numericIdVal, undefined, forceRefresh),
                fetchHolding(sheetId, ticker, exchange.toUpperCase()),
                getMetadataValue(sheetId, 'holdings_rebuild'),
                fetchDividends(sheetId, ticker, exchange)
            ]);

            setHoldingData(holding);
            setData(prev => {
                if (!tickerData) return prev;
                return {
                    ...prev,
                    ...tickerData,
                    dividends: mergeDividends(tickerData.dividends, sheetDividends),
                    splits: tickerData.splits || prev?.splits
                } as TickerData;
            });
            setSheetRebuildTime(sheetRebuild);

            if (tickerData?.dividends && !tickerData.fromCacheMax) {
                syncDividends(sheetId, ticker, exchange, tickerData.dividends, tickerData.source || 'API');
            }
            if (tickerData?.historical) setHistoricalData(tickerData.historical);
            if (!tickerData && !holding) setError(t('Ticker not found.', 'הנייר לא נמצא.'));
        } catch (err) {
            setError(t('Error fetching ticker data.', 'שגיאה בטעינת נתוני הנייר.'));
            console.error(err);
        } finally {
            if (!forceRefresh) setLoading(false);
        }
    }, [ticker, exchange, numericId, sheetId, t, navigate, state, mergeDividends]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        if (ticker && exchange) {
            await fetchData(true);
            const historyResponse = await fetchTickerHistory(ticker, exchange, undefined, true);
            setHistoricalData(historyResponse?.historical || []);
            setData(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    dividends: mergeDividends(historyResponse?.dividends, prev.dividends),
                    splits: historyResponse?.splits || prev.splits
                } as TickerData;
            });
        }
        setRefreshing(false);
    }, [ticker, exchange, fetchData, mergeDividends]);


    useEffect(() => {
        fetchData();
        if (ticker && exchange) {
            Promise.all([
                fetchTickerHistory(ticker, exchange),
                fetchDividends(sheetId, ticker, exchange)
            ]).then(([historyResponse, sheetDividends]) => {
                setHistoricalData(historyResponse?.historical || []);
                setData(prev => {
                    if (!prev && !historyResponse) return null;
                    return {
                        ...prev,
                        ...historyResponse,
                        dividends: mergeDividends(historyResponse?.dividends, sheetDividends),
                        splits: historyResponse?.splits || prev?.splits
                    } as TickerData;
                });
                if (historyResponse?.dividends && !historyResponse.fromCacheMax) {
                    syncDividends(sheetId, ticker, exchange, historyResponse.dividends, 'Yahoo History');
                }
            });
        }
    }, [ticker, exchange, sheetId, fetchData, mergeDividends]);

    const displayData = data || holdingData;
    const resolvedName = data?.name || holdingData?.name || initialName;
    const resolvedNameHe = data?.nameHe || holdingData?.nameHe || initialNameHe;

    const ownedInPortfolios = useMemo(() => ticker ? getOwnedInPortfolios(ticker, portfolios, exchange) : undefined, [ticker, portfolios, exchange]);

    const externalLinks = useMemo(() => {
        if (!ticker) return [];
        const links = [];
        const nid = numericId || data?.numericId || holdingData?.numericId;
        const clenaedHeName = resolvedNameHe?.replace(/[^a-zA-Z0-9א-ת ]/g, '').replace(/ /g, '-');

        if (exchange === Exchange.CBS) return [];
        if (exchange === Exchange.GEMEL) {
            if (nid) links.push({ name: 'MyGemel', url: `https://www.mygemel.net/קופות-גמל/${clenaedHeName}` });
            links.push({ name: 'GemelNet', url: `https://gemelnet.cma.gov.il/views/perutHodshi.aspx?idGuf=${nid}&OCHLUSIYA=1` });
            return links;
        }
        if (exchange === Exchange.PENSION) {
            if (nid) links.push({ name: 'MyGemel', url: `https://www.mygemel.net/פנסיה/${clenaedHeName}` });
            links.push({ name: 'PensyaNet', url: `https://pensyanet.cma.gov.il/Parameters/Index` });
            return links;
        }
        if (exchange === Exchange.FOREX) {
            const formattedTicker = ticker.includes('-') ? ticker : `${ticker}-USD`;
            links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${getVerifiedYahooSymbol(ticker, exchange)}` });
            links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${formattedTicker}` });
        } else {
            links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${getVerifiedYahooSymbol(ticker, exchange)}` });
            const gExchange = toGoogleFinanceExchangeCode(exchange);
            links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}${gExchange ? `:${gExchange}` : ''}` });
        }
        if (data?.globesInstrumentId) links.push({ name: 'Globes', url: `https://www.globes.co.il/portal/instrument.aspx?instrumentid=${data.globesInstrumentId}` });
        if (nid) {
            links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${nid}` });
            links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/security/${nid}` });
        }
        return links;
    }, [ticker, exchange, data, holdingData, numericId, resolvedNameHe]);
    
    const dividendGains = useMemo<Record<string, { amount: number, pct: number }>>(() => {
        const empty = {
            'YTD': { amount: 0, pct: 0 },
            '1Y': { amount: 0, pct: 0 },
            '5Y': { amount: 0, pct: 0 },
            'Max': { amount: 0, pct: 0 },
        };
        if (!data?.dividends || !displayData?.currency || !historicalData?.length) return empty;
        const findPriceAtDate = (date: Date) => historicalData.reduce((closest, current) => Math.abs(current.date.getTime() - date.getTime()) < Math.abs(closest.date.getTime() - date.getTime()) ? current : closest).price;
        const calculateDividendsForRange = (startDate: Date) => {
            const basePrice = findPriceAtDate(startDate);
            if (!basePrice) return { amount: 0, pct: 0 };
            const sum = data.dividends!.filter(d => d.date >= startDate).reduce((acc, div) => acc + div.amount, 0);
            return { amount: sum, pct: sum / basePrice };
        };
        const now = new Date();
        return {
            'YTD': calculateDividendsForRange(new Date(now.getFullYear(), 0, 1)),
            '1Y': calculateDividendsForRange(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())),
            '5Y': calculateDividendsForRange(new Date(now.getFullYear() - 5, now.getMonth(), now.getDate())),
            'Max': calculateDividendsForRange(historicalData[0].date),
        };
    }, [data?.dividends, displayData?.currency, historicalData]);

    const formatVolume = (val?: number, currencyCode?: string) => {
        if (val == null || isNaN(val)) return null;
        let effectiveVal = val;
        let effectiveCurrency = currencyCode;
        if (currencyCode && normalizeCurrency(currencyCode) === Currency.ILA) {
            effectiveVal = toILS(val, Currency.ILA);
            effectiveCurrency = Currency.ILS;
        }
        const suffixes = language === 'he' ? { K: " א'", M: " מ'", B: " B" } : { K: 'K', M: 'M', B: 'B' };
        const tier = Math.floor(Math.log10(effectiveVal) / 3);
        if (tier < 1) return { text: effectiveVal.toLocaleString(), currency: '' };
        const [suffix, _] = Object.entries(suffixes)[tier - 1];
        const formattedNum = (effectiveVal / Math.pow(1000, tier)).toLocaleString(undefined, { maximumFractionDigits: 1 });
        const currencyStr = effectiveCurrency ? formatPrice(0, effectiveCurrency, 0, t).replace(/[0-9.,-]+/g, '').trim() : '';
        return { text: `${formattedNum}${suffix}`, currency: currencyStr };
    };

    return {
        ticker,
        exchange,
        numericId,
        data,
        holdingData,
        historicalData,
        loading,
        error,
        refreshing,
        sheetRebuildTime,
        t,
        language,
        fetchData,
        handleRefresh,
        displayData,
        resolvedName,
        resolvedNameHe,
        ownedInPortfolios,
        externalLinks,
        dividendGains,
        formatVolume,
        state,
        navigate,
    };
};
