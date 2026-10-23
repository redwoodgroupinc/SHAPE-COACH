# Launching ShapeCoach on Google Play

ShapeCoach for Android is a **Trusted Web Activity**: a small Android app that opens
`https://shapecoach-theta.vercel.app/app.html?source=android` full screen in Chrome. The camera,
the on-device pose model and the coach's voice run inside it. The download is free; the app opens
on **ShapeCoach Premium**, a US$14.99 monthly subscription sold through Google Play Billing, and
offers a free demo. The website only describes the app and links to Google Play: opening the coach
page in a normal browser redirects to it.

| What | Value |
| --- | --- |
| App name | ShapeCoach |
| Package name | `net.shapecoach.app` (permanent once uploaded) |
| Version | 1.1.3 (version code 5) |
| Subscription product ID | `shapecoach_premium` |
| Base plan | `monthly`, auto-renewing, 1 month, US$14.99 |
| Website (app content) | https://shapecoach-theta.vercel.app |
| Privacy policy | https://shapecoach-theta.vercel.app/privacy.html |
| Terms | https://shapecoach-theta.vercel.app/terms.html |
| Target / min Android | Android 16 (API 36) / Android 6 (API 23) |
| Play Billing | Android Browser Helper billing 1.2.0 (Play Billing Library 8.3) |
| Permissions | Internet, network state, Google Play Billing (the camera is asked for by Chrome) |

## What you need

