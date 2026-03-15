import Foundation
import NPRPC
import NScalc

final class AuthorizatorImpl: AuthorizatorServant, @unchecked Sendable {
	private struct PendingRegistration: Sendable {
		let username: String
		let email: String
		let password: String
		let code: UInt32
	}

	private let userPoa: Poa
	private let userService: UserService
	private let solutionService: SolutionService
	private let fertilizerService: FertilizerService
	private let calculationService: CalculationService
	private let sessionService: SessionService
	private let pendingLock = NSLock()
	private var pendingRegistrations: [String: PendingRegistration] = [:]

	init(rpc: Rpc, db: AppDatabase) throws {
		self.userPoa = try rpc.createPoa(maxObjects: 1024, lifetime: .transient, idPolicy: .systemGenerated)
		self.userService = UserService(db: db)
		self.solutionService = SolutionService(db: db)
		self.fertilizerService = FertilizerService(db: db)
		self.calculationService = CalculationService(db: db)
		self.sessionService = SessionService(db: db)
		super.init()
	}

	private func makeUserData(for user: UserRecord) throws -> UserData {
		guard let userId = user.id else {
			throw RuntimeError(message: "User record has no id")
		}

		let servant = RegisteredUserImpl(
			user: user,
			solutionService: solutionService,
			fertilizerService: fertilizerService,
			calculationService: calculationService
		)

		var flags: ObjectActivationFlags = .allowAll
		if sessionContext != nil {
			flags.insert(.privateSession)
		}

		let oid = try userPoa.activateObject(servant, flags: flags, sessionContext: sessionContext)
		guard let userObject = NPRPCObject.fromObjectId(oid) else {
			throw RuntimeError(message: "Failed to create RegisteredUser object")
		}

		let sessionId = try sessionService.createSession(userId: userId)
		return UserData(name: user.name, sessionId: sessionId, db: userObject)
	}

	private func loginByEmail(_ email: String, password: String?) throws -> UserData {
		let normalizedEmail = email.lowercased()
		guard let user = try userService.user(byEmail: normalizedEmail) else {
			throw AuthorizationFailed(reason: .email_does_not_exist)
		}

		if let password, !password.isEmpty, !user.verifyPassword(password) {
			throw AuthorizationFailed(reason: .incorrect_password)
		}

		return try makeUserData(for: user)
	}

	override func logIn(login: String, password: String) throws -> UserData {
		guard !password.isEmpty else {
			throw AuthorizationFailed(reason: .incorrect_password)
		}
		return try loginByEmail(login, password: password)
	}

	override func logInWithSessionId(session_id: String) throws -> UserData {
		guard let user = try sessionService.user(forSession: session_id) else {
			throw AuthorizationFailed(reason: .session_does_not_exist)
		}
		return try makeUserData(for: user)
	}

	override func logOut(session_id: String) -> Bool {
		do {
			guard try sessionService.user(forSession: session_id) != nil else {
				return false
			}
			try sessionService.deleteSession(session_id)
			return true
		} catch {
			print("[Authorizator] logOut failed: \(error)")
			return false
		}
	}

	override func checkUsername(username: String) -> Bool {
		do {
			return try userService.isUsernameAvailable(username)
		} catch {
			print("[Authorizator] checkUsername failed: \(error)")
			return false
		}
	}

	override func checkEmail(email: String) -> Bool {
		do {
			return try userService.isEmailAvailable(email)
		} catch {
			print("[Authorizator] checkEmail failed: \(error)")
			return false
		}
	}

	override func registerStepOne(username: String, email: String, password: String) throws {
		if !(try userService.isUsernameAvailable(username)) {
			throw RegistrationFailed(reason: .username_already_exist)
		}
		if !(try userService.isEmailAvailable(email)) {
			throw RegistrationFailed(reason: .email_already_registered)
		}

		let code = UInt32.random(in: 10000...99999)
		let pending = PendingRegistration(
			username: username,
			email: email.lowercased(),
			password: password,
			code: code
		)

		pendingLock.lock()
		pendingRegistrations[username] = pending
		pendingLock.unlock()

		print("[Authorizator] registration code for \(username): \(code)")
	}

	override func registerStepTwo(username: String, code: UInt32) throws {
		let pending: PendingRegistration?
		pendingLock.lock()
		pending = pendingRegistrations[username]
		pendingLock.unlock()

		guard let pending else {
			throw RegistrationFailed(reason: .invalid_username)
		}
		guard pending.code == code else {
			throw RegistrationFailed(reason: .incorrect_code)
		}

		_ = try userService.addUser(name: pending.username, email: pending.email, password: pending.password)

		pendingLock.lock()
		pendingRegistrations.removeValue(forKey: username)
		pendingLock.unlock()
	}
}