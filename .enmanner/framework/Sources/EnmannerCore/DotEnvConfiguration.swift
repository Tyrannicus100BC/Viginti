import Foundation

public enum DotEnvConfigurationError: LocalizedError, Equatable {
    case duplicateKey(String)
    case unsupportedValue(String)
    case invalidValue(String)
    case missingRequiredValue(String)

    public var errorDescription: String? {
        switch self {
        case .duplicateKey(let key):
            return "The dotenv file defines \(key) more than once. Remove the duplicate before editing it with Enmanner."
        case .unsupportedValue(let key):
            return "The dotenv value for \(key) uses unsupported multiline or malformed quoting."
        case .invalidValue(let key):
            return "The value for \(key) contains a newline and cannot be stored as one dotenv entry."
        case .missingRequiredValue(let label):
            return "\(label) is required."
        }
    }
}

public struct DotEnvConfigurationStore {
    private let projectURL: URL
    private let configuration: EnmannerManifest.UserConfiguration

    public init(
        projectURL: URL,
        configuration: EnmannerManifest.UserConfiguration
    ) {
        self.projectURL = projectURL
        self.configuration = configuration
    }

    public func load() throws -> [String: String] {
        let document = try loadDocument()
        return try document.values(
            for: Set(configuration.fields.map(\.key))
        )
    }

    public func templateAssignedKeys() throws -> Set<String> {
        guard let template = configuration.template else { return [] }
        let templateURL = try ProjectPaths.resolve(
            template,
            inside: projectURL
        )
        return try DotEnvDocument(
            text: String(contentsOf: templateURL, encoding: .utf8)
        ).assignedKeys()
    }

    @discardableResult
    public func materializeIfNeeded() throws -> Bool {
        let destinationURL = try ProjectPaths.resolve(
            configuration.file,
            inside: projectURL
        )
        guard !FileManager.default.fileExists(atPath: destinationURL.path) else {
            return false
        }
        try write(loadDocument(), to: destinationURL)
        return true
    }

    public func missingRequiredFields() throws
        -> [EnmannerManifest.UserConfiguration.Field] {
        let values = try load()
        return configuration.fields.filter { field in
            field.required &&
                values[field.key, default: ""]
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .isEmpty
        }
    }

    public func save(_ values: [String: String]) throws {
        for field in configuration.fields {
            let value = values[field.key, default: ""]
            if field.required &&
                value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                throw DotEnvConfigurationError.missingRequiredValue(field.label)
            }
            if value.contains("\n") || value.contains("\r") {
                throw DotEnvConfigurationError.invalidValue(field.key)
            }
        }

        var document = try loadDocument()
        try document.update(
            values: values,
            declaredKeys: configuration.fields.map(\.key)
        )

        let destinationURL = try ProjectPaths.resolve(
            configuration.file,
            inside: projectURL
        )
        try write(document, to: destinationURL)
    }

    private func write(
        _ document: DotEnvDocument,
        to destinationURL: URL
    ) throws {
        let fileManager = FileManager.default
        let existingPermissions = (
            try? fileManager.attributesOfItem(atPath: destinationURL.path)[
                .posixPermissions
            ] as? NSNumber
        ) ?? nil
        try Data(document.rendered().utf8).write(
            to: destinationURL,
            options: .atomic
        )
        try fileManager.setAttributes(
            [
                .posixPermissions:
                    existingPermissions?.intValue ?? 0o600
            ],
            ofItemAtPath: destinationURL.path
        )
    }

    private func loadDocument() throws -> DotEnvDocument {
        let fileManager = FileManager.default
        let destinationURL = try ProjectPaths.resolve(
            configuration.file,
            inside: projectURL
        )
        if fileManager.fileExists(atPath: destinationURL.path) {
            return DotEnvDocument(
                text: try String(contentsOf: destinationURL, encoding: .utf8)
            )
        }
        if let template = configuration.template {
            let templateURL = try ProjectPaths.resolve(
                template,
                inside: projectURL
            )
            return DotEnvDocument(
                text: try String(contentsOf: templateURL, encoding: .utf8)
            )
        }
        return DotEnvDocument(text: "")
    }
}

private struct DotEnvDocument {
    private struct Assignment {
        let key: String
        let prefix: String
        let value: String
        let suffix: String
    }

    private var lines: [String]
    private let newline: String
    private var endsWithNewline: Bool

    init(text: String) {
        newline = text.contains("\r\n") ? "\r\n" : "\n"
        endsWithNewline = !text.isEmpty && text.hasSuffix(newline)
        lines = text.isEmpty ? [] : text.components(separatedBy: newline)
        if endsWithNewline {
            lines.removeLast()
        }
    }

    func values(for declaredKeys: Set<String>) throws -> [String: String] {
        var result: [String: String] = [:]
        for line in lines {
            let assignment: Assignment?
            do {
                assignment = try Self.assignment(from: line)
            } catch DotEnvConfigurationError.unsupportedValue(let key)
                where !declaredKeys.contains(key) {
                assignment = nil
            }
            guard let assignment,
                  declaredKeys.contains(assignment.key) else { continue }
            guard result[assignment.key] == nil else {
                throw DotEnvConfigurationError.duplicateKey(assignment.key)
            }
            result[assignment.key] = assignment.value
        }
        return result
    }

    func assignedKeys() throws -> Set<String> {
        var keys: Set<String> = []
        for line in lines {
            guard let assignment = try Self.assignment(from: line) else {
                continue
            }
            keys.insert(assignment.key)
        }
        return keys
    }

