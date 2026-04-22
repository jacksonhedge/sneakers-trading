import Foundation

struct OpportunitiesResponse: Decodable {
    let opportunities: [Opportunity]
    let platforms: [String: PlatformStat]
    let lastUpdated: String?
    let totalMarkets: Int?
    let gatedCount: Int?
    let note: String?
}

struct PlatformStat: Decodable {
    let markets: Int
    let latestTs: String?
}

struct Opportunity: Decodable, Identifiable {
    let platform: String
    let marketId: String
    let question: String
    let sport: String?
    let outcomes: [Outcome]
    let overround: Double?
    let volume: Double?
    let liquidity: Double?
    let phase: String
    let ts: String

    var id: String { "\(platform)-\(marketId)" }

    enum CodingKeys: String, CodingKey {
        case platform
        case marketId = "market_id"
        case question
        case sport
        case outcomes
        case overround
        case volume
        case liquidity
        case phase
        case ts
    }
}

struct Outcome: Decodable, Hashable {
    let name: String
    let bestAsk: Double?
    let bestBid: Double?

    enum CodingKeys: String, CodingKey {
        case name
        case bestAsk = "best_ask"
        case bestBid = "best_bid"
    }
}
