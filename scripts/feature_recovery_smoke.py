"""Verify restored feature visibility, including when Study area is collapsed."""

import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    args = parser.parse_args()
    output = Path("data/cache/feature-recovery-qa")
    output.mkdir(parents=True, exist_ok=True)
    errors, console_errors, checks = [], [], []
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
            page.goto(args.url, wait_until="networkidle")
            expect(
                page.get_by_role("slider", name="Scene time", exact=True)
            ).to_be_enabled(timeout=30000)
            expect(
                page.get_by_role("button", name="Draw search area", exact=True)
            ).to_be_visible()
            expect(
                page.get_by_role("button", name="Go to my site", exact=True)
            ).to_be_visible()
            expect(
                page.get_by_role("button", name="Anywhere on the Moon", exact=True)
            ).to_have_count(0)
            # The south-pole-facing default must not label the hidden northern side.
            expect(
                page.locator(".moon-grid-label", has_text="60°N")
            ).not_to_be_visible()
            page.get_by_role("button", name="Earth orbit", exact=True).click()
            expect(page.locator(".body-label.earth")).to_be_visible()
            expect(page.locator(".body-label.sun")).to_be_visible()
            page.get_by_role("button", name="View from site", exact=True).click()
            expect(page.locator(".site-sky-context")).to_be_visible()
            expect(page.locator(".site-horizon-overview")).to_be_visible()
            page.get_by_role("button", name="Moon surface", exact=True).click()
            editor = page.locator("details.area-editor")
            if not editor.evaluate("el => el.open"):
                editor.locator("summary").first.click()
            page.get_by_role("button", name="Find a place", exact=True).click()
            page.get_by_label("Find an approved landmark", exact=True).fill("Tycho")
            page.locator(".landmark-matches button").first.click()
            page.get_by_label("Detailed search radius (km)", exact=False).fill("5")
            expect(page.locator(".local-area-workspace")).to_be_visible()
            editor.locator("summary").first.click()
            expect(editor).not_to_have_attribute("open", "")
            expect(
                page.get_by_role("button", name="Rank this area", exact=True)
            ).to_be_visible()
            assert page.locator(".coarse-area-preview").evaluate(
                "el => !el.closest('details')"
            )
            expect(
                page.get_by_role("button", name="Continue to mission", exact=True)
            ).not_to_be_visible()
            page.get_by_role("button", name="Rank this area", exact=True).click()
            expect(
                page.get_by_role(
                    "button", name="View all 21 locations in 3D", exact=True
                )
            ).to_be_visible(timeout=30000)
            page.get_by_role(
                "button", name="View all 21 locations in 3D", exact=True
            ).click()
            dialog = page.get_by_role("dialog", name="Explore the ranked local area")
            expect(dialog.locator("canvas")).to_be_visible(timeout=30000)
            expect(
                dialog.get_by_role(
                    "button", name="Select mapped candidate 1", exact=True
                )
            ).to_be_visible(timeout=30000)
            expect(dialog.locator(".mapped-site-count")).to_contain_text("21")
            page.screenshot(
                path=str(output / f"restored-sites-{width}.png"), full_page=True
            )
            dialog.get_by_role("button", name="Close site map", exact=True).click()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            checks.append(
                f"{width}px: decluttered scene, correct label culling, Earth/Sun, site horizon, visible ranking with closed editor, 21 ranked locations in 3D"
            )
            print(checks[-1], flush=True)
            page.close()
        browser.close()
    (output / "recovery-report.json").write_text(
        json.dumps(
            {"checks": checks, "errors": errors, "console_errors": console_errors},
            indent=2,
        )
    )
    assert not errors, errors
    assert not console_errors, console_errors


if __name__ == "__main__":
    main()
