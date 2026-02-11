"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usePortfolios = usePortfolios;
const react_1 = require("react");
const index_1 = require("./sheets/index");
function usePortfolios(sheetId, refreshTrigger = 0) {
    const [portfolios, setPortfolios] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    (0, react_1.useEffect)(() => {
        if (!sheetId)
            return;
        let active = true;
        setLoading(true);
        (0, index_1.fetchPortfolios)(sheetId)
            .then(data => {
            if (active) {
                setPortfolios(data);
                setLoading(false);
            }
        })
            .catch(err => {
            if (active) {
                console.error("Failed to load portfolios", err);
                setError(String(err));
                setLoading(false);
            }
        });
        return () => { active = false; };
    }, [sheetId, refreshTrigger]);
    return { portfolios, loading, error };
}
