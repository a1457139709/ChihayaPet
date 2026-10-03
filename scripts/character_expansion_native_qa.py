#!/usr/bin/env python3
"""Opt-in, offscreen AppKit QA. Never makes or substitutes expansion artwork.

Examples:
  python3 scripts/character_expansion_native_qa.py --output /tmp/chihaya-real-qa
  python3 scripts/character_expansion_native_qa.py --self-check --output /tmp/chihaya-capture-check
The requested output and its .run sibling must not already exist.
"""
import argparse
import json
import os
from pathlib import Path
import plistlib
import shlex
import subprocess
import sys
import io
import tarfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pack", type=Path, help="Real CharacterExpansion root; defaults to source checkout resources")
    parser.add_argument("--self-check", action="store_true", help="Six real Standing captures only, no expansion acceptance")
    parser.add_argument("--derived-data", type=Path)
    parser.add_argument("--timeout", type=int, default=3600, help="Per-build/test process timeout in seconds")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    # Historical AppKit renderer is a pinned, disposable art-validation fixture.
    # It is not an active application or a dependency of Electron builds.
    legacy = root / 'build/native-artwork-validation-source'
    if not (legacy / 'scripts/generate_project.py').exists():
        legacy.mkdir(parents=True, exist_ok=True)
        data = subprocess.check_output(['git', 'archive', 'b6a2f10f759de40665b7d7ab664c33a0004ea244'], cwd=root)
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for member in archive.getmembers():
                if legacy not in (legacy / member.name).resolve().parents or member.issym() or member.islnk():
                    raise ValueError('Unsafe native QA fixture path')
            archive.extractall(legacy)
    output = args.output.resolve()
    run = output.with_name(output.name + ".run")
    resources = (root / "ChihayaPet/Resources").resolve()
    if output == resources or resources in output.parents or run == resources or resources in run.parents:
        parser.error("QA artifacts must remain outside app resources")
    if output.exists() or run.exists():
        parser.error("Refusing to overwrite output or .run evidence directory")
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    run.mkdir(parents=True)
    derived = (args.derived_data or root / "build/DerivedData").resolve()
    environment = dict(os.environ)
    environment.setdefault("DEVELOPER_DIR", "/Applications/Xcode.app/Contents/Developer")
    commands = []

    def execute(command, log, timeout=args.timeout):
        commands.append(shlex.join(map(str, command)))
        (run / "commands.json").write_text(json.dumps(commands, indent=2) + "\n")
        with (run / log).open("x") as stream:
            subprocess.run(command, cwd=legacy, env=environment, stdout=stream, stderr=subprocess.STDOUT,
                           timeout=timeout, check=True)

    execute(["xcodebuild", "-version"], "xcode-version.txt", 30)
    execute(["xcrun", "--sdk", "macosx", "--show-sdk-version"], "sdk-version.txt", 30)
    execute([sys.executable, "scripts/generate_project.py"], "generate-project.log", 30)
    method = "testLegacyCaptureMechanicsSelfCheck" if args.self_check else "testRealPackNativeAcceptance"
    selection = "ChihayaPetTests/CharacterExpansionVisualAcceptanceTests/" + method
    execute(["xcodebuild", "-project", "ChihayaPet.xcodeproj", "-scheme", "ChihayaPet", "-configuration", "Debug",
             "-destination", "platform=macOS,arch=arm64", "-derivedDataPath", str(derived),
             "-only-testing:" + selection, "build-for-testing"], "build.log")
    candidates = list((derived / "Build/Products").glob("*.xctestrun"))
    if not candidates:
        raise RuntimeError("Build produced no xctestrun file")
    original = max(candidates, key=lambda p: p.stat().st_mtime_ns)
    with original.open("rb") as stream:
        configuration = plistlib.load(stream)
    copied = run / "native-qa.xctestrun"
    test_command = ["xcodebuild", "test-without-building", "-xctestrun", str(copied),
                    "-destination", "platform=macOS,arch=arm64", "-parallel-testing-enabled", "NO",
                    "-only-testing:" + selection, "-resultBundlePath", str(run / "results.xcresult")]
    qa_environment = {
        "CHIHAYA_TESTING": "1",
        "CHIHAYA_EXPANSION_QA_PROJECT_ROOT": str(root),
        "CHIHAYA_EXPANSION_QA_SELFCHECK_OUTPUT" if args.self_check else "CHIHAYA_EXPANSION_QA_OUTPUT": str(output),
        "CHIHAYA_EXPANSION_QA_COMMAND": shlex.join(test_command),
        "CHIHAYA_EXPANSION_QA_TOOLS": (run / "xcode-version.txt").read_text() + (run / "sdk-version.txt").read_text(),
    }
    if args.pack:
        qa_environment["CHIHAYA_EXPANSION_QA_PACK"] = str(args.pack.resolve())

    # Keep __TESTROOT__ locations valid when copying the config into the evidence directory.
    def relocate(value):
        if isinstance(value, str):
            return value.replace("__TESTROOT__", str(original.parent))
        if isinstance(value, list):
            return [relocate(item) for item in value]
        if isinstance(value, dict):
            result = {key: relocate(item) for key, item in value.items()}
            if "TestBundlePath" in result:
                result.setdefault("EnvironmentVariables", {}).update(qa_environment)
            return result
        return value

    with copied.open("xb") as stream:
        plistlib.dump(relocate(configuration), stream)
    execute(test_command, "test.log")
    report_path = output / ("self-check.json" if args.self_check else "report.json")
    report = json.loads(report_path.read_text())  # Missing/skipped test must not return runner success.
    if args.self_check:
        if len(report["scenes"]) != 6:
            raise RuntimeError("Standing mechanics check did not save six scenes")
    elif not (report["captureComplete"] and report["captureCount"] == 480
              and report["variantCount"] == 80 and report["technicalAcceptance"] == "passed"):
        raise RuntimeError("Real-pack acceptance report is incomplete or failed")
    print(f"{'Standing mechanics only' if args.self_check else 'Real-pack technical acceptance'}: {report_path}")
    print(f"Command, build, XCTest and tool evidence: {run}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Native QA failed: {error}", file=sys.stderr)
        sys.exit(1)
