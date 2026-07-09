import { fetchYahooTickerData } from './src/lib/fetching/yahoo';
import { Exchange } from './src/lib/types';
import { fetchBoiData } from './src/lib/fetching/boi';

async function run() {
  const yData = await fetchYahooTickerData("AAPL", Exchange.NASDAQ, undefined, false);
  console.log("Yahoo Data:", yData ? "Success" : "Null", yData?.isStaleFallback ? "(Stale)" : "(Not Stale)");
}

run().catch(console.error);
