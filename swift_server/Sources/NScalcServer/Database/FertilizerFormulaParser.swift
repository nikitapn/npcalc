import Foundation

enum FertilizerValidationError: LocalizedError {
    case invalidFormula(String)

    var errorDescription: String? {
        switch self {
        case .invalidFormula(let message):
            return message
        }
    }
}

struct FertilizerParseResult {
    static let targetElementNames = ["NO3", "NH4", "P", "K", "Ca", "Mg", "S", "Cl", "Fe", "Zn", "B", "Mn", "Cu", "Mo"]

    var elements: [Double]
    var bottle: Int64
    var fertilizerType: Int64
    var density: Double
    var cost: Double

    init(
        elements: [Double] = Array(repeating: 0, count: targetElementNames.count),
        bottle: Int64 = 0,
        fertilizerType: Int64 = 0,
        density: Double = 0,
        cost: Double = 1
    ) {
        self.elements = elements
        self.bottle = bottle
        self.fertilizerType = fertilizerType
        self.density = density
        self.cost = cost
    }
}

enum FertilizerFormulaParser {
    static func parse(script: String) throws -> FertilizerParseResult {
        do {
            return try ScriptParser(text: script).parse()
        } catch let error as ParserError {
            throw FertilizerValidationError.invalidFormula(error.errorDescription ?? "invalid fertilizer formula")
        }
    }
}

private struct ParsedFormula {
    var elements: [String: Double]
    var nh2Count: Double
    var nh4Count: Double
    var no3Count: Double
}

private enum FormulaNode {
    case atom(String, Int)
    case group([FormulaNode], Int)
}

private struct Molecule {
    var coefficient: Double
    var nodes: [FormulaNode]
}

private enum ParserError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message):
            return message
        }
    }
}

private final class ScriptParser {
    private static let directlyAssignments: [String: Int] = [
        "N-NO3": 0,
        "N-NH4": 1,
        "P": 2,
        "K": 3,
        "Ca": 4,
        "Mg": 5,
        "S": 6,
        "Cl": 7,
        "Fe": 8,
        "Zn": 9,
        "B": 10,
        "Mn": 11,
        "Cu": 12,
        "Mo": 13,
    ]

    private static let formulaElementToTargetIndex: [String: Int] = [
        "P": 2,
        "K": 3,
        "Ca": 4,
        "Mg": 5,
        "S": 6,
        "Cl": 7,
        "Fe": 8,
        "Zn": 9,
        "B": 10,
        "Mn": 11,
        "Cu": 12,
        "Mo": 13,
    ]

    private let text: String

    init(text: String) {
        self.text = text
    }

