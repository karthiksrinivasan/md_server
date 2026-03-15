#!/usr/bin/env bash
###############################################################################
# plan-loop.sh — Autonomous PRD implementation loop using Superpowers skills
#
# Orchestrates the full lifecycle of multi-plan PRD implementation by spawning
# fresh Claude sessions for each phase. Each session gets exactly the context
# it needs — no context pollution across phases.
#
# Cycle per plan:
#   Phase 1: BASE_VERIFY  — Verify base branch (main) is clean before starting
#   Phase 2: WRITE        — Generate plan from spec (auto-skips if plan exists)
#   Phase 3: EXECUTE      — Implement in fresh session (subagent-driven-development)
#   Phase 4: VERIFY       — Run tests + build on implementation
#   Phase 5: REVIEW       — Code review (always 3 iterations for deeper insights)
#   Phase 6: VERIFY_FINAL — Final tests + build after review fixes
#   Phase 7: MERGE        — Merge branch to main (local merge, verified)
#
# Usage:
#   ./scripts/plan-loop.sh                    # Start/resume from state file
#   ./scripts/plan-loop.sh --plan 3           # Jump to plan 3
#   ./scripts/plan-loop.sh --phase write      # Jump to specific phase
#   ./scripts/plan-loop.sh --plan 3 --phase execute
#   ./scripts/plan-loop.sh --auto             # Skip human gates (fully autonomous)
#   ./scripts/plan-loop.sh --dry-run          # Show what would run
#   ./scripts/plan-loop.sh --max-review-loops 3  # Cap review→fix cycles (default: 3)
#   ./scripts/plan-loop.sh --no-skip-permissions # Prompt for tool approvals (default: skip)
#
# Requirements:
#   - claude CLI installed and authenticated
#   - gh CLI installed and authenticated
#   - jq installed
#   - git repo with main branch
#
# State:
#   Persisted to .plan-loop/state.json — script is fully resumable.
#   Logs per-phase at .plan-loop/logs/
###############################################################################
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
STATE_DIR="${PROJECT_ROOT}/.plan-loop"
STATE_FILE="${STATE_DIR}/state.json"
LOG_DIR="${STATE_DIR}/logs"
MODEL="claude-opus-4-6"
CLAUDE_CMD="claude"
MAX_REVIEW_LOOPS=3
SKIP_PERMISSIONS=true

# ─── Manifest ────────────────────────────────────────────────────────────────
#
# All project-specific config lives in plan-loop.json at the project root.
# The script reads plans, spec path, base branch, etc. from there.
#
# Example plan-loop.json:
# {
#   "spec": "docs/superpowers/specs/my-spec.md",
#   "plans_dir": "docs/superpowers/plans",
#   "base_branch": "main",
#   "plans": [
#     { "name": "foundation", "description": "Foundation + Data Layer" },
#     { "name": "api-layer",  "description": "API Layer" }
#   ]
# }
#
MANIFEST_FILE="${PROJECT_ROOT}/plan-loop.json"
PLAN_REGISTRY=()

load_manifest() {
  if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo ""
    echo "  No plan-loop.json found at project root."
    echo "  Creating one — you can edit it later."
    echo ""
    generate_manifest
  fi

  # Read config from manifest
  SPEC_FILE=$(jq -r '.spec // "docs/superpowers/specs/spec.md"' "$MANIFEST_FILE")
  PLANS_DIR=$(jq -r '.plans_dir // "docs/superpowers/plans"' "$MANIFEST_FILE")
  BASE_BRANCH=$(jq -r '.base_branch // "main"' "$MANIFEST_FILE")

  # Optional overrides
  local manifest_model
  manifest_model=$(jq -r '.model // empty' "$MANIFEST_FILE")
  [[ -n "$manifest_model" ]] && MODEL="$manifest_model"

  local manifest_max_loops
  manifest_max_loops=$(jq -r '.max_review_loops // empty' "$MANIFEST_FILE")
  [[ -n "$manifest_max_loops" ]] && MAX_REVIEW_LOOPS="$manifest_max_loops"

  # Load plans into registry array
  local plan_count
  plan_count=$(jq '.plans | length' "$MANIFEST_FILE")
  if [[ "$plan_count" -eq 0 ]]; then
    die "No plans defined in $MANIFEST_FILE"
  fi

  for ((i = 0; i < plan_count; i++)); do
    local name desc
    name=$(jq -r ".plans[$i].name" "$MANIFEST_FILE")
    desc=$(jq -r ".plans[$i].description" "$MANIFEST_FILE")
    PLAN_REGISTRY+=("$((i + 1)):${name}:${desc}")
  done

  info "Loaded manifest: $plan_count plans from $MANIFEST_FILE"
}

# Auto-generate manifest by scanning the project
generate_manifest() {
  local spec_file=""
  local plans_dir=""
  local base_branch="main"

  # Try to find spec file
  spec_file=$(find "${PROJECT_ROOT}/docs" -name "*.md" -path "*/specs/*" 2>/dev/null | head -1 || true)
  if [[ -z "$spec_file" ]]; then
    spec_file=$(find "${PROJECT_ROOT}/docs" -name "*spec*" -o -name "*prd*" -o -name "*design*" 2>/dev/null | head -1 || true)
  fi
  spec_file="${spec_file#${PROJECT_ROOT}/}"

  # Try to find plans directory
  if [[ -d "${PROJECT_ROOT}/docs/superpowers/plans" ]]; then
    plans_dir="docs/superpowers/plans"
  elif [[ -d "${PROJECT_ROOT}/docs/plans" ]]; then
    plans_dir="docs/plans"
  else
    plans_dir="docs/superpowers/plans"
  fi

  # Detect base branch
  if git show-ref --verify --quiet refs/heads/main 2>/dev/null; then
    base_branch="main"
  elif git show-ref --verify --quiet refs/heads/master 2>/dev/null; then
    base_branch="master"
  fi

  # Try to extract plan roadmap from CLAUDE.md or spec
  local plans_json="[]"
  # Check CLAUDE.md for a roadmap table
  if [[ -f "${PROJECT_ROOT}/CLAUDE.md" ]]; then
    # Parse markdown table rows like "| 1 | Foundation + Data Layer | Done |"
    local extracted
    extracted=$(grep -E '^\| *[0-9]+ *\|' "${PROJECT_ROOT}/CLAUDE.md" 2>/dev/null | while IFS='|' read -r _ num name status _; do
      num=$(echo "$num" | xargs)
      name=$(echo "$name" | xargs)
      # Convert name to slug: lowercase, spaces to hyphens, strip parens
      local slug
      slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/ *(.*)//; s/ /-/g; s/[^a-z0-9-]//g; s/--*/-/g; s/^-//; s/-$//')
      echo "{\"name\": \"${slug}\", \"description\": \"${name}\"}"
    done | paste -sd',' -)

    if [[ -n "$extracted" ]]; then
      plans_json="[${extracted}]"
    fi
  fi

  # If no plans found from CLAUDE.md, try the spec file
  if [[ "$plans_json" == "[]" && -n "$spec_file" && -f "${PROJECT_ROOT}/${spec_file}" ]]; then
    local extracted
    extracted=$(grep -E '^\| *[0-9]+ *\|' "${PROJECT_ROOT}/${spec_file}" 2>/dev/null | while IFS='|' read -r _ num name _; do
      num=$(echo "$num" | xargs)
      name=$(echo "$name" | xargs)
      local slug
      slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/ *(.*)//; s/ /-/g; s/[^a-z0-9-]//g; s/--*/-/g; s/^-//; s/-$//')
      echo "{\"name\": \"${slug}\", \"description\": \"${name}\"}"
    done | paste -sd',' -)

    if [[ -n "$extracted" ]]; then
      plans_json="[${extracted}]"
    fi
  fi

  # If still empty, create a placeholder
  if [[ "$plans_json" == "[]" ]]; then
    plans_json='[{"name": "plan-1", "description": "Plan 1 — edit plan-loop.json to define your plans"}]'
    warn "Could not auto-detect plans. Edit plan-loop.json to define them."
  fi

  # Write manifest
  cat > "$MANIFEST_FILE" <<EOF
{
  "spec": "${spec_file:-docs/spec.md}",
  "plans_dir": "${plans_dir}",
  "base_branch": "${base_branch}",
  "model": "claude-opus-4-6",
  "max_review_loops": 3,
  "plans": ${plans_json}
}
EOF

  info "Generated $MANIFEST_FILE — review and edit if needed."
  echo ""
  echo "  Generated plan-loop.json:"
  cat "$MANIFEST_FILE"
  echo ""
}

