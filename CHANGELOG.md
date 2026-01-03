# Changelog

All notable changes to the Claude Code Image Paste (WSL) extension will be documented in this file.

## [1.1.6] - 2025-01-03

### Changed
- Added dark gray background to icon for marketplace visibility

## [1.1.5] - 2025-01-03

### Changed
- Scaled up icon for better visibility in marketplace

## [1.1.4] - 2025-01-03

### Changed
- Excluded dev files from marketplace package

## [1.1.3] - 2025-01-03

### Changed
- New custom icon design (image + clipboard + terminal)

## [1.1.2] - 2025-01-03

### Changed
- Added .vscodeignore to exclude dev files from marketplace package

## [1.1.1] - 2025-01-03

### Security
- **Fixed** Command injection vulnerability - now uses `execFile` with array arguments instead of string interpolation
- **Fixed** Path traversal protection - validates `saveDirectory` and `filenamePrefix` settings
- **Fixed** Filename injection - comprehensive validation blocks reserved names, path separators, and invalid characters
- **Added** File overwrite confirmation dialog when renaming to existing filename
- **Added** Random PowerShell script filenames to prevent race conditions
- **Improved** Error messages sanitized to avoid exposing internal details

### Added
- Auto-cleanup feature (`maxImages` setting) - automatically deletes oldest images
- Configurable filename prefix (`filenamePrefix` setting)
- Auto-gitignore - automatically adds save directory to `.gitignore`
- Workspace validation for relative save directories
- Multiple WSL detection methods for improved reliability

### Changed
- Enhanced WSL path handling for better cross-filesystem compatibility
- Improved error handling throughout - no more uncaught exceptions
- Better user-friendly error messages
- Keyboard shortcut changed to `Ctrl+Alt+V` to avoid conflicts

### Fixed
- Path conversion issues between Windows and WSL
- File operations now handle errors gracefully per-file

## [1.0.0] - 2025-01-03

### Added
- Initial release - forked from [agg4code/claude-image-paste](https://github.com/aggroot/claude-image-paste)
- Clipboard image pasting with PowerShell
- File drop support for copied image files
- Custom save directory support
- Optional rename prompt
- `@` prefix for Claude Code file imports
- WSL path conversion

### Credits
- Original extension by [agg](https://github.com/aggroot)
