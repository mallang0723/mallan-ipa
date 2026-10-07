import Foundation
import Security

enum RuntimeKeys {
    static func randomHex() throws -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw failure("보안 난수를 만들 수 없습니다.")
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func encryptionKey() throws -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: (Bundle.main.bundleIdentifier ?? "MarinaraIOS") + ".engine",
            kSecAttrAccount as String: "encryption-key"
        ]
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data,
           let value = String(data: data, encoding: .utf8), value.count == 64 { return value }
        // Never replace an unreadable key: doing so would strand existing connections.
        guard status == errSecItemNotFound else { throw failure("저장된 암호화 키를 읽을 수 없습니다. (\(status))") }
        let value = try randomHex()
        var item = query
        item[kSecValueData as String] = Data(value.utf8)
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let saved = SecItemAdd(item as CFDictionary, nil)
        guard saved == errSecSuccess else { throw failure("암호화 키를 저장할 수 없습니다. (\(saved))") }
        return value
    }

    static func failure(_ message: String) -> NSError {
        NSError(domain: "MarinaraIOS", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}
