#!/usr/bin/env bash
# Smoke test for the ShapeCoach Android app on an emulator (run by the Android app workflow).
# Installs the debug build, opens it the way a user would, and saves screenshots, the screen's
# accessibility tree and a short log to smoke/. The debug build isn't signed with the upload
# key, so Chrome is told to skip the Digital Asset Links check for the site; with the real
# release build Chrome checks /.well-known/assetlinks.json instead.
set -uo pipefail
APK=${1:?debug apk}
OUT=${2:-smoke}
SITE=https://shapecoach-theta.vercel.app
mkdir -p "$OUT"
log() { echo "$*" | tee -a "$OUT/result.txt"; }

shot() { adb exec-out screencap -p > "$OUT/$1.png"; adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/$1.xml" > /dev/null 2>&1; }
# Tap the centre of the first on-screen element whose text or description matches $1.
tap_text() {
  local bounds
  bounds=$(grep -oE "(text|content-desc)=\"[^\"]*$1[^\"]*\"[^>]*bounds=\"\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]\"" "$OUT/$2.xml" | head -1 | grep -oE '\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]')
  [ -z "$bounds" ] && { log "TAP '$1': not found on screen"; return 1; }
  read -r x1 y1 x2 y2 <<< "$(echo "$bounds" | tr -d '[]' | tr ',' ' ')"
  adb shell input tap $(( (x1 + x2) / 2 )) $(( (y1 + y2) / 2 ))
  log "TAP '$1' at $(( (x1 + x2) / 2 )),$(( (y1 + y2) / 2 ))"
}

log "Android: $(adb shell getprop ro.build.version.release) (API $(adb shell getprop ro.build.version.sdk))"
log "Chrome: $(adb shell dumpsys package com.android.chrome | grep -m1 versionName | tr -d ' ')"
adb install -r "$APK" > /dev/null && log "INSTALL: ok" || { log "INSTALL: failed"; exit 1; }

# Chrome reads this file on emulator builds: skip its welcome screens and the asset-link check.
printf '_ --disable-fre --no-default-browser-check --no-first-run --disable-digital-asset-link-verification-for-url=%s\n' "$SITE" > /tmp/chrome-command-line
adb push /tmp/chrome-command-line /data/local/tmp/chrome-command-line > /dev/null
adb shell chmod 644 /data/local/tmp/chrome-command-line
adb shell am set-debug-app --persistent com.android.chrome
adb shell am force-stop com.android.chrome
adb shell settings put global package_verifier_enable 0 > /dev/null 2>&1 || true

adb logcat -c
adb shell monkey -p net.shapecoach.app -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 45
shot 1-launch
log "TOP ACTIVITY: $(adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//')"
grep -q 'ShapeCoach Premium' "$OUT/1-launch.xml" && log "PAYWALL ON LAUNCH: yes" || log "PAYWALL ON LAUNCH: no"
grep -q "$SITE" "$OUT/1-launch.xml" && log "URL BAR VISIBLE: yes" || log "URL BAR VISIBLE: no"

# The free demo from the Premium screen.
if tap_text 'Watch a demo' 1-launch; then
  sleep 25
  shot 2-demo
  grep -qiE 'reps|Squat|Tracking' "$OUT/2-demo.xml" && log "DEMO RUNNING: yes" || log "DEMO RUNNING: unknown"
fi

adb logcat -d | grep -iE 'shapecoach|TrustedWebActivity|TwaLauncher|chromium.*(CONSOLE|Uncaught)|AndroidRuntime|FATAL' | tail -150 > "$OUT/logcat.txt"
grep -q 'FATAL EXCEPTION' "$OUT/logcat.txt" && log "CRASH: yes" || log "CRASH: none"
exit 0
