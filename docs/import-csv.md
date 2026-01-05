# Importing CSV from Yahoo Finance

This short guide explains how to export a CSV from Yahoo Finance and import it into the app.

## Exporting from Yahoo
- On Yahoo Finance, open the Portfolio or Activity page containing the transactions or holdings you want to export.
- Use any available "Export" or "Download" button to get a CSV. If there is no explicit export, copy the table into a CSV format (comma-separated).

## Required columns for this importer
The importer expects the following fields in the CSV (column names can vary; you'll map them in the wizard):
- Symbol or Ticker (e.g. AAPL, 1175819)
- Date (formats supported: YYYY-MM-DD, YYYYMMDD, or other JS-parsable formats)
- Type (Buy, Sell, DIV, Fee, etc.)
- Qty (number of shares/units)
- Price (per-share/unit price)

Optional but useful:
- Exchange (e.g., NASDAQ, TASE) — if missing, the importer can auto-deduce or you can set a manual exchange.

## How to use the Import Wizard
1. Upload the CSV file or paste the CSV text into the wizard.
2. Select the target portfolio.
3. The importer will attempt to auto-map common column names (Symbol, Date, Qty, Price, Exchange). Review and correct mappings in the "Map Columns" step.
4. Choose an exchange mode:
   - Map from CSV (if file includes exchange values)
   - Manual Input (one exchange for all rows)
   - Auto-Deduce (based on ticker format; numeric tickers -> TASE, otherwise NASDAQ)
5. Preview the parsed transactions and confirm values. Fix any date/format issues by adjusting mappings or editing the CSV source.
6. Click Import to add transactions to the selected portfolio.

## Common tips
- If dates appear as integers like `20241025`, the importer will parse them as `YYYY-MM-DD` automatically.
- If the CSV uses a different delimiter or encapsulation, re-save it as a standard comma-separated file.
- If exchange is missing or ambiguous, choose Manual Input or correct the exchange column in the mapping step.

If you have a sample file causing issues, paste a few rows into an issue or share it and I'll help adapt the parser.