# ─── CLI Flags ───────────────────────────────────────────────────────────────

AUTO_MODE=false
DRY_RUN=false
JUMP_PLAN=""
JUMP_PHASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --auto)              AUTO_MODE=true; shift ;;
    --dry-run)           DRY_RUN=true; shift ;;
    --plan)              JUMP_PLAN="$2"; shift 2 ;;
    --phase)             JUMP_PHASE="$2"; shift 2 ;;
    --max-review-loops)  MAX_REVIEW_LOOPS="$2"; shift 2 ;;
    --config)            MANIFEST_FILE="$2"; shift 2 ;;
    --no-skip-permissions) SKIP_PERMISSIONS=false; shift ;;
    -h|--help)
      sed -n '2,/^###/p' "$0" | head -n -1 | sed 's/^# \?//'
      exit 0 ;;
    *) echo "Unknown flag: $1. Use -h for help."; exit 1 ;;
  esac
done

# ─── Helpers ─────────────────────────────────────────────────────────────────

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
  local level="$1"; shift
  local msg="[$(timestamp)] [$level] $*"
  echo "$msg" | tee -a "${LOG_DIR}/plan-loop.log"
}

info()    { log "INFO" "$@"; }
warn()    { log "WARN" "$@"; }
error()   { log "ERROR" "$@"; }
success() { log "DONE" "$@"; }

die() { error "$@"; exit 1; }

hr() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ─── State Management ────────────────────────────────────────────────────────

init_state() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"
  if [[ ! -f "$STATE_FILE" ]]; then
    cat > "$STATE_FILE" <<'EOF'
{
  "current_plan": 1,
  "current_phase": "base_verify",
  "completed_plans": [],
  "plan_files": {},
  "pr_urls": {},
  "branches": {},
  "review_loops": {}
}
EOF
    info "Initialized state at $STATE_FILE"
    # Auto-detect progress on first run
    detect_progress
  fi
  # Ensure .plan-loop is gitignored
  if ! git check-ignore -q "$STATE_DIR" 2>/dev/null; then
    if ! grep -qF '.plan-loop' "${PROJECT_ROOT}/.gitignore" 2>/dev/null; then
      echo '.plan-loop/' >> "${PROJECT_ROOT}/.gitignore"
      info "Added .plan-loop/ to .gitignore"
    fi
  fi
}

# ─── Progress Detection ─────────────────────────────────────────────────────
#
# On first run, scans git history and plan files to determine which plans
# are already complete, in progress, or not started. Populates state.json
# so the loop starts at the right place.
#
detect_progress() {
  info "Detecting existing progress..."

  local total
  total=$(plan_count)
  local highest_completed=0

  for ((i = 1; i <= total; i++)); do
    local name
    name=$(plan_name "$i")

    # 1. Check for existing plan file
    local plan_file
    plan_file=$(find_plan_file "$i")
    if [[ -n "$plan_file" ]]; then
      state_set ".plan_files[\"${i}\"] = \"${plan_file}\""
      info "  Plan $i: found plan file — $plan_file"
    fi

    # 2. Check for merged branches (plan is complete)
    #    Look for common branch naming patterns
    local merged=false
    local branch_pattern
    for branch_pattern in \
      "feat/${name}" \
      "implement/plan-${i}-${name}" \
      "feature/${name}" \
      "plan-${i}" \
      "plan-${i}-${name}"; do
      if git branch --merged "$BASE_BRANCH" 2>/dev/null | grep -qF "$branch_pattern"; then
        merged=true
        state_set ".branches[\"${i}\"] = \"${branch_pattern}\""
        info "  Plan $i: branch '$branch_pattern' is merged to $BASE_BRANCH — COMPLETE"
        break
      fi
    done

    # 3. Also check if plan's PRs were merged via gh (if gh is available)
    if [[ "$merged" == "false" ]] && command -v gh >/dev/null 2>&1; then
      local pr_url
      pr_url=$(gh pr list --state merged --search "Plan $i" --json url --jq '.[0].url' 2>/dev/null || true)
      if [[ -n "$pr_url" && "$pr_url" != "null" ]]; then
        merged=true
        state_set ".pr_urls[\"${i}\"] = \"${pr_url}\""
        info "  Plan $i: found merged PR — $pr_url — COMPLETE"
      fi
    fi

    if [[ "$merged" == "true" ]]; then
      state_set ".completed_plans += [${i}]"
      highest_completed=$i
    fi

    # 4. Check for in-progress branches (not merged, but exist)
    if [[ "$merged" == "false" ]]; then
      local current_branch
      current_branch=$(git branch --show-current 2>/dev/null || true)
      for branch_pattern in \
        "feat/${name}" \
        "implement/plan-${i}-${name}" \
        "feature/${name}"; do
        # Check local branches
        if git show-ref --verify --quiet "refs/heads/${branch_pattern}" 2>/dev/null; then
          state_set ".branches[\"${i}\"] = \"${branch_pattern}\""
          info "  Plan $i: branch '$branch_pattern' exists (not merged) — IN PROGRESS"

          # Determine which phase we're in based on what exists
          if [[ -z "$plan_file" ]]; then
            # No plan file, need to write it — but base_verify first
            state_set ".current_plan = $i"
            state_set ".current_phase = \"base_verify\""
            info "  → Resuming at Plan $i, phase: base_verify (no plan file)"
          elif [[ "$current_branch" == "$branch_pattern" ]]; then
            # We're on this branch — likely mid-execution or mid-review
            # Check if there are commits beyond base branch
            local commit_count
            commit_count=$(git rev-list --count "${BASE_BRANCH}..${branch_pattern}" 2>/dev/null || echo "0")
            if [[ "$commit_count" -gt 0 ]]; then
              # Has commits — check if PR exists
              local existing_pr
              existing_pr=$(gh pr list --head "$branch_pattern" --json url --jq '.[0].url' 2>/dev/null || true)
              if [[ -n "$existing_pr" && "$existing_pr" != "null" ]]; then
                state_set ".pr_urls[\"${i}\"] = \"${existing_pr}\""
                state_set ".current_plan = $i"
                state_set ".current_phase = \"verify\""
                info "  → Resuming at Plan $i, phase: verify (PR exists: $existing_pr)"
              else
                # Has commits but no PR — verify what's there
                state_set ".current_plan = $i"
                state_set ".current_phase = \"verify\""
                info "  → Resuming at Plan $i, phase: verify ($commit_count commits, no PR yet)"
              fi
            else
              # Branch exists but no commits — start fresh from base_verify
              state_set ".current_plan = $i"
              state_set ".current_phase = \"base_verify\""
              info "  → Resuming at Plan $i, phase: base_verify (branch exists, no commits)"
            fi
          else
            # Not on this branch — start from base_verify
            state_set ".current_plan = $i"
            state_set ".current_phase = \"base_verify\""
            info "  → Resuming at Plan $i, phase: base_verify"
          fi
          return 0
        fi
        # Check remote branches
        if git show-ref --verify --quiet "refs/remotes/origin/${branch_pattern}" 2>/dev/null; then
          state_set ".branches[\"${i}\"] = \"${branch_pattern}\""
          info "  Plan $i: remote branch '$branch_pattern' exists — IN PROGRESS"
          state_set ".current_plan = $i"
          state_set ".current_phase = \"base_verify\""
          info "  → Resuming at Plan $i, phase: base_verify"
          return 0
        fi
      done
    fi
  done

  # If we got here, all detected plans are either complete or not started
  local next_plan=$((highest_completed + 1))
  if [[ "$next_plan" -le "$total" ]]; then
    state_set ".current_plan = $next_plan"
    # If the next plan has a plan file, skip to execute; otherwise write
    local next_plan_file
    next_plan_file=$(find_plan_file "$next_plan")
    if [[ -n "$next_plan_file" ]]; then
      state_set ".current_phase = \"base_verify\""
      info "  → Starting at Plan $next_plan, phase: base_verify (plan file exists)"
    else
      state_set ".current_phase = \"base_verify\""
      info "  → Starting at Plan $next_plan, phase: base_verify"
    fi
  else
    state_set ".current_plan = $((total + 1))"
    info "  → All plans appear complete!"
  fi

  hr
  info "Progress detection complete."
}

