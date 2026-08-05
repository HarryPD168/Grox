# Remaining hardening

Tracked after multi-agent R1/R2 review and platform-debt pass (0.2.19).
Updated through **0.2.31** residual / regression matrix.

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

## Done in 0.2.21–0.2.30 (evidence train)

| Version | Item | Notes |
|---------|------|--------|
| 0.2.24 | Offline merge order | Spine + `insertLiveOnly`; 处理好了 before Push |
| 0.2.26–27 | ACP notify allowlist | `_x.ai/yolo_mode_changed` after `wireMethod` underscore prefix |
| 0.2.28 | Catalog union | `mergeProjectSessionsPure` keeps same-cwd offline missions on project "+" |
| 0.2.29 | CU Bearer host inject | FE Authorization stripped; host injects live token on `session/new\|load` |
| 0.2.29 | CU migrate latch | `computer_use_fe_migrated` prevents localStorage re-open after host opt-out |
| 0.2.30 | Per-session upgrade force | Not process-wide Wave-1 forever; `upgradeForceRescanned` once per mission |
| 0.2.30 | User-boundary trim | `trim_offline_blocks_at_user_boundary` / FE `sliceCacheBlocks` skip mid-tool |

## Critical regression matrix (automated)

Run from `apps/desktop`:

```bash
pnpm test
pnpm test:rust
```

| ID | Path | Primary tests |
|----|------|----------------|
| CP-01 | Upgrade force per-session | `sessionOpenPolicy.test.ts`, `criticalPath.regression.test.ts` |
| CP-02 | Catalog union on new session | `sessionCatalogMerge.test.ts` |
| CP-03 | Open flash block order | `offlineMerge.test.ts` |
| CP-04 | CU opt-out / revoke | `computerUse.test.ts` |
| CP-05 | Silent ACP flood scope | `silentAcp.test.ts` |
| CP-06 | Trim user boundary | `sessionCache.slice.test.ts`, Rust `trim_offline_*` |
| CP-07 | ACP method allowlist | Rust `acp_method_*` |
| CP-08 | Host CU migrate latch | Rust `host_prefs` migrate tests |
| CP-09 | Markdown SSRF dual-gate | `markdownOpenUrl.test.ts` |
| CP-10 | CU Bearer strip | Rust `inject_computer_mcp_auth_*` |

## Manual smoke (install / operator)

After installing `%LOCALAPPDATA%\Grox`:

1. **Open order** — long spoof/history mission: 处理好了 appears before 你现在尝试 / Push (no flash reorder).
2. **Window switch** — change mission / permission mode: no flood of `不允许的 ACP 方法：_x.ai/...`.
3. **Project +** — new session in same cwd: old offline missions remain in sidebar without “导入 CLI 历史”.
4. **Upgrade force** — after shell update, first open of each old mission rescans once; second open is fast (fingerprint path).
5. **CU** — Settings OFF after prior attach refuses mid-turn computer tools; Bearer not visible in FE params.

## Protocol / product still outside shell-only scope

| Item | Severity | Notes |
|------|----------|-------|
| Agent-layer JSON-RPC heartbeat | P2 protocol | Needs grok agent protocol support for mid-tool keepalives; shell process liveness is in place |
| Full store/integration + Playwright E2E | P2 | Pure unit coverage is primary; optional Playwright not wired in desktop package |
| Nested Job breakaway edge cases | P3 | If parent already in a non-breakaway job, assign may fail (logged); kill still best-effort |
| max*2 trim fallback mid-tool | P3 | Documented in `sessionCache.slice.test.ts` when single primary is far above window |

## Root repo files intentionally not committed

| File | Why left untracked |
|------|--------------------|
| `.npmrc` (`dangerouslyAllowAllBuilds=true`) | Local install convenience; too permissive for shared default |
| `pnpm-workspace.yaml` (only `onlyBuiltDependencies`) | Incomplete / not a proper packages workspace; apps/desktop is self-contained |
