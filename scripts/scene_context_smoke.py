"""Check smooth site navigation and the observer sky on desktop and phones."""

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    output = Path("data/cache/site-context-qa")
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    checks = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--enable-unsafe-swiftshader"]
        )
        for width in (1440, 390):
            page = browser.new_page(viewport={"width": width, "height": 1000})
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("http://127.0.0.1:8000", wait_until="networkidle")
            scene = page.get_by_role(
                "region", name="Interactive topographic Moon, Earth and Sun"
            )
            canvas = scene.locator("canvas")
            expect(canvas).to_be_visible(timeout=30000)
            expect(page.get_by_role("slider", name="Scene time", exact=True)).to_be_enabled()
            page.wait_for_timeout(1500)
            page.get_by_role("button", name="Full screen", exact=False).click()
            page.wait_for_timeout(1500)
            if not page.locator("details.area-editor").evaluate("el => el.open"):
                # Exit fullscreen temporarily to use the site picker.
                page.get_by_role("button", name="Exit full screen", exact=False).click()
                page.locator("details.area-editor > summary").click()
            elif page.evaluate("!!document.fullscreenElement"):
                page.get_by_role("button", name="Exit full screen", exact=False).click()
            page.get_by_role("button", name="Find a place", exact=True).click()
            page.get_by_label("Find an approved landmark", exact=True).fill("Tycho")
            match = page.locator(".landmark-matches button").first
            expect(match).to_be_visible()
            match.click()
            page.wait_for_timeout(1600)
            page.get_by_role("button", name="Full screen", exact=False).click()
            page.wait_for_timeout(1600)
            expect(page.get_by_role("button", name="Go to my site", exact=True)).to_be_enabled()
            # Return from a whole-globe frame through several distinct animation frames.
            # Freeze frame time so screenshot/GPU latency cannot skip the midpoint.
            page.clock.install()
            page.clock.pause_at(datetime.now(UTC) + timedelta(seconds=2))
            page.get_by_role("button", name="Fit view", exact=True).click(force=True)
            page.clock.run_for(1800)
            before = canvas.screenshot()
            page.get_by_role("button", name="Go to my site", exact=True).click(force=True)
            page.clock.run_for(300)
            middle = canvas.screenshot()
            page.clock.run_for(1800)
            after = canvas.screenshot()
            page.clock.resume()
            assert before != middle != after, "Site navigation must render intermediate motion"
            page.screenshot(path=str(output / f"site-focus-{width}.png"))
            page.get_by_role("button", name="View from site", exact=True).click()
            expect(page.locator(".site-sky-context")).to_contain_text("43.30°S")
            expect(page.locator(".site-sky-readings")).to_contain_text("bearing")
            expect(page.locator(".site-sky-context")).to_contain_text("terrain obstructions excluded")
            expect(page.locator(".site-sky-readings > div")).to_have_count(2)
            readings = page.locator(".site-sky-readings").inner_text()
            slider = page.get_by_role("slider", name="Scene time", exact=True)
            slider.fill("1000")
            expect(page.locator(".site-sky-readings")).not_to_have_text(readings)
            page.get_by_role("button", name="Look toward Earth", exact=True).click()
            sky_before = canvas.screenshot()
            canvas.focus()
            canvas.press("ArrowRight")
            assert sky_before != canvas.screenshot(), "Arrow keys must turn observer gaze"
            page.screenshot(path=str(output / f"site-sky-{width}.png"))
            page.get_by_role("button", name="Go to my site", exact=True).click()
            expect(page.get_by_role("button", name="Moon surface", exact=True)).to_have_attribute("aria-pressed", "true")
            expect(page.locator(".site-sky-context")).to_have_count(0)
            page.wait_for_timeout(1500)
            expect(scene).to_contain_text("gold equator")
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            page.get_by_role("button", name="Earth orbit", exact=True).click()
            expect(scene.locator(".body-label.earth")).to_be_visible()
            checks.append(f"{width}px: eased site navigation, return button, graticule, geometric sky, time updates, keyboard gaze and orbit retained")
            print(checks[-1], flush=True)
            page.close()
        browser.close()
    (output / "report.json").write_text(json.dumps({"checks": checks, "errors": errors}, indent=2))
    assert not errors, errors


if __name__ == "__main__":
    main()
