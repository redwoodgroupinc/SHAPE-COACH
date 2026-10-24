#!/usr/bin/env bash
# Smoke test for the ShapeCoach Android app on an emulator (run by the Android app workflow).
# Installs the debug build, opens it the way a user would, then drives the page through Chrome's
# DevTools (android-smoke-cdp.mjs) and saves screenshots, the page state and a short log to
# smoke/. The debug build isn't signed with the upload key, so Chrome is told to skip the
# Digital Asset Links check for the site; with the real release build Chrome checks
# /.well-known/assetlinks.json instead.
set -uo pipefail
APK=${1:?debug apk}
OUT=${2:-smoke}
SITE=https://shapecoach-theta.vercel.app
mkdir -p "$OUT"
log() { echo "$*" | tee -a "$OUT/result.txt"; }

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
adb shell monkey -p com.shapecoachai -c android.intent.category.LAUNCHER 1 > /dev/null
sleep 30
log "TOP ACTIVITY: $(adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity' | sed 's/^ *//')"
adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/launch-ui.xml" > /dev/null 2>&1
grep -q "$SITE" "$OUT/launch-ui.xml" && log "URL BAR VISIBLE: yes" || log "URL BAR VISIBLE: no"

# Look inside the page through Chrome's DevTools socket.
adb forward tcp:9222 localabstract:chrome_devtools_remote > /dev/null
node "$(dirname "$0")/android-smoke-cdp.mjs" 9222 "$OUT" 2>&1 | tee -a "$OUT/result.txt"

adb logcat -d | grep -iE 'shapecoach|TrustedWebActivity|TwaLauncher|TWAConnectionPool|DelegationService|DigitalGoods|PlayBilling|BillingClient|chromium.*(CONSOLE|Uncaught)|AndroidRuntime|FATAL' | tail -150 > "$OUT/logcat.txt"
grep -q 'FATAL EXCEPTION' "$OUT/logcat.txt" && log "CRASH: yes" || log "CRASH: none"
grep -q 'ShapeCoachPayment: Purchase requested for shapecoach_premium_yearly' "$OUT/logcat.txt" && log "APP PAYMENT SCREEN OPENED: yes ($(grep -m1 -oE 'ShapeCoachPayment: (Google|Launching|Could|No |Purchase flow)[^\r]*' "$OUT/logcat.txt"))" || log "APP PAYMENT SCREEN OPENED: no"
grep -q 'No TWA candidates' "$OUT/logcat.txt" && log "CHROME FOUND THE APP'S DELEGATION SERVICE: no" || log "CHROME FOUND THE APP'S DELEGATION SERVICE: yes"
exit 0
