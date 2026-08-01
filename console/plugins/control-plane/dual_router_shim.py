#!/usr/bin/env python3
"""JSON stdin/stdout bridge from AutoClaw to dual-llm-router."""

from __future__ import annotations

import json
import logging
import sys
from contextlib import redirect_stdout


def main() -> int:
    logging.basicConfig(stream=sys.stderr, level=logging.INFO)
    payload = json.load(sys.stdin)
    config = payload["config"]
    sys.path.insert(0, config["router_path"])
    with redirect_stdout(sys.stderr):
        from router import DualLLMRouter  # pylint: disable=import-outside-toplevel

    assignment = payload["assignment"]
    prompt = json.dumps(
        {
            "goal": assignment["goal"],
            "target_files": assignment["write_scopes"],
            "acceptance_criteria": assignment["acceptance_criteria"],
            "constraints": {
                "read_scopes": assignment["read_scopes"],
                "write_scopes": assignment["write_scopes"],
                "assignment_id": assignment["assignment_id"],
            },
        }
    )
    router_args = {"workspace_root": payload["worktree_path"]}
    if config.get("planner_model"):
        router_args["planner_model"] = config["planner_model"]
    if config.get("executor_model"):
        router_args["executor_model"] = config["executor_model"]
    with redirect_stdout(sys.stderr):
        router = DualLLMRouter(**router_args)
        result = router.run(prompt, execute_tools=True)
    json.dump(result, sys.stdout)
    sys.stdout.write("\n")
    # A router-reported failure is valid protocol output. Process failures are
    # reserved for shim/import/runtime crashes so the caller can distinguish them.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
