# Project Instructions for AI Agents

These instructions apply to AI-assisted development in this repository. Preserve the project's current design decisions and canonical plans, and verify the live repository state before treating older documentation as current implementation truth.

<!-- auto-preference-learner:start -->
## Learned working preferences

- In multi-session development, verify the live Git/GitHub state and continue from the most advanced real development branch; do not regress to a historical branch or stale handoff when newer work exists.
- While clear, low-risk work remains within the current objective, continue to the next useful task without asking whether to proceed or stopping after a trivial checkpoint.
- Create and push frequent coherent checkpoints so environment resets do not erase meaningful progress. On a protected or primary branch, prefer coherent recoverable commits over premature WIP churn.
- Prefer local tests, builds, linters, and other local validation as the normal development loop. Install missing tooling when practical; if a required gate remains unavailable, record the exact blocker and continue independent resolvable work instead of treating the unavailable gate as a reason to stop all development.
- Keep documentation synchronized with meaningful behavior, architecture, validation, and continuation-state changes so another agent can safely resume from the repository itself.
- Use available plugins and integrations when they materially improve correctness, verification, or development efficiency; do not invoke them merely for ceremony.
<!-- auto-preference-learner:end -->
