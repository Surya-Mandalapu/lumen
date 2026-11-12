"""Verify local coarse ranking and actual search-result locations on the 3D Moon."""

import json
from pathlib import Path
from time import perf_counter

from playwright.sync_api import expect, sync_playwright


def main():
    output = Path("data/cache/local-ranking-qa")
    output.mkdir(parents=True, exist_ok=True)
    errors, timings, checks, console_errors = [], [], [], []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--enable-unsafe-swiftshader"]
        )
        for width in (1440, 390):
            page = browser.new_page(
                viewport={"width": width, "height": 1000}, reduced_motion="reduce"
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "console",
                lambda message: (
                    console_errors.append(message.text)
                    if message.type == "error"
                    and "Failed to load resource" not in message.text
                    else None
                ),
            )
            page.goto("http://127.0.0.1:8000", wait_until="networkidle")
            if not page.locator("details.area-editor").evaluate("el => el.open"):
                page.locator("details.area-editor > summary").click()
            page.get_by_role("button", name="Find a place", exact=True).click()
            page.get_by_label("Find an approved landmark", exact=True).fill("Tycho")
            page.locator(".landmark-matches button").first.click()
            page.get_by_label("Detailed search radius (km)", exact=False).fill("5")
            expect(page.locator(".coarse-area-preview")).to_be_visible()
            started = perf_counter()
            with page.expect_response(
                lambda response: (
                    response.url.endswith("/global/rank-area")
                    and response.request.method == "POST"
                ),
                timeout=30000,
            ) as ranked:
                page.get_by_role("button", name="Rank this area", exact=True).click()
            assert ranked.value.ok
            result = ranked.value.json()
            assert len(result["sites"]) == 21
            timings.append(
                {
                    "width": width,
                    "completed_5km_7day_coarse_ranking_seconds": perf_counter()
                    - started,
                }
            )
            (output / f"coarse-ranking-{width}.json").write_text(json.dumps(result))
            page.get_by_role(
                "button", name="View all 21 locations in 3D", exact=True
            ).click()
            dialog = page.get_by_role("dialog", name="Explore the ranked local area")
            expect(dialog.locator("canvas")).to_be_visible(timeout=30000)
            expect(dialog.locator(".mapped-site-count")).to_contain_text("21")
            expect(
                dialog.get_by_role("button", name="Frame all sites", exact=True)
            ).to_be_enabled()
            expect(
                dialog.get_by_role(
                    "button", name="Select mapped candidate 1", exact=True
                )
            ).to_be_visible()
            dialog.get_by_role(
                "button", name="Select mapped candidate 2", exact=True
            ).click()
            expect(dialog.locator(".mapped-site-detail")).to_contain_text("Candidate 2")
            dialog.get_by_label("Select mapped location", exact=True).select_option(
                result["sites"][-1]["id"]
            )
            expect(dialog.locator(".mapped-site-detail")).to_contain_text(
                "Candidate 21"
            )
            expect(dialog.locator(".mapped-site-detail")).to_contain_text(
                "Planning score"
            )
            page.wait_for_timeout(500)
            page.screenshot(
                path=str(output / f"coarse-sites-{width}.png"), full_page=True
            )
            dialog.get_by_role("button", name="Close site map", exact=True).click()
            page.get_by_label("Coarse ranking priority", exact=True).select_option("0")
            expect(page.locator(".coarse-area-ranking .changed-notice")).to_be_visible()
            page.get_by_role(
                "button", name="Use a supported south-pole area", exact=True
            ).click()
            page.get_by_label("Detailed search radius (km)", exact=False).fill("3")
            expect(
                page.get_by_role("button", name="Continue to mission", exact=True)
            ).to_be_enabled()
            page.get_by_role("button", name="Continue to mission", exact=True).click()
            page.get_by_role("button", name="Review mission", exact=True).click()
            with page.expect_response(
                lambda response: (
                    response.url.endswith("/candidates/search")
                    and response.request.method == "POST"
                ),
                timeout=30000,
            ) as searched:
                page.get_by_role(
                    "button", name="Find candidate sites", exact=True
                ).click()
            assert searched.value.ok
            search = searched.value.json()
            expect(
                page.get_by_role("button", name="View sites on 3D Moon", exact=True)
            ).to_be_visible(timeout=30000)
            page.get_by_role("button", name="View sites on 3D Moon", exact=True).click()
            dialog = page.get_by_role("dialog", name="Places to consider · 3D Moon")
            expect(dialog.locator("canvas")).to_be_visible(timeout=30000)
            expect(dialog.locator(".mapped-site-count")).to_contain_text(
                str(len(search["candidates"]))
            )
            dialog.get_by_role(
                "button",
                name=f"Eligible locations ({len(search['map_candidates'])})",
                exact=True,
            ).click()
            expect(dialog.locator(".mapped-site-count")).to_contain_text(
                str(len(search["map_candidates"]))
            )
            last = search["map_candidates"][-1]
            dialog.get_by_label("Select mapped location", exact=True).select_option(
                last["id"]
            )
            expect(dialog.locator(".mapped-site-detail")).to_contain_text(
                f"{last['score']:.1f}"
            )
            page.wait_for_timeout(500)
            page.screenshot(
                path=str(output / f"prepared-sites-{width}.png"), full_page=True
            )
            dialog.get_by_role("button", name="Inspect mapped site", exact=True).click()
            expect(page.get_by_role("dialog")).to_be_visible(timeout=30000)
            expect(
                page.get_by_role("button", name="Close panel", exact=True)
            ).to_be_visible()
            checks.append(
                f"{width}px: actual 21-point coarse ranking, spatial markers, selection, stale-input notice, all returned eligible polar locations, and mapped-site inspection"
            )
            print(checks[-1], flush=True)
            page.close()
        browser.close()
    (output / "report.json").write_text(
        json.dumps(
            {
                "checks": checks,
                "timings": timings,
                "errors": errors,
                "console_errors": console_errors,
            },
            indent=2,
        )
    )
    assert not errors, errors
    assert not console_errors, console_errors
    assert all(row["completed_5km_7day_coarse_ranking_seconds"] < 30 for row in timings)


if __name__ == "__main__":
    main()
