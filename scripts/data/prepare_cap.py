"""Resume preparation of real NASA terrain tiles across the 87°S–90°S cap."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from prepare_terrain import CAP_TILE_COUNT, candidate_grid
from verify_cap_tiles import verify_tiles

ROOT = Path(__file__).resolve().parents[2]
TILE_ROOT = ROOT / "data/derived/lunar-south-cap-v1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--azimuth-step-deg", type=int, choices=(1, 2, 5), default=5)
    parser.add_argument(
        "--max-new-tiles",
        type=int,
        default=0,
        help="Stop after this many new tiles; zero prepares every missing tile",
    )
    args = parser.parse_args()
    prepared = 0
    for x in range(CAP_TILE_COUNT):
        for y in range(CAP_TILE_COUNT):
            if not len(candidate_grid((x, y))[0]):
                continue
            if (TILE_ROOT / f"tile-{x}-{y}" / "metadata.json").exists():
                continue
            if args.max_new_tiles and prepared >= args.max_new_tiles:
                report = verify_tiles(TILE_ROOT)
                print(
                    f"Paused: {report['verified_tiles']}/{report['expected_tiles']} verified tiles"
                )
                return
            subprocess.run(
                [
                    sys.executable,
                    str(Path(__file__).with_name("prepare_terrain.py")),
                    "--cap-tile",
                    str(x),
                    str(y),
                    "--azimuth-step-deg",
                    str(args.azimuth_step_deg),
                ],
                check=True,
            )
            prepared += 1
    report = verify_tiles(TILE_ROOT)
    print(
        f"Verified {report['verified_tiles']}/{report['expected_tiles']} cap tiles; "
        f"{report['verified_candidates']} candidates"
    )
    if not report["complete"]:
        raise SystemExit("Cap tile preparation is incomplete")


if __name__ == "__main__":
    main()
