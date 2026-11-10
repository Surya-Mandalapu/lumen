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

from playwright.sync_api import Error as BrowserError
from playwright.sync_api import expect, sync_playwright


def job_state_checks(browser, url, output, passed):
    """Exercise the advertised future job contract without claiming a live queue."""
    for width in (1440, 390):
        page = browser.new_page(
            viewport={"width": width, "height": 844}, reduced_motion="reduce"
        )
        catalog = page.request.get(f"{url}/api/v1/coverage").json()
        catalog["search_service"] = {"mode": "jobs"}
        page.route(
            "**/api/v1/coverage",
            lambda route, request, *, catalog=catalog: route.fulfill(json=catalog),
        )
        state = {"status": "queued", "code": 202, "deleted": False}

        def jobs(route, request, *, state=state):
            if route.request.method == "DELETE":
                state["deleted"] = True
                route.fulfill(json={"status": "canceled"})
            elif state["code"] >= 400:
                route.fulfill(
                    status=state["code"],
                    json={
                        "detail": {"message": "Retained mission; retry when available."}
                    },
                )
            else:
                route.fulfill(
                    status=202 if route.request.method == "POST" else 200,
                    json={
                        "job_id": "qa",
                        "status": state["status"],
                        "queue_position": 2,
                    },
                )

        page.route("**/api/v1/jobs", jobs)
        page.route("**/api/v1/jobs/*", jobs)

        def submit(page=page):
            page.goto(url, wait_until="networkidle")
            page.get_by_role("button", name="Continue to mission").click()
            page.get_by_role("button", name="Review mission", exact=True).click()
            page.get_by_role("button", name="Find candidate sites", exact=True).click()

        submit()
        expect(page.locator(".analysis-status")).to_contain_text("Waiting in the queue")
        state["status"] = "running"
        expect(page.locator(".analysis-status")).to_contain_text("Analysis running")
        page.get_by_role("button", name="Cancel analysis").click()
        expect(page.locator(".analysis-status")).to_contain_text("Analysis canceled")
        page.wait_for_timeout(100)
        assert state["deleted"]
        expect(page.locator(".candidate-card")).to_have_count(0)
        for status, code, label in (
            ("failed", 202, "Analysis failed"),
            ("expired", 202, "Analysis expired"),
            ("queued", 429, "The queue is full"),
            ("queued", 503, "Service waking up"),
        ):
            state.update(status=status, code=code)
            submit()
            expect(page.locator(".analysis-status")).to_contain_text(label)
            expect(
                page.get_by_role("button", name="Review and resubmit mission")
            ).to_be_enabled()
            page.get_by_role("button", name="Review and resubmit mission").click()
            expect(page.get_by_label("Mission end (UTC, exclusive)")).to_have_value(
                "2028-10-08T00:00"
            )
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(
            path=str(output / f"retained-mission-{width}.png"), full_page=True
        )
        page.close()
    passed(
        "Job-contract fixtures: queued, running, cancel with DELETE, failed, expired, queue-full and waking retain inputs at desktop and 390 px"
    )


def late_result_check(browser, url, output, passed):
    """Complete an older held job after a newer mission has already finished."""
    for width in (1440, 390):
        page = browser.new_page(viewport={"width": width, "height": 844})
        catalog = page.request.get(f"{url}/api/v1/coverage").json()
        catalog["search_service"] = {"mode": "jobs"}
        page.route(
            "**/api/v1/coverage",
            lambda route, request, *, catalog=catalog: route.fulfill(json=catalog),
        )
        old = json.loads((output / "regional-analysis.json").read_text())
        held = []
        posted = []

        def job(route, request, *, posted=posted, held=held, old=old):
            if route.request.method == "DELETE":
                route.fulfill(json={"status": "canceled"})
            elif route.request.method == "POST":
                posted.append(route.request.post_data_json)
                if len(posted) == 1:
                    route.fulfill(
                        status=202, json={"job_id": "old", "status": "queued"}
                    )
                else:
                    current = {
                        **old,
                        "search_id": "new-applied-mission",
                        "request": posted[-1],
                        "common_window": {
                            **old["common_window"],
                            **posted[-1]["time_range"],
                        },
                    }
                    route.fulfill(
                        status=202,
                        json={"job_id": "new", "status": "complete", "result": current},
                    )
            else:
                held.append(route)

        page.route("**/api/v1/jobs", job)
        page.route("**/api/v1/jobs/*", job)
        page.goto(url, wait_until="networkidle")
        page.get_by_role("button", name="Continue to mission").click()
        page.get_by_role("button", name="Review mission", exact=True).click()
        page.get_by_role("button", name="Find candidate sites", exact=True).click()
        expect(page.locator(".analysis-status")).to_contain_text("Waiting in the queue")
        page.wait_for_timeout(950)
        assert held
        page.get_by_role("button", name="Edit mission", exact=True).click()
        page.get_by_label("Mission end (UTC, exclusive)").fill("2028-10-07T00:00")
        page.get_by_role("button", name="Review mission", exact=True).click()
        page.get_by_role("button", name="Find candidate sites", exact=True).click()
        expect(page.locator(".applied-mission")).to_contain_text("2028-10-07")
        for route in held:
            try:
                route.fulfill(
                    json={"job_id": "old", "status": "complete", "result": old}
                )
            except BrowserError as error:
                print(f"Expected aborted old request: {error}", flush=True)
        page.wait_for_timeout(200)
        expect(page.locator(".applied-mission")).to_contain_text("2028-10-07")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.close()
    passed(
        "Late old-job completion cannot replace a newer applied mission, on desktop and mobile"
    )


