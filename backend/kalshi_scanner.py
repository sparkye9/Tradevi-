"""
Kalshi same-day edge scanner — standalone CLI.

Run:
    python kalshi_scanner.py                 # dry scan
    python kalshi_scanner.py --live          # place limit orders (confirms per order)
    python kalshi_scanner.py --fair-file fair.json

Setup (one time):
    1. ROTATE YOUR KEY. Delete the old one in Kalshi, generate a new pair.
    2. Save private key to ~/.kalshi/kalshi_private_key.pem
    3. Set env vars:  KALSHI_KEY_ID=<id>   KALSHI_KEY_PATH=~/.kalshi/kalshi_private_key.pem
    4. pip install cryptography requests

Rules enforced:
    - Only markets closing before CUTOFF_HOUR_ET today
    - Only asks in PRICE_FLOOR_CENTS to PRICE_CEIL_CENTS band
    - Only edges >= EDGE_MIN_CENTS vs your fair value
    - Max MAX_POSITIONS, sized across BANKROLL_DOLLARS
    - Refuses to run without fair values (never invents probabilities)
"""

import argparse
import datetime as dt
import json
import sys
from zoneinfo import ZoneInfo

from services.kalshi_service import (
    BANKROLL_DOLLARS,
    CUTOFF_HOUR_ET,
    EDGE_MIN_CENTS,
    MAX_POSITIONS,
    PRICE_CEIL_CENTS,
    PRICE_FLOOR_CENTS,
    fetch_candidate_markets,
    load_private_key,
    place_limit_order,
    score_market,
    size_positions,
)

ET = ZoneInfo("America/New_York")

# Fill this dict with devig output before running, or use --fair-file.
# Keys: exact Kalshi market tickers. Values: fair YES probability in cents (0-100).
FAIR_VALUES_CENTS: dict[str, float] = {
    # "KXMLBGAME-26JUL19NYYLAD-NYY": 55,
    # "KXHIGHNY-26JUL19-B87.5": 40,
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("--live", action="store_true", help="place limit orders (confirms per order)")
    ap.add_argument("--fair-file", help="JSON file mapping {ticker: fair_yes_cents}")
    args = ap.parse_args()

    fair = dict(FAIR_VALUES_CENTS)
    if args.fair_file:
        with open(args.fair_file) as f:
            fair.update(json.load(f))
    if not fair:
        sys.exit(
            "No fair values supplied. Fill FAIR_VALUES_CENTS in this file or pass --fair-file.\n"
            "The scanner never invents probabilities — it only compares your fair\n"
            "numbers against Kalshi asks.\n\n"
            "Get fair values: python devig.py -130 +110"
        )

    try:
        pk = load_private_key()
    except ValueError as e:
        sys.exit(str(e))

    now = dt.datetime.now(ET)
    print(f"Scan time : {now:%a %b %d %I:%M %p ET} | cutoff {CUTOFF_HOUR_ET}:00 ET")
    print(f"Bankroll  : ${BANKROLL_DOLLARS:.2f} | max {MAX_POSITIONS} positions | edge >= {EDGE_MIN_CENTS}c")
    print(f"Price band: {PRICE_FLOOR_CENTS}c – {PRICE_CEIL_CENTS}c\n")

    markets = fetch_candidate_markets(pk)
    print(f"{len(markets)} open markets found in target series before cutoff.")

    scored = [s for m in markets if (s := score_market(m, fair))]
    picks = size_positions(scored)

    if not picks:
        print("\nNo qualifying edges right now. Correct answer: do not trade.")
        return

    print(f"\n{len(picks)} qualifying position(s):\n")
    for p in picks:
        print(f"  {p['ticker']}")
        print(f"  {p['title']}")
        print(
            f"  BUY {p['side'].upper()} x{p['contracts']} @ {p['ask_cents']}c "
            f"(fair {p['fair_cents']}c, edge +{p['edge_cents']}c) "
            f"cost ${p['cost_dollars']:.2f} → ${p['payout_if_right']:.2f} if right"
        )
        print(f"  closes {p['close_time']}\n")

    if not args.live:
        print("Dry run. Re-run with --live to place these as limit orders.")
        return

    for p in picks:
        ans = input(
            f"Place limit order: {p['ticker']} {p['side'].upper()} "
            f"x{p['contracts']} @ {p['ask_cents']}c?  Type YES: "
        )
        if ans.strip() == "YES":
            import requests
            try:
                resp = place_limit_order(pk, p)
                print(f"  placed: {json.dumps(resp.get('order', resp))[:300]}")
            except requests.HTTPError as e:
                print(f"  error : {e}")
        else:
            print("  skipped.")


if __name__ == "__main__":
    main()
