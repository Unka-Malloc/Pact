# Pact Client Design System

This document outlines the design language, layout principles, and component behavior for the Pact Flutter desktop client. Unlike the web operations console (`server-web/Design.md`), which focuses on dense enterprise administration, the local desktop client acts as a **Local Agent Hub**. It should feel lightweight, native, and deeply integrated into the user's personal development environment.

## Product Identity

The Pact Client is the command center for the developer's machine. It orchestrates local AI agents (Cursor, VSCode, Windsurf) and bridges them to the Pact server's capabilities.
The UI must be:
1. **Responsive and Snappy**: It runs locally; interactions should feel instantaneous.
2. **Native-App Feel**: It should not feel like a wrapped website. Use subtle desktop idioms (frosted glass, platform-appropriate shadows).
3. **Visually Engaging**: The state of agents (connected, syncing, authorizing) should be obvious at a glance.

## Color Palette (Aligned with Server)

The client uses the same primitive palette as the server (`#2563eb` for brand blue, etc.) to ensure brand consistency. However, the client applies these colors with more generous whitespace and less dense data grids.

| Role | Token (Server Equiv) | Light Value | Dark Value | Usage |
| --- | --- | --- | --- | --- |
| App Background | `--bg-subtle` | `#F9FAFB` (gray-50) | `#111827` (gray-900) | Main window background |
| Surface | `--bg-surface` | `#FFFFFF` (gray-0) | `#1F2937` (gray-800) | Cards, dialogs, sidebars |
| Accent/Brand | `--brand` | `#2563EB` (blue-600) | `#3B82F6` (blue-500) | Primary buttons, active states, focus rings |
| Brand Subtle | `--brand-subtle` | `#EFF6FF` (blue-50) | `#1E3A8A` (blue-900) | Selected list items, highlighted backgrounds |
| Success | `--success` | `#16A34A` (green-600) | `#22C55E` (green-500) | Installed agents, approved auths, connected |
| Warning | `--warning` | `#D97706` (amber-600) | `#F59E0B` (amber-500) | Pending authorizations, warnings |
| Danger | `--danger` | `#DC2626` (red-600) | `#EF4444` (red-500) | Uninstalled/failed states, rejected auths, destructive |
| Text Primary | `--text-primary` | `#111827` (gray-900) | `#F9FAFB` (gray-50) | Headings, main text |
| Text Secondary | `--text-secondary`| `#4B5563` (gray-600) | `#9CA3AF` (gray-400) | Subtitles, metadata |
| Line/Border | `--border-subtle` | `#E5E7EB` (gray-200) | `#374151` (gray-700) | Dividers, card borders |

## Typography

Use standard system fonts where appropriate to maintain a native feel, or `Inter` for consistent cross-platform rendering.
- **Headings**: Semi-bold to Bold.
- **Body**: Regular weight, 14px size for readability on desktop monitors.
- **Monospace**: `JetBrains Mono` or `Fira Code` for any path names, JSON previews, or terminal output.

## Layout Structure

The app uses a classic Desktop Split View:

1. **Sidebar (Navigation)**:
   - Width: 240px.
   - Contains major sections: Dashboard, Agents, Capabilities, Authorization, Settings.
   - Distinct highlight for the active section.

2. **Main Canvas**:
   - Scrollable area for content.
   - Uses constrained width for readable content (max ~900px wide for text-heavy areas, fluid for grids).
   - Padding: 24px or 32px around the perimeter.

3. **Window Controls**:
   - (macOS) Traffic lights integrated into the sidebar or top bar.
   - (Windows) Standard window controls at the top right.

## Component Guidelines

### Agent Cards
- Display the agent icon prominently.
- Show clear status indicators (e.g., green dot for "Connected", grey for "Not Installed").
- Actions ("Install", "Uninstall") should be easily accessible but not distracting.

### Authorization Board
- Treat pending authorization requests as high-priority tasks.
- Use a split layout or distinct borders (warning colors) to highlight pending requests.
- "Approve" and "Reject" buttons must be unambiguous.

### Capabilities Viewer
- Use a grid or a structured list.
- Group tools logically (e.g., File System, Terminal, API).
- Provide a search bar to easily filter through available tools.

## Animation and Motion
- **Micro-interactions**: Subtle scale or opacity changes on hover (especially for agent cards and buttons).
- **Transitions**: Smooth cross-fades when navigating between sidebar sections (duration ~200ms).
- Avoid bouncy or overly playful animations; keep it professional.

## Accessibility
- Ensure high contrast for text (WCAG AA).
- All actions must be keyboard navigable.
- Provide tooltips for icon-only buttons.