state_get() { jq -r "$1" "$STATE_FILE"; }

state_set() {
  local tmp="${STATE_FILE}.tmp"
  jq "$1" "$STATE_FILE" > "$tmp" && mv "$tmp" "$STATE_FILE"
}

# ─── Plan Registry Helpers ───────────────────────────────────────────────────

plan_name()  { echo "${PLAN_REGISTRY[$1-1]}" | cut -d: -f2; }
plan_desc()  { echo "${PLAN_REGISTRY[$1-1]}" | cut -d: -f3; }
plan_count() { echo "${#PLAN_REGISTRY[@]}"; }

find_plan_file() {
  local plan_num="$1"
  local name
  name=$(plan_name "$plan_num")
  # Check state first
  local from_state
  from_state=$(state_get ".plan_files[\"${plan_num}\"] // empty")
  if [[ -n "$from_state" && -f "${PROJECT_ROOT}/${from_state}" ]]; then
    echo "$from_state"
    return
  fi
  # Glob for it
  local found
  found=$(find "${PROJECT_ROOT}/${PLANS_DIR}" -name "*${name}*" -type f 2>/dev/null | head -1)
  if [[ -n "$found" ]]; then
    echo "${found#${PROJECT_ROOT}/}"
  fi
}

# ─── Confirmation Gate ───────────────────────────────────────────────────────

confirm() {
  local msg="$1"
  if [[ "$AUTO_MODE" == "true" ]]; then
    info "AUTO: Skipping gate — $msg"
    return 0
  fi
  echo ""
  echo "  $msg"
  read -rp "  Press Enter to continue (or Ctrl+C to abort)... "
}

# ─── Worktree Helpers ────────────────────────────────────────────────────────
#
# When a branch is checked out in a worktree, `git checkout <branch>` fails.
# These helpers detect worktrees and consolidate changes back to the main tree.
#

# Returns the worktree path for a branch, or empty if not in a worktree
worktree_path_for_branch() {
  local branch="$1"
  git worktree list --porcelain 2>/dev/null | awk -v b="$branch" '
    /^worktree / { wt = substr($0, 10) }
    /^branch /   { if (substr($0, 8) == "refs/heads/" b) print wt }
  '
}

# Ensure a branch is available for checkout in the main working tree.
# If it's in a worktree, remove the worktree first (changes should already
# be committed+pushed by the execute phase).
ensure_branch_in_main_tree() {
  local branch="$1"
  local wt_path
  wt_path=$(worktree_path_for_branch "$branch")

  if [[ -n "$wt_path" && "$wt_path" != "$PROJECT_ROOT" ]]; then
    info "Branch '$branch' is in worktree at $wt_path — removing worktree to consolidate..."

    # Check for uncommitted changes in the worktree
    local wt_status
    wt_status=$(git -C "$wt_path" status --porcelain 2>/dev/null || true)
    if [[ -n "$wt_status" ]]; then
      warn "Worktree has uncommitted changes — committing them first..."
      git -C "$wt_path" add -A
      git -C "$wt_path" commit -m "chore: save uncommitted worktree changes before consolidation" || true
    fi

    # Remove the worktree (branch stays, commits stay)
    git worktree remove "$wt_path" --force 2>/dev/null || {
      warn "Could not remove worktree cleanly, trying prune..."
      rm -rf "$wt_path" 2>/dev/null || true
      git worktree prune 2>/dev/null || true
    }

    success "Worktree removed. Branch '$branch' is now available in main tree."
  fi
}

# ─── Claude Session Runner ──────────────────────────────────────────────────
#
# Spawns a fresh Claude session with --print (non-interactive).
# Each session gets a clean context — no pollution from prior phases.
#

