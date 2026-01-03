// Required VS Code and Node.js modules
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execFile } = require('child_process');
const util = require('util');

// Convert exec/execFile to promise-based functions for async/await usage
const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);

// Constants
const EXTENSION_NAME = 'Claude Image Paste';
const CONFIG_SECTION = 'claudeImagePaste';
const COMMAND_TIMEOUT = 10000; // 10 seconds
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif'];

// Windows reserved filenames that cannot be used
const WINDOWS_RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

// ==================== HELPER FUNCTIONS ====================

/**
 * Converts a Windows path to WSL path format for Node.js file operations
 * @param {string} winPath - Windows path (e.g., "C:\Users\...")
 * @returns {string} WSL path (e.g., "/mnt/c/Users/...")
 */
function windowsToWslPath(winPath) {
    return winPath
        .replace(/\\/g, '/')
        .replace(/^([A-Z]):/, (match, drive) => `/mnt/${drive.toLowerCase()}`);
}

/**
 * Converts a WSL path to Windows path format
 * @param {string} wslPath - WSL path (e.g., "/mnt/c/Users/...")
 * @returns {string} Windows path (e.g., "C:\Users\...")
 */
function wslToWindowsPath(wslPath) {
    return wslPath
        .replace(/^\/mnt\/([a-z])/, (match, drive) => `${drive.toUpperCase()}:`)
        .replace(/\//g, '\\');
}

/**
 * Generates a cryptographically random filename suffix
 * @returns {string} Random hex string
 */
function generateRandomSuffix() {
    return crypto.randomBytes(8).toString('hex');
}

/**
 * Shows an error message with the extension name prefix
 * @param {string} message - The error message to display
 */
function showErrorMessage(message) {
    vscode.window.showErrorMessage(`${EXTENSION_NAME}: ${message}`);
}

/**
 * Shows a success message with file information
 * Handles errors gracefully if file is no longer accessible
 * @param {string} filePath - Path to the successfully processed file
 */
function showSuccessMessage(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const sizeKB = Math.round(stats.size / 1024);
        vscode.window.showInformationMessage(
            `${EXTENSION_NAME}: Inserted ${path.basename(filePath)} (${sizeKB}KB)`
        );
    } catch (error) {
        // Fallback without size if file is no longer accessible
        vscode.window.showInformationMessage(
            `${EXTENSION_NAME}: Inserted ${path.basename(filePath)}`
        );
    }
}

/**
 * Ensures the save directory is in .gitignore
 * @param {string} workspacePath - Path to workspace root
 * @param {string} dirName - Directory name to add to .gitignore
 */
function ensureGitignore(workspacePath, dirName) {
    const gitignorePath = path.join(workspacePath, '.gitignore');
    const entry = `\n# Claude Image Paste screenshots\n${dirName}/\n`;

    try {
        if (fs.existsSync(gitignorePath)) {
            const content = fs.readFileSync(gitignorePath, 'utf8');
            // Check if already in gitignore
            if (!content.includes(`${dirName}/`) && !content.includes(`${dirName}\n`)) {
                fs.appendFileSync(gitignorePath, entry);
            }
        } else {
            // Create .gitignore if it doesn't exist
            fs.writeFileSync(gitignorePath, entry.trim() + '\n');
        }
    } catch (error) {
        // Silently fail - gitignore is nice to have but not critical
        console.log('Could not update .gitignore:', error.message);
    }
}

/**
 * Validates the save directory path for security issues
 * @param {string} customDir - User-provided directory path
 * @param {string} workspacePath - Workspace root path
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateSaveDirectory(customDir, workspacePath) {
    if (!customDir || customDir.trim() === '') {
        return null; // Empty is valid (uses temp)
    }

    // Block path traversal patterns
    if (customDir.includes('..')) {
        return 'Save directory cannot contain ".." (path traversal)';
    }

    // Block absolute paths to system directories
    const systemDirs = ['/etc', '/sys', '/proc', '/bin', '/sbin', '/usr', '/var', '/root'];
    const normalizedDir = customDir.toLowerCase().replace(/\\/g, '/');

    for (const sysDir of systemDirs) {
        if (normalizedDir.startsWith(sysDir)) {
            return `Cannot save to system directory: ${sysDir}`;
        }
    }

    // Block Windows system directories
    if (/^[a-z]:\\windows/i.test(customDir) || /^[a-z]:\\program files/i.test(customDir)) {
        return 'Cannot save to Windows system directories';
    }

    return null;
}

/**
 * Cleans up old images in the directory, keeping only the most recent N files
 * Handles errors gracefully for individual files
 * @param {string} directory - Path to the image directory
 * @param {number} maxImages - Maximum number of images to keep
 */
