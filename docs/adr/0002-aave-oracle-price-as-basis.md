# Use the Aave Oracle price as the basis for health factor and simulation

Both the live Health Factor and the falling-price Scenario are driven by the
price reported by the Aave Oracle contract (Chainlink-based), not by an external
market price feed such as CoinGecko. Aave triggers liquidations off its own
oracle, so this makes "liquidation at price X" literally correct rather than
approximately correct — the two can diverge by a percent or more during
volatility.

A market price may be shown alongside as a human-friendly reference, but it must
never drive the math. The trade-off is that displayed numbers may differ slightly
from what users see on an exchange; that difference is the point, and is what
makes the simulation faithful to Aave's actual behavior.