    func parse() throws -> FertilizerParseResult {
        var result = FertilizerParseResult()
        var bottleWasAssigned = false
        var costWasAssigned = false
        var typeWasAssigned = false

        for statement in splitStatements(text) {
            if statement.isEmpty {
                continue
            }

            if let formulaBody = consumeKeywordPrefix("formula", in: statement) {
                let parsedFormula = try FormulaStatementParser(text: formulaBody).parse()
                try applyFormula(parsedFormula, to: &result.elements)
                continue
            }

            guard let assignmentRange = statement.range(of: ":=") else {
                throw ParserError.message("invalid statement: \(statement)")
            }

            let lhs = statement[..<assignmentRange.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
            let rhs = statement[assignmentRange.upperBound...].trimmingCharacters(in: .whitespacesAndNewlines)

            switch lhs {
            case "solution":
                if typeWasAssigned {
                    throw ParserError.message("fertilizer type redefinition")
                }
                result.fertilizerType = 2
                result.density = try ExpressionParser(text: String(rhs)).parse()
                typeWasAssigned = true
            case "density":
                if typeWasAssigned {
                    throw ParserError.message("fertilizer type redefinition")
                }
                result.fertilizerType = 1
                result.density = try ExpressionParser(text: String(rhs)).parse()
                typeWasAssigned = true
            case "bottle":
                if bottleWasAssigned {
                    throw ParserError.message("bottle redefinition")
                }
                result.bottle = try parseBottle(String(rhs))
                bottleWasAssigned = true
            case "cost":
                if costWasAssigned {
                    throw ParserError.message("cost redefinition")
                }
                result.cost = try ExpressionParser(text: String(rhs)).parse()
                costWasAssigned = true
            default:
                guard let index = Self.directlyAssignments[String(lhs)] else {
                    throw ParserError.message("unknown assignment target: \(lhs)")
                }
                let value = try ExpressionParser(text: String(rhs)).parse()
                try setDirectly(index: index, percent: value, elements: &result.elements)
            }
        }

        return result
    }

    private func applyFormula(_ formula: ParsedFormula, to elements: inout [Double]) throws {
        let totalMass = formula.elements.values.reduce(0, +)
        guard totalMass > 0 else {
            throw ParserError.message("formula mass must be greater than zero")
        }

        if let nitrogenMass = formula.elements["N"] {
            let nSum = formula.nh2Count + formula.nh4Count + formula.no3Count
            if nSum > 0 {
                let nitrogenPercent = nitrogenMass / totalMass * 100
                let no3Percent = formula.no3Count / nSum * nitrogenPercent
                let nh4Percent = formula.nh4Count / nSum * nitrogenPercent
                try setNitrogen(no3Percent: no3Percent, nh4Percent: nh4Percent, elements: &elements)
            }
        }

        for (symbol, mass) in formula.elements {
            guard let index = Self.formulaElementToTargetIndex[symbol] else {
                continue
            }
            let percent = mass / totalMass * 100
            if elements[index] != 0, percent != 0 {
                throw ParserError.message("element redefinition")
            }
            elements[index] = percent
        }
    }

    private func setDirectly(index: Int, percent: Double, elements: inout [Double]) throws {
        if index < 2 {
            try setNitrogen(
                no3Percent: index == 0 ? percent : 0,
                nh4Percent: index == 1 ? percent : 0,
                elements: &elements
            )
            return
        }

        if elements[index] != 0, percent != 0 {
            throw ParserError.message("element redefinition")
        }
        elements[index] = percent
    }

    private func setNitrogen(no3Percent: Double, nh4Percent: Double, elements: inout [Double]) throws {
        if elements[0] != 0, no3Percent != 0 {
            throw ParserError.message("N-NO3 redefinition")
        }
        if elements[1] != 0, nh4Percent != 0 {
            throw ParserError.message("N-NH4 redefinition")
        }
        elements[0] = no3Percent
        elements[1] = nh4Percent
    }

    private func parseBottle(_ text: String) throws -> Int64 {
        switch text {
        case "A":
            return 0
        case "B":
            return 1
        case "C":
            return 2
        default:
            throw ParserError.message("invalid bottle value: \(text)")
        }
    }

    private func splitStatements(_ script: String) -> [String] {
        let characters = Array(script)
        var statements: [String] = []
        var current = ""
        var index = 0

        while index < characters.count {
            let character = characters[index]
            if character == "/", index + 1 < characters.count, characters[index + 1] == "/" {
                index += 2
                while index < characters.count, characters[index] != "\n" {
                    index += 1
                }
                continue
            }

            if character == ";" {
                let trimmed = current.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    statements.append(trimmed)
                }
                current.removeAll(keepingCapacity: true)
                index += 1
                continue
            }

            current.append(character)
            index += 1
        }

        let trailing = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trailing.isEmpty {
            statements.append(trailing)
        }

        return statements
    }

