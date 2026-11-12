"""Shared job regression fixtures and entry point for the scene-first Lumen planner.

Install playwright and its Chromium browser first. Screenshots, exports and the
machine-readable report go to ignored data/cache/demo-qa by default.
"""

from __future__ import annotations

import json

from playwright.sync_api import Error as BrowserError
from playwright.sync_api import expect


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
        old = json.loads((output / "scientific-search-1440.json").read_text())
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


def main():
    from orbital_smoke import main as run_scene_checks

    run_scene_checks()


if __name__ == "__main__":
    main()
