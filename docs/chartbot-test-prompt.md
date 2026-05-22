# ChartBot Full Tool Test

Paste the block below verbatim into the ChartBot panel (violet, Chart mode).
Delete the chartbot_session localStorage key first so you start with a clean context.

---

## PROMPT (paste this entire block)

```
You are about to run a full self-test of every tool available to you.
Work through the list below in order. For each tool:
  1. Call the tool with sensible arguments.
  2. If it succeeds, immediately call take_screenshot and label it with the tool name.
  3. Record the result as PASS or FAIL with a one-line reason.
  4. Move to the next tool. Do not stop on failure — keep going.

Use SPY on a 1D chart as your baseline unless a test requires changing it.
Create any state a later test needs (e.g. draw something before testing remove_drawing).

--- TOOL LIST ---

GROUP A — Chart inspection (read, no side effects)
A1. get_chart_state       — get the current symbol, resolution, chart type
A2. inspect_chart         — list all studies and shapes on the chart
A3. list_drawings         — list all drawing entity IDs

GROUP B — Account / market data (read, no side effects)
B1. get_account           — fetch account balance and equity
B2. get_positions         — list all open positions
B3. get_orders            — list open orders
B4. get_quote  AAPL       — fetch live quote for AAPL
B5. get_snapshot SPY      — fetch full snapshot for SPY
B6. get_bars SPY 1Day 10  — fetch 10 daily bars for SPY
B7. get_news AAPL         — fetch recent news for AAPL
B8. get_movers            — fetch top market movers
B9. find_symbol MSFT      — search for MSFT

GROUP C — Chart navigation
C1. set_symbol AAPL       — switch chart to AAPL
C2. set_resolution 60     — switch to 1H
C3. set_resolution 240    — switch to 4H
C4. set_resolution W      — switch to 1W
C5. set_resolution D      — switch back to 1D
C6. set_symbol SPY        — switch back to SPY
C7. set_chart_type candles
C8. set_chart_type line
C9. set_chart_type candles  — restore
C10. set_timezone America/Chicago
C11. set_timezone America/New_York  — restore
C12. set_visible_range    — use a recent 30-day window (compute unix timestamps)

GROUP D — Drawing tools (each creates state for later tests)
D1.  draw_horizontal_line — at current price level
D2.  draw_vertical_line   — at a recent bar
D3.  draw_trend_line      — two points on recent bars
D4.  draw_rectangle       — box around last 5 bars
D5.  draw_fib_retracement — recent swing high to swing low
D6.  draw_text            — label "TEST" near current price
D7.  draw_arrow           — pointing at a recent bar

GROUP E — Drawing management (requires state from D)
E1. list_drawings         — confirm D1-D7 are present
E2. get_drawing_properties — fetch properties of the horizontal line from D1
E3. set_drawing_properties — change its color
E4. modify_drawing        — move the text label from D6
E5. remove_drawing        — remove the arrow from D7

GROUP F — Studies / indicators
F1. add_indicator RSI
F2. add_indicator MACD
F3. add_indicator "Bollinger Bands"
F4. inspect_chart         — confirm all three are listed

GROUP G — Trading visualization
G1. compare_symbol QQQ    — overlay QQQ on the SPY chart
G2. mark_bar              — mark a recent bar with a label
G3. show_position_line    — attempt for SPY (note if no position exists)
G4. propose_order         — propose a paper buy of 1 SPY share (market order)

GROUP H — Data export
H1. export_chart_data     — export last 20 bars to the conversation

--- END TOOL LIST ---

After completing all tests, output a final report in this exact format:

## ChartBot Tool Test Report
**Date:** <today>
**Symbol:** SPY  **Baseline resolution:** 1D

| Tool | Status | Notes |
|------|--------|-------|
| A1 get_chart_state | PASS/FAIL | ... |
... (one row per tool) ...

**Summary:** X/37 tools passed.
**Failed tools:** list any that failed with the error message.
```
