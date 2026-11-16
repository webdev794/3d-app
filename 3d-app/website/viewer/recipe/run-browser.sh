#!/bin/bash
# Runs one browser job under the PC-wide browser.lock (one test browser at a time, >= 1.5 GB free RAM; coordinator rule).
# (The lock checked and held in both scratchpad folders the agents use.)
# (Set LOCK_DIRS to the folders holding browser.lock when they move: "dir1 dir2".)
# (AGENT-RULES 7: a lock is never stale by age; after writing our stamp wait 2 s and read it again: another stamp won.)
L1=${LOCK_DIRS%% *}/browser.lock; [ -z "$LOCK_DIRS" ] && L1=/d/systemp/claude/d--3d-app/f8ed271f-373f-48f2-8ab8-74454c4c0e9f/scratchpad/browser.lock
L2=/d/systemp/claude/0fe865e4811eb60b/f8ed271f-373f-48f2-8ab8-74454c4c0e9f/scratchpad/browser.lock
STAMP="${AGENT:-RECIPE} $(date '+%Y-%m-%d %H:%M:%S') $$"
while true; do
  busy=0
  for LOCK in $L1 $L2; do [ -f "$LOCK" ] && busy=1; done
  if [ $busy = 1 ]; then echo "waiting: browser.lock held: $(cat $L1 $L2 2>/dev/null | head -1)" >&2; node -e "setTimeout(()=>{},15000)"; continue; fi
  free=$(powershell -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory" | tr -dc '0-9')
  if [ "${free:-0}" -lt 1572864 ]; then echo "waiting: free RAM ${free} KB" >&2; node -e "setTimeout(()=>{},20000)"; continue; fi
  for LOCK in $L1 $L2; do echo "$STAMP" > "$LOCK"; done
  node -e "setTimeout(()=>{},2000)"
  ok=1; for LOCK in $L1 $L2; do [ "$(cat "$LOCK" 2>/dev/null)" = "$STAMP" ] || ok=0; done
  [ $ok = 1 ] && break
done
"$@"; rc=$?
# (Only our own lock is removed: another agent may hold it now.)
for LOCK in $L1 $L2; do [ "$(cat "$LOCK" 2>/dev/null)" = "$STAMP" ] && rm -f "$LOCK"; done
exit $rc
