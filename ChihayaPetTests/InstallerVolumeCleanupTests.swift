import XCTest
@testable import ChihayaPet

final class InstallerVolumeCleanupTests: XCTestCase {
    private let installed = URL(fileURLWithPath: "/Applications/ChihayaPet.app")
    private func info(_ paths: [String]) -> [String: Any] {
        ["images": [["system-entities": paths.map { ["mount-point": $0] }]]]
    }
    func testOnlyMarkedDiskImagesAreSelected() {
        let result = InstallerVolumeCleanup.candidates(info: info(["/Volumes/ChihayaPet", "/Volumes/Other", "/Volumes/Unmarked", "/tmp/mounted"]), appURL: installed, home: URL(fileURLWithPath: "/Users/test")) { path in
            path != "/Volumes/Unmarked" && path != "/Volumes/Other"
        }
        XCTAssertEqual(result, ["/Volumes/ChihayaPet"])
    }
    func testRunningFromImageOrDevelopmentDirectoryNeverEjects() {
        for path in ["/Volumes/ChihayaPet/ChihayaPet.app", "/tmp/build/ChihayaPet.app", "/ApplicationsElsewhere/ChihayaPet.app"] {
            XCTAssertTrue(InstallerVolumeCleanup.candidates(info: info(["/Volumes/ChihayaPet"]), appURL: URL(fileURLWithPath: path), home: URL(fileURLWithPath: "/Users/test"), isInstaller: { _ in true }).isEmpty)
        }
    }
    func testMarkerAndBundleIdentityMustBothMatch() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let contents = root.appendingPathComponent("ChihayaPet.app/Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        let plist = contents.appendingPathComponent("Info.plist")
        func writeIdentity(_ id: String) throws {
            try PropertyListSerialization.data(fromPropertyList: ["CFBundleIdentifier": id], format: .xml, options: 0).write(to: plist)
        }
        try writeIdentity("local.ChihayaPet")
        XCTAssertFalse(InstallerVolumeCleanup.isInstaller(root.path))
        try InstallerVolumeCleanup.markerValue.write(to: root.appendingPathComponent(InstallerVolumeCleanup.markerName), atomically: true, encoding: .utf8)
        XCTAssertTrue(InstallerVolumeCleanup.isInstaller(root.path))
        try writeIdentity("unrelated.application")
        XCTAssertFalse(InstallerVolumeCleanup.isInstaller(root.path))
    }
    func testUserApplicationsAndDuplicateMounts() {
        XCTAssertEqual(InstallerVolumeCleanup.candidates(info: info(["/Volumes/ChihayaPet 1", "/Volumes/ChihayaPet 1"]), appURL: URL(fileURLWithPath: "/Users/test/Applications/ChihayaPet.app"), home: URL(fileURLWithPath: "/Users/test"), isInstaller: { _ in true }), ["/Volumes/ChihayaPet 1"])
        XCTAssertTrue(InstallerVolumeCleanup.candidates(info: [:], appURL: installed, home: URL(fileURLWithPath: "/Users/test"), isInstaller: { _ in true }).isEmpty)
    }
}
