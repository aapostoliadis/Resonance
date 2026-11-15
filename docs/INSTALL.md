# Resonance 2.5.0

- **Windows x64** · Run `Resonance-Windows-x64-Harmonic-Fold.exe` to open the compact, frameless Resonance deck. Choose a Form from **Visualizations**, then click **Visualizer** beside **Shuffle** to open it full screen with **Settings** already open. **View → Stage** also opens the selected Form. Press **Esc** or click **Exit Stage** to return to the deck. For music playing on your PC, use **Connect audio → Share music audio**. Spotify desktop controls use the Windows media session. This portable build includes its own runtime and has no publisher signature.

- **Build from source** · On Windows x64 with Node.js 24, run `npm ci`, `npm ci --prefix packaging/windows`, and `npm run package:win` from the repository root. The portable build is `dist/windows/Resonance-Windows-x64.exe`. Run `npm run test:windows -- dist/windows/Resonance-Windows-x64.exe` for the packaged smoke test.
- **Local audio** · On Windows, use **File → Open audio file**, press **Ctrl+O**, or drop an audio file onto the deck. You can also open a file from Explorer by dragging it onto the EXE or choosing the EXE with **Open with**. The deck plays the file directly and drives the visualizer. MP3, WAV, FLAC, Ogg Vorbis, Opus, AAC and M4A are supported. If the app cannot decode a selected file, the Windows file picker, desktop drag-and-drop, and Explorer launch can use an installed FFmpeg to open formats such as AIFF and WMA.
- **macOS 13 or later** · Unzip the archive for Apple Silicon or Intel and open `Resonance.app`. Both builds have local ad hoc signatures and are not notarized. System audio capture requires macOS 14.2 or later and the corresponding macOS permission. Microphone input is also available.
- **Android 8 or later** · Open `Resonance-Android.apk` on your device and follow Android’s installation prompt. Choose **Use microphone** to react to music playing through nearby speakers.
- **iPhone, iOS 16.4 or later** · Unzip the Xcode project on a Mac, open `Resonance.xcodeproj`, and select your signing team under **Signing & Capabilities**. Select your iPhone and click **Run**. The project needs to be built and signed before it can be installed.

The mobile apps use microphone input and leave playback controls in the music app. The Edge Apple Music extension applies to the browser version of Resonance.

## Verification

The portable Windows executable launched and served its bundled graphics. Its Spotify status endpoint returned an active media session. The Android APK signature passed verification, and the app opened in an Android emulator. The emulator granted microphone permission but could not start its audio source. Live microphone input still needs a physical device test. The Mac archives passed structural checks and include framework symlinks and executable permissions. macOS launch and iPhone compilation and installation still need an Apple device or Mac build host.
