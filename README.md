# Claude Code Image Paste (WSL)

A VS Code/Cursor extension for pasting images into terminals for Claude Code conversations. Optimized for Windows & WSL environments.

**Based on [agg4code/claude-image-paste](https://github.com/aggroot/claude-image-paste)** - enhanced with WSL path handling, auto-save to project directory, and automatic cleanup.

## ✨ Features

- 📋 **Clipboard Images**: Paste screenshots directly from your clipboard
- 📁 **File Support**: Copy image files from Explorer and paste their paths
- 🖼️ **Multiple Formats**: PNG, JPG, JPEG, GIF, BMP, WebP, SVG, ICO, TIFF
- 🔄 **WSL Path Conversion**: Automatically converts paths for WSL terminals
- 📂 **Auto-Save to Project**: Save images to your project directory instead of temp
- 🧹 **Auto-Cleanup**: Keeps only the last N images to prevent folder bloat
- 🤖 **@ Prefix**: Automatically adds `@` prefix for Claude Code file imports
- 📝 **Auto-Gitignore**: Automatically adds save directory to `.gitignore`
- ✏️ **File Renaming**: Optional rename dialog for custom filenames
- 📅 **Smart Naming**: Auto-generates timestamped filenames with configurable prefix

## 🚀 Installation

### VS Code Marketplace
```
ext install melon-hub.claude-code-image-paste-wsl
```

### Manual Installation
1. Download the latest `.vsix` from [Releases](https://github.com/melon-hub/claude-code-image-paste-wsl/releases)
2. In VS Code/Cursor: `Ctrl+Shift+P` → "Install from VSIX..."
3. Select the downloaded file
4. Restart VS Code/Cursor

## 📖 Usage

1. **Copy an image**:
   - Take a screenshot (`Win+Shift+S`, `PrintScreen`, etc.)
   - OR copy an image file from File Explorer
   - OR right-click an image in browser → Copy image

2. **With your terminal open**, press:
   ```
   Ctrl+Alt+V
   ```

3. **The image path is inserted** with `@` prefix, ready for Claude Code!

> **Note**: The keyboard shortcut requires a terminal to be open. The command palette (`Ctrl+Shift+P` → "Paste Image for Claude") is available but will shift focus away from the terminal.

## ⚙️ Settings

Configure in VS Code Settings (`Ctrl+,`) → search "Claude Image Paste":

| Setting | Default | Description |
|---------|---------|-------------|
| `saveDirectory` | `""` | Where to save images (see below) |
| `skipRenamePrompt` | `false` | Skip the file rename dialog |
| `maxImages` | `10` | Max images to keep in directory (oldest auto-deleted) |
| `filenamePrefix` | `img_` | Prefix for auto-generated filenames |

### 📅 Filename Format

Images are automatically named with a timestamp:

```
img_20250103_143052.png
│   │        │
│   │        └── Time: 14:30:52 (HHMMSS)
│   └─────────── Date: 2025-01-03 (YYYYMMDD)
└────────────────Prefix (configurable)
```

This ensures filenames are **unique** and **sort chronologically** in file explorers.

### 📂 How `saveDirectory` Works

| Value | Behavior | Example Result |
|-------|----------|----------------|
| `""` (empty) | Uses system temp folder | `C:\Users\You\AppData\Local\Temp\img_20250103_120000.png` |
| `.claude-images` | Relative to **current workspace root** | `[workspace]/.claude-images/img_20250103_120000.png` |
| `screenshots` | Relative to **current workspace root** | `[workspace]/screenshots/img_20250103_120000.png` |
| `~/Pictures` | Expands `~` to home directory | `/home/you/Pictures/img_20250103_120000.png` |
| `/absolute/path` | Uses exact path | `/absolute/path/img_20250103_120000.png` |

**Key point**: Relative paths (like `.claude-images`) are resolved from whatever folder you have open in VS Code/Cursor. So if you open `/home/user/my-project`, images save to `/home/user/my-project/.claude-images/`.

The folder is **automatically created** if it doesn't exist, and **automatically added to `.gitignore`**.

### 💡 Recommended Setup

Add to your VS Code/Cursor `settings.json`:

```json
{
  "claudeImagePaste.saveDirectory": ".claude-images",
  "claudeImagePaste.skipRenamePrompt": true,
  "claudeImagePaste.maxImages": 10
}
```

This configuration:
- ✅ Saves images to `.claude-images/` in your project root
- ✅ Skips the rename prompt for faster workflow
- ✅ Auto-deletes old images, keeping only the last 10

## 🛠️ Requirements

- **Windows 10/11** with **WSL2** (or native Windows)
- **PowerShell** (comes with Windows)
- **VS Code 1.74.0+** or **Cursor**

## 🐛 Troubleshooting

**"No active terminal found"**
- Open a terminal first (`` Ctrl+` ``)
- Make sure at least one terminal exists in VS Code/Cursor

**"No image in clipboard"**
- Ensure you copied an image (not just selected it)
- Try copying again - some apps don't copy to clipboard correctly

**"Failed to move file to custom directory"**
- Check the directory path is valid
- Ensure you have write permissions
- Try using an absolute path instead of relative

**Keyboard shortcut doesn't work**
- Ensure a terminal is open (doesn't need to be focused)
- Check for conflicts: `Ctrl+K Ctrl+S` → search "Paste Image"
- Try reassigning to a different shortcut

**Extension not updating**
- Fully close and reopen VS Code/Cursor (reload window may not be enough)

## 👥 Credits

- **Original Extension**: [claude-image-paste](https://github.com/aggroot/claude-image-paste) by [agg](https://github.com/aggroot)
- **WSL Fork**: [melon-hub](https://github.com/melon-hub)

## 📝 License

MIT License - see [LICENSE](LICENSE)
