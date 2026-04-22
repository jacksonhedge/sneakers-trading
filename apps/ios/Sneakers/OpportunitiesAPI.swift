import Foundation

enum OpportunitiesAPI {
    static func fetch() async throws -> OpportunitiesResponse {
        let url = AppConfig.apiBaseURL.appendingPathComponent("api/markets/opportunities")
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw URLError(.init(rawValue: http.statusCode))
        }
        return try JSONDecoder().decode(OpportunitiesResponse.self, from: data)
    }
}
