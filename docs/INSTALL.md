# Resonance 2.5.0

- **Windows x64** · Run `Resonance-Windows-x64.exe` to open the compact, frameless Resonance deck. Choose a Form from **Visualizations**, then click **VIS** beside **Shuffle** to open it full screen with **Settings** already open. **View → Stage** also opens the selected Form. Press **Esc** or click **Exit Stage** to return to the deck. For music playing on your PC, use **Connect audio → Share music audio**. Spotify desktop controls use the Windows media session. This portable build includes its own runtime and has no publisher signature.
- **macOS 13 or later** · Unzip the archive for Apple Silicon or Intel and open `Resonance.app`. Both builds have local ad hoc signatures and are not notarized. System audio capture requires macOS 14.2 or later and the corresponding macOS permission. Microphone input is also available.
- **Android 8 or later** · Open `Resonance-Android.apk` on your device and follow Android’s installation prompt. Choose **Use microphone** to react to music playing through nearby speakers.
- **iPhone, iOS 16.4 or later** · Unzip the Xcode project on a Mac, open `Resonance.xcodeproj`, and select your signing team under **Signing & Capabilities**. Select your iPhone and click **Run**. The project needs to be built and signed before it can be installed.

The mobile apps use microphone input and leave playback controls in the music app. The Edge Apple Music extension applies to the browser version of Resonance.

## Verification

The portable Windows executable launched and served its bundled graphics. Its Spotify status endpoint returned an active media session. The Android APK signature passed verification, and the app opened in an Android emulator. The emulator granted microphone permission but could not start its audio source. Live microphone input still needs a physical device test. The Mac archives passed structural checks and include framework symlinks and executable permissions. macOS launch and iPhone compilation and installation still need an Apple device or Mac build host.
