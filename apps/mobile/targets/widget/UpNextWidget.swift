import SwiftUI
import WidgetKit

private let accent = Color(red: 0xe5 / 255, green: 0x42 / 255, blue: 0x42 / 255)
private let secondary = Color(red: 0x88 / 255, green: 0x88 / 255, blue: 0x88 / 255)
private let surface = Color(red: 0x1c / 255, green: 0x1c / 255, blue: 0x1c / 255)
private let outline = Color(red: 0x2a / 255, green: 0x2a / 255, blue: 0x2a / 255)

private struct UpNextEntry: TimelineEntry {
  let date: Date
  let upNext: LiveUpdateSharedStore.UpNext
}

// JS reloads the timeline whenever Home resolves a new card, so the provider
// never schedules its own refresh (Android: updatePeriodMillis 0).
private struct UpNextProvider: TimelineProvider {
  func placeholder(in context: Context) -> UpNextEntry {
    UpNextEntry(date: .now, upNext: .fallback)
  }

  func getSnapshot(in context: Context, completion: @escaping (UpNextEntry) -> Void) {
    completion(UpNextEntry(date: .now, upNext: LiveUpdateSharedStore.loadUpNext()))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<UpNextEntry>) -> Void) {
    completion(Timeline(entries: [UpNextEntry(date: .now, upNext: LiveUpdateSharedStore.loadUpNext())], policy: .never))
  }
}

// Port of widgets/up-next-widget.tsx: the same three layouts, picked by the same
// breakpoints (getUpNextWidgetSize in widgets/up-next-widget-size.ts; the config
// test keeps the numbers in sync). Widget points stand in for Android dp.
private enum UpNextLayout {
  case small, compact, expanded

  init(_ size: CGSize) {
    if size.width < 180 || size.height < 64 { self = .small }
    else if size.width < 260 || size.height < 112 { self = .compact }
    else { self = .expanded }
  }
}

private struct Chevron: View {
  let color: Color
  var body: some View {
    Text("›").font(.system(size: 24, weight: .medium)).foregroundStyle(color)
  }
}

private struct UpNextView: View {
  let upNext: LiveUpdateSharedStore.UpNext

  private var labelText: some View {
    Text(upNext.label.uppercased())
      .font(.system(size: 12, weight: .bold))
      .kerning(1.4)
      .foregroundStyle(accent)
      .lineLimit(1)
  }

  var body: some View {
    GeometryReader { proxy in
      Group {
        switch UpNextLayout(proxy.size) {
        case .small: small
        case .compact: compact
        case .expanded: expanded
        }
      }
      .frame(width: proxy.size.width, height: proxy.size.height)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(upNext.label), \(upNext.name). \(upNext.source). \(upNext.action)")
  }

  private var small: some View {
    HStack(spacing: 8) {
      Capsule().fill(accent).frame(width: 4, height: 24)
      Text(upNext.name)
        .font(.system(size: 15, weight: .bold))
        .foregroundStyle(.white)
        .lineLimit(1)
        .truncationMode(.tail)
        .minimumScaleFactor(0.5)
        .frame(maxWidth: .infinity, alignment: .leading)
      Chevron(color: accent)
    }
    .padding(.horizontal, 12)
  }

  private var compact: some View {
    HStack(spacing: 0) {
      Rectangle().fill(accent).frame(width: 4)
      VStack(alignment: .leading, spacing: 4) {
        labelText
        Text(upNext.name)
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(.white)
          .lineLimit(1)
          .truncationMode(.tail)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      Chevron(color: secondary)
    }
    .padding(.trailing, 12)
  }

  // Deliberately differs from Android's expanded layout: the accent is a
  // full-height bar on the left (as in compact), not a strip across the top.
  private var expanded: some View {
    HStack(spacing: 0) {
      Rectangle().fill(accent).frame(width: 4)

      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 8) {
          Circle().fill(accent).frame(width: 6, height: 6)
          labelText.layoutPriority(1)
          Rectangle().fill(outline).frame(width: 1, height: 12)
          Text(upNext.source)
            .font(.system(size: 12, weight: .bold))
            .foregroundStyle(secondary)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        Spacer(minLength: 0)
        Text(upNext.name)
          .font(.system(size: 24, weight: .bold))
          .kerning(-0.5)
          .foregroundStyle(.white)
          .lineLimit(2)
          .truncationMode(.tail)
          .frame(maxWidth: .infinity, alignment: .leading)
        Spacer(minLength: 0)
        HStack(spacing: 8) {
          Text(upNext.action)
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(.white)
            .lineLimit(1)
            .truncationMode(.tail)
            .frame(maxWidth: .infinity, alignment: .leading)
          Chevron(color: accent)
        }
      }
      .padding(16)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

struct UpNextWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "UpNext", provider: UpNextProvider()) { entry in
      UpNextView(upNext: entry.upNext)
        .widgetURL(URL(string: "pumppal://up-next"))
        .containerBackground(for: .widget) {
          // Android's 1px #2a2a2a border, drawn on the system's own corner shape.
          ZStack {
            surface
            ContainerRelativeShape().strokeBorder(outline, lineWidth: 1)
          }
        }
    }
    .configurationDisplayName("Up next")
    .description("Start your next workout")
    .supportedFamilies([.systemSmall, .systemMedium])
    .contentMarginsDisabled()
  }
}