run_claude() {
  local description="$1"
  local prompt="$2"
  local log_file="$3"

  hr
  info "Spawning Claude session: $description"
  info "Log: $log_file"

  if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN — would execute:"
    echo "  $CLAUDE_CMD --print --model $MODEL ..."
    echo "  Prompt (first 300 chars): ${prompt:0:300}..."
    return 0
  fi

  # Write prompt to temp file to avoid shell escaping issues with large prompts
  local prompt_file
  prompt_file=$(mktemp "${STATE_DIR}/prompt-XXXXXX.md")
  echo "$prompt" > "$prompt_file"

  local perm_flags=""
  if [[ "$SKIP_PERMISSIONS" == "true" ]]; then
    perm_flags="--dangerously-skip-permissions"
  fi

  # Use stream-json for structured log + live text output
  # Unset ANTHROPIC_API_KEY so Claude CLI uses subscription auth, not API tokens.
  local json_log="${log_file%.log}.jsonl"
  local stderr_log="${log_file%.log}.stderr"
  local exit_code=0

  # Use pipefail to catch claude exit code through the pipe chain
  set +e
  (
    set -o pipefail
    ANTHROPIC_API_KEY= $CLAUDE_CMD --print \
      --verbose \
      --output-format stream-json \
      --model "$MODEL" \
      $perm_flags \
      "$(cat "$prompt_file")" 2>"$stderr_log" \
      | tee "$json_log" \
      | jq -rj 'if .type == "assistant" then
          (.message.content[]? | select(.type=="text") | .text // empty)
        elif .type == "result" then
          (.result // empty), "\n"
        else empty end' 2>/dev/null \
      | tee "$log_file"
  )
  exit_code=$?
  set -e

  # If claude failed, show stderr
  if [[ $exit_code -ne 0 && -s "$stderr_log" ]]; then
    error "Claude stderr output:"
    cat "$stderr_log" | tee -a "${LOG_DIR}/plan-loop.log"
  fi

  rm -f "$prompt_file"

  if [[ $exit_code -eq 0 ]]; then
    success "Session complete: $description"
  else
    error "Session failed (exit $exit_code): $description"
  fi
  return $exit_code
}

# ─── Test Runner Helper ──────────────────────────────────────────────────────
#
# Runs vitest with both verbose (human-readable) and JSON (machine-readable)
# reporters. The JSON output is saved to a file so spawned Claude sessions can
# read structured failure details without re-running the full suite.
#
# Usage: run_tests <log_file> <json_file>
#   Sets TEST_EXIT_CODE in caller scope.
#
run_tests() {
  local log_file="$1"
  local json_file="$2"

  # Run with dual reporters: verbose to stdout/log, json to file
  set +e
  npm test -- --reporter=verbose --reporter=json --outputFile="$json_file" 2>&1 | tee -a "$log_file"
  TEST_EXIT_CODE=$?
  set -e

  # Generate a human-readable failure summary from the JSON
  if [[ $TEST_EXIT_CODE -ne 0 && -f "$json_file" ]]; then
    local summary_file="${json_file%.json}.failures.txt"
    jq -r '
      .testResults[]?
      | select(.status == "failed")
      | "❌ " + (.name // "unknown"),
        (
          .assertionResults[]?
          | select(.status == "failed")
          | "  FAIL: " + (.fullName // .title // "unknown"),
            "  " + (.failureMessages[0] // "" | split("\n")[0])
        ),
        ""
    ' "$json_file" > "$summary_file" 2>/dev/null || true

    if [[ -s "$summary_file" ]]; then
      info "Failure summary written to: $summary_file"
    fi
  fi
}

# ─── Phase: VERIFY ──────────────────────────────────────────────────────────
#
# Verify CURRENT plan's implementation (tests + build).
# Runs after execute to confirm implementation is sound before review.
# Also used as verify_final after review loops to confirm review fixes.
#
phase_verify() {
  local plan_num="$1"
  local desc
  desc=$(plan_desc "$plan_num")

  hr
  # Determine next phase based on current phase context
  local current_phase
  current_phase=$(state_get '.current_phase')
  local phase_label="VERIFY"
  [[ "$current_phase" == "verify_final" ]] && phase_label="VERIFY_FINAL"

  info "PHASE: $phase_label (Plan $plan_num — $desc)"

  local branch plan_file
  branch=$(state_get ".branches[\"${plan_num}\"] // empty")
  plan_file=$(find_plan_file "$plan_num")

  if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN — would verify plan $plan_num"
    if [[ "$current_phase" == "verify_final" ]]; then
      state_set ".current_phase = \"merge\""
    else
      state_set ".current_phase = \"review\""
    fi
    return 0
  fi

  # Ensure we're on the right branch (handle worktree case)
  if [[ -n "$branch" ]]; then
    ensure_branch_in_main_tree "$branch"
    git checkout "$branch" 2>/dev/null
  fi

  # Sync dependencies (may differ after worktree consolidation or branch switch)
  info "Running npm install..."
  npm install 2>&1 | tail -5

  # Fast path: run tests + build directly in bash — no Claude needed if they pass
  local test_ok=false build_ok=false
  local ts=$(date +%s)
  local verify_log="${LOG_DIR}/plan-${plan_num}-${phase_label,,}-${ts}.log"
  local test_json="${LOG_DIR}/plan-${plan_num}-${phase_label,,}-${ts}.test-results.json"
  local test_failures="${LOG_DIR}/plan-${plan_num}-${phase_label,,}-${ts}.test-results.failures.txt"

  info "Running npm test (bash-first, no Claude)..."
  local TEST_EXIT_CODE=0
  run_tests "$verify_log" "$test_json"
  [[ $TEST_EXIT_CODE -eq 0 ]] && test_ok=true

  info "Running npm run build (bash-first, no Claude)..."
  if npm run build 2>&1 | tee -a "$verify_log"; then
    build_ok=true
  fi

  if [[ "$test_ok" == "true" && "$build_ok" == "true" ]]; then
    success "$phase_label passed — tests + build clean. Skipped Claude session."
  else
    warn "$phase_label found failures — spawning Claude to fix..."
    local fix_log="${LOG_DIR}/plan-${plan_num}-${phase_label,,}-fix-$(date +%s).log"

    # Build failure context from captured test results
    local failure_context=""
    if [[ -s "$test_failures" ]]; then
      failure_context="
## Test Failure Summary (from ${test_failures})

Read this file for the failure summary. It contains the failed test names and first line of each error.

For full structured results (JSON), read: ${test_json}
The JSON has testResults[].assertionResults[] with status, fullName, and failureMessages.

DO NOT re-run the full test suite just to find which tests failed — the information is already in these files."
    fi

    run_claude \
      "Fix $phase_label failures for Plan $plan_num" \
      "Plan $plan_num ($desc) has test/build failures. Fix them.

Tests passed: $test_ok
Build passed: $build_ok
${plan_file:+Plan file: ${plan_file}}
${branch:+Branch: ${branch}}
Base branch: ${BASE_BRANCH}
${failure_context}

## Steps

1. Ensure you are on branch: ${branch:-HEAD}
2. Read the failure summary file to understand what failed: ${test_failures}
   - If you need more detail on a specific failure, read ${test_json} and look at the failureMessages
   - DO NOT re-run the full test suite just to discover failures — that wastes 2+ minutes
3. Fix each failure
4. Re-run \`npm test -- --reporter=verbose --reporter=json --outputFile=${test_json}\` and \`npm run build\` to verify fixes
5. Commit fixes: \`git commit -m 'fix: ${phase_label,,} corrections for plan $plan_num'\`
6. Push to ${branch:-the current branch}" \
      "$fix_log"

    # Re-verify after Claude fix attempt
    info "Re-verifying after fix session..."
    local recheck_ts=$(date +%s)
    local recheck_json="${LOG_DIR}/plan-${plan_num}-${phase_label,,}-recheck-${recheck_ts}.test-results.json"
    local recheck_test=false recheck_build=false
    TEST_EXIT_CODE=0
    run_tests "${verify_log}" "$recheck_json"
    [[ $TEST_EXIT_CODE -eq 0 ]] && recheck_test=true
    if npm run build 2>&1 | tail -5; then recheck_build=true; fi

    if [[ "$recheck_test" != "true" || "$recheck_build" != "true" ]]; then
      warn "Tests/build still failing after Claude fix (test=$recheck_test build=$recheck_build)."
      if [[ "$AUTO_MODE" != "true" ]]; then
        confirm "Fix manually, then press Enter to continue."
      else
        error "AUTO: Proceeding despite failures — next phase may catch remaining issues."
      fi
    else
      success "Fix confirmed — tests + build now pass."
    fi
  fi

  if [[ "$current_phase" == "verify_final" ]]; then
    state_set ".current_phase = \"merge\""
    success "Final verification of Plan $plan_num complete."
  else
    state_set ".current_phase = \"review\""
    success "Verification of Plan $plan_num complete. Moving to review."
  fi
}

# ─── Phase: BASE VERIFY ─────────────────────────────────────────────────────
#
# Verify the base branch (main) is in a clean, working state before starting
# a new plan. Ensures tests pass and build succeeds on the base branch.
# This catches any breakage from previous merges before branching.
#
phase_base_verify() {
  local plan_num="$1"
  local desc
  desc=$(plan_desc "$plan_num")

  hr
  info "PHASE: BASE VERIFY (before Plan $plan_num — $desc)"

  # Ensure we're on the base branch
  if [[ "$DRY_RUN" != "true" ]]; then
    git checkout "$BASE_BRANCH" 2>/dev/null
    git pull origin "$BASE_BRANCH" 2>/dev/null || true
  fi

  if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN — would verify base branch"
    state_set ".current_phase = \"write\""
    return 0
  fi

  # Fast path: run tests + build directly in bash — no Claude needed if they pass
  local test_ok=false build_ok=false
  local ts=$(date +%s)
  local verify_log="${LOG_DIR}/plan-${plan_num}-base-verify-${ts}.log"
  local test_json="${LOG_DIR}/plan-${plan_num}-base-verify-${ts}.test-results.json"
  local test_failures="${LOG_DIR}/plan-${plan_num}-base-verify-${ts}.test-results.failures.txt"

  info "Running npm install..."
  npm install 2>&1 | tail -5 | tee -a "$verify_log"

  info "Running npm test (bash-first, no Claude)..."
  local TEST_EXIT_CODE=0
  run_tests "$verify_log" "$test_json"
  [[ $TEST_EXIT_CODE -eq 0 ]] && test_ok=true

  info "Running npm run build (bash-first, no Claude)..."
  if npm run build 2>&1 | tee -a "$verify_log"; then
    build_ok=true
  fi

  if [[ "$test_ok" == "true" && "$build_ok" == "true" ]]; then
    success "Base branch clean — tests + build pass. Skipped Claude session."
  else
    warn "Base branch has failures — spawning Claude to fix..."
    local fix_log="${LOG_DIR}/plan-${plan_num}-base-fix-$(date +%s).log"

    # Build failure context from captured test results
    local failure_context=""
    if [[ -s "$test_failures" ]]; then
      failure_context="
## Test Failure Summary (from ${test_failures})

Read this file for the failure summary. It contains the failed test names and first line of each error.

For full structured results (JSON), read: ${test_json}
The JSON has testResults[].assertionResults[] with status, fullName, and failureMessages.

DO NOT re-run the full test suite just to find which tests failed — the information is already in these files."
    fi

    run_claude \
      "Fix base branch before Plan $plan_num" \
      "The base branch ($BASE_BRANCH) has test/build failures. Fix them.

Tests passed: $test_ok
Build passed: $build_ok
${failure_context}

## Steps

1. Read the failure summary to understand what failed: ${test_failures}
   - For full error details, read ${test_json} (JSON with failureMessages)
   - DO NOT re-run the full test suite just to discover failures — that wastes 2+ minutes
2. Fix all failures — these are regressions on the base branch
3. Re-run \`npm test -- --reporter=verbose --reporter=json --outputFile=${test_json}\` and \`npm run build\` until both pass
4. Commit fixes: \`git commit -m 'fix: base branch regression before plan $plan_num'\`
5. Push to $BASE_BRANCH" \
      "$fix_log"

    if [[ "$AUTO_MODE" != "true" ]]; then
      confirm "Base branch had issues. Verify fixes, then press Enter."
    fi
  fi

  state_set ".current_phase = \"write\""
  success "Base branch verified. Proceeding to Plan $plan_num."
}

# ─── Phase 2: WRITE PLAN ────────────────────────────────────────────────────
#
# Generate the plan using superpowers:writing-plans.
# The writing-plans skill internally dispatches plan-document-reviewer subagents
# to review each chunk before finalizing.
#
phase_write() {
  local plan_num="$1"
  local name desc
  name=$(plan_name "$plan_num")
  desc=$(plan_desc "$plan_num")

  hr
  info "PHASE 2: WRITE (Plan $plan_num — $desc)"

  # Check if plan already exists — auto-skip to execute
  local existing_plan
  existing_plan=$(find_plan_file "$plan_num")
  if [[ -n "$existing_plan" ]]; then
    info "Plan file already exists: $existing_plan — skipping write phase."
    state_set ".plan_files[\"${plan_num}\"] = \"${existing_plan}\""
    state_set ".current_phase = \"execute\""
    return 0
  fi

  # Build context about previously completed plans
  local completed_context=""
  for ((i = 1; i < plan_num; i++)); do
    local pf
    pf=$(find_plan_file "$i")
    if [[ -n "$pf" ]]; then
      completed_context="${completed_context}
- Plan $i ($(plan_desc "$i")): ${pf} — READ THIS to understand what's already built"
    fi
  done

  local log_file="${LOG_DIR}/plan-${plan_num}-write-$(date +%s).log"
  local plan_date
  plan_date=$(date +%Y-%m-%d)

  run_claude \
    "Write Plan $plan_num ($desc)" \
    "Write an implementation plan for Plan $plan_num of $(plan_count): ${desc}.

## Required Skill

Invoke **superpowers:writing-plans** — follow it exactly. It defines:
- Plan document header format (MUST include the agentic worker instruction)
- Task structure with checkbox syntax (\`- [ ]\`) for tracking
- Bite-sized step granularity (2-5 min per step)
- TDD approach (write failing test → verify fail → implement → verify pass → commit)
- Plan review loop via plan-document-reviewer subagent per chunk

## Context

- **Project spec:** ${SPEC_FILE} — read this to understand Plan $plan_num's scope
- **Plans directory:** ${PLANS_DIR}
- **CLAUDE.md:** Read for project conventions, module boundaries, tech stack
${completed_context:+- **Previously completed:**${completed_context}}

## Plan Requirements

1. Read the spec and identify all features/requirements for Plan $plan_num
2. Read previous plan files to understand what infrastructure exists
3. Explore the current codebase to see what's actually built (don't assume)
4. Write the plan with:
   - Exact file paths for every create/modify operation
   - Complete code snippets (not \"add validation\" — show the code)
   - Exact test commands with expected output
   - Dependency graph: which tasks depend on which
   - Parallelization markers: which tasks can run independently
5. Each task small enough for a single subagent (~15-30 min of work)

## Plan Review

The writing-plans skill requires dispatching **plan-document-reviewer subagents** to review each chunk.
Use the template at writing-plans/plan-document-reviewer-prompt.md.
Fix issues found by the reviewer before finalizing.

## Output

Save the plan to: ${PLANS_DIR}/${plan_date}-${name}.md

The plan header MUST include:
\`\`\`
> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development
> to implement this plan.
\`\`\`

Base branch: ${BASE_BRANCH}" \
    "$log_file"

  # Verify plan file was created
  local new_plan
  new_plan=$(find_plan_file "$plan_num")
  if [[ -z "$new_plan" ]]; then
    die "Plan file not created. Check log: $log_file"
  fi

  info "Plan written: $new_plan"
  confirm "Review the plan at $new_plan. Approve to proceed to implementation?"

  state_set ".plan_files[\"${plan_num}\"] = \"${new_plan}\""
  state_set ".current_phase = \"execute\""
  success "Plan $plan_num written and approved."
}

# ─── Phase 3: EXECUTE ───────────────────────────────────────────────────────
#
# Fresh Claude session implements the plan using subagent-driven-development.
# Each task gets its own implementer subagent + spec reviewer + code reviewer.
# Uses git worktree for isolation.
#
phase_execute() {
  local plan_num="$1"
  local name desc
  name=$(plan_name "$plan_num")
  desc=$(plan_desc "$plan_num")

  hr
  info "PHASE 3: EXECUTE (Plan $plan_num — $desc)"

  local plan_file
  plan_file=$(find_plan_file "$plan_num")
  if [[ -z "$plan_file" ]]; then
    die "No plan file for Plan $plan_num. Run 'write' phase first."
  fi

  local branch="implement/plan-${plan_num}-${name}"
  state_set ".branches[\"${plan_num}\"] = \"${branch}\""

  local log_file="${LOG_DIR}/plan-${plan_num}-execute-$(date +%s).log"

  # Ensure base branch is up to date
  if [[ "$DRY_RUN" != "true" ]]; then
    # Clean up stale worktree if a previous execute left one behind
    ensure_branch_in_main_tree "$branch"
    git checkout "$BASE_BRANCH" 2>/dev/null
    git pull origin "$BASE_BRANCH" 2>/dev/null || true
  fi

  run_claude \
    "Execute Plan $plan_num ($desc)" \
    "Implement the plan at ${plan_file}.
This is Plan ${plan_num} of $(plan_count): ${desc}.

## Required Skills (MUST invoke via Skill tool in this order)

CRITICAL: You MUST invoke each skill below using the Skill tool before taking any action.
Do NOT skip skill invocations or try to implement without them.

### 1. superpowers:using-git-worktrees
Invoke: \`/superpowers:using-git-worktrees\`
Create isolated workspace:
- Branch: ${branch}
- Base: ${BASE_BRANCH}
- Run project setup (npm install) and verify baseline tests pass

### 2. superpowers:subagent-driven-development
Invoke: \`/superpowers:subagent-driven-development\`
This is MANDATORY — you MUST invoke this skill and follow its workflow exactly.
Execute the plan using subagent-driven development. This skill defines the full workflow:

**Per task (sequential — do NOT parallelize implementation subagents):**

a. **Dispatch implementer subagent** (Agent tool, general-purpose):
   - Provide FULL task text from plan — do NOT make subagent read the plan file
   - Include scene-setting context (what was built in prior tasks, where this fits)
   - Use implementer-prompt.md template structure
   - Use model selection: haiku for 1-2 file mechanical tasks, sonnet for multi-file integration, opus for architecture
   - Handle status responses: DONE → review, DONE_WITH_CONCERNS → assess then review, NEEDS_CONTEXT → provide and redispatch, BLOCKED → escalate/redispatch with better model

b. **Dispatch spec reviewer subagent** (Agent tool, general-purpose):
   - Use spec-reviewer-prompt.md template
   - Provide: full task requirements + implementer's report
   - CRITICAL: reviewer must read actual code, not trust the report
   - Must pass (✅) before proceeding to code quality review

c. **Dispatch code quality reviewer subagent** (Agent tool, superpowers:code-reviewer):
   - Use code-reviewer.md template from requesting-code-review/
   - Provide: BASE_SHA, HEAD_SHA, task description, plan reference
   - Check: single responsibility per file, clean interfaces, tests verify behavior
   - Must pass before moving to next task

d. **Review loop:** If either reviewer finds issues:
   - Same implementer subagent fixes (or fresh one with fix instructions)
   - Re-dispatch the failing reviewer
   - Repeat until approved
   - NEVER skip the re-review

e. **Commit** after both reviews approve

### 3. superpowers:verification-before-completion
Invoke: \`/superpowers:verification-before-completion\`
After ALL tasks complete:
- Run \`npm test\` — read FULL output, count failures
- Run \`npm run build\` — verify exit 0
- Do NOT claim success without running commands and reading output
- If anything fails, fix it before proceeding

### 4. superpowers:finishing-a-development-branch
Invoke: \`/superpowers:finishing-a-development-branch\`
- Choose option 2: Push and create PR
- PR title: \"Plan ${plan_num}/$(plan_count): ${desc}\"
- PR body: summary of all tasks implemented, test counts, build status

## Subagent Optimization

Where the plan marks tasks as parallelizable, you may dispatch REVIEWER subagents
in parallel (e.g., spec review of task N while code quality review of task N-1).
But NEVER dispatch multiple IMPLEMENTER subagents in parallel — they conflict.

## Rules

- Every task gets a fresh subagent (no context pollution)
- Do NOT skip reviews — both spec and code quality must pass
- Stop and report if blocked — do not guess
- Follow TDD when the plan specifies it (superpowers:test-driven-development)
- Base branch: ${BASE_BRANCH}" \
    "$log_file"

  # Extract PR URL from output (check both text log and JSON log)
  local pr_url json_log_path="${log_file%.log}.jsonl"
  pr_url=$(grep -oE 'https://github.com/[^ )"]+/pull/[0-9]+' "$log_file" "$json_log_path" 2>/dev/null | grep -oE 'https://[^ )"]+' | tail -1 || true)

  if [[ -n "$pr_url" ]]; then
    info "PR created: $pr_url"
    state_set ".pr_urls[\"${plan_num}\"] = \"${pr_url}\""
  else
    warn "No PR URL detected. Check log: $log_file"
  fi

  state_set ".current_phase = \"verify\""
  success "Plan $plan_num implementation complete."
}

# ─── Phase 4: REVIEW ────────────────────────────────────────────────────────
#
# Code review + fix in a single Claude session per iteration.
# Each session reviews the diff, fixes issues found, and verifies the result.
# This halves the number of Claude sessions vs. separate review + fix phases.
#
phase_review() {
  local plan_num="$1"
  local desc
  desc=$(plan_desc "$plan_num")

  hr
  info "PHASE 4: REVIEW (Plan $plan_num — $desc)"

  local pr_url branch plan_file
  pr_url=$(state_get ".pr_urls[\"${plan_num}\"] // empty")
  branch=$(state_get ".branches[\"${plan_num}\"] // empty")
  plan_file=$(find_plan_file "$plan_num")

  # Ensure we're on the feature branch for review+fix (handle worktree case)
  if [[ -n "$branch" ]]; then
    ensure_branch_in_main_tree "$branch"
    git checkout "$branch" 2>/dev/null
  fi

  local loop_count
  loop_count=$(state_get ".review_loops[\"${plan_num}\"] // 0")

  while [[ "$loop_count" -lt "$MAX_REVIEW_LOOPS" ]]; do
    loop_count=$((loop_count + 1))
    state_set ".review_loops[\"${plan_num}\"] = $loop_count"

    info "Review+fix iteration $loop_count/$MAX_REVIEW_LOOPS"
    local review_log="${LOG_DIR}/plan-${plan_num}-review-${loop_count}-$(date +%s).log"

    # Single combined review+fix session — saves one Claude spawn per iteration
    run_claude \
      "Review+fix Plan $plan_num, iteration $loop_count" \
      "You are performing code review iteration $loop_count/$MAX_REVIEW_LOOPS for Plan $plan_num: ${desc}.
Review the code, fix all issues found, verify fixes, and report.

${pr_url:+PR: ${pr_url}}
${branch:+Branch: ${branch}}
${plan_file:+Plan file: ${plan_file}}
Base branch: ${BASE_BRANCH}

## STEP 1: REVIEW

Invoke **superpowers:requesting-code-review** and use the code-reviewer.md template.

1. Get the git diff range:
   \`\`\`bash
   BASE_SHA=\$(git merge-base ${BASE_BRANCH} ${branch:-HEAD})
   HEAD_SHA=\$(git rev-parse ${branch:-HEAD})
   \`\`\`

2. Fill the code-reviewer template:
   - WHAT_WAS_IMPLEMENTED: Plan $plan_num — ${desc}
   - PLAN_OR_REQUIREMENTS: ${plan_file}
   - BASE_SHA / HEAD_SHA: from above

3. Use **superpowers:dispatching-parallel-agents** to run in parallel:
   - **Agent 1: Plan compliance** — Read plan file, check every task implemented.
   - **Agent 2: Code quality** — Review diff for architecture, security, testing, conventions.
   - **Agent 3: Verification** — Run \`npm test\` and \`npm run build\`, report results.

## STEP 2: FIX (if any issues found)

After review completes, fix all issues directly — do NOT stop and report without fixing.

1. Fix all critical issues first, then important, then suggestions
2. Run \`npm test\` — all must pass
3. Run \`npm run build\` — must exit 0
4. Commit: \`git commit -m 'fix: address review findings for plan $plan_num (round $loop_count)'\`
5. Push to ${branch}

If the review found NO issues and tests+build pass, skip to Step 3.

## STEP 3: REPORT

### Review Summary
- **Assessment:** APPROVE / REQUEST_CHANGES
- **Plan coverage:** N/M tasks implemented
- **Tests:** PASS/FAIL (count)
- **Build:** PASS/FAIL
- **Fixes applied:** list if any

### Issues Found
- Critical: list
- Important: list
- Suggestions: list

### Missing from Plan
- Task N: what's missing" \
      "$review_log"

    # Parse review result
    local review_result
    review_result=$(grep -iE 'Assessment.*:.*\b(APPROVE|REQUEST_CHANGES)\b' "$review_log" 2>/dev/null | tail -1 || echo "")

    if echo "$review_result" | grep -qi "APPROVE"; then
      info "Code review APPROVED on iteration $loop_count/$MAX_REVIEW_LOOPS"
    else
      warn "Code review requested changes (iteration $loop_count/$MAX_REVIEW_LOOPS)"
    fi

    if [[ "$loop_count" -ge "$MAX_REVIEW_LOOPS" ]]; then
      info "All $MAX_REVIEW_LOOPS review iterations complete."
      break
    fi

    if [[ "$AUTO_MODE" != "true" ]]; then
      confirm "Review iteration $loop_count done. Press Enter for next iteration."
    fi
  done

  state_set ".current_phase = \"verify_final\""
  success "All $MAX_REVIEW_LOOPS review iterations for Plan $plan_num complete. Moving to final verification."
}

# ─── Phase: MERGE ───────────────────────────────────────────────────────────
#
# Merge the feature branch to base branch. Strategies in order:
#   1. Local merge --no-ff (most reliable)
#   2. gh pr merge --squash (fallback if local has conflicts)
#   3. Rebase + fast-forward (last automated attempt)
#   4. Spawn Claude session to resolve conflicts (AI-assisted)
# Verifies merge succeeded before advancing to next plan.
#
phase_merge() {
  local plan_num="$1"
  local desc
  desc=$(plan_desc "$plan_num")

  hr
  info "PHASE: MERGE (Plan $plan_num — $desc)"

  local pr_url branch
  pr_url=$(state_get ".pr_urls[\"${plan_num}\"] // empty")
  branch=$(state_get ".branches[\"${plan_num}\"] // empty")

  echo ""
  echo "  Plan $plan_num ($desc) — reviewed and ready to merge."
  [[ -n "$pr_url" ]] && echo "  PR: $pr_url"
  [[ -n "$branch" ]] && echo "  Branch: $branch"
  echo ""

  if [[ "$DRY_RUN" == "true" ]]; then
    info "DRY RUN — would merge $branch into $BASE_BRANCH"
    state_set ".completed_plans += [${plan_num}]"
    state_set ".current_plan = $((plan_num + 1))"
    state_set ".current_phase = \"base_verify\""
    return 0
  fi

  local merge_succeeded=false

  # Consolidate from worktree if needed (before any checkout/merge)
  if [[ -n "$branch" ]]; then
    ensure_branch_in_main_tree "$branch"
  fi

  if [[ "$AUTO_MODE" == "true" ]]; then
    info "AUTO: Merging $branch into $BASE_BRANCH..."

    # Strategy 1: Local merge (most reliable)
    if [[ -n "$branch" ]]; then
      # Ensure we're on base branch with latest
      git checkout "$BASE_BRANCH" 2>/dev/null
      git pull origin "$BASE_BRANCH" 2>/dev/null || true

      # Merge the feature branch
      if git merge --no-ff "$branch" -m "Merge plan $plan_num: $desc"; then
        success "Local merge succeeded: $branch → $BASE_BRANCH"
        merge_succeeded=true

        # Push merged base branch to remote
        if git push origin "$BASE_BRANCH" 2>/dev/null; then
          success "Pushed $BASE_BRANCH to remote."
        else
          warn "Could not push $BASE_BRANCH to remote. Continuing with local merge."
        fi

        # Close PR if one exists
        if [[ -n "$pr_url" ]]; then
          local pr_number
          pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')
          gh pr close "$pr_number" 2>/dev/null || true
          info "Closed PR #$pr_number (merged locally)."
        fi

        # Clean up feature branch
        git branch -d "$branch" 2>/dev/null || true
        git push origin --delete "$branch" 2>/dev/null || true
      else
        warn "Local merge had conflicts. Attempting gh pr merge..."
        git merge --abort 2>/dev/null || true
      fi
    fi

    # Strategy 2: gh pr merge (fallback)
    if [[ "$merge_succeeded" == "false" && -n "$pr_url" ]]; then
      local pr_number
      pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')
      if gh pr merge "$pr_number" --squash --delete-branch 2>&1; then
        success "PR merged via gh."
        merge_succeeded=true
        # Pull the merged changes
        git checkout "$BASE_BRANCH" 2>/dev/null
        git pull origin "$BASE_BRANCH" 2>/dev/null || true
      else
        warn "gh pr merge also failed."
      fi
    fi

    # Strategy 3: Force merge if still not merged (last resort)
    if [[ "$merge_succeeded" == "false" && -n "$branch" ]]; then
      warn "All merge strategies failed. Attempting rebase merge..."
      git checkout "$branch" 2>/dev/null
      if git rebase "$BASE_BRANCH" 2>/dev/null; then
        git checkout "$BASE_BRANCH" 2>/dev/null
        if git merge --ff-only "$branch" 2>/dev/null; then
          success "Rebase + fast-forward merge succeeded."
          merge_succeeded=true
          git push origin "$BASE_BRANCH" 2>/dev/null || true
          git branch -d "$branch" 2>/dev/null || true
        fi
      else
        git rebase --abort 2>/dev/null || true
        git checkout "$BASE_BRANCH" 2>/dev/null || true
      fi
    fi

    # Strategy 4: Spawn Claude session to resolve merge conflicts
    if [[ "$merge_succeeded" == "false" && -n "$branch" ]]; then
      warn "All automated merge strategies failed. Spawning Claude session to resolve conflicts..."

      # Start the merge so Claude can see the conflicts
      git checkout "$BASE_BRANCH" 2>/dev/null
      git pull origin "$BASE_BRANCH" 2>/dev/null || true
      git merge --no-ff "$branch" 2>/dev/null || true  # Will leave conflict markers

      local merge_log="${LOG_DIR}/plan-${plan_num}-merge-resolve-$(date +%s).log"
      local merge_prompt
      merge_prompt="You are resolving merge conflicts for Plan ${plan_num}: ${desc}.

The branch '${branch}' is being merged into '${BASE_BRANCH}' but has conflicts.

## Steps

1. Run \`git status\` to see all conflicted files
2. For each conflicted file:
   - Read the file to understand both sides of the conflict
   - The feature branch (${branch}) changes are the NEW work — generally prefer these
   - The base branch (${BASE_BRANCH}) changes may include work from other plans — preserve those too
   - Resolve by keeping both sides' intent (merge, don't pick one side)
   - Remove all conflict markers (<<<<<<< ======= >>>>>>>)
3. After resolving all conflicts:
   - \`git add\` each resolved file
   - Run \`npm test\` to verify nothing is broken
   - Run \`npm run build\` to verify clean build
   - If tests/build fail, fix the issues
   - \`git commit --no-edit\` to complete the merge
4. Report what you resolved and any concerns"

      if run_claude "Merge conflict resolution (Plan $plan_num)" "$merge_prompt" "$merge_log"; then
        # Verify the merge actually completed
        if ! git rev-parse --verify MERGE_HEAD >/dev/null 2>&1; then
          success "Claude resolved merge conflicts successfully."
          merge_succeeded=true

          # Push merged base branch to remote
          if git push origin "$BASE_BRANCH" 2>/dev/null; then
            success "Pushed $BASE_BRANCH to remote."
          else
            warn "Could not push $BASE_BRANCH to remote. Continuing with local merge."
          fi

          # Clean up feature branch
          git branch -d "$branch" 2>/dev/null || true
          git push origin --delete "$branch" 2>/dev/null || true
        else
          error "Claude session completed but merge is still unresolved."
          git merge --abort 2>/dev/null || true
        fi
      else
        error "Claude merge resolution session failed."
        git merge --abort 2>/dev/null || true
      fi
    fi

    if [[ "$merge_succeeded" == "false" ]]; then
      error "ALL merge strategies failed for Plan $plan_num (including AI-assisted resolution)."
      die "Cannot advance to next plan. Fix merge manually: git checkout $BASE_BRANCH && git merge $branch"
    fi
  else
    # Interactive mode: attempt local merge first, fall back to manual
    if [[ -n "$branch" ]]; then
      info "Attempting local merge of $branch into $BASE_BRANCH..."
      git checkout "$BASE_BRANCH" 2>/dev/null
      git pull origin "$BASE_BRANCH" 2>/dev/null || true

      if git merge --no-ff "$branch" -m "Merge plan $plan_num: $desc"; then
        success "Local merge succeeded: $branch → $BASE_BRANCH"
        merge_succeeded=true
        git push origin "$BASE_BRANCH" 2>/dev/null || true
        git branch -d "$branch" 2>/dev/null || true
        git push origin --delete "$branch" 2>/dev/null || true

        # Close PR if one exists
        if [[ -n "$pr_url" ]]; then
          local pr_number
          pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')
          gh pr close "$pr_number" 2>/dev/null || true
          info "Closed PR #$pr_number (merged locally)."
        fi
      else
        git merge --abort 2>/dev/null || true
        warn "Auto-merge failed (conflicts). Spawning Claude to resolve..."

        # Re-start the merge so Claude can see conflict markers
        git merge --no-ff "$branch" 2>/dev/null || true

        local merge_log="${LOG_DIR}/plan-${plan_num}-merge-resolve-$(date +%s).log"
        local merge_prompt
        merge_prompt="You are resolving merge conflicts for Plan ${plan_num}: ${desc}.

The branch '${branch}' is being merged into '${BASE_BRANCH}' but has conflicts.

## Steps

1. Run \`git status\` to see all conflicted files
2. For each conflicted file:
   - Read the file to understand both sides of the conflict
   - The feature branch (${branch}) changes are the NEW work — generally prefer these
   - The base branch (${BASE_BRANCH}) changes may include work from other plans — preserve those too
   - Resolve by keeping both sides' intent (merge, don't pick one side)
   - Remove all conflict markers (<<<<<<< ======= >>>>>>>)
3. After resolving all conflicts:
   - \`git add\` each resolved file
   - Run \`npm test\` to verify nothing is broken
   - Run \`npm run build\` to verify clean build
   - If tests/build fail, fix the issues
   - \`git commit --no-edit\` to complete the merge
4. Report what you resolved and any concerns"

        if run_claude "Merge conflict resolution (Plan $plan_num)" "$merge_prompt" "$merge_log"; then
          if ! git rev-parse --verify MERGE_HEAD >/dev/null 2>&1; then
            success "Claude resolved merge conflicts successfully."
            merge_succeeded=true
            git push origin "$BASE_BRANCH" 2>/dev/null || true
            git branch -d "$branch" 2>/dev/null || true
            git push origin --delete "$branch" 2>/dev/null || true

            if [[ -n "$pr_url" ]]; then
              local pr_number
              pr_number=$(echo "$pr_url" | grep -oE '[0-9]+$')
              gh pr close "$pr_number" 2>/dev/null || true
              info "Closed PR #$pr_number (merged locally)."
            fi
          else
            error "Claude session completed but merge is still unresolved."
            git merge --abort 2>/dev/null || true
            confirm "Merge manually: git checkout $BASE_BRANCH && git merge $branch"
          fi
        else
          error "Claude merge resolution session failed."
          git merge --abort 2>/dev/null || true
          confirm "Merge manually: git checkout $BASE_BRANCH && git merge $branch"
        fi
      fi
    else
      confirm "Merge the PR / branch, then press Enter to continue to Plan $((plan_num + 1))."
    fi

    # Pull whatever was merged
    git checkout "$BASE_BRANCH" 2>/dev/null
    git pull origin "$BASE_BRANCH" 2>/dev/null || true
  fi

  # Verify merge actually landed — check that base branch contains the feature branch tip.
  # Use merge-base --is-ancestor which correctly handles --no-ff merges (where the branch
  # tip is reachable via the merge commit's second parent).
  git checkout "$BASE_BRANCH" 2>/dev/null || true
  if [[ -n "$branch" ]] && git show-ref --verify --quiet "refs/heads/$branch" 2>/dev/null; then
    if ! git merge-base --is-ancestor "$branch" "$BASE_BRANCH" 2>/dev/null; then
      error "MERGE VERIFICATION FAILED: $branch tip is not an ancestor of $BASE_BRANCH!"
      die "Cannot advance to next plan. Fix merge manually: git checkout $BASE_BRANCH && git merge $branch"
    fi
    # Branch is fully merged — clean up if not already deleted
    git branch -d "$branch" 2>/dev/null || true
    git push origin --delete "$branch" 2>/dev/null || true
  fi

  info "Confirmed: $BASE_BRANCH has all changes from Plan $plan_num."

  # Advance state
  state_set ".completed_plans += [${plan_num}]"
  state_set ".current_plan = $((plan_num + 1))"
  state_set ".current_phase = \"base_verify\""

  success "Plan $plan_num complete. Advancing to Plan $((plan_num + 1))."
}

# ─── Main Loop ───────────────────────────────────────────────────────────────

main() {
  # Preflight
  command -v jq  >/dev/null 2>&1 || die "jq required. Install: brew install jq"
  command -v gh  >/dev/null 2>&1 || die "gh required. Install: brew install gh"
  command -v "$CLAUDE_CMD" >/dev/null 2>&1 || die "claude CLI required."
  [[ -d "$PROJECT_ROOT/.git" ]] || die "Not in a git repository."

  # Ensure directories exist before anything logs
  mkdir -p "$STATE_DIR" "$LOG_DIR"

  # Load project config from plan-loop.json (generates if missing)
  load_manifest

  init_state

  # Apply jump flags
  [[ -n "$JUMP_PLAN" ]]  && state_set ".current_plan = $JUMP_PLAN"  && info "Jumped to Plan $JUMP_PLAN"
  [[ -n "$JUMP_PHASE" ]] && state_set ".current_phase = \"$JUMP_PHASE\"" && info "Jumped to phase $JUMP_PHASE"

  local total
  total=$(plan_count)

  hr
  echo ""
  echo "  PLAN LOOP — Autonomous PRD Implementation"
  echo "  Plans: $total | Mode: $($AUTO_MODE && echo 'AUTONOMOUS' || echo 'INTERACTIVE')"
  echo "  State: $STATE_FILE"
  echo "  Max review loops: $MAX_REVIEW_LOOPS"
  echo ""

  # Show plan status summary
  local completed_list
  completed_list=$(state_get '.completed_plans | length')
  for ((i = 1; i <= total; i++)); do
    local status="pending"
    local pf branch
    pf=$(find_plan_file "$i")
    branch=$(state_get ".branches[\"${i}\"] // empty")

    if state_get ".completed_plans[]" 2>/dev/null | grep -qx "$i"; then
      status="done"
    elif [[ "$i" -eq "$(state_get '.current_plan')" ]]; then
      status="$(state_get '.current_phase')"
    fi

    local status_icon
    case "$status" in
      done)     status_icon="[DONE]" ;;
      pending)  status_icon="[    ]" ;;
      *)        status_icon="[>${status}<]" ;;
    esac

    echo "  $status_icon Plan $i: $(plan_desc "$i")"
    [[ -n "$pf" ]]     && echo "           plan: $pf"
    [[ -n "$branch" ]] && echo "           branch: $branch"
  done
  echo ""
  hr

  while true; do
    local current_plan current_phase
    current_plan=$(state_get '.current_plan')
    current_phase=$(state_get '.current_phase')

    # Done?
    if [[ "$current_plan" -gt "$total" ]]; then
      hr
      echo ""
      echo "  ALL $total PLANS COMPLETE!"
      echo ""
      for ((i = 1; i <= total; i++)); do
        local pf pr
        pf=$(state_get ".plan_files[\"${i}\"] // \"—\"")
        pr=$(state_get ".pr_urls[\"${i}\"] // \"—\"")
        echo "  Plan $i: $(plan_desc "$i")"
        echo "    File: $pf"
        echo "    PR:   $pr"
      done
      echo ""
      hr
      success "PRD implementation complete!"

      # ─── PM Loop: Post-implementation QA ────────────────────────────────
      #
      # After all plans are implemented and merged, run a PM feedback loop
      # that browses the app via Playwright and validates against user stories.
      #
      local pm_done
      pm_done=$(state_get '.pm_loop_done // false')
      if [[ "$pm_done" != "true" ]]; then
        hr
        info "PHASE: PM LOOP — Post-implementation QA via browser testing"
        confirm "All plans merged. Run PM feedback loop against the live app?"

        local pm_log="${LOG_DIR}/pm-loop-$(date +%s).log"

        run_claude \
          "PM Loop — Browser QA" \
          "/pm-loop --port 3005 use the user stories defined here @docs/user-stories.md" \
          "$pm_log"

        state_set '.pm_loop_done = true'
        success "PM Loop complete. Check log: $pm_log"
      fi

      exit 0
    fi

    info ">>> Plan $current_plan/$total ($(plan_desc "$current_plan")) — Phase: $current_phase"

    case "$current_phase" in
      base_verify)   phase_base_verify "$current_plan" ;;
      write)         phase_write       "$current_plan" ;;
      execute)       phase_execute     "$current_plan" ;;
      verify)        phase_verify      "$current_plan" ;;
      review)        phase_review      "$current_plan" ;;
      verify_final)  phase_verify      "$current_plan" ;;
      merge)         phase_merge       "$current_plan" ;;
      *)             die "Unknown phase: $current_phase" ;;
    esac
  done
}

main "$@"
