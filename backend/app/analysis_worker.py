"""Isolated scientific entry point. Parent owns concurrency, deadline and cancellation."""

import json
import logging
import sys

from fastapi import HTTPException


def main():
    payload = json.load(sys.stdin)
    try:
        if sys.argv[1] == "search":
            from app.api import candidate_search_calculation
            from app.models import SearchRequest

            result = candidate_search_calculation(SearchRequest.model_validate(payload))
        elif sys.argv[1] == "preview":
            from app.global_api import GlobalPointRequest, preview_calculation

            result = preview_calculation(GlobalPointRequest.model_validate(payload))
        elif sys.argv[1] == "rank_area":
            from app.global_api import GlobalAreaRequest, area_ranking_calculation

            result = area_ranking_calculation(GlobalAreaRequest.model_validate(payload))
        else:
            raise ValueError("Unknown analysis operation")
        response = {"result": result}
    except HTTPException as exc:
        response = {"error": exc.detail, "status": exc.status_code}
    except Exception:
        logging.getLogger(__name__).exception("Analysis worker failed")
        response = {
            "error": "Scientific calculation unavailable. Your inputs are retained.",
            "status": 503,
        }
    print(json.dumps(response, allow_nan=False))


if __name__ == "__main__":
    main()