function cleanupOldImages(directory, maxImages) {
    // Ensure maxImages is at least 1
    maxImages = Math.max(1, maxImages);

    try {
        const files = fs.readdirSync(directory)
            .filter(file => SUPPORTED_IMAGE_EXTENSIONS.some(ext =>
                file.toLowerCase().endsWith(ext)))
            .map(file => {
                const filePath = path.join(directory, file);
                try {
                    return {
                        name: file,
                        path: filePath,
                        mtime: fs.statSync(filePath).mtime.getTime()
                    };
                } catch (error) {
                    // Skip files we can't stat (permissions, deleted, etc.)
                    return null;
                }
            })
            .filter(item => item !== null)
            .sort((a, b) => b.mtime - a.mtime); // Sort by newest first

        // Delete files beyond the limit
        if (files.length > maxImages) {
            const filesToDelete = files.slice(maxImages);
            for (const file of filesToDelete) {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`Cleaned up old image: ${file.name}`);
                } catch (error) {
                    console.log(`Failed to delete ${file.name}: ${error.message}`);
                }
            }
        }
    } catch (error) {
        console.log('Could not cleanup old images:', error.message);
    }
}

/**
 * Handles moving the image to a custom save directory if configured
 * @param {string} tempImagePath - Path to the temporary image file (WSL format in WSL, Windows format on Windows)
 * @param {string} platform - Current platform: 'windows' or 'wsl'
 * @returns {Promise<string>} - Final path where the image was saved
 */
async function handleCustomSaveDirectory(tempImagePath, platform) {
    const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const customDirectory = config.get('saveDirectory');
    let finalPath = tempImagePath;

    // If custom directory is set, move the file there
    if (customDirectory && customDirectory.trim() !== '') {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        // Validate directory for security issues
        const validationError = validateSaveDirectory(customDirectory, workspaceFolder?.uri.fsPath);
        if (validationError) {
            throw new Error(validationError);
        }

        let expandedDir = customDirectory.replace(/^~/, os.homedir());

        // If path is relative, make it relative to workspace root
        if (!path.isAbsolute(expandedDir)) {
            if (workspaceFolder) {
                let workspacePath = workspaceFolder.uri.fsPath;

                // Normalize workspace path to match our working format
                if (platform === 'wsl' && workspacePath.match(/^[A-Z]:/i)) {
                    // Workspace path is Windows format but we need WSL format
                    workspacePath = windowsToWslPath(workspacePath);
                }

                // Use path.posix for WSL paths, path for Windows
                if (platform === 'wsl') {
                    expandedDir = workspacePath + '/' + expandedDir;
                } else {
                    expandedDir = path.join(workspacePath, expandedDir);
                }

                // Auto-add to .gitignore
                ensureGitignore(workspacePath, customDirectory);
            } else {
                throw new Error('Relative save directory requires an open workspace folder');
            }
        }

        // Create directory if it doesn't exist
        try {
            if (!fs.existsSync(expandedDir)) {
                fs.mkdirSync(expandedDir, { recursive: true, mode: 0o755 });
            }
        } catch (error) {
            throw new Error(`Failed to create directory '${customDirectory}': ${error.message}`);
        }

        // Extract filename using path.basename for reliability
        let fileName = path.basename(tempImagePath);

        // Apply custom filename prefix if configured (with validation)
        const filenamePrefix = config.get('filenamePrefix', 'img_');
        if (filenamePrefix !== 'img_' && fileName.startsWith('img_')) {
            // Validate prefix doesn't contain path separators or invalid chars
            if (/[\/\\<>:"|?*\0]/.test(filenamePrefix)) {
                throw new Error('Invalid filenamePrefix: contains forbidden characters');
            }
            fileName = fileName.replace(/^img_/, filenamePrefix);
        }

        // Build final path
        finalPath = platform === 'wsl'
            ? expandedDir + '/' + fileName
            : path.join(expandedDir, fileName);

        // Final safety check: ensure filename doesn't contain path traversal
        if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
            throw new Error('Invalid filename detected');
        }

        // Use copy + delete instead of rename for cross-filesystem moves (WSL/Windows)
        try {
            fs.copyFileSync(tempImagePath, finalPath);
            fs.unlinkSync(tempImagePath);
        } catch (error) {
            // Provide user-friendly error messages (sanitized)
            let userMsg = 'Failed to save image';
            if (error.code === 'ENOENT') {
                userMsg = 'Save directory could not be accessed';
            } else if (error.code === 'EACCES') {
                userMsg = 'Permission denied when saving image';
            } else if (error.code === 'ENOSPC') {
                userMsg = 'Disk is full';
            }
            throw new Error(userMsg);
        }

        // Cleanup old images, keeping only the most recent N (enforce bounds: 1-100)
        const maxImages = Math.min(100, Math.max(1, config.get('maxImages', 10)));
        cleanupOldImages(expandedDir, maxImages);
    }

    return finalPath;
}

