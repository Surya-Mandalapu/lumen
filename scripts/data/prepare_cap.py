"""Resume verified offline preparation across the complete 87 to 90 degree south cap."""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from verify_cap_tiles import verify_tiles

ROOT = Path(__file__).resolve().parents[2]
TILE_ROOT = ROOT / "data/derived/lunar-south-cap-v1"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--azimuth-step-deg", type=int, choices=(1, 2, 5), default=5)
    parser.add_argument("--root", type=Path, default=TILE_ROOT)
    parser.add_argument(
        "--workers",
        type=int,
        choices=(1, 2, 3, 4),
        default=1,
        help="Offline processes; allow at least 1 GiB available memory per worker",
    )
    parser.add_argument(
        "--max-new-tiles",
        type=int,
        default=0,
        help="Stop after this many new tiles; zero prepares all missing tiles",
    )
    args = parser.parse_args()
    if args.max_new_tiles < 0:
        parser.error("--max-new-tiles cannot be negative")
    args.root.mkdir(parents=True, exist_ok=True)
    lock_path = args.root / ".prepare.lock"
    try:
        lock = lock_path.open("x")
    except FileExistsError:
        raise SystemExit(
            "Preparation is already locked. Confirm no preparer is running before removing .prepare.lock."
        ) from None
    try:
        with lock:
            # A metadata file alone never authorizes resumption: validate every byte,
            # candidate/exclusion and recipe before skipping completed tiles.
            report = verify_tiles(args.root, azimuth_step_deg=args.azimuth_step_deg)
            pending = [tuple(tile) for tile in report["missing_tiles"]]
            if args.max_new_tiles:
                pending = pending[: args.max_new_tiles]

            def prepare(tile):
                x, y = tile
                subprocess.run(
                    [
                        sys.executable,
                        str(Path(__file__).with_name("prepare_terrain.py")),
                        "--cap-tile",
                        str(x),
                        str(y),
                        "--azimuth-step-deg",
                        str(args.azimuth_step_deg),
                        "--output",
                        str(args.root / f"tile-{x}-{y}"),
                    ],
                    check=True,
                )

            with ThreadPoolExecutor(max_workers=args.workers) as executor:
                list(executor.map(prepare, pending))
            report = verify_tiles(args.root, azimuth_step_deg=args.azimuth_step_deg)
            print(
                f"Verified {report['verified_tiles']}/{report['expected_tiles']} cap tiles; "
                f"{report['verified_candidates']} valid, {report['excluded_candidates']} excluded"
            )
            if not report["complete"] and not args.max_new_tiles:
                raise SystemExit("Cap tile preparation is incomplete")
    finally:
        lock_path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
