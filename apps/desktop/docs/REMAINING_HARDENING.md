# Remaining hardening

Tracked after multi-agent R1/R2 review and platform-debt pass (0.2.19).

## Done in 0.2.19–0.2.20

| Item | Notes |
|------|--------|
| Windows Job Object for ACP child tree | Agent child assigned to job with `KILL_ON_JOB_CLOSE`; `terminate_process` calls `TerminateJobObject` before `child.kill` |
| Computer Use host-attested opt-in | `host_prefs.json` + native confirm; **0.2.20 gate ignores FE `operator_enabled`** |
| Bypass/YOLO host-attested | `host_prefs_set_permission_mode` + native confirm when enabling bypass |
| Agent process liveness (shell heartbeat) | 15s `try_wait` poll; emits `acp-exit` if child dies silently |
| Idle / absolute policy | Defaults remain 45m / 4h; overridable via `host_prefs` + `configurePromptTurnTimeouts` |
| Cross-platform single-instance | Windows named mutex; Unix exclusive `flock` |
| Open flash / offline enrich | **0.2.20** stabilize live block ids + Timeline pinningRef |
| host_prefs path | **0.2.20** single app_data dir + process cache at startup |
| CU sticky revoke | **0.2.20** per-lease first; process-wide only as last resort |
| FE CU migration | **0.2.20** silent migrate localStorage CU=1 → host_prefs once |

## Protocol / product still outside shell-only scope

| Item | Severity | Notes |
|------|----------|-------|
| Agent-layer JSON-RPC heartbeat | P2 protocol | Needs grok agent protocol support for mid-tool keepalives; shell process liveness is in place |
| Full store/integration test harness | P2 | Pure unit coverage remains primary; bridge E2E still manual |
| Nested Job breakaway edge cases | P3 | If parent already in a non-breakaway job, assign may fail (logged); kill still best-effort |

## Root repo files intentionally not committed

| File | Why left untracked |
|------|--------------------|
| `.npmrc` (`dangerouslyAllowAllBuilds=true`) | Local install convenience; too permissive for shared default |
| `pnpm-workspace.yaml` (only `onlyBuiltDependencies`) | Incomplete / not a proper packages workspace; apps/desktop is self-contained |