def south_pole_3d_checks(page, output, passed):
    for width in (1440, 390):
        page.set_viewport_size({"width": width, "height": 1050 if width > 400 else 844})
        page.get_by_role("button", name="3D terrain", exact=True).click()
        terrain = page.locator(".area-3d-preview canvas")
        expect(terrain).to_be_visible(timeout=30000)
        terrain.scroll_into_view_if_needed()
        page.wait_for_timeout(300)
        coords = page.get_by_label("Latitude °", exact=True)
        previous = coords.input_value()
        (terrain.tap if width == 390 else terrain.click)(
            position={
                "x": terrain.bounding_box()["width"] * 0.5,
                "y": terrain.bounding_box()["height"] * 0.62,
            }
        )
        expect(coords).not_to_have_value(previous)
        picked = (
            coords.input_value(),
            page.get_by_label("Longitude °E", exact=True).input_value(),
        )
        before = terrain.screenshot()
        bounds = terrain.bounding_box()
        x, y = bounds["x"] + bounds["width"] * 0.5, bounds["y"] + bounds["height"] * 0.5
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 70, y - 25, steps=12)
        page.mouse.up()
        page.wait_for_timeout(250)
        assert terrain.screenshot() != before, "Terrain did not rotate"
        assert picked == (
            coords.input_value(),
            page.get_by_label("Longitude °E", exact=True).input_value(),
        ), "Dragging terrain moved the selected point"
        page.screenshot(
            path=str(output / f"south-pole-terrain-{width}.png"), full_page=True
        )
        page.get_by_role("button", name="3D Moon", exact=True).click()
        moon = page.locator(".area-3d-preview canvas")
        expect(moon).to_be_visible(timeout=30000)
        page.wait_for_load_state("networkidle")
        expect(page.locator(".moon-loading")).to_have_count(0, timeout=30000)
        page.wait_for_timeout(300)
        before = moon.screenshot()
        page.get_by_role("button", name="Zoom to south pole", exact=True).click()
        page.wait_for_timeout(300)
        assert moon.screenshot() != before, "Moon did not zoom to the pole"
        previous = coords.input_value()
        (moon.tap if width == 390 else moon.click)(
            position={
                "x": moon.bounding_box()["width"] * 0.55,
                "y": moon.bounding_box()["height"] * 0.4,
            }
        )
        expect(coords).not_to_have_value(previous)
        assert -90 <= float(coords.input_value()) <= -87, (
            "Zoomed polar pick was not in the polar cap"
        )
        page.screenshot(
            path=str(output / f"south-pole-moon-{width}.png"), full_page=True
        )
        expect(
            page.get_by_role("button", name="Show whole Moon", exact=True)
        ).to_be_visible()
        page.get_by_role("button", name="Reset south-pole view", exact=True).click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        expect(
            page.get_by_role("button", name="Coverage map", exact=True)
        ).to_have_count(0)
        page.get_by_role("button", name="3D terrain", exact=True).click()
        coords.fill("-89.9")
        page.get_by_label("Longitude °E", exact=True).fill("0")
        expect(page.locator(".coverage-outcome")).to_contain_text("Supported area")
    page.set_viewport_size({"width": 1440, "height": 1050})
    passed(
        "South-pole 3D terrain rotates; Moon loads, faces the pole, zooms and resets; surface clicks select coordinates, drags preserve selection, and coverage-map choice is absent at desktop and 390 px"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument(
        "--channel", help="Use an installed browser, for example chrome"
    )
    parser.add_argument("--output", type=Path, default=Path("data/cache/demo-qa"))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "checks": [],
        "page_errors": [],
        "console_errors": [],
        "http_errors": [],
    }

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
                has_touch=True,
            )
            page.on("pageerror", lambda error: report["page_errors"].append(str(error)))
            # Expected HTTP failures are tested below; record other console errors.
            page.on(
                "console",
                lambda message: (
                    report["console_errors"].append(message.text)
                    if message.type == "error"
                    and "Failed to load resource" not in message.text
                    else None
                ),
            )
            requests: list[str] = []
            expected_failures: set[tuple[str, int]] = {("/api/v1/layers/psr", 503)}
            page.on("request", lambda request: requests.append(request.url))
            page.on(
                "response",
                lambda response: (
                    report["http_errors"].append(
                        {"url": response.url, "status": response.status}
                    )
                    if response.status >= 400
                    and (urlparse(response.url).path, response.status)
                    not in expected_failures
                    else None
                ),
            )
            page.goto(args.url, wait_until="networkidle")
            expect(
                page.get_by_role("button", name="Continue to mission")
            ).to_be_enabled()
            south_pole_3d_checks(page, args.output, passed)
            page.screenshot(path=str(args.output / "area-desktop.png"), full_page=True)
            page.set_viewport_size({"width": 390, "height": 844})
            fits(page)
            page.screenshot(path=str(args.output / "area-mobile.png"), full_page=True)
            page.get_by_label("Latitude °", exact=True).fill("-80")
            expect(page.locator(".coverage-outcome")).to_contain_text(
                "Outside prepared coverage"
            )
            expect(
                page.get_by_role("button", name="Continue to mission")
            ).to_be_disabled()
            page.get_by_label("Latitude °", exact=True).fill("-87.01")
            expect(page.locator(".coverage-outcome")).to_contain_text(
                "Partial coverage"
            )
            expect(
                page.get_by_role("button", name="Continue to mission")
            ).to_be_disabled()
            page.get_by_role("checkbox").check()
            expect(
                page.get_by_role("button", name="Continue to mission")
            ).to_be_enabled()
            page.get_by_label("Latitude °", exact=True).fill("-89.9")
            expect(page.locator(".coverage-outcome")).to_contain_text("Supported area")
            page.get_by_label("Radius (km)", exact=True).fill("6")
            expect(
                page.get_by_role("button", name="Continue to mission")
            ).to_be_disabled()
            page.get_by_label("Radius (km)", exact=True).fill("5")
            expect(page.locator(".coverage-outcome")).to_contain_text(
                "Partial coverage"
            )
            page.get_by_role("checkbox").check()
            page.get_by_role("button", name="Continue to mission").click()
            page.get_by_label("Mission end (UTC, exclusive)").fill("2028-10-09T00:00")
            page.get_by_role("button", name="Review mission", exact=True).click()
            expect(page.get_by_role("alert")).to_contain_text("up to 7 days")
            page.get_by_label("Mission end (UTC, exclusive)").fill("2028-10-08T00:00")
            page.get_by_role("button", name="More sunlight", exact=False).click()
            page.get_by_role("button", name="Balanced", exact=False).click()
            page.get_by_role("button", name="Review mission", exact=True).click()
            expect(page.locator(".review-facts")).to_contain_text("Balanced")
            page.screenshot(path=str(args.output / "review-mobile.png"), full_page=True)
            page.set_viewport_size({"width": 1440, "height": 1050})
            passed(
                "Guided area selection, keyboard, outside/partial coverage and advertised public limits"
            )
            started = perf_counter()
            page.get_by_role("button", name="Find candidate sites", exact=True).click()
            expect(page.locator(".candidate-card")).to_have_count(3, timeout=90000)
            report["regional_search_seconds"] = round(perf_counter() - started, 3)
            assert page.locator(".candidate-card .primary-metrics dd").count() == 9
            expect(page.locator(".site-takeaway")).to_contain_text(
                "strongest weighted contribution"
            )
            with page.expect_download() as download:
                page.get_by_role(
                    "button", name="Export scientific JSON", exact=True
                ).click()
            export = args.output / "regional-analysis.json"
            download.value.save_as(export)
            result = json.loads(export.read_text())
            assert result["counts"]["region"] > 0 and len(result["candidates"]) == 5
            assert result["provenance"]["kernels"]
            page.get_by_role("button", name="Reveal 2 more candidates").click()
            expect(page.locator(".candidate-card")).to_have_count(5)
            page.get_by_role("button", name="Show three initial sites").click()
            page.get_by_role(
                "button", name="Add to comparison candidate 1", exact=True
            ).click()
            page.get_by_role(
                "button", name="Add to comparison candidate 2", exact=True
            ).click()
            page.get_by_role("button", name="Compare 2/2 selected sites").click()
            expect(
                page.get_by_role("region", name="Same-window comparison table")
            ).to_be_visible()
            page.set_viewport_size({"width": 390, "height": 844})
            fits(page)
            page.screenshot(
                path=str(args.output / "comparison-mobile.png"), full_page=True
            )
            page.get_by_role("button", name="Close panel", exact=True).click()
            page.screenshot(
                path=str(args.output / "regional-mobile.png"), full_page=True
            )
            page.set_viewport_size({"width": 1440, "height": 1050})
            page.screenshot(
                path=str(args.output / "regional-desktop.png"), full_page=True
            )
            page.get_by_role("button", name="Inspect site 01").click()
            expect(page.get_by_role("dialog")).to_be_visible()
            page.get_by_role("tab", name="Timeline", exact=True).click()
            expect(page.get_by_role("button", name="Play mission")).to_be_disabled()
            expect(page.locator(".chart-panel")).to_have_count(1)
            page.get_by_role("tab", name="Terrain horizon", exact=True).click()
            expect(page.locator(".chart-panel")).to_have_count(1)
            page.get_by_role("tab", name="Sources & exports", exact=True).click()
            with page.expect_download() as download:
                page.get_by_role("button", name="Download timeline CSV").click()
            download.value.save_as(args.output / "regional-timeline.csv")
            assert "time_utc" in (args.output / "regional-timeline.csv").read_text()
            page.get_by_role("tab", name="Terrain & sky", exact=True).click()
            expect(page.locator(".evidence-terrain canvas")).to_be_visible(
                timeout=30000
            )
            page.get_by_role("combobox", name="Terrain view", exact=True).select_option(
                "map"
            )
            expect(page.locator(".evidence-terrain svg").first).to_be_visible(
                timeout=30000
            )
            page.get_by_role("combobox", name="Terrain view", exact=True).select_option(
                "terrain"
            )
            expect(page.locator(".evidence-terrain canvas")).to_be_visible()
            page.get_by_role("button", name="Close panel", exact=True).click()
            expect(page.get_by_role("button", name="Inspect site 01")).to_be_focused()
            page.get_by_role("button", name="Edit mission", exact=True).click()
            page.get_by_label("Mission end (UTC, exclusive)").fill("2028-10-07T00:00")
            page.get_by_role("button", name="03 Review sites").click()
            expect(page.locator(".changed-notice")).to_be_visible()
            page.get_by_role("button", name="Create mission summary").click()
            expect(page.get_by_role("dialog")).to_contain_text(
                "previous applied analysis"
            )
            with page.expect_download() as download:
                page.get_by_role("button", name="Download HTML summary").click()
            download.value.save_as(args.output / "mission-summary.html")
            summary = (args.output / "mission-summary.html").read_text()
            printable = browser.new_page()
            printable.set_content(summary)
            printable.pdf(
                path=str(args.output / "mission-summary.pdf"), prefer_css_page_size=True
            )
            printable.close()
            assert "2028-10-08" in summary and "2028-10-07" not in summary
            assert "sampled time" in summary and "landing certification" in summary
            page.screenshot(
                path=str(args.output / "summary-desktop.png"), full_page=True
            )
            page.get_by_role("button", name="Close panel", exact=True).click()
            passed(
                "Three primary metrics, progressive shortlist, same-window comparison, detail tabs, 3D, CSV, applied-only summary and focus restoration"
            )
            page.get_by_role("button", name="Edit mission", exact=True).click()
            page.locator(".advanced-mission summary").first.click()
            page.get_by_label("Maximum slope (°)", exact=True).fill("0")
            page.get_by_role("button", name="Review mission", exact=True).click()
            page.get_by_role("button", name="Find candidate sites", exact=True).click()
            expect(page.locator(".empty-results")).to_be_visible(timeout=90000)
            passed(
                "Valid supported empty search keeps constraints and explains the filtering funnel"
            )

            page.get_by_role("button", name="Anywhere on the Moon", exact=True).click()
            expect(page.locator(".global-map canvas")).to_be_visible(timeout=30000)
            global_map = page.locator(".global-map canvas")
            global_map.click(position={"x": 400, "y": 200})
            longitude = float(
                page.get_by_label("Longitude (°E)", exact=True).input_value()
            )
            global_map.focus()
            page.keyboard.press("ArrowRight")
            assert (
                float(page.get_by_label("Longitude (°E)", exact=True).input_value())
                != longitude
            )
            page.get_by_label("Latitude (°N)", exact=True).fill("0")
            page.get_by_label("Longitude (°E)", exact=True).fill("0")
            page.get_by_label("End (UTC)", exact=True).fill("2028-10-02T00:00")
            with page.expect_response(
                lambda response: "/global/preview" in response.url
            ) as response:
                page.get_by_role(
                    "button", name="Preview this point", exact=True
                ).click()
            assert response.value.status == 200
            near = response.value.json()
            assert near["metrics"]["earth_visibility_fraction"] == 1
            assert len(near["timeline"]) == 289
            expect(page.locator(".global-result")).to_be_visible()
            expect(page.locator(".global-terrain canvas")).to_be_visible(timeout=30000)
            page.get_by_label("Inspect five-minute sample").fill("100")
            expect(page.locator(".global-result")).to_contain_text(
                near["timeline"][100]["time_utc"]
            )
            with page.expect_download() as download:
                page.get_by_role("button", name="Export preview", exact=True).click()
            export = args.output / "global-preview.json"
            download.value.save_as(export)
            exported = json.loads(export.read_text())
            assert exported["coordinate"] == near["coordinate"]
            assert exported["provenance"]["artifact_sha256"]
            passed(
                "Global map, real near-side preview, 3D terrain, timeline and export work"
            )
            page.screenshot(
                path=str(args.output / "global-desktop.png"), full_page=True
            )

            page.get_by_label("Longitude (°E)", exact=True).fill("179.9")
            expect(page.locator(".global-result")).to_contain_text("previous selection")
            with page.expect_response(
                lambda response: "/global/preview" in response.url
            ) as response:
                page.get_by_role(
                    "button", name="Preview this point", exact=True
                ).click()
            assert response.value.json()["metrics"]["earth_visibility_fraction"] == 0
            page.set_viewport_size({"width": 390, "height": 844})
            fits(page)
            page.screenshot(path=str(args.output / "global-mobile.png"), full_page=True)
            passed(
                "Global far-side visibility, stale-results notice and mobile layout work"
            )

            # An overlong window must not replace the previous valid results.
            expected_failures.add(("/api/v1/global/preview", 422))
            page.get_by_label("End (UTC)", exact=True).fill("2028-12-01T00:00")
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_contain_text(
                "31 days"
            )
            expect(page.locator(".global-result")).to_contain_text("179.9000")
            page.get_by_label("End (UTC)", exact=True).fill("2028-10-02T00:00")

            preview_url = "**/api/v1/global/preview"
            expected_failures.add(("/api/v1/global/preview", 503))
            page.route(
                preview_url,
                lambda route: route.fulfill(
                    status=503, json={"detail": "Preview temporarily unavailable"}
                ),
            )
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_contain_text(
                "temporarily unavailable"
            )
            page.unroute(preview_url)
            page.get_by_role("button", name="Preview this point", exact=True).click()
            expect(page.locator(".global-preview .error-box")).to_have_count(
                0, timeout=30000
            )
            expect(
                page.get_by_role("button", name="Preview this point", exact=True)
            ).to_be_enabled()
            passed(
                "Invalid windows and service failures retain prior results and recover on retry"
            )

            page.get_by_role(
                "button", name="South-pole site search", exact=True
            ).click()
            expected_failures.add(("/api/v1/global/terrain", 503))
            page.route(
                "**/api/v1/global/terrain",
                lambda route: route.fulfill(
                    status=503, json={"detail": "Global terrain unavailable"}
                ),
            )
            page.reload(wait_until="networkidle")
            page.get_by_role("button", name="Anywhere on the Moon", exact=True).click()
            expect(
                page.get_by_role("button", name="Retry loading terrain")
            ).to_be_visible()
            expect(
                page.get_by_role("button", name="Preview this point", exact=True)
            ).to_be_disabled()
            page.unroute("**/api/v1/global/terrain")
            page.get_by_role("button", name="Retry loading terrain").click()
            expect(page.locator(".global-map canvas")).to_be_visible(timeout=30000)
            expect(
                page.get_by_role("button", name="Preview this point", exact=True)
            ).to_be_enabled()
            passed("Missing global terrain has an explicit recoverable state")
            assert not report["page_errors"], report["page_errors"]
            assert not report["console_errors"], report["console_errors"]
            assert not report["http_errors"], report["http_errors"]
            passed("No uncaught browser or unexpected console errors")
            job_state_checks(browser, args.url, args.output, passed)
            late_result_check(browser, args.url, args.output, passed)
            browser.close()
    finally:
        (args.output / "report.json").write_text(
            json.dumps(report, indent=2), encoding="utf-8"
        )


if __name__ == "__main__":
    main()
