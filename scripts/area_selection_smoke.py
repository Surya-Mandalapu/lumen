"""Verify right-drag, left-drag and touch search circles through the actual API."""

import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


def main():
    output = Path("data/cache/area-selection-qa")
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    checks = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True, args=["--enable-unsafe-swiftshader"]
        )
        for width in (1440, 390):
            page = browser.new_page(
                viewport={"width": width, "height": 1000},
                reduced_motion="reduce",
                has_touch=width == 390,
            )
            page.on("pageerror", lambda error: errors.append(str(error)))
            submitted = []
            page.on(
                "request",
                lambda request, submitted=submitted: (
                    submitted.append(request.post_data_json)
                    if request.url.endswith("/coverage/preview")
                    else None
                ),
            )
            page.goto("http://127.0.0.1:8000", wait_until="networkidle")
            canvas = page.locator(".orbital-canvas canvas")
            expect(
                page.get_by_role("slider", name="Scene time", exact=True)
            ).to_be_enabled(timeout=30000)
            page.get_by_role("button", name="Full screen", exact=False).click()
            page.wait_for_function(
                "document.querySelector('.orbital-canvas canvas').getBoundingClientRect().width === innerWidth"
            )
            page.wait_for_timeout(500)
            box = canvas.bounding_box()
            offset = 12 if width == 1440 else 3
            x, y = (
                box["x"] + box["width"] / 2 + offset,
                box["y"] + box["height"] / 2 + offset,
            )
            before = len(submitted)
            page.mouse.move(x, y)
            page.mouse.down(button="right")
            page.mouse.move(x + 70, y + 15, steps=8)
            expect(page.locator(".area-selection-status")).to_contain_text(
                "limit reached"
            )
            assert len(submitted) == before, "A draft must not change the applied area"
            page.screenshot(path=str(output / f"drawing-{width}.png"))
            page.mouse.up(button="right")
            expect(page.locator(".area-selection-status")).to_contain_text(
                "Search area selected"
            )
            page.wait_for_timeout(700)
            area = submitted[-1]
            assert area["selector_type"] == "circle" and area["search_radius_km"] == 5
            assert area["center"]["latitude_deg"] < -87, area
            before = len(submitted)
            # Escape and releasing off the globe must retain that area.
            page.mouse.move(x, y)
            page.mouse.down(button="right")
            page.mouse.move(x + 25, y, steps=4)
            page.keyboard.press("Escape")
            page.mouse.up(button="right")
            expect(page.locator(".area-selection-status")).to_contain_text("cancelled")
            assert len(submitted) == before
            page.get_by_role("button", name="Fit view", exact=True).click()
            page.wait_for_timeout(300)
            page.mouse.move(x, y)
            page.mouse.down(button="right")
            page.mouse.move(box["x"] + 2, box["y"] + 2, steps=4)
            page.mouse.up(button="right")
            expect(page.locator(".area-selection-status")).to_contain_text("cancelled")
            assert len(submitted) == before
            page.get_by_role("button", name="Draw search area", exact=True).click()
            if width == 390:
                session = page.context.new_cdp_session(page)
                session.send(
                    "Input.dispatchTouchEvent",
                    {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]},
                )
                for step in range(1, 6):
                    session.send(
                        "Input.dispatchTouchEvent",
                        {
                            "type": "touchMove",
                            "touchPoints": [
                                {"x": x + step * 4, "y": y + step, "id": 1}
                            ],
                        },
                    )
                session.send(
                    "Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}
                )
            else:
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x + 20, y + 5, steps=5)
                page.mouse.up()
            expect(
                page.get_by_role("button", name="Draw search area", exact=True)
            ).to_have_attribute("aria-pressed", "false")
            expect(page.locator(".area-selection-status")).to_contain_text(
                "Search area selected"
            )
            page.wait_for_timeout(700)
            applied = submitted[-1]
            assert 1 <= applied["search_radius_km"] <= 5
            page.get_by_role("button", name="Exit full screen", exact=False).click()
            if not page.locator("details.area-editor").evaluate(
                "element => element.open"
            ):
                page.locator("details.area-editor > summary").click()
            expect(
                page.get_by_label("Detailed search radius (km)", exact=False)
            ).to_have_value(str(applied["search_radius_km"]))
            page.screenshot(path=str(output / f"selected-{width}.png"), full_page=True)
            if width == 1440:
                expect(
                    page.get_by_role("button", name="Continue to mission", exact=True)
                ).to_be_enabled()
                page.get_by_role(
                    "button", name="Continue to mission", exact=True
                ).click()
                page.get_by_role("button", name="Review mission", exact=True).click()
                with page.expect_response(
                    lambda response: (
                        response.url.endswith("/candidates/search")
                        and response.request.method == "POST"
                    ),
                    timeout=30000,
                ) as search:
                    page.get_by_role(
                        "button", name="Find candidate sites", exact=True
                    ).click()
                assert search.value.ok
                result = search.value.json()
                assert result["counts"]["region"] > 0
                assert all(
                    result["request"]["region"][key] == value
                    for key, value in applied.items()
                )
                expect(page.locator(".candidate-card")).to_have_count(
                    len(result["candidates"]), timeout=30000
                )
                (output / "drawn-area-search.json").write_text(json.dumps(result))
            checks.append(
                f"{width}px: right-drag preview and commit, radius cap, Escape/off-globe cancellation, {'touch' if width == 390 else 'left-drag'}, applied coordinates/radius"
            )
            print(checks[-1], flush=True)
            page.close()
        browser.close()
    (output / "report.json").write_text(
        json.dumps({"checks": checks, "errors": errors}, indent=2)
    )
    assert not errors, errors


if __name__ == "__main__":
    main()
