import SwiftUI

struct BankrollCard: View {
    var cardholder: String = ""
    var productName: String = "Bankroll"

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.09, green: 0.09, blue: 0.10),
                            Color(red: 0.04, green: 0.04, blue: 0.05)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.06), lineWidth: 0.5)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text("Sneakers")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(.white)
                    Spacer()
                }

                Spacer()

                HStack(alignment: .bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(displayCardholder)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white.opacity(0.85))
                        Text(productName.uppercased())
                            .font(.system(size: 10, weight: .semibold))
                            .tracking(1.5)
                            .foregroundStyle(.green)
                    }
                    Spacer()
                    NetworkMark()
                }
            }
            .padding(22)
        }
        .aspectRatio(1.586, contentMode: .fit)
        .shadow(color: .black.opacity(0.35), radius: 18, x: 0, y: 10)
    }

    private var displayCardholder: String {
        let name = cardholder.split(separator: "@").first.map(String.init) ?? cardholder
        let cleaned = name.replacingOccurrences(of: ".", with: " ")
            .split(separator: " ")
            .map { $0.prefix(1).uppercased() + $0.dropFirst().lowercased() }
            .joined(separator: " ")
        return cleaned.isEmpty ? "Cardholder name" : cleaned
    }
}

private struct NetworkMark: View {
    var body: some View {
        HStack(spacing: -10) {
            Circle()
                .fill(Color(red: 0.93, green: 0.23, blue: 0.18))
                .frame(width: 26, height: 26)
            Circle()
                .fill(Color(red: 0.98, green: 0.65, blue: 0.14))
                .frame(width: 26, height: 26)
        }
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()
        BankrollCard(cardholder: "jackson.fitzgerald@sneakersterminal.com")
            .padding(20)
    }
}