- **`shapecoach-1.1.3.aab`**: the signed release bundle to upload. It replaces every earlier
  bundle (1.0.0 to 1.1.2, which can't use Google Play Billing); if you already uploaded one of
  those, upload this as a new release. It is built by the *Android app* GitHub workflow (unsigned, on the `android-build`
  branch) and signed with the upload key.
- **`shapecoach-upload.jks`** and its password: the **upload key**. Keep both private and backed
  up (for example in a password manager). Never commit them. You need them for every update; if
  you lose them, Play Console support can reset the upload key, which takes a few days.
- **`store/`**: Play Store icon (512×512), feature graphic (1024×500) and four phone screenshots
  (1080×1920).

Only you can do the steps below: they happen in your Google Play Console, Google Cloud and Vercel
accounts. Roughly, in order:

1. Play Console account and app (an hour, plus identity verification).
2. Upload to internal testing, create the subscription, connect a service account (an hour;
   Google can take up to a day to accept a new service account).
3. Add Google's signing key to Vercel, test a purchase, fill in the app content and listing.
4. **Closed test with at least 12 testers for 14 days in a row** (required for personal accounts
   created after 13 November 2023), then apply for production and wait for review.

## 1. Set up the Play Console account

1. Create a developer account at https://play.google.com/console (US$25 once) and complete
   identity verification.
2. Set up a **payments profile** (Settings → Payments profile) so Google can pay you. Selling
   subscriptions needs it.

## 2. Create the app

Home → **Create app**: name *ShapeCoach*, default language English (United States), **App**,
**Free**. (The download is free; Premium is an in-app subscription. Don't choose "Paid", and note
that a free app can't be changed to paid later.)

## 3. Upload the bundle to internal testing

1. Test and release → Testing → **Internal testing** (just you, available within minutes) →
   Create new release.
2. Keep **Google-generated key** for Play App Signing when asked.
3. Upload `shapecoach-1.1.3.aab`, add release notes ("First release"), save and roll out.
4. Add yourself as a tester and install the app from the opt-in link on your phone.

## 4. Create the subscription

Monetize with Play → Products → **Subscriptions** → Create subscription. (Play Console allows this
only after a bundle with the billing permission is uploaded, which step 3 did.)

1. Product ID **`shapecoach_premium`** (must match exactly), name *ShapeCoach Premium*.
2. Add a base plan: ID **`monthly`**, auto-renewing, billing period **1 month**, price
   **US$14.99**. Let Play set local prices for other countries, then **Activate** it.
3. Optional: add a free-trial offer to the base plan. The app shows whatever Google Play offers.

Use one base plan only: through the Digital Goods API the app sees just the first eligible plan.

## 5. Let the website acknowledge purchases (required)

Google Play **refunds subscriptions that are not acknowledged within 3 days**. ShapeCoach
acknowledges each purchase from its server (`api/verify-purchase.js` on Vercel), which needs a
Google service account:

1. In Google Cloud (https://console.cloud.google.com), create a project (or use one), open
   **APIs & Services → Library**, find **Google Play Android Developer API** and **Enable** it.
2. **IAM & Admin → Service accounts → Create service account** (any name, no roles needed). Open
   it → **Keys → Add key → Create new key → JSON**. A `.json` file downloads; keep it private.
3. In Play Console → **Users and permissions → Invite new users**, enter the service account's
   email (it ends in `iam.gserviceaccount.com`). Under **App permissions** add ShapeCoach and tick
   **View financial data, orders, and cancellation survey responses** and **Manage orders and
   subscriptions**. Invite.
4. In Vercel → project **shapecoach** → **Settings → Environment Variables**, add
   `GOOGLE_PLAY_SERVICE_ACCOUNT` for **Production**, with the whole contents of the JSON file as
   the value. Save, then **Deployments → (latest production deployment) → ⋯ → Redeploy**.

New service accounts can take up to a day before Google accepts them. Until this is set up, the
endpoint answers `503 not_configured` and purchases are **not** acknowledged.

## 6. Add Google's signing key to the website (required)

Play re-signs the app with its own key, so the website must trust that key too. Otherwise the app
opens with a browser address bar and **purchases won't work**.

1. Test and release → **App integrity → App signing**: copy the **App signing key certificate
   SHA-256 fingerprint** (looks like `AB:12:…`, 32 pairs).
2. In Vercel → **Settings → Environment Variables**, add `PLAY_APP_SIGNING_SHA256` for
   **Production** with that fingerprint as the value, save, and **Redeploy** as in step 5.

The site's `/.well-known/assetlinks.json` (served by `api/assetlinks.js`) then lists both keys.
Check it with Google's tool; the fingerprint should be listed:
`https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://shapecoach-theta.vercel.app&relation=delegate_permission/common.handle_all_urls`

Chrome caches this for a while: if the installed app still shows an address bar, clear Chrome's
data (or reinstall the app) after updating.

## 7. Test the subscription

1. Settings → **License testing**: add the Gmail accounts of your testers. Their purchases are free
   test purchases that renew every few minutes.
2. Open the app: the ShapeCoach Premium screen appears straight away, with the price from Google
   Play. Subscribe and check that the camera coach starts. Settings in the app shows *ShapeCoach
   Premium: Active* and a **Manage** link.
3. In Play Console → **Order management**, the test order should show as acknowledged.

## 8. App content (Policy and programs → App content)

- **Privacy policy**: `https://shapecoach-theta.vercel.app/privacy.html`
- **Ads**: No, the app has no ads.
- **App access**: choose *All or some functionality is restricted* and add these instructions:
  "The app opens on the ShapeCoach Premium subscription screen. To review it without
  subscribing, tap *Watch the free demo instead* at the bottom of that screen: the demo runs the
  full coaching experience (exercise recognition, rep counting, form cues and voice) on a
  recorded athlete. The live camera coach and video analysis need the ShapeCoach Premium
  subscription (US$14.99/month) through Google Play Billing. No login is needed."
- **Content rating**: complete the questionnaire (category: all other app types). Answer no to
  violence, sexuality, language, controlled substances, gambling, user interaction/sharing and
  location; yes to digital purchases.
- **Target audience**: 18 and over (the app is not designed for children).
- **Data safety** (review against your own understanding before submitting):
  - Does the app collect or share user data? **Yes**, only this:
    *Financial info → Purchase history*: collected (the purchase token goes to ShapeCoach's server
    to be acknowledged with Google), **not shared**, **processed ephemerally** (not stored),
    **required**, purpose **App functionality**.
  - Camera video is processed on the device and never leaves it, so it is not "collected".
    Settings and set history stay on the device.
  - Data is encrypted in transit: **Yes** (HTTPS). Users can request deletion: not applicable,
    nothing is stored (no accounts).
- **Advertising ID**: No (the app doesn't use it).
- **Health apps**: declare it as an activity and fitness app. ShapeCoach gives general exercise
  guidance; it is not a medical device.
- **Government apps / financial features / news**: not applicable.

## 9. Store listing (Grow users → Store presence → Main store listing)

- **App name**: ShapeCoach
- **Short description** (80 characters max):
  `Your AI personal trainer: counts reps and fixes your form as you train.`
- **Full description**:

  > ShapeCoach turns your phone into a personal trainer that watches every rep.
  >
  > Prop up your phone, press start and move. There's no exercise to pick: ShapeCoach recognises
  > squats, push-ups, lunges, bicep curls and overhead presses on its own, counts every rep, and
  > talks you through your form mid-set, with cues like "Push your knees out" and "Brace your core".
  >
  > • Automatic exercise recognition from your first rep
  > • Rep counting that only counts full range of motion
  > • Real-time form checks: knees caving in, chest dropping, hips sagging, elbows drifting,
  >   swinging and rushing
  > • A coach's voice that corrects you mid-set, so you don't have to look at the screen
  > • Workout summaries with form score, clean reps and time per rep
  > • Private by design: pose tracking runs on your phone and video is never uploaded
  >
  > ShapeCoach Premium unlocks the live camera coach and video analysis for US$14.99 a month
  > (shown in your local currency before you subscribe). The subscription renews monthly until you
  > cancel in Google Play. A demo is free.
  >
  > ShapeCoach gives general fitness guidance and is not medical advice.

- **App icon**: `store/play-icon-512.png`
- **Feature graphic**: `store/feature-graphic-1024x500.png`
- **Phone screenshots**: `store/screenshot-1-home.png` … `store/screenshot-4-premium.png`
- **Category**: Health & Fitness. **Contact email**: your support email. **Website**:
  `https://shapecoach-theta.vercel.app`.

## 10. Closed test, then production

1. Test and release → Testing → **Closed testing** → create a track, add at least **12 testers**
   (an email list or a Google Group), and roll out the same release.
2. Keep at least 12 testers opted in **for 14 days in a row**. They should install and open the
   app. They can use the free demo; license testers can also subscribe for free.
3. After 14 days, Dashboard → **Apply for production** and answer the questions about your test.
4. Once approved, Test and release → **Production** → create a release with the same bundle,
   choose countries, and send it for review. Reviews usually take a few days.

## Updating the app later

Most changes (the coach, the paywall, copy) are website changes: deploy the website and every
installed app gets them immediately. Rebuild the Android bundle only to change the app itself
(name, icon, colours, domain or library versions):

1. Increase `versionCode` (and `versionName`) in `android/app/build.gradle` and
   `android/twa-manifest.json`.
2. Push; the *Android app* workflow publishes the unsigned bundle to the `android-build` branch,
   and its emulator job publishes screenshots and a report to `android-build/smoke/`.
3. Sign it: `scripts/sign-android.sh shapecoach-unsigned.aab shapecoach-upload.jks shapecoach-1.1.4.aab`.
4. Upload it as a new release.

### Moving to your own domain

If you buy a domain such as `shapecoach.net`, connect it in Vercel (it serves the same
`/.well-known/assetlinks.json`), change `hostName` in `android/app/build.gradle` (and `host` in
`android/twa-manifest.json`), and publish an app update.
