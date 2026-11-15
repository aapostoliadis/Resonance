"""Build an ad hoc-signed Resonance app archive from a macOS Electron ZIP."""

import argparse
import json
import os
from pathlib import Path
import plistlib
import shutil
import stat
import subprocess
from tempfile import TemporaryDirectory
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[2]
RUNTIME = (
    "desktop-main.cjs", "desktop-preload.cjs", "server.cjs", "local-audio.cjs",
    "spotify-media.ps1", "spotify-volume.cs", "index.html", "app.js", "player.js",
    "apple-music.js", "reactivity.js", "style.css", "player.css", "graphics.bundle.js",
    "graphics.bundle.js.LEGAL.txt", "CREDITS.md", "licenses/GSAP-LICENSE.txt",
    "licenses/THREE-LICENSE.txt",
)


def extract_electron(archive, bundle):
    with ZipFile(archive) as source:
        for entry in source.infolist():
            if not entry.filename.startswith("Electron.app/"):
                continue
            relative = Path(entry.filename.removeprefix("Electron.app/"))
            if relative.is_absolute() or ".." in relative.parts:
                raise ValueError(f"Invalid Electron ZIP path: {entry.filename}")
            path = bundle / relative
            if entry.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            mode = entry.external_attr >> 16
            if stat.S_ISLNK(mode):
                path.symlink_to(source.read(entry).decode())
            else:
                with source.open(entry) as data, path.open("wb") as target:
                    shutil.copyfileobj(data, target)
                path.chmod(mode & 0o777)


def write_archive(bundle, output):
    with ZipFile(output, "w", ZIP_DEFLATED, compresslevel=3) as archive:
        for path in sorted(bundle.rglob("*")):
            name = path.relative_to(bundle.parent).as_posix()
            if path.is_symlink():
                entry = ZipInfo(name)
                entry.create_system = 3
                entry.external_attr = path.lstat().st_mode << 16
                archive.writestr(entry, os.readlink(path))
            else:
                archive.write(path, name)


def build(electron_zip, output, signer):
    version = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    with TemporaryDirectory(prefix="resonance-macos-") as temp:
        bundle = Path(temp) / "Resonance.app"
        extract_electron(electron_zip, bundle)
        contents = bundle / "Contents"
        plist = contents / "Info.plist"
        info = plistlib.loads(plist.read_bytes())
        info.update(
            CFBundleDisplayName="Resonance",
            CFBundleName="Resonance",
            CFBundleIdentifier="local.resonance.visualizer",
            CFBundleIconFile="Resonance.icns",
            CFBundleShortVersionString=version,
            CFBundleVersion=version,
            NSAudioCaptureUsageDescription="Resonance uses system audio to animate your visualizations.",
            NSMicrophoneUsageDescription="Resonance uses the microphone to animate your visualizations.",
        )
        plist.write_bytes(plistlib.dumps(info))
        for helper in (contents / "Frameworks").glob("Electron Helper*.app"):
            helper_plist = helper / "Contents" / "Info.plist"
            helper_info = plistlib.loads(helper_plist.read_bytes())
            if "CFBundleExecutable" not in helper_info:
                executable = helper / "Contents" / "MacOS" / helper.stem
                if not executable.is_file():
                    raise ValueError(f"Missing Electron helper executable: {executable}")
                helper_info["CFBundleExecutable"] = executable.name
                helper_plist.write_bytes(plistlib.dumps(helper_info))
        resources = contents / "Resources"
        shutil.copyfile(Path(__file__).with_name("Resonance.icns"), resources / "Resonance.icns")
        for name in RUNTIME:
            path = resources / "app" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, path)
        (resources / "app" / "package.json").write_text(
            json.dumps({
                "name": "resonance", "productName": "Resonance",
                "version": version, "main": "desktop-main.cjs",
            }) + "\n",
            encoding="utf-8",
        )
        subprocess.run([signer, "sign", bundle], check=True)
        output.parent.mkdir(parents=True, exist_ok=True)
        write_archive(bundle, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("electron_zip", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--signer", default="rcodesign")
    args = parser.parse_args()
    build(args.electron_zip, args.output, args.signer)
