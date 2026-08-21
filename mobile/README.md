# The phone app

The same game as the website, wrapped by [Capacitor](https://capacitorjs.com)
so it can go in the App Store and Play Store. There is no second copy of the
game: `build.py` assembles `static/` into `www/`, and the native projects load
that.

```
mobile/
  build.py               static/ -> www/, plus the config.js only the app gets
  capacitor.config.json  app id, name, colours
  assets/                icon.png and splash.png (from tools/appicon.py)
  store/listing.md       every field the two stores ask you to fill in
  ios/                   the Xcode project
  android/               the Android Studio project
  www/                   generated - never edit, never committed
```

## Building after a change to the game

```bash
python3 mobile/build.py          # refresh www/ from static/
cd mobile && npx cap sync        # copy www/ into both native projects
```

`cap sync` also re-reads `capacitor.config.json`, so run it after changing that
too. If the icon changes, re-run `python3 tools/appicon.py` and then:

```bash
cd mobile && npx @capacitor/assets generate \
  --iconBackgroundColor '#123024' --iconBackgroundColorDark '#123024' \
  --splashBackgroundColor '#0d1f18' --splashBackgroundColorDark '#0d1f18'
```

## What differs from the website

Two things, both handled by the `config.js` that `build.py` writes and the
website never has:

| | Website | App |
|---|---|---|
| Room API | `/api/...` on the same origin | `window.JUNGLE_API`, the Render server |
| Invite link | `location.origin` | `window.JUNGLE_SITE`, so the link is one a friend can open |

The service worker is left out of the app: every file is already on the device,
and it cannot register from a `capacitor://` page anyway.

Because the app calls the server from a different origin, `server.py` answers
the room API with CORS headers and handles the `OPTIONS` preflight. Without
that, online play works on the website and fails silently in the app.

## Still to do before submitting

- [ ] **Confirm the app id.** `capacitor.config.json` says
      `com.espadared.jungle`. It is permanent once published on either store -
      change it now if you want something else.
- [ ] **Install Xcode** (App Store, ~7-10GB) for the iPhone build.
- [ ] **Install Android Studio** for the Android build.
- [ ] **Screenshots.** Take them from the iOS Simulator and the Android
      emulator once those are installed - that gives exact store resolutions.
      Headless Chrome was tried and hangs on this machine.
- [ ] Apple Developer Program membership, and a Google Play Console account.

## Building for the stores

**iPhone** - open `ios/App/App.xcworkspace` in Xcode, set the team to your
Apple Developer account under Signing & Capabilities, pick "Any iOS Device",
then Product → Archive and follow the Distribute App flow to App Store Connect.

**Android** - open `android/` in Android Studio, then Build → Generate Signed
App Bundle. Create an upload key the first time and **keep it safe**: lose it
and you cannot update the app again. It is git-ignored on purpose - back it up
somewhere that is not this repository.

Google requires roughly 12 testers on a closed track for 14 continuous days
before a personal account can go to production, so start that clock early.

## Server note

Online play talks to the free Render instance, which sleeps after about 15
minutes idle and takes ~50 seconds to wake. Playing the computer is unaffected
because it runs on the device. If online play gets real use, the paid tier
removes the wait.
