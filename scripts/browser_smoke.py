"""Exercise the built regional and global demo against a running Lumen server.

Install playwright and its Chromium browser first. Screenshots, exports and the
machine-readable report go to ignored data/cache/demo-qa by default.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import perf_counter
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--channel", help="Use an installed browser, for example chrome")
    parser.add_argument("--output", type=Path, default=Path("data/cache/demo-qa"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report: dict = {"checks": [], "page_errors": [], "console_errors": [], "http_errors": []}

    def passed(label: str) -> None:
        report["checks"].append(label)
        print(f"PASS {label}", flush=True)

    def fits(page) -> None:
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            "Page overflows the viewport"
        )

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                channel=args.channel,
                headless=True,
                args=["--enable-unsafe-swiftshader"],
            )
            page = browser.new_page(
                viewport={"width": 1440, "height": 1050},
                reduced_motion="reduce",
                accept_downloads=True,
            )
            page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
            # Expected HTTP failures are tested below; record other console errors.
            page.on(
                "console",
                lambda message: report["console_errors"].append(message.text)
                if message.type == "error" and "Failed to load resource" not in message.text
                else None,
            )
            requests: list[str] = []
            expected_failures: set[tuple[str, int]] = set()
            page.on("request", lambda request: requests.append(request.url))
            page.on("response", lambda response: report["http_errors"].append(
                {"url": response.url, "status": response.status}
            ) if response.status >= 400 and (
                urlparse(response.url).path, response.status
            ) not in expected_failures else None)
            page.goto(args.url, wait_until="networkidle")
            expect(page.get_by_text("NASA terrain · prepared locally")).to_be_visible()
            expect(page.locator(".coverage-preview")).not_to_have_attribute("open", "")
            page.locator(".coverage-preview summary").click()
            expect(page.locator(".coverage-facts")).to_contain_text("verified terrain and kernels")
            coverage_map = page.locator(".coverage-map")
            coverage_map.click(position={"x": 120, "y": 96})
            expect(page.get_by_role("combobox", name="Region", exact=True)).to_have_value("circle")
            before = float(page.get_by_label("Latitude °", exact=True).input_value())
            coverage_map.focus()
            page.keyboard.press("ArrowUp")
            assert float(page.get_by_label("Latitude °", exact=True).input_value()) > before
            page.get_by_label("Radius (km)", exact=True).fill("50")
            expect(page.locator(".coverage-facts")).to_contain_text("Partial footprint overlap")
            passed("Regional coverage selection supports pointer, keyboard and partial coverage")

            page.get_by_role("button", name="Reset mission parameters").click()
            started = perf_counter()
            page.get_by_role("button", name="Find candidate sites", exact=True).click()
            expect(page.locator(".candidate-card")).to_have_count(5, timeout=90000)
            report["regional_search_seconds"] = round(perf_counter() - started, 3)
            expect(page.locator(".refined-inspection")).to_be_visible(timeout=30000)
            page.wait_for_load_state("networkidle")
            before_requests = len(requests)
            page.locator(".selection-funnel summary").click()
            expect(page.locator(".selection-funnel")).to_contain_text("1,680 prepared candidates")
            page.locator(".result-explanation summary").click()
            expect(page.locator(".explanation-body")).to_contain_text("contributes the most")
            expect(page.locator(".constraint-evidence")).to_contain_text("Earth visibility")
            page.get_by_role("button", name="Compare 2/2").click()
            expect(page.locator(".comparison-takeaway li")).to_have_count(4)
            page.wait_for_timeout(250)
            assert len(requests) == before_requests, requests[before_requests:]
            passed("Regional search, explanations and comparison use the same analysis")
            with page.expect_download() as download:
                page.get_by_role("button", name="Export analysis", exact=True).click()
            export = args.output / "regional-analysis.json"
            download.value.save_as(export)
            result = json.loads(export.read_text())
            assert result["counts"]["region"] == 1680 and len(result["candidates"]) == 5
            assert result["provenance"]["kernels"]
            passed("Regional JSON export includes the original request and scientific provenance")
            page.screenshot(path=str(args.output / "regional-desktop.png"), full_page=True)

            page.set_viewport_size({"width": 390, "height": 844})
            fits(page)
            page.screenshot(path=str(args.output / "regional-mobile.png"), full_page=True)
            page.set_viewport_size({"width": 1440, "height": 1050})
            coverage_map.click(position={"x": 120, "y": 96})
            expect(page.locator(".search-state .changed-notice")).to_be_visible()
            with page.expect_response(lambda response: "/candidates/search" in response.url) as response:
                page.get_by_role("button", name="Find candidate sites", exact=True).click()
            circle_result = response.value.json()
            assert circle_result["request"]["region"]["selector_type"] == "circle"
            assert 0 < circle_result["counts"]["region"] < 1680
            expect(page.locator(".candidate-card")).to_have_count(len(circle_result["candidates"]))
            page.get_by_role("button", name="Reset mission parameters").click()
            page.get_by_label("Max slope (°)", exact=True).fill("0")
            page.get_by_role("button", name="Find candidate sites", exact=True).click()
            expect(page.locator(".empty-results")).to_be_visible(timeout=90000)
            passed("Mobile results fit; edits mark stale results; circle and empty searches work")

            page.get_by_role("button", name="Anywhere on the Moon", exact=True).click()
            expect(page.locator(".global-map canvas")).to_be_visible(timeout=30000)
            global_map = page.locator(".global-map canvas")
            global_map.click(position={"x": 400, "y": 200})
            longitude = float(page.get_by_label("Longitude (°E)", exact=True).input_value())
            global_map.focus()
            page.keyboard.press("ArrowRight")
            assert float(page.get_by_label("Longitude (°E)", exact=True).input_value()) != longitude
            page.get_by_label("Latitude (°N)", exact=True).fill("0")
            page.get_by_label("Longitude (°E)", exact=True).fill("0")
            page.get_by_label("End (UTC)", exact=True).fill("2028-10-02T00:00")
            with page.expect_response(lambda response: "/global/preview" in response.url) as response:
                page.get_by_role("button", name="Preview this point", exact=True).click()
            assert response.value.status == 200
            near = response.value.json()
            assert near["metrics"]["earth_visibility_fraction"] == 1
            assert len(near["timeline"]) == 289
            expect(page.locator(".global-result")).to_be_visible()
            expect(page.locator(".global-terrain canvas")).to_be_visible(timeout=30000)
            page.get_by_label("Inspect five-minute sample").fill("100")
            expect(page.locator(".global-result")).to_contain_text(near["timeline"][100]["time_utc"])
            with page.expect_download() as download:
                page.get_by_role("button", name="Export preview", exact=True).click()
            export = args.output / "global-preview.json"
            download.value.save_as(export)
            exported = json.loads(export.read_text())
            assert exported["coordinate"] == near["coordinate"]
            assert exported["provenance"]["artifact_sha256"]
            passed("Global map, real near-side preview, 3D terrain, timeline and export work")
            page.screenshot(path=str(args.output / "global-desktop.png"), full_page=True)

            page.get_by_label("Longitude (°E)", exact=True).fill("179.9")
            expect(page.locator(".global-result")).to_contain_text("previous selection")
            with page.expect_response(lambda response: "/global/preview" in response.url) as response:
                page.get_by_role("button", name="Preview this point", exact=True).click()
            assert response.value.json()["metrics"]["earth_visibility_fraction"] == 0
            page.set_viewport_size({"width": 390, "height": 844})
            fits(page)
            page.screenshot(path=str(args.output / "global-mobile.png"), full_page=True)
            passed("Global far-side visibility, stale-results notice and mobile layout work")

            # An overlong window must not replace the previous valid results.
            expected_failures.add(("/api/v1/global/preview", 422))
            page.get_by_label("End (UTC)", exact=True).fill("2028-12-01T00:00")
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_contain_text("31 days")
            expect(page.locator(".global-result")).to_contain_text("179.9000")
            page.get_by_label("End (UTC)", exact=True).fill("2028-10-02T00:00")

            preview_url = "**/api/v1/global/preview"
            expected_failures.add(("/api/v1/global/preview", 503))
            page.route(preview_url, lambda route: route.fulfill(
                status=503, json={"detail": "Preview temporarily unavailable"}
            ))
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_contain_text("temporarily unavailable")
            page.unroute(preview_url)
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_have_count(0, timeout=30000)
            expect(page.get_by_role("button", name="Preview this point", exact=True)).to_be_enabled()
            passed("Invalid windows and service failures retain prior results and recover on retry")

            page.get_by_role("button", name="South-pole site search", exact=True).click()
            expected_failures.add(("/api/v1/global/terrain", 503))
            page.route("**/api/v1/global/terrain", lambda route: route.fulfill(
                status=503, json={"detail": "Global terrain unavailable"}
            ))
            page.get_by_role("button", name="Anywhere on the Moon", exact=True).click()
            expect(page.get_by_role("button", name="Retry loading terrain")).to_be_visible()
            expect(page.get_by_role("button", name="Preview this point", exact=True)).to_be_disabled()
            page.unroute("**/api/v1/global/terrain")
            page.get_by_role("button", name="Retry loading terrain").click()
            expect(page.locator(".global-map canvas")).to_be_visible(timeout=30000)
            expect(page.get_by_role("button", name="Preview this point", exact=True)).to_be_enabled()
            passed("Missing global terrain has an explicit recoverable state")
            assert not report["page_errors"], report["page_errors"]
            assert not report["console_errors"], report["console_errors"]
            assert not report["http_errors"], report["http_errors"]
            passed("No uncaught browser or unexpected console errors")
            browser.close()
    finally:
        (args.output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