/**
 * Validates a filename for security and filesystem compatibility
 * @param {string} value - The filename to validate
 * @param {string} originalExt - The original file extension
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateFilename(value, originalExt) {
    if (!value || value.trim() === '') {
        return 'File name cannot be empty';
    }

    // Block path separators (path traversal)
    if (/[\/\\]/.test(value)) {
        return 'File name cannot contain path separators';
    }

    // Block invalid Windows/Linux characters
    if (/[<>:"|?*\0]/.test(value)) {
        return 'File name contains invalid characters';
    }

    // Block Windows reserved names
    if (WINDOWS_RESERVED_NAMES.test(value)) {
        return 'File name cannot use reserved system names (CON, PRN, etc.)';
    }

    // Block leading/trailing spaces or dots (problematic on Windows)
    if (/^[\s.]|[\s.]$/.test(value)) {
        return 'File name cannot start or end with spaces or dots';
    }

    // Length check (255 is typical filesystem limit)
    if (value.length > 255) {
        return 'File name is too long (max 255 characters)';
    }

    // Ensure valid image extension is preserved
    const ext = path.extname(value).toLowerCase();
    if (!ext || !SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        return `File must have a valid image extension (${originalExt} recommended)`;
    }

    return null;
}

/**
 * Prompts the user to rename the file if desired
 * Includes validation and overwrite confirmation
 * @param {string} currentPath - Current path of the file
 * @returns {Promise<string>} - Final path after potential rename
 */
async function promptForFileRename(currentPath) {
    const currentName = path.basename(currentPath);
    const currentExt = path.extname(currentName);
    const baseName = path.basename(currentName, currentExt);

    const newName = await vscode.window.showInputBox({
        prompt: 'Enter a new name for the image (or press Enter to keep current name)',
        value: currentName,
        valueSelection: [0, baseName.length], // Pre-select only the base name, not extension
        validateInput: (value) => validateFilename(value, currentExt)
    });

    // If user cancelled (undefined) or kept same name
    if (!newName || newName === currentName) {
        return currentPath;
    }

    const dir = path.dirname(currentPath);
    const newPath = path.join(dir, newName);

    // Check if target file already exists
    try {
        if (fs.existsSync(newPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `File "${newName}" already exists. Overwrite?`,
                'Yes', 'No'
            );
            if (overwrite !== 'Yes') {
                return currentPath; // Keep original name
            }
        }

        fs.renameSync(currentPath, newPath);
        return newPath;
    } catch (error) {
        showErrorMessage(`Failed to rename file: ${error.message}`);
        return currentPath; // Return original path on failure
    }
}

/**
 * Main extension activation function
 * Registers the paste image command and sets up event handlers
 * @param {vscode.ExtensionContext} context - VS Code extension context
 */
