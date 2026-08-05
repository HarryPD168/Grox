# Desktop invariants (Codex migration guardrails)

Must hold after every PR on the capability-migration track. Run:

```text
cd apps/desktop && pnpm test
```

Focus suites: `permissionAuto`, `queueTurnPolicy`, `promptQueue`, `sessionGate`, `firstEventWatch`, `promptTurnTimeout`, `computerUse`, plus pure modules (`featureFlags`, `sandboxPolicy`, `effectiveRuntime`, `grokInspect`, `worktreePolicy`, `concurrentSessions`, `reviewPreset`, `activeProcesses`).

| ID | Invariant |
|----|-----------|
| I-01 | Drain prompt queue only when session is idle; Stop suppresses drain |
| I-02 | Opening gate must not drop permission / plan / question cards |
| I-03 | In-flight turn must not half-apply a new sandbox preference |
| I-04 | Computer Use only via operator opt-in (not Bypass) |
| I-05 | Media tools remain allowlisted |
| I-06 | Failed worktree bind must not create a session with invalid cwd |
| I-07 | Queue ghost / consumed semantics stay intact under new UI |
| I-08 | Feature flag off ≈ pre-slice spawn / behavior |
| I-09 | First-event budget SSOT: warm `FIRST_EVENT_STALL_MS` (25s); post-`session/load` one-shot `POST_BIND_FIRST_EVENT_MS` (60s); message seconds derive from the budget that fired |
| I-10 | Primary prompt-turn timeout emits hard `error` **before** flight invalidate; store parks queue (no auto-drain) |
| I-11 | Timeout classification uses `isPromptTurnTimeoutMessage` (no duplicate phrase lists in store) |
| I-12 | Concurrent-only timeout under live primary must not force session idle |
| I-13 | Live progress excludes `user_message_chunk` / mode-only updates (zero-event purity) |
| I-14 | Open session may silent warm-bind the **active** mission only (no UI replay flood); first-send awaits the same `loadPromises` if still in flight |
| I-15 | Background silent bind must not start while a live primary/concurrent turn is bookkept |
| I-16 | Stop / FE timeout parks local queue; operator must **Resume queue** or send again (no surprise auto-drain) |
| I-17 | First-event soft warn (post-bind) is `kind: info` only — must not match timeout classifier / park queue |
| I-18 | CU sticky stop on kill is fail-closed (emergency_stop failure → revoke bearer) |
| I-19 | Windows ACP child is in a Job Object; terminate kills the process tree |
| I-20 | Computer Use + Bypass prefer host-attested `host_prefs.json` (native confirm on enable) |
| I-21 | Shell polls agent process liveness and emits `acp-exit` if the child dies silently |
| I-22 | Offline history enrich reuses live block identities for matching content; Timeline idle pin must not flash mid-history on open |
| I-23 | Computer Use gate = `GROX_COMPUTER_USE` env **or** host_prefs only (FE localStorage cannot open MCP) |
| I-24 | host_prefs uses a single app_data path + process cache (set at startup) |
| I-25 | Queue park always updates suppress set **and** `queueDrainParked` via one mirror helper |

## UI honesty

- Dual-state: **requested** vs **applied \| unknown**
- Never show green “isolated” when applied is unknown (inspect degrade path)
- Default sandbox preference is **follow CLI** (no shell-forced sandbox)

## Shell constraints

- No OS sandbox implemented in the desktop shell
- Worktrees only via `grok worktree` (no parallel raw `git worktree` track)
- ACP spawn remains `grok agent … stdio` via Tauri; Lite shell only