    mutating func update(
        values: [String: String],
        declaredKeys: [String]
    ) throws {
        let declaredKeySet = Set(declaredKeys)
        var seen: Set<String> = []
        for index in lines.indices {
            let assignment: Assignment?
            do {
                assignment = try Self.assignment(from: lines[index])
            } catch DotEnvConfigurationError.unsupportedValue(let key)
                where !declaredKeySet.contains(key) {
                assignment = nil
            }
            guard let assignment,
                  declaredKeySet.contains(assignment.key) else { continue }
            guard seen.insert(assignment.key).inserted else {
                throw DotEnvConfigurationError.duplicateKey(assignment.key)
            }
            let value = values[assignment.key, default: ""]
            lines[index] =
                assignment.prefix + Self.encoded(value) + assignment.suffix
        }

        for key in declaredKeys
            where !seen.contains(key) {
            if !lines.isEmpty && lines.last?.isEmpty == false {
                lines.append("")
            }
            lines.append("\(key)=\(Self.encoded(values[key, default: ""]))")
        }
        endsWithNewline = !lines.isEmpty
    }

    func rendered() -> String {
        let body = lines.joined(separator: newline)
        return endsWithNewline ? body + newline : body
    }

    private static func assignment(from line: String) throws -> Assignment? {
        var cursor = line.startIndex
        while cursor < line.endIndex && line[cursor].isWhitespace {
            cursor = line.index(after: cursor)
        }
        if line[cursor...].hasPrefix("export") {
            let afterExport = line.index(cursor, offsetBy: 6)
            guard afterExport < line.endIndex,
                  line[afterExport].isWhitespace else {
                return nil
            }
            cursor = afterExport
            while cursor < line.endIndex && line[cursor].isWhitespace {
                cursor = line.index(after: cursor)
            }
        }
        guard let equals = line[cursor...].firstIndex(of: "=") else {
            return nil
        }
        let key = line[cursor..<equals]
            .trimmingCharacters(in: .whitespaces)
        guard key.range(
            of: #"^[A-Za-z_][A-Za-z0-9_]*$"#,
            options: .regularExpression
        ) != nil else {
            return nil
        }

        var valueStart = line.index(after: equals)
        while valueStart < line.endIndex && line[valueStart].isWhitespace {
            valueStart = line.index(after: valueStart)
        }
        let prefix = String(line[..<valueStart])
        let remainder = line[valueStart...]
        if remainder.isEmpty {
            return Assignment(
                key: key,
                prefix: prefix,
                value: "",
                suffix: ""
            )
        }

        if remainder.first == "#" {
            let suffixStart = line.index(after: equals)
            return Assignment(
                key: key,
                prefix: String(line[...equals]),
                value: "",
                suffix: String(line[suffixStart...])
            )
        }

        if remainder.first == "\"" || remainder.first == "'" {
            let quote = remainder.first!
            var index = remainder.index(after: remainder.startIndex)
            var escaped = false
            while index < remainder.endIndex {
                let character = remainder[index]
                if character == quote && (!escaped || quote == "'") {
                    let contentRange =
                        remainder.index(after: remainder.startIndex)..<index
                    let content = String(remainder[contentRange])
                    let suffixStart = remainder.index(after: index)
                    let suffix = String(remainder[suffixStart...])
                    let trimmedSuffix = suffix.trimmingCharacters(
                        in: .whitespaces
                    )
                    guard trimmedSuffix.isEmpty ||
                            trimmedSuffix.hasPrefix("#") else {
                        throw DotEnvConfigurationError.unsupportedValue(key)
                    }
                    let decodedValue =
                        quote == "\"" ? decodedDoubleQuoted(content) : content
                    guard !decodedValue.contains("\n") &&
                            !decodedValue.contains("\r") else {
                        throw DotEnvConfigurationError.unsupportedValue(key)
                    }
                    return Assignment(
                        key: key,
                        prefix: prefix,
                        value: decodedValue,
                        suffix: suffix
                    )
                }
                if quote == "\"" && character == "\\" && !escaped {
                    escaped = true
                } else {
                    escaped = false
                }
                index = remainder.index(after: index)
            }
            throw DotEnvConfigurationError.unsupportedValue(key)
        }

        var commentStart: String.Index?
        for index in remainder.indices {
            let character = remainder[index]
            if character == "#" {
                commentStart = index
                break
            }
        }
        let valueEnd = commentStart ?? remainder.endIndex
        let rawValue = String(remainder[..<valueEnd])
        let value = rawValue.trimmingCharacters(in: .whitespaces)
        let suffixOffset = rawValue.distance(
            from: rawValue.startIndex,
            to: rawValue.index(
                rawValue.endIndex,
                offsetBy: -(
                    rawValue.count -
                    rawValue.trimmingCharacters(in: .whitespaces).count
                )
            )
        )
        let suffixStart = remainder.index(
            remainder.startIndex,
            offsetBy: suffixOffset
        )
        return Assignment(
            key: key,
            prefix: prefix,
            value: value,
            suffix: String(remainder[suffixStart...])
        )
    }

    private static func decodedDoubleQuoted(_ value: String) -> String {
        var result = ""
        var escaped = false
        for character in value {
            if escaped {
                switch character {
                case "n": result.append("\n")
                case "r": result.append("\r")
                case "t": result.append("\t")
                case "\"": result.append("\"")
                case "\\": result.append("\\")
                default:
                    result.append("\\")
                    result.append(character)
                }
                escaped = false
            } else if character == "\\" {
                escaped = true
            } else {
                result.append(character)
            }
        }
        if escaped {
            result.append("\\")
        }
        return result
    }

    private static func encoded(_ value: String) -> String {
        if value.range(
            of: #"^[A-Za-z0-9_./:@%+,\-]*$"#,
            options: .regularExpression
        ) != nil {
            return value
        }
        let escaped = value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }
}