function activate(context) {
    // Register the main command for pasting images
    let disposable = vscode.commands.registerCommand('claude-image-paste.pasteImage', async () => {
        try {
            // Step 1: Validate platform compatibility (Windows or WSL only)
            const platform = getPlatform();
            if (!platform) {
                showErrorMessage('Only supported on Windows and WSL environments');
                return;
            }

            // Step 2: Ensure there's an active terminal to paste into
            const activeTerminal = vscode.window.activeTerminal;
            if (!activeTerminal) {
                showErrorMessage('No active terminal found. Please open a terminal first.');
                return;
            }

            // Step 3: Check workspace if relative saveDirectory is configured
            const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
            const customDirectory = config.get('saveDirectory');
            if (customDirectory && !path.isAbsolute(customDirectory) &&
                !customDirectory.startsWith('~') &&
                !vscode.workspace.workspaceFolders?.[0]) {
                showErrorMessage('Relative save directory requires an open workspace folder');
                return;
            }

            // Debug: Show that the command was triggered
            vscode.window.setStatusBarMessage('$(loading~spin) Claude Image Paste: Processing clipboard...', 5000);

            // Step 4: Execute the main image processing workflow
            try {
                // Step 4a: Extract image from clipboard using PowerShell (returns Windows path)
                let imagePath = await getImageFromClipboard(platform);

                if (!imagePath) {
                    showErrorMessage('No image found in clipboard');
                    return;
                }

                // Step 4b: Convert to WSL path for fs operations if we're in WSL
                if (platform === 'wsl') {
                    imagePath = windowsToWslPath(imagePath);
                }

                // Step 4c: Move to custom directory if user has configured one
                imagePath = await handleCustomSaveDirectory(imagePath, platform);

                // Step 4d: Give user opportunity to rename the file (if not skipped)
                const skipRenamePrompt = config.get('skipRenamePrompt', false);

                if (!skipRenamePrompt) {
                    imagePath = await promptForFileRename(imagePath);
                }

                // Step 4e: Convert path for terminal and insert with @ prefix
                const terminalPath = (platform === 'wsl') ? imagePath : windowsToWslPath(imagePath);
                activeTerminal.sendText(`@${terminalPath}`, false);

                // Step 4f: Show success notification with file details
                showSuccessMessage(imagePath);
            } catch (error) {
                showErrorMessage(error.message);
            }

        } catch (error) {
            // Handle any unexpected errors
            showErrorMessage(`Unexpected error: ${error.message}`);
        }
    });

    // Register the command with VS Code for cleanup on deactivation
    context.subscriptions.push(disposable);
}

// ==================== CORE FUNCTIONS ====================

/**
 * Determines the current platform and checks compatibility
 * Uses multiple detection methods for robustness
 * @returns {string|null} 'windows' for native Windows, 'wsl' for Windows Subsystem for Linux, or null if unsupported
 */
function getPlatform() {
    // Check if running on native Windows
    if (process.platform === 'win32') {
        return 'windows';
    }

    // Check if running on WSL (Linux with Windows integration)
    if (process.platform === 'linux') {
        // Method 1: Check for WSL environment variable (most reliable)
        if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) {
            return 'wsl';
        }

        // Method 2: Check for WSL interop file
        if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) {
            return 'wsl';
        }

        // Method 3: Fallback - check for Windows mount point
        if (fs.existsSync('/mnt/c/Windows')) {
            return 'wsl';
        }
    }

    // Unsupported platform (e.g., macOS, other Linux distributions)
    return null;
}

/**
 * Gets the Windows temp directory path from WSL
 * @returns {Promise<string>} Windows temp directory in WSL path format
 */
async function getWindowsTempDir() {
    try {
        // Try to get actual Windows temp path
        const { stdout } = await execPromise('cmd.exe /c echo %TEMP%', { timeout: 5000 });
        const winTemp = stdout.trim();
        if (winTemp && !winTemp.includes('%')) {
            return windowsToWslPath(winTemp);
        }
    } catch (error) {
        // Ignore errors, fall through to default
    }

    // Fallback: Use user's temp in Windows profile
    const userProfile = process.env.USERPROFILE || '';
    if (userProfile) {
        return windowsToWslPath(userProfile) + '/AppData/Local/Temp';
    }

    // Last resort fallback
    return '/mnt/c/Windows/Temp';
}

