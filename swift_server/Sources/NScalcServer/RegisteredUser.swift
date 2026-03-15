import NScalc

final class RegisteredUserImpl: RegisteredUserServant, @unchecked Sendable {
  private let user: UserRecord
  private let solutionService: SolutionService
  private let fertilizerService: FertilizerService
  private let calculationService: CalculationService

  init(
    user: UserRecord,
    solutionService: SolutionService,
    fertilizerService: FertilizerService,
    calculationService: CalculationService
  ) {
    self.user = user
    self.solutionService = solutionService
    self.fertilizerService = fertilizerService
    self.calculationService = calculationService
    super.init()
  }

  private var userId: Int64 {
    user.id ?? 0
  }

  override func getMyCalculations() -> [Calculation] {
    do {
      return try calculationService.getAll(userId: userId).map { $0.toRpc() }
    } catch {
      print("[RegisteredUser] getMyCalculations failed: \(error)")
      return []
    }
  }

  override func addSolution(name: String, elements: [Double]) -> UInt32 {
    guard elements.count == 14 else {
      print("[RegisteredUser] addSolution rejected invalid elements count: \(elements.count)")
      return 0
    }
    do {
      let solution = try solutionService.addSolution(userId: userId, name: name, elements: elements)
      return UInt32(solution.id ?? 0)
    } catch {
      print("[RegisteredUser] addSolution failed: \(error)")
      return 0
    }
  }

  override func setSolutionName(id: UInt32, name: String) throws {
    try solutionService.updateName(id: Int64(id), userId: userId, name: name)
  }

  override func setSolutionElements(id: UInt32, name: [SolutionElement]) throws {
    let values = name.map { (index: Int($0.index), value: $0.value) }
    try solutionService.updateElements(id: Int64(id), userId: userId, indexedValues: values)
  }

  override func deleteSolution(id: UInt32) throws {
    guard let solution = try solutionService.getSolution(id: Int64(id)) else {
      return
    }
    guard solution.userId == userId else {
      throw PermissionViolation(msg: "You don't have rights to fiddle with this solution.")
    }
    _ = try solutionService.deleteSolution(id: Int64(id), userId: userId)
  }

  override func addFertilizer(name: String, formula: String) -> UInt32 {
    do {
      let fertilizer = try fertilizerService.addFertilizer(userId: userId, name: name, formula: formula)
      return UInt32(fertilizer.id ?? 0)
    } catch {
      print("[RegisteredUser] addFertilizer failed: \(error)")
      return 0
    }
  }

  override func setFertilizerName(id: UInt32, name: String) throws {
    try fertilizerService.updateName(id: Int64(id), userId: userId, name: name)
  }

  override func setFertilizerFormula(id: UInt32, name: String) throws {
    try fertilizerService.updateFormula(id: Int64(id), userId: userId, formula: name)
  }

  override func deleteFertilizer(id: UInt32) throws {
    guard let fertilizer = try fertilizerService.getFertilizer(id: Int64(id)) else {
      return
    }
    guard fertilizer.userId == userId else {
      throw PermissionViolation(msg: "You don't have rights to fiddle with this fertilizer.")
    }
    _ = try fertilizerService.deleteFertilizer(id: Int64(id), userId: userId)
  }

  override func updateCalculation(calculation: Calculation) -> UInt32 {
    do {
      return UInt32(try calculationService.upsert(calculation, userId: userId))
    } catch {
      print("[RegisteredUser] updateCalculation failed: \(error)")
      return 0
    }
  }

  override func deleteCalculation(id: UInt32) {
    do {
      try calculationService.deleteCalculation(id: Int64(id), userId: userId)
    } catch {
      print("[RegisteredUser] deleteCalculation failed: \(error)")
    }
  }
}