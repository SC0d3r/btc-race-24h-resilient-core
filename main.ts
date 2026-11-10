import { runBars } from './vendor/makefun-bars.ts';
import type { OrderInput } from './vendor/makefun-bars.ts';

// Strategy:
// 1. Core Entry: Spend 98% of cash on the first bar that has a price.
// 2. Trailing Drawdown Guard: Sell if equity or price drops <= 96% of their respective peaks.
// 3. Re-entry: Buy if equity >= 100.5% of exit equity AND price > close60 (or 300 bars elapsed).
// 4. Hysteresis: No re-entry for 30 bars after exit.
// 5. Second Buy: At seq >= 120, buy rest if invested and no exit has happened.

let peakEquity: bigint = 0n;
let peakPrice: bigint = 0n;
let exitEquity: bigint = 0n;
let lastExitBar: number = -1;
let invested: boolean = false;
let secondBuyDone: boolean = false;
let guardExitHappened: boolean = false;

const closes: bigint[] = [];

await runBars({
  async onBatch(state, batch) {
    const symbol = state.hello.symbols[0].symbol;
    const price = state.close(symbol);
    
    // Always push close to history
    if (price !== null) {
      closes.push(price);
    }
    
    if (price === null) return [];
    
    const close60 = closes.length >= 61 ? closes[closes.length - 61] : null;
    
    const orders: OrderInput[] = [];

    // Core Entry
    if (!invested && lastExitBar === -1 && !guardExitHappened) {
      orders.push({ 
        side: 'buy', 
        symbol, 
        notional_quote_units: (state.cash * 98n) / 100n, 
        max_slippage_bps: 10000 
      });
      invested = true;
      peakEquity = state.equity;
      peakPrice = price;
    }
    // Second Buy
    else if (invested && !secondBuyDone && !guardExitHappened && state.seq >= 120 && state.cash >= 1000000n) {
      orders.push({ 
        side: 'buy', 
        symbol, 
        notional_quote_units: state.cash, 
        max_slippage_bps: 10000 
      });
      secondBuyDone = true;
    }
    // Invested logic
    else if (invested) {
      if (state.equity > peakEquity) peakEquity = state.equity;
      if (price > peakPrice) peakPrice = price;
      
      if (state.equity * 100n <= peakEquity * 96n || price * 100n <= peakPrice * 96n) {
        const pos = state.positions.get(symbol);
        if (pos !== undefined && pos.qty > 0n) {
          orders.push({ 
            side: 'sell', 
            symbol, 
            qty: pos.qty, 
            max_slippage_bps: 10000 
          });
        }
        invested = false;
        exitEquity = state.equity;
        lastExitBar = state.seq;
        guardExitHappened = true;
      }
    }
    // Flat with guard exit (Re-entry)
    else if (!invested && lastExitBar !== -1) {
      const barsSinceExit = state.seq - lastExitBar;
      const rebound = state.equity * 1000n >= exitEquity * 1005n;
      const trendOk = close60 === null || price > close60;
      
      if (barsSinceExit >= 30 && rebound && trendOk) {
        orders.push({ 
          side: 'buy', 
          symbol, 
          notional_quote_units: state.cash, 
          max_slippage_bps: 10000 
        });
        invested = true;
        peakEquity = state.equity;
        peakPrice = price;
        lastExitBar = -1;
      }
    }

    return orders;
  }
});