/**
 * Extracts image from clipboard using PowerShell and saves it to temp directory
 * Handles both copied image files and screenshot/bitmap data from clipboard
 * Uses random filenames to prevent race conditions
 * @param {string} platform - 'windows' or 'wsl'
 * @returns {Promise<string>} Path to the saved image file
 */
async function getImageFromClipboard(platform) {
    // PowerShell script that handles both file drops and bitmap clipboard data
    const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($files -and $files.Count -gt 0) {
    $sourceFile = $files[0]
    if (Test-Path $sourceFile) {
        $imageExtensions = @('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff', '.tif')
        $extension = [System.IO.Path]::GetExtension($sourceFile).ToLower()
        if ($imageExtensions -contains $extension) {
            $dateString = Get-Date -Format "yyyyMMdd_HHmmss"
            $tempPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "img_$dateString$extension")
            Copy-Item -Path $sourceFile -Destination $tempPath -Force
            Write-Output $tempPath
            exit 0
        }
    }
}

$image = [System.Windows.Forms.Clipboard]::GetImage()
if ($image -ne $null) {
    $dateString = Get-Date -Format "yyyyMMdd_HHmmss"
    $tempPath = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "img_$dateString.png")
    $image.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $image.Dispose()
    Write-Output $tempPath
    exit 0
}

Write-Error "No image in clipboard"
exit 1
`.trim();

    // Generate random filename to prevent race conditions
    const randomSuffix = generateRandomSuffix();
    const scriptName = `claude_clip_${randomSuffix}.ps1`;

    // Write script to temp file
    let scriptPath;
    let psExecutable;
    let psArgs;

    if (platform === 'wsl') {
        // Get Windows temp directory for WSL
        const winTempDir = await getWindowsTempDir();
        scriptPath = `${winTempDir}/${scriptName}`;

        try {
            fs.writeFileSync(scriptPath, psScript, { mode: 0o600 });
        } catch (error) {
            // Fallback to /mnt/c/Windows/Temp if user temp fails
            scriptPath = `/mnt/c/Windows/Temp/${scriptName}`;
            fs.writeFileSync(scriptPath, psScript, { mode: 0o600 });
        }

        // Convert to Windows path for PowerShell - use array syntax to prevent injection
        const winScriptPath = wslToWindowsPath(scriptPath);
        psExecutable = 'powershell.exe';
        psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', winScriptPath];
    } else {
        // Native Windows
        scriptPath = path.join(os.tmpdir(), scriptName);
        fs.writeFileSync(scriptPath, psScript);
        psExecutable = 'powershell';
        psArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
    }

    // Execute PowerShell using execFile (array syntax prevents command injection)
    try {
        const { stdout, stderr } = await execFilePromise(psExecutable, psArgs, {
            timeout: COMMAND_TIMEOUT,
            maxBuffer: 1024 * 1024
        });

        // Clean up script file
        try {
            fs.unlinkSync(scriptPath);
        } catch (e) {
            // Ignore cleanup errors
        }

        const result = stdout.trim();
        if (!result) {
            const errMsg = stderr ? stderr.trim() : 'No image in clipboard';
            throw new Error(errMsg);
        }

        return result;
    } catch (execError) {
        // Clean up script file on error
        try {
            fs.unlinkSync(scriptPath);
        } catch (e) {
            // Ignore cleanup errors
        }

        if (execError.killed) {
            throw new Error('Clipboard access timed out. Please try again.');
        }

        // Provide user-friendly error messages (sanitized - don't expose internal details)
        if (execError.message && execError.message.includes('No image in clipboard')) {
            throw new Error('No image found in clipboard. Copy an image first.');
        }

        throw new Error('Clipboard access failed. Please try again.');
    }
}

// ==================== EXTENSION LIFECYCLE ====================

/**
 * Called when the extension is deactivated
 * Clean up any resources if needed
 */
function deactivate() {
    // Currently no cleanup needed, but this is where we'd add it if required
}

// Export the main functions for VS Code to use
module.exports = {
    activate,
    deactivate
}
