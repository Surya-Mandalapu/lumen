"""Real-browser verification for the scene-first planner, textured bodies and orbital timeline."""

import argparse
import json
from pathlib import Path
from time import perf_counter

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--output", type=Path, default=Path("data/cache/orbital-qa"))
    parser.add_argument("--channel")
    parser.add_argument("--skip-job-fixtures", action="store_true")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    report = {"checks": [], "page_errors": [], "console_errors": [], "timings": []}

    def passed(message):
        report["checks"].append(message)
        print(f"PASS {message}", flush=True)

    def fits(page):
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            "Horizontal overflow"
        )

    def open_editor(page):
        if not page.locator("details.area-editor").evaluate("element => element.open"):
            page.locator(".area-editor > summary").click()

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                channel=args.channel,
                headless=True,
                args=["--enable-unsafe-swiftshader"],
            )
            for width in (1440, 390):
                page = browser.new_page(
                    viewport={"width": width, "height": 1000 if width > 400 else 844},
                    reduced_motion="reduce",
                    accept_downloads=True,
                )
                page.on(
                    "pageerror", lambda error: report["page_errors"].append(str(error))
                )
                page.on(
                    "console",
                    lambda message: (
                        report["console_errors"].append(message.text)
                        if message.type == "error"
                        and "Failed to load resource" not in message.text
                        else None
                    ),
                )
                assets = []
                page.on(
                    "response",
                    lambda response, assets=assets: (
                        assets.append(response.url)
                        if "/assets/" in response.url and response.ok
                        else None
                    ),
                )
                page.goto(args.url, wait_until="networkidle")
                scene = page.get_by_role(
                    "region", name="Interactive topographic Moon, Earth and Sun"
                )
                expect(scene.locator("canvas")).to_be_visible(timeout=30000)
                expect(
                    page.get_by_role("slider", name="Scene time", exact=True)
                ).to_be_enabled(timeout=30000)
                expect(page.get_by_role("button", name="Moon surface", exact=True)).to_have_attribute("aria-pressed", "true")
                expect(scene.locator(".body-label.earth")).to_have_count(0)
                expect(scene.locator(".body-label.sun")).to_have_count(0)
                assert any("moon-height.i16" in url for url in assets)
                expect(
                    page.get_by_role("button", name="Anywhere on the Moon", exact=True)
                ).to_have_count(0)
                expect(page.locator(".discovery-card")).to_have_count(0)
                expect(
                    page.get_by_text("Searches stop within 30 seconds", exact=True)
                ).to_have_count(0)
                fits(page)
                page.screenshot(
                    path=str(args.output / f"scene-first-{width}.png"), full_page=True
                )

                page.get_by_role("button", name="Full screen", exact=False).click()
                expect(scene).to_have_class("orbital-scene immersive")
                box = scene.bounding_box()
                assert abs(box["width"] - width) < 2
                page.get_by_role("button", name="Go to my site", exact=True).click()
                page.wait_for_timeout(300)
                # A full-scale height setting must change actual rendered relief.
                page.get_by_label("Topographic relief", exact=True).select_option("1")
                page.wait_for_timeout(150)
                true_scale = scene.locator("canvas").screenshot()
                page.get_by_label("Topographic relief", exact=True).select_option("12")
                page.wait_for_timeout(150)
                exaggerated = scene.locator("canvas").screenshot()
                assert true_scale != exaggerated, (
                    "Relief control did not change the mesh"
                )
                assert page.locator(".moon-landmark:visible").count() > 0, (
                    "No visible relevant landmark labels"
                )
                page.screenshot(
                    path=str(args.output / f"topography-labels-{width}.png")
                )
                page.get_by_role("button", name="Landmarks", exact=True).click()
                expect(page.locator(".moon-landmark")).to_have_count(0)
                page.get_by_role("button", name="Landmarks", exact=True).click()
                page.get_by_role("button", name="Earth orbit", exact=True).click()
                expect(scene.locator(".body-label.earth")).to_be_visible()
                expect(scene.locator(".body-label.sun")).to_be_visible()
                assert any("earth-visual.glb" in url for url in assets)
                assert any("sun-visual.glb" in url for url in assets)
                with page.expect_response(lambda response: "/api/v1/scene/ephemeris" in response.url and response.request.method == "POST") as ephemeris:
                    page.get_by_label("Scene duration", exact=True).select_option("30")
                assert ephemeris.value.ok
                slider = page.get_by_role("slider", name="Scene time", exact=True)
                expect(slider).to_be_enabled()
                first_time = page.locator(".scene-readout").inner_text()
                before = scene.locator("canvas").screenshot()
                slider.focus()
                slider.press("End")
                expect(page.locator(".scene-readout")).not_to_have_text(first_time)
                after = scene.locator("canvas").screenshot()
                assert before != after, "Time scrub did not move the orbital view"
                page.get_by_role("button", name="Play scene time", exact=True).click()
                expect(
                    page.get_by_role("button", name="Pause scene time", exact=True)
                ).to_be_visible()
                page.wait_for_timeout(400)
                page.get_by_role("button", name="Pause scene time", exact=True).click()
                assert int(slider.input_value()) > 0
                stopped = slider.input_value()
                page.wait_for_timeout(200)
                assert slider.input_value() == stopped
                page.screenshot(path=str(args.output / f"earth-orbit-{width}.png"))
                page.keyboard.press("Escape")
                expect(scene).not_to_have_class("orbital-scene immersive")
                page.wait_for_function("!document.fullscreenElement")
                assert page.evaluate("document.body.style.overflow") != "hidden"
                passed(
                    f"{width}px: textured NASA Earth/Sun, real relief, visible landmark labels, native fullscreen, orbit scrub, play/pause, Escape and responsive layout"
                )

                page.get_by_role("button", name="Moon surface", exact=True).click()
                expect(scene.locator(".body-label.earth")).to_have_count(0)
                expect(scene.locator(".body-label.sun")).to_have_count(0)
                open_editor(page)
                page.get_by_role("button", name="Find a place", exact=True).click()
                page.get_by_label("Find an approved landmark", exact=True).fill("Tycho")
                page.locator(".landmark-matches button").first.click()
                expect(
                    page.get_by_label("Latitude ° (south is negative)", exact=True)
                ).to_have_value("-43.2958")
                page.get_by_role("button", name="Save area", exact=True).click()
                expect(page.locator(".saved-areas summary")).to_contain_text("1")
                expect(page.locator(".coarse-area-preview")).to_be_visible()
                started = perf_counter()
                page.get_by_role(
                    "button", name="Preview this point", exact=True
                ).click()
                expect(page.locator(".coarse-preview-result")).to_be_visible(
                    timeout=30000
                )
                report["timings"].append(
                    {
                        "width": width,
                        "completed_point_preview_seconds": round(
                            perf_counter() - started, 3
                        ),
                    }
                )
                page.get_by_role(
                    "button", name="Use a supported south-pole area", exact=True
                ).click()
                expect(
                    page.get_by_role("button", name="Continue to mission", exact=True)
                ).to_be_enabled()
                page.get_by_role(
                    "button", name="Continue to mission", exact=True
                ).click()
                page.get_by_role("button", name="Review mission", exact=True).click()
                page.get_by_role(
                    "button", name="Find candidate sites", exact=True
                ).click()
                started = perf_counter()
                expect(page.locator(".candidate-card")).to_have_count(3, timeout=30000)
                report["timings"].append(
                    {
                        "width": width,
                        "completed_site_search_seconds": round(
                            perf_counter() - started, 3
                        ),
                    }
                )
                page.get_by_role(
                    "button", name="Add to comparison candidate 1", exact=True
                ).click()
                page.get_by_role(
                    "button", name="Add to comparison candidate 2", exact=True
                ).click()
                page.get_by_role(
                    "button", name="Compare 2/2 selected sites", exact=True
                ).click()
                expect(
                    page.get_by_role("region", name="Same-window comparison table")
                ).to_be_visible()
                page.get_by_role("button", name="Close panel", exact=True).click()
                with page.expect_download() as download:
                    page.get_by_role(
                        "button", name="Export scientific JSON", exact=True
                    ).click()
                download.value.save_as(args.output / f"scientific-search-{width}.json")
                fits(page)
                passed(
                    f"{width}px: compact place lookup, saved area, completed coarse preview, mission setup, completed detailed search, comparison and scientific export"
                )
                page.close()

            page = browser.new_page(
                viewport={"width": 1440, "height": 1000}, reduced_motion="reduce"
            )
            page.route(
                "**/api/v1/scene/ephemeris",
                lambda route: route.fulfill(
                    status=503, json={"detail": "Ephemerides temporarily unavailable"}
                ),
            )
            page.goto(args.url, wait_until="networkidle")
            expect(page.get_by_role("alert")).to_contain_text(
                "Ephemerides temporarily unavailable"
            )
            expect(
                page.get_by_role("slider", name="Scene time", exact=True)
            ).to_be_disabled()
            expect(page.locator(".orbital-canvas canvas")).to_be_visible()
            page.unroute("**/api/v1/scene/ephemeris")
            page.get_by_role("button", name="Retry positions", exact=True).click()
            expect(
                page.get_by_role("slider", name="Scene time", exact=True)
            ).to_be_enabled()
            page.evaluate("HTMLElement.prototype.requestFullscreen = undefined")
            page.get_by_role("button", name="Full screen", exact=False).click()
            expect(page.locator(".orbital-scene")).to_have_class(
                "orbital-scene immersive"
            )
            page.keyboard.press("Escape")
            expect(page.locator(".orbital-scene")).not_to_have_class(
                "orbital-scene immersive"
            )
            passed(
                "Unavailable ephemerides are explicit, the Moon remains usable, retry recovers, and fullscreen CSS fallback exits cleanly"
            )
            page.close()
            if not args.skip_job_fixtures:
                from browser_smoke import job_state_checks, late_result_check

                job_state_checks(browser, args.url, args.output, passed)
                late_result_check(browser, args.url, args.output, passed)
            browser.close()
        assert not report["page_errors"], report["page_errors"]
        assert not report["console_errors"], report["console_errors"]
    finally:
        (args.output / "report.json").write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
