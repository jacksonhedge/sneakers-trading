import SwiftUI

struct AddCashSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var selectedPreset: Int? = 50
    @State private var customAmount: String = ""

    private let presets = [20, 50, 100, 250, 500]

    private var amount: Int {
        if let preset = selectedPreset { return preset }
        return Int(customAmount) ?? 0
    }

    var body: some View {
        VStack(spacing: 20) {
            header
            newBalance
            chipsGrid
            sourceRow
            Spacer(minLength: 4)
            payButton
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 24)
    }

    private var header: some View {
        HStack {
            Text("Add cash")
                .font(.system(size: 22, weight: .bold))
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(Color(.secondarySystemBackground))
                    .clipShape(Circle())
            }
        }
    }

    private var newBalance: some View {
        VStack(spacing: 6) {
            Text("New balance")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            Text("$\(amount).00")
                .font(.system(size: 52, weight: .bold))
                .foregroundStyle(.green)
                .contentTransition(.numericText())
                .animation(.snappy, value: amount)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private var chipsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(presets, id: \.self) { preset in
                chip(preset: preset)
            }
            customChip
        }
    }

    private func chip(preset: Int) -> some View {
        let active = selectedPreset == preset
        return Button {
            selectedPreset = preset
            customAmount = ""
        } label: {
            Text("$\(preset)")
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(active ? .black : .primary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(active ? Color.green : Color(.secondarySystemBackground))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(active ? Color.green : .clear, lineWidth: 1.5)
                )
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }

    private var customChip: some View {
        Button {
            selectedPreset = nil
        } label: {
            Text("Custom amount")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(
                            Color.secondary.opacity(0.3),
                            style: StrokeStyle(lineWidth: 1.5, dash: [4])
                        )
                )
        }
    }

    private var sourceRow: some View {
        Button {} label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(Color.black)
                    Image(systemName: "applelogo")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(.white)
                }
                .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Apple Pay")
                        .font(.system(size: 15, weight: .medium))
                    Text("Visa •••• 4242")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .background(Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var payButton: some View {
        Button {} label: {
            HStack(spacing: 6) {
                Image(systemName: "applelogo")
                    .font(.system(size: 16, weight: .semibold))
                Text("Pay $\(amount).00")
                    .font(.system(size: 17, weight: .semibold))
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 18)
            .background(Color.black)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.white.opacity(0.18), lineWidth: 0.75)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .disabled(amount == 0)
        .opacity(amount == 0 ? 0.4 : 1)
    }
}

#Preview {
    AddCashSheet()
}
