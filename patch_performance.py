import re

with open("src/lib/performance.ts", "r") as f:
    text = f.read()

# Add import
import_stmt = "import { interpolateSparseHistory } from './fetching/utils/interpolate';\n"
text = import_stmt + text

# find return deduped
text = text.replace("return deduped;\n}", "return interpolateSparseHistory(deduped) as { date: Date, adjClose: number, price: number }[];\n}")

with open("src/lib/performance.ts", "w") as f:
    f.write(text)