    private func consumeKeywordPrefix(_ keyword: String, in statement: String) -> String? {
        guard statement.hasPrefix(keyword) else {
            return nil
        }
        let suffixStart = statement.index(statement.startIndex, offsetBy: keyword.count)
        if suffixStart == statement.endIndex {
            return ""
        }
        let next = statement[suffixStart]
        guard next.isWhitespace else {
            return nil
        }
        return String(statement[suffixStart...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

private final class FormulaStatementParser {
    private let text: String
    private var parser: ChemicalFormulaParser

    init(text: String) {
        self.text = text
        self.parser = ChemicalFormulaParser(text: text)
    }

    func parse() throws -> ParsedFormula {
        let formula = try parser.parseFormula()
        parser.skipWhitespace()

        var purity: Double? = nil
        if parser.consumeKeyword("purity") {
            purity = try ExpressionParser(text: parser.remainingText()).parse()
            parser = ChemicalFormulaParser(text: "")
        }

        if !parser.remainingText().trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw ParserError.message("unexpected trailing formula input: \(text)")
        }

        if let purity {
            if purity < 0 || purity > 100 {
                throw ParserError.message("invalid purity value: \(purity)")
            }
            let multiplier = purity * 0.01
            return ParsedFormula(
                elements: formula.elements.mapValues { $0 * multiplier },
                nh2Count: formula.nh2Count * multiplier,
                nh4Count: formula.nh4Count * multiplier,
                no3Count: formula.no3Count * multiplier
            )
        }

        return formula
    }
}

private final class ChemicalFormulaParser {
    private static let atomicMass: [String: Double] = [
        "H": 1.0079407540557772,
        "B": 10.811028046410001,
        "C": 12.010735896735248,
        "N": 14.006703211445798,
        "O": 15.999404924318277,
        "Na": 22.989769282,
        "Mg": 24.3050516198371,
        "Al": 26.98153853,
        "Si": 28.085498705705955,
        "P": 30.97376199842,
        "S": 32.06478740612706,
        "Cl": 35.452937582608,
        "K": 39.098300910086,
        "Ca": 40.078022511017735,
        "Mn": 54.93804391,
        "Fe": 55.845144433865904,
        "Co": 58.93319429,
        "Ni": 58.69334710994765,
        "Cu": 63.54603994583,
        "Zn": 65.37778252952499,
        "Mo": 95.959788541188,
        "Ag": 107.868149634557,
    ]

    private static let supportedSymbols = atomicMass.keys.sorted { lhs, rhs in
        if lhs.count != rhs.count {
            return lhs.count > rhs.count
        }
        return lhs < rhs
    }

    private let text: String
    private let characters: [Character]
    private var index = 0

    init(text: String) {
        self.text = text
        self.characters = Array(text)
    }

    func parseFormula() throws -> ParsedFormula {
        skipWhitespace()
        var molecules: [Molecule] = [try parseMolecule()]

        while true {
            skipWhitespace()
            guard let character = currentCharacter else {
                break
            }
            if character == "*" || character == "•" {
                index += 1
                molecules.append(try parseMolecule())
                continue
            }
            break
        }

        return try evaluate(molecules: molecules)
    }

    func skipWhitespace() {
        while let character = currentCharacter, character.isWhitespace {
            index += 1
        }
    }

    func consumeKeyword(_ keyword: String) -> Bool {
        skipWhitespace()
        guard matches(keyword) else {
            return false
        }

        let end = index + keyword.count
        if end < characters.count, !characters[end].isWhitespace {
            return false
        }

        index = end
        return true
    }

    func remainingText() -> String {
        guard index < characters.count else {
            return ""
        }
        return String(characters[index...]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var currentCharacter: Character? {
        guard index < characters.count else {
            return nil
        }
        return characters[index]
    }

    private func parseMolecule() throws -> Molecule {
        skipWhitespace()
        let coefficient = parseOptionalNumber() ?? 1
        let nodes = try parseCompound(stopOnRightParen: false)
        return Molecule(coefficient: coefficient, nodes: nodes)
    }

    private func parseCompound(stopOnRightParen: Bool) throws -> [FormulaNode] {
        skipWhitespace()
        var nodes: [FormulaNode] = []

        while let character = currentCharacter {
            if stopOnRightParen, character == ")" {
                break
            }
            if character == "*" || character == "•" {
                break
            }

            if character == "(" {
                index += 1
                let groupNodes = try parseCompound(stopOnRightParen: true)
                skipWhitespace()
                guard currentCharacter == ")" else {
                    throw ParserError.message("missing closing ')' in formula")
                }
                index += 1
                let count = parseOptionalInteger() ?? 1
                nodes.append(.group(groupNodes, count))
                skipWhitespace()
                continue
            }

            guard let symbol = parseElementSymbol() else {
                break
            }
            let count = parseOptionalInteger() ?? 1
            nodes.append(.atom(symbol, count))
            skipWhitespace()
        }

        if nodes.isEmpty {
            throw ParserError.message("expected formula term")
        }

        return nodes
    }

    private func parseElementSymbol() -> String? {
        for symbol in Self.supportedSymbols {
            if matches(symbol) {
                index += symbol.count
                return symbol
            }
        }
        return nil
    }

    private func parseOptionalInteger() -> Int? {
        skipWhitespace()
        let start = index
        while let character = currentCharacter, character.isNumber {
            index += 1
        }
        guard index > start else {
            return nil
        }
        return Int(String(characters[start..<index]))
    }

    private func parseOptionalNumber() -> Double? {
        skipWhitespace()
        let start = index
        var sawDigits = false

        while let character = currentCharacter, character.isNumber {
            sawDigits = true
            index += 1
        }

        if currentCharacter == "." {
            index += 1
            while let character = currentCharacter, character.isNumber {
                sawDigits = true
                index += 1
            }
        }

        guard sawDigits else {
            index = start
            return nil
        }

        return Double(String(characters[start..<index]))
    }

    private func evaluate(molecules: [Molecule]) throws -> ParsedFormula {
        var elements: [String: Double] = [:]
        var nh2Count = 0.0
        var nh4Count = 0.0
        var no3Count = 0.0

        for molecule in molecules {
            let evaluated = try evaluate(nodes: molecule.nodes)
            for (symbol, mass) in evaluated.elements {
                elements[symbol, default: 0] += mass * molecule.coefficient
            }
            nh2Count += evaluated.nh2Count * molecule.coefficient
            nh4Count += evaluated.nh4Count * molecule.coefficient
            no3Count += evaluated.no3Count * molecule.coefficient
        }

        return ParsedFormula(elements: elements, nh2Count: nh2Count, nh4Count: nh4Count, no3Count: no3Count)
    }

    private func evaluate(nodes: [FormulaNode]) throws -> ParsedFormula {
        var elements: [String: Double] = [:]
        var nh2Count = 0.0
        var nh4Count = 0.0
        var no3Count = 0.0

        for (offset, node) in nodes.enumerated() {
            switch node {
            case .group(let groupNodes, let count):
                let nested = try evaluate(nodes: groupNodes)
                let multiplier = Double(count)
                for (symbol, mass) in nested.elements {
                    elements[symbol, default: 0] += mass * multiplier
                }
                nh2Count += nested.nh2Count * multiplier
                nh4Count += nested.nh4Count * multiplier
                no3Count += nested.no3Count * multiplier
            case .atom(let symbol, let count):
                guard let atomicMass = Self.atomicMass[symbol] else {
                    throw ParserError.message("unsupported element symbol: \(symbol)")
                }
                elements[symbol, default: 0] += atomicMass * Double(count)

                guard symbol == "N", offset + 1 < nodes.count else {
                    continue
                }
                guard case .atom(let nextSymbol, let nextCount) = nodes[offset + 1] else {
                    continue
                }

                if nextSymbol == "H", nextCount == 2 {
                    nh2Count += Double(count)
                }
                if nextSymbol == "H", nextCount == 4 {
                    nh4Count += Double(count)
                }
                if nextSymbol == "O", nextCount == 3 {
                    no3Count += Double(count)
                }
            }
        }

        return ParsedFormula(elements: elements, nh2Count: nh2Count, nh4Count: nh4Count, no3Count: no3Count)
    }

    private func matches(_ string: String) -> Bool {
        let chars = Array(string)
        guard index + chars.count <= characters.count else {
            return false
        }
        for offset in chars.indices {
            if characters[index + offset] != chars[offset] {
                return false
            }
        }
        return true
    }
}

private final class ExpressionParser {
    private let characters: [Character]
    private var index = 0

    init(text: String) {
        self.characters = Array(text)
    }

    func parse() throws -> Double {
        let value = try parseExpression(minPrecedence: 0)
        skipWhitespace()
        if index != characters.count {
            throw ParserError.message("unexpected trailing expression input")
        }
        return value
    }

    private func parseExpression(minPrecedence: Int) throws -> Double {
        var lhs = try parsePrefix()

        while true {
            skipWhitespace()
            guard let op = currentCharacter, let precedence = precedence(of: op), precedence >= minPrecedence else {
                break
            }

            index += 1
            let nextMinPrecedence = op == "^" ? precedence : precedence + 1
            let rhs = try parseExpression(minPrecedence: nextMinPrecedence)
            lhs = apply(op, lhs, rhs)
        }

        return lhs
    }

    private func parsePrefix() throws -> Double {
        skipWhitespace()
        guard let character = currentCharacter else {
            throw ParserError.message("unexpected end of expression")
        }

        if character == "-" {
            index += 1
            return -(try parsePrefix())
        }

        if character == "(" {
            index += 1
            let value = try parseExpression(minPrecedence: 0)
            skipWhitespace()
            guard currentCharacter == ")" else {
                throw ParserError.message("missing closing ')' in expression")
            }
            index += 1
            return value
        }

        if let number = parseNumber() {
            return number
        }

        if consumeIdentifier("PI") {
            return Double.pi
        }
        if consumeIdentifier("E") {
            return M_E
        }

        throw ParserError.message("unexpected token in expression")
    }

    private var currentCharacter: Character? {
        guard index < characters.count else {
            return nil
        }
        return characters[index]
    }

    private func skipWhitespace() {
        while let character = currentCharacter, character.isWhitespace {
            index += 1
        }
    }

    private func parseNumber() -> Double? {
        skipWhitespace()
        let start = index
        var sawDigits = false

        while let character = currentCharacter, character.isNumber {
            sawDigits = true
            index += 1
        }

        if currentCharacter == "." {
            index += 1
            while let character = currentCharacter, character.isNumber {
                sawDigits = true
                index += 1
            }
        }

        guard sawDigits else {
            index = start
            return nil
        }

        return Double(String(characters[start..<index]))
    }

    private func consumeIdentifier(_ identifier: String) -> Bool {
        let chars = Array(identifier)
        guard index + chars.count <= characters.count else {
            return false
        }
        for offset in chars.indices {
            if characters[index + offset] != chars[offset] {
                return false
            }
        }
        let end = index + chars.count
        if end < characters.count, characters[end].isLetter {
            return false
        }
        index = end
        return true
    }

    private func precedence(of character: Character) -> Int? {
        switch character {
        case "+", "-":
            return 1
        case "*", "/":
            return 2
        case "^":
            return 3
        default:
            return nil
        }
    }

    private func apply(_ op: Character, _ lhs: Double, _ rhs: Double) -> Double {
        switch op {
        case "+":
            return lhs + rhs
        case "-":
            return lhs - rhs
        case "*":
            return lhs * rhs
        case "/":
            return lhs / rhs
        case "^":
            return Foundation.pow(lhs, rhs)
        default:
            return lhs
        }
    }
}