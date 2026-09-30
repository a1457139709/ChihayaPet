import Darwin
import Foundation

private enum ValidatorToolError: Error, CustomStringConvertible {
    case usage(String)
    case invalidLegacyManifest
    case invalidPack(String)

    var description: String {
        switch self {
        case .usage(let message), .invalidPack(let message): return message
        case .invalidLegacyManifest: return "Invalid legacy CharacterSprites manifest"
        }
    }
}

private struct ValidatorOptions {
    let pack: URL
    let legacy: URL
    let projectRoot: URL?

    init(arguments: [String]) throws {
        var values: [String: String] = [:]
        var index = 0
        while index < arguments.count {
            let option = arguments[index]
            guard ["--pack", "--legacy", "--project-root"].contains(option),
                  index + 1 < arguments.count else {
                throw ValidatorToolError.usage(
                    "Usage: CharacterExpansionValidator --pack PATH --legacy PATH [--project-root PATH]"
                )
            }
            guard values[option] == nil else {
                throw ValidatorToolError.usage("Duplicate option: \(option)")
            }
            values[option] = arguments[index + 1]
            index += 2
        }
        guard let pack = values["--pack"], let legacy = values["--legacy"] else {
            throw ValidatorToolError.usage(
                "Usage: CharacterExpansionValidator --pack PATH --legacy PATH [--project-root PATH]"
            )
        }
        self.pack = URL(fileURLWithPath: pack, isDirectory: true)
        self.legacy = URL(fileURLWithPath: legacy, isDirectory: true)
        projectRoot = values["--project-root"].map { URL(fileURLWithPath: $0, isDirectory: true) }
    }
}

private func legacyHashes(at legacyRoot: URL) throws -> [String: String] {
    let data = try Data(contentsOf: legacyRoot.appendingPathComponent("manifest.json"))
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let hashes = object["assetHashes"] as? [String: String] else {
        throw ValidatorToolError.invalidLegacyManifest
    }
    return hashes
}

private func parentDirectories(of path: String) -> Set<String> {
    let components = path.split(separator: "/").map(String.init)
    guard components.count > 1 else { return [] }
    return Set((1..<components.count).map { components.prefix($0).joined(separator: "/") })
}

private func verifyStrictWhitelist(_ library: ExpansionLibrary) throws -> Int {
    let referencedIDs = Set(library.manifest.variants.values.flatMap(\.runtimeAssets))
    let extensionPaths = try Set(referencedIDs.compactMap { id -> String? in
        guard let asset = library.manifest.assets[id] else {
            throw ValidatorToolError.invalidPack("Missing referenced asset: \(id)")
        }
        guard asset.origin == .extensionPack else { return nil }
        let components = asset.path.split(separator: "/", omittingEmptySubsequences: false)
        let filename = components.last.map(String.init) ?? ""
        guard components.count == 2, components[0] == "assets",
              filename.count > 4, filename.hasSuffix(".png") else {
            throw ValidatorToolError.invalidPack(
                "Runtime extension asset must match assets/<filename>.png: \(asset.path)"
            )
        }
        return asset.path
    })
    let expectedFiles = extensionPaths.union(["manifest.json"])
    let expectedDirectories = extensionPaths.reduce(into: Set<String>()) {
        $0.formUnion(parentDirectories(of: $1))
    }
    let keys: Set<URLResourceKey> = [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey]
    let originalRootValues = try library.rootURL.resourceValues(forKeys: keys)
    guard originalRootValues.isDirectory == true, originalRootValues.isSymbolicLink != true else {
        throw ValidatorToolError.invalidPack("CharacterExpansion root must be a real directory")
    }
    let canonicalRoot = library.rootURL.resolvingSymlinksInPath().standardizedFileURL
    var enumerationError: Error?
    guard let enumerator = FileManager.default.enumerator(
        at: canonicalRoot,
        includingPropertiesForKeys: Array(keys),
        options: [],
        errorHandler: { _, error in
            enumerationError = error
            return false
        }
    ) else {
        throw ValidatorToolError.invalidPack("Cannot enumerate CharacterExpansion")
    }
    while let url = enumerator.nextObject() as? URL {
        let values = try url.resourceValues(forKeys: keys)
        let canonicalURL = url.resolvingSymlinksInPath().standardizedFileURL
        guard canonicalURL.path.hasPrefix(canonicalRoot.path + "/") else {
            throw ValidatorToolError.invalidPack("Pack entry escapes CharacterExpansion: \(url.path)")
        }
        let relative = String(canonicalURL.path.dropFirst(canonicalRoot.path.count + 1))
        guard values.isSymbolicLink != true else {
            throw ValidatorToolError.invalidPack("Unexpected pack entry (symlink): \(relative)")
        }
        if values.isDirectory == true {
            guard expectedDirectories.contains(relative) else {
                throw ValidatorToolError.invalidPack("Unexpected pack entry: \(relative)")
            }
        } else if values.isRegularFile == true {
            guard expectedFiles.contains(relative) else {
                throw ValidatorToolError.invalidPack("Unexpected pack entry: \(relative)")
            }
        } else {
            throw ValidatorToolError.invalidPack("Unexpected pack entry: \(relative)")
        }
    }
    if let enumerationError { throw enumerationError }
    return extensionPaths.count
}

private func verifySourceArtworksAreOutsidePack(
    _ library: ExpansionLibrary,
    projectRoot: URL
) throws {
    let canonicalProjectRoot = projectRoot.resolvingSymlinksInPath().standardizedFileURL
    let canonicalPackRoot = library.rootURL.resolvingSymlinksInPath().standardizedFileURL
    for source in library.manifest.sourceArtworks {
        let sourceURL = canonicalProjectRoot.appendingPathComponent(source.projectRelativePath)
            .resolvingSymlinksInPath().standardizedFileURL
        guard sourceURL.path != canonicalPackRoot.path,
              !sourceURL.path.hasPrefix(canonicalPackRoot.path + "/") else {
            throw ValidatorToolError.invalidPack(
                "Source artwork must be outside CharacterExpansion: \(source.projectRelativePath)"
            )
        }
    }
}

@main
private enum CharacterExpansionValidator {
    static func main() {
        do {
            let options = try ValidatorOptions(arguments: Array(CommandLine.arguments.dropFirst()))
            let library = try ExpansionLibrary(
                rootURL: options.pack,
                legacyRootURL: options.legacy,
                allowedLegacyHashes: try legacyHashes(at: options.legacy)
            )
            try library.validate(.complete)
            let extensionAssetCount = try verifyStrictWhitelist(library)
            if let projectRoot = options.projectRoot {
                try library.verifySources(at: projectRoot)
                try verifySourceArtworksAreOutsidePack(library, projectRoot: projectRoot)
            }
            print(
                "Validated CharacterExpansion: \(library.manifest.variants.count) variants, "
                + "\(library.manifest.declaredStates.count) face states, \(extensionAssetCount) extension PNGs."
            )
        } catch {
            FileHandle.standardError.write(Data("CharacterExpansion validation failed: \(error)\n".utf8))
            exit(EXIT_FAILURE)
        }
    }
}
