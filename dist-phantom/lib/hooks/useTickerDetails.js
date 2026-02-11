"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useTickerDetails = void 0;
const react_1 = require("react");
const react_router_dom_1 = require("react-router-dom");
const fetching_1 = require("../fetching");
const sheets_1 = require("../sheets");
const types_1 = require("../types");
const currency_1 = require("../currency");
const i18n_1 = require("../i18n");
const portfolioUtils_1 = require("../portfolioUtils");
const types_2 = require("../types");
const useTickerDetails = ({ sheetId, ticker: propTicker, exchange: propExchange, numericId: propNumericId, initialName: propInitialName, initialNameHe: propInitialNameHe, portfolios = [] }) => {
    const params = (0, react_router_dom_1.useParams)();
    const navigate = (0, react_router_dom_1.useNavigate)();
    const location = (0, react_router_dom_1.useLocation)();
    const state = location.state;
    const ticker = propTicker || params.ticker;
    const exchange = (0, types_1.parseExchange)(propExchange || params.exchange || '');
    const explicitNumericId = propNumericId || params.numericId || state?.numericId;
    const [derivedNumericId, setDerivedNumericId] = (0, react_1.useState)(undefined);
    const numericId = explicitNumericId || derivedNumericId;
    const initialName = propInitialName || state?.initialName;
    const initialNameHe = propInitialNameHe || state?.initialNameHe;
    const [data, setData] = (0, react_1.useState)(null);
    const [holdingData, setHoldingData] = (0, react_1.useState)(null);
    const [historicalData, setHistoricalData] = (0, react_1.useState)(null);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [refreshing, setRefreshing] = (0, react_1.useState)(false);
    const [sheetRebuildTime, setSheetRebuildTime] = (0, react_1.useState)(null);
    const { t, language } = (0, i18n_1.useLanguage)();
    const mergeDividends = (0, react_1.useCallback)((apiDivs = [], sheetDivs = []) => {
        const seen = new Set();
        const merged = [];
        [...apiDivs, ...sheetDivs].forEach(div => {
            const key = `${div.date.toISOString().split('T')[0]}:${Number(div.amount).toFixed(6)}`;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(div);
            }
        });
        return merged.sort((a, b) => b.date.getTime() - a.date.getTime());
    }, []);
    const fetchData = (0, react_1.useCallback)(async (forceRefresh = false) => {
        if (!ticker || !exchange) {
            setError(t('Missing ticker or exchange information.', 'חסר מידע על סימול או בורסה.'));
            setLoading(false);
            return;
        }
        if (!forceRefresh)
            setLoading(true);
        setError(null);
        try {
            let currentNumericId = numericId;
            if (!currentNumericId && (exchange === types_1.Exchange.TASE || exchange === types_1.Exchange.GEMEL || exchange === types_1.Exchange.PENSION)) {
                const dataset = await (0, fetching_1.getTickersDataset)();
                const tickerNum = parseInt(ticker, 10);
                const foundItem = Object.values(dataset).flat().find(item => item.exchange === exchange &&
                    (item.symbol === ticker || (!isNaN(tickerNum) && item.securityId === tickerNum)));
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
            if (!currentNumericId && (exchange === types_1.Exchange.TASE || exchange === types_1.Exchange.GEMEL || exchange === types_1.Exchange.PENSION)) {
                console.warn(`Could not find numeric ID for ${ticker}.`);
            }
            const numericIdVal = currentNumericId ? parseInt(currentNumericId, 10) : null;
            const [tickerData, holding, sheetRebuild, sheetDividends] = await Promise.all([
                (0, fetching_1.getTickerData)(ticker, exchange, numericIdVal, undefined, forceRefresh),
                (0, sheets_1.fetchHolding)(sheetId, ticker, exchange.toUpperCase()),
                (0, sheets_1.getMetadataValue)(sheetId, 'holdings_rebuild'),
                (0, sheets_1.fetchDividends)(sheetId, ticker, exchange)
            ]);
            setHoldingData(holding);
            setData(prev => {
                if (!tickerData)
                    return prev;
                return {
                    ...prev,
                    ...tickerData,
                    dividends: mergeDividends(tickerData.dividends, sheetDividends),
                    splits: tickerData.splits || prev?.splits
                };
            });
            setSheetRebuildTime(sheetRebuild);
            if (tickerData?.dividends && !tickerData.fromCacheMax) {
                (0, sheets_1.syncDividends)(sheetId, ticker, exchange, tickerData.dividends, tickerData.source || 'API');
            }
            if (tickerData?.historical)
                setHistoricalData(tickerData.historical);
            if (!tickerData && !holding)
                setError(t('Ticker not found.', 'הנייר לא נמצא.'));
        }
        catch (err) {
            setError(t('Error fetching ticker data.', 'שגיאה בטעינת נתוני הנייר.'));
            console.error(err);
        }
        finally {
            if (!forceRefresh)
                setLoading(false);
        }
    }, [ticker, exchange, numericId, sheetId, t, navigate, state, mergeDividends]);
    const handleRefresh = (0, react_1.useCallback)(async () => {
        setRefreshing(true);
        if (ticker && exchange) {
            await fetchData(true);
            const historyResponse = await (0, fetching_1.fetchTickerHistory)(ticker, exchange, undefined, true);
            setHistoricalData(historyResponse?.historical || []);
            setData(prev => {
                if (!prev)
                    return null;
                return {
                    ...prev,
                    dividends: mergeDividends(historyResponse?.dividends, prev.dividends),
                    splits: historyResponse?.splits || prev.splits
                };
            });
        }
        setRefreshing(false);
    }, [ticker, exchange, fetchData, mergeDividends]);
    (0, react_1.useEffect)(() => {
        fetchData();
        if (ticker && exchange) {
            Promise.all([
                (0, fetching_1.fetchTickerHistory)(ticker, exchange),
                (0, sheets_1.fetchDividends)(sheetId, ticker, exchange)
            ]).then(([historyResponse, sheetDividends]) => {
                setHistoricalData(historyResponse?.historical || []);
                setData(prev => {
                    if (!prev && !historyResponse)
                        return null;
                    return {
                        ...prev,
                        ...historyResponse,
                        dividends: mergeDividends(historyResponse?.dividends, sheetDividends),
                        splits: historyResponse?.splits || prev?.splits
                    };
                });
                if (historyResponse?.dividends && !historyResponse.fromCacheMax) {
                    (0, sheets_1.syncDividends)(sheetId, ticker, exchange, historyResponse.dividends, 'Yahoo History');
                }
            });
        }
    }, [ticker, exchange, sheetId, fetchData, mergeDividends]);
    const displayData = data || holdingData;
    const resolvedName = data?.name || holdingData?.name || initialName;
    const resolvedNameHe = data?.nameHe || holdingData?.nameHe || initialNameHe;
    const ownedInPortfolios = (0, react_1.useMemo)(() => ticker ? (0, portfolioUtils_1.getOwnedInPortfolios)(ticker, portfolios, exchange) : undefined, [ticker, portfolios, exchange]);
    const externalLinks = (0, react_1.useMemo)(() => {
        if (!ticker)
            return [];
        const links = [];
        const nid = numericId || data?.numericId || holdingData?.numericId;
        const clenaedHeName = resolvedNameHe?.replace(/[^a-zA-Z0-9א-ת ]/g, '').replace(/ /g, '-');
        if (exchange === types_1.Exchange.CBS)
            return [];
        if (exchange === types_1.Exchange.GEMEL) {
            if (nid)
                links.push({ name: 'MyGemel', url: `https://www.mygemel.net/קופות-גמל/${clenaedHeName}` });
            links.push({ name: 'GemelNet', url: `https://gemelnet.cma.gov.il/views/perutHodshi.aspx?idGuf=${nid}&OCHLUSIYA=1` });
            return links;
        }
        if (exchange === types_1.Exchange.PENSION) {
            if (nid)
                links.push({ name: 'MyGemel', url: `https://www.mygemel.net/פנסיה/${clenaedHeName}` });
            links.push({ name: 'PensyaNet', url: `https://pensyanet.cma.gov.il/Parameters/Index` });
            return links;
        }
        if (exchange === types_1.Exchange.FOREX) {
            const formattedTicker = ticker.includes('-') ? ticker : `${ticker}-USD`;
            links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${(0, fetching_1.getVerifiedYahooSymbol)(ticker, exchange)}` });
            links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${formattedTicker}` });
        }
        else {
            links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${(0, fetching_1.getVerifiedYahooSymbol)(ticker, exchange)}` });
            const gExchange = (0, types_1.toGoogleFinanceExchangeCode)(exchange);
            links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}${gExchange ? `:${gExchange}` : ''}` });
        }
        if (data?.globesInstrumentId)
            links.push({ name: 'Globes', url: `https://www.globes.co.il/portal/instrument.aspx?instrumentid=${data.globesInstrumentId}` });
        if (nid) {
            links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${nid}` });
            links.push({ name: 'Maya (TASE)', url: `https://market.tase.co.il/he/market_data/security/${nid}` });
        }
        return links;
    }, [ticker, exchange, data, holdingData, numericId, resolvedNameHe]);
    const dividendGains = (0, react_1.useMemo)(() => {
        const empty = {
            'YTD': { amount: 0, pct: 0 },
            '1Y': { amount: 0, pct: 0 },
            '5Y': { amount: 0, pct: 0 },
            'Max': { amount: 0, pct: 0 },
        };
        if (!data?.dividends || !displayData?.currency || !historicalData?.length)
            return empty;
        const findPriceAtDate = (date) => historicalData.reduce((closest, current) => Math.abs(current.date.getTime() - date.getTime()) < Math.abs(closest.date.getTime() - date.getTime()) ? current : closest).price;
        const calculateDividendsForRange = (startDate) => {
            const basePrice = findPriceAtDate(startDate);
            if (!basePrice)
                return { amount: 0, pct: 0 };
            const sum = data.dividends.filter(d => d.date >= startDate).reduce((acc, div) => acc + div.amount, 0);
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
    const formatVolume = (val, currencyCode) => {
        if (val == null || isNaN(val))
            return null;
        let effectiveVal = val;
        let effectiveCurrency = currencyCode;
        if (currencyCode && (0, currency_1.normalizeCurrency)(currencyCode) === types_2.Currency.ILA) {
            effectiveVal = (0, currency_1.toILS)(val, types_2.Currency.ILA);
            effectiveCurrency = types_2.Currency.ILS;
        }
        const suffixes = language === 'he' ? { K: " א'", M: " מ'", B: " B" } : { K: 'K', M: 'M', B: 'B' };
        let tier = Math.floor(Math.log10(effectiveVal) / 3);
        if (tier < 1)
            return { text: effectiveVal.toLocaleString(), currency: '' };
        // Clamp tier to max available suffix (Billions currently)
        const suffixEntries = Object.entries(suffixes);
        if (tier > suffixEntries.length)
            tier = suffixEntries.length;
        const [suffix, _] = suffixEntries[tier - 1];
        const formattedNum = (effectiveVal / Math.pow(1000, tier)).toLocaleString(undefined, { maximumFractionDigits: 1 });
        const currencyStr = effectiveCurrency ? (0, currency_1.formatPrice)(0, effectiveCurrency, 0, t).replace(/[0-9.,-]+/g, '').trim() : '';
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
exports.useTickerDetails = useTickerDetails;
