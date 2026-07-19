"""
Devig helper: turn sportsbook American odds into a fair YES price in cents.

Usage (standalone):
    python devig.py -130 +110

Importable:
    from devig import devig_two_way
    fair_a, fair_b = devig_two_way(-130, +110)
    # fair_a is the fair probability (0-1) for the -130 side
"""

import sys


def implied(odds: int) -> float:
    """Raw implied probability from American odds, before devig."""
    return 100 / (odds + 100) if odds > 0 else -odds / (-odds + 100)


def devig_two_way(odds_a: int, odds_b: int) -> tuple[float, float]:
    """
    Remove vig from a two-way market.
    Returns (fair_prob_a, fair_prob_b) as fractions (0-1), summing to 1.0.
    """
    pa = implied(odds_a)
    pb = implied(odds_b)
    total = pa + pb
    return pa / total, pb / total


def main():
    if len(sys.argv) != 3:
        sys.exit(
            "usage: python devig.py <team_odds> <opponent_odds>\n"
            "  e.g. python devig.py -130 +110"
        )
    a, b = int(sys.argv[1]), int(sys.argv[2])
    fair_a, fair_b = devig_two_way(a, b)
    cents_a = round(fair_a * 100)
    cents_b = round(fair_b * 100)

    print(f"side {a:+d}:  raw {implied(a)*100:.1f}%  →  fair {fair_a*100:.1f}%  ({cents_a}c)")
    print(f"side {b:+d}:  raw {implied(b)*100:.1f}%  →  fair {fair_b*100:.1f}%  ({cents_b}c)")
    print(f"\nMax buy on Kalshi: {cents_a - 3}c for the {a:+d} side  (fair minus 3c edge min)")


if __name__ == "__main__":
    main()
