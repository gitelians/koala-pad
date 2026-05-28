# TradingView Advanced Charts (Charting Library)

This folder is the runtime mount point for the **self-hosted TradingView Charting Library**.

## Why it's empty

The Charting Library is **not publicly downloadable**. You must apply for it:
https://www.tradingview.com/HTML5-stock-forex-bitcoin-charting-library/

Once approved, TradingView gives you a private GitHub invite. Clone that repo and copy
its `charting_library/` folder here, so the final layout is:

```
apps/web/public/tradingview/
└── charting_library/
    ├── charting_library.js          ← entry point loaded by PriceChart.tsx
    ├── charting_library.d.ts
    ├── bundles/
    └── … (everything else from TV's repo)
```

The component looks for `/tradingview/charting_library/charting_library.js`. As soon as
that file is reachable, the chart renders without any further configuration.

## How the rest of the integration works

- React wrapper: `apps/web/src/components/PriceChart.tsx`
- Custom datafeed: `apps/web/src/components/tradingview/datafeed.ts`
- Bridges TradingView's UDF interface → existing Supabase RPC `get_token_candles`
- Live updates via Supabase Realtime on the `trades` table (same channel pattern as the
  legacy `lightweight-charts` implementation)
- Mode (`marketcap`/`price`) and currency (`USD`/`BNB`) toggles are React state — they
  invalidate the datafeed cache and call `widget.setSymbol()` to redraw

## Optional: server-side range query

The current datafeed pulls the latest 1000 candles per resolution and filters client-side
by `from`/`to`. For deep history scrolling you'd want a Supabase RPC like:

```sql
get_token_candles_range(p_token_address, p_interval, p_from timestamptz, p_to timestamptz)
```

Plug it into `fetchAllBars()` in `datafeed.ts` when the time comes.
