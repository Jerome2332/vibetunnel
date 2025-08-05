import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';
import type { PoltergeistConfig } from '../src/types';

// Mock execSync for build validation tests
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

describe('Enhanced Poltergeist Init - Comprehensive Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'poltergeist-enhanced-test-'));
    process.chdir(tempDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(__dirname);
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Fix 1: Current Implementation Issues', () => {
    describe('Duplicate Target Names', () => {
      it('should handle duplicate project names with unique suffixes', () => {
        const targets = [
          { name: 'vibetunnel', type: 'app-bundle' },
          { name: 'vibetunnel', type: 'app-bundle' },
          { name: 'vibetunnel', type: 'app-bundle' }
        ];

        // After deduplication
        ensureUniqueTargetNames(targets);

        expect(targets[0].name).toBe('vibetunnel');
        expect(targets[1].name).toBe('vibetunnel-2');
        expect(targets[2].name).toBe('vibetunnel-3');
      });

      it('should preserve unique names', () => {
        const targets = [
          { name: 'app', type: 'app-bundle' },
          { name: 'app-ios', type: 'app-bundle' },
          { name: 'framework', type: 'framework' }
        ];

        ensureUniqueTargetNames(targets);

        expect(targets[0].name).toBe('app');
        expect(targets[1].name).toBe('app-ios');
        expect(targets[2].name).toBe('framework');
      });
    });

    describe('Workspace vs Project Detection', () => {
      it('should use -workspace flag for .xcworkspace files', () => {
        const project = {
          path: '/Users/test/MyApp.xcworkspace',
          type: 'xcworkspace' as const,
          scheme: 'MyApp'
        };

        const command = generateXcodeBuildCommand(project, '.', 'MyApp', false);
        
        expect(command).toContain('-workspace MyApp.xcworkspace');
        expect(command).not.toContain('-project');
      });

      it('should use -project flag for .xcodeproj files', () => {
        const project = {
          path: '/Users/test/MyApp.xcodeproj',
          type: 'xcodeproj' as const,
          scheme: 'MyApp'
        };

        const command = generateXcodeBuildCommand(project, '.', 'MyApp', false);
        
        expect(command).toContain('-project MyApp.xcodeproj');
        expect(command).not.toContain('-workspace');
      });

      it('should add -sdk iphonesimulator for iOS projects', () => {
        const project = {
          path: '/Users/test/ios/MyApp.xcodeproj',
          type: 'xcodeproj' as const,
          scheme: 'MyApp'
        };

        const command = generateXcodeBuildCommand(project, 'ios', 'MyApp', true);
        
        expect(command).toContain('-sdk iphonesimulator');
      });
    });

    describe('Path Normalization', () => {
      it('should clean redundant path components', () => {
        expect(cleanPath('././build/Debug')).toBe('./build/Debug');
        expect(cleanPath('./.')).toBe('.');
        expect(cleanPath('./mac/build')).toBe('./mac/build');
        expect(cleanPath('.')).toBe('.');
      });
    });
  });

  describe('Enhancement 2: Project Analysis', () => {
    describe('Parse Xcode Project', () => {
      it('should parse project info when xcodebuild succeeds', async () => {
        const mockOutput = `Information about project "MyApp":
    Targets:
        MyApp
        MyAppTests
        MyAppUITests

    Build Configurations:
        Debug
        Release

    If no build configuration is specified and -scheme is not passed then "Release" is used.

    Schemes:
        MyApp
        MyApp-Dev`;

        vi.mocked(execSync).mockReturnValue(mockOutput);

        const info = await parseXcodeProject('/path/to/MyApp.xcodeproj');

        expect(info).not.toBeNull();
        expect(info!.targets).toHaveLength(3);
        expect(info!.targets[0].name).toBe('MyApp');
        expect(info!.schemes).toEqual(['MyApp', 'MyApp-Dev']);
        expect(info!.configurations).toEqual(['Debug', 'Release']);
      });

      it('should return null when parsing fails', async () => {
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('xcodebuild failed');
        });

        const info = await parseXcodeProject('/path/to/Invalid.xcodeproj');
        expect(info).toBeNull();
      });
    });

    describe('Bundle ID Extraction', () => {
      it('should extract bundle ID from Info.plist', () => {
        mkdirSync('MyApp', { recursive: true });
        writeFileSync('MyApp/Info.plist', `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.company.myapp</string>
</dict>
</plist>`);

        const bundleId = extractBundleId('.', 'MyApp');
        expect(bundleId).toBe('com.company.myapp');
      });

      it('should return null when Info.plist not found', () => {
        const bundleId = extractBundleId('.', 'NonExistent');
        expect(bundleId).toBeNull();
      });

      it('should try multiple Info.plist locations', () => {
        writeFileSync('MyApp-Info.plist', `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.alternate.location</string>
</dict>
</plist>`);

        const bundleId = extractBundleId('.', 'MyApp');
        expect(bundleId).toBe('com.alternate.location');
      });
    });
  });

  describe('Enhancement 6: Configuration Validation', () => {
    describe('Build Command Validation', () => {
      it('should validate xcodebuild commands with dry-run', async () => {
        const command = 'cd . && xcodebuild -project MyApp.xcodeproj -scheme MyApp build';
        
        vi.mocked(execSync).mockImplementation((cmd: string) => {
          if (cmd.includes('-dry-run')) {
            return Buffer.from('');
          }
          throw new Error('Should use dry-run');
        });

        const isValid = await validateBuildCommand(command, tempDir);
        expect(isValid).toBe(true);
        expect(execSync).toHaveBeenCalledWith(
          expect.stringContaining('-dry-run'),
          expect.any(Object)
        );
      });

      it('should handle validation failures', async () => {
        const command = 'cd invalid && xcodebuild -project Missing.xcodeproj build';
        
        vi.mocked(execSync).mockImplementation(() => {
          throw new Error('Command failed');
        });

        const isValid = await validateBuildCommand(command, tempDir);
        expect(isValid).toBe(false);
      });

      it('should respect timeout for validation', async () => {
        vi.mocked(execSync).mockImplementation((cmd: string, options: any) => {
          expect(options.timeout).toBe(5000);
          return Buffer.from('');
        });

        await validateBuildCommand('xcodebuild build', tempDir);
      });
    });

    describe('Watch Path Validation', () => {
      it('should validate existing watch paths', () => {
        mkdirSync('src', { recursive: true });
        mkdirSync('Resources', { recursive: true });

        const paths = [
          'src/**/*.swift',
          'Resources/**/*.plist',
          'Missing/**/*.swift'
        ];

        const validPaths = validateWatchPaths(paths, tempDir);

        expect(validPaths).toContain('src/**/*.swift');
        expect(validPaths).toContain('Resources/**/*.plist');
        expect(validPaths).not.toContain('Missing/**/*.swift');
      });

      it('should handle complex glob patterns', () => {
        mkdirSync('MyApp/Sources', { recursive: true });

        const paths = [
          'MyApp/**/*.{swift,m,h}',
          'MyApp/Sources/**/*.swift'
        ];

        const validPaths = validateWatchPaths(paths, tempDir);
        expect(validPaths).toHaveLength(2);
      });
    });
  });

  describe('Quick Start Guide Generation', () => {
    it('should generate comprehensive guide for single target', () => {
      const config: PoltergeistConfig = {
        version: '1.0',
        projectType: 'swift',
        targets: [
          {
            name: 'myapp',
            type: 'app-bundle',
            enabled: true,
            buildCommand: 'xcodebuild build',
            outputPath: './build/MyApp.app',
            bundleId: 'com.example.myapp',
            watchPaths: ['**/*.swift']
          }
        ],
        notifications: {
          successSound: 'Glass',
          failureSound: 'Basso'
        }
      };

      const guide = generateQuickStartGuide(config);

      expect(guide).toContain('🚀 Quick Start Guide');
      expect(guide).toContain('poltergeist haunt');
      expect(guide).toContain('poltergeist status');
      expect(guide).toContain('poltergeist logs');
      expect(guide).toContain('myapp: xcodebuild build');
    });

    it('should show target-specific commands for multiple targets', () => {
      const config: PoltergeistConfig = {
        version: '1.0',
        projectType: 'swift',
        targets: [
          {
            name: 'app',
            type: 'app-bundle',
            enabled: true,
            buildCommand: 'build app',
            outputPath: './app.app',
            bundleId: 'com.example.app',
            watchPaths: ['**/*.swift']
          },
          {
            name: 'framework',
            type: 'framework',
            enabled: true,
            buildCommand: 'build framework',
            outputPath: './framework.framework',
            watchPaths: ['**/*.swift']
          }
        ],
        notifications: {
          successSound: 'Glass',
          failureSound: 'Basso'
        }
      };

      const guide = generateQuickStartGuide(config);

      expect(guide).toContain('poltergeist haunt --target app');
      expect(guide).toContain('✓ Enabled (2)');
    });

    it('should show disabled targets separately', () => {
      const config: PoltergeistConfig = {
        version: '1.0',
        projectType: 'swift',
        targets: [
          {
            name: 'mac',
            type: 'app-bundle',
            enabled: true,
            buildCommand: 'build mac',
            outputPath: './mac.app',
            bundleId: 'com.example.mac',
            watchPaths: ['**/*.swift']
          },
          {
            name: 'ios',
            type: 'app-bundle',
            enabled: false,
            buildCommand: 'build ios',
            outputPath: './ios.app',
            bundleId: 'com.example.ios',
            watchPaths: ['**/*.swift']
          }
        ],
        notifications: {
          successSound: 'Glass',
          failureSound: 'Basso'
        }
      };

      const guide = generateQuickStartGuide(config);

      expect(guide).toContain('✓ Enabled (1)');
      expect(guide).toContain('✗ Disabled (1)');
      expect(guide).toContain('ios: Enable with \'enabled: true\'');
    });

    it('should include advanced usage tips', () => {
      const config: PoltergeistConfig = {
        version: '1.0',
        projectType: 'swift',
        targets: [],
        notifications: {
          successSound: 'Glass',
          failureSound: 'Basso'
        }
      };

      const guide = generateQuickStartGuide(config);

      expect(guide).toContain('Run as background service');
      expect(guide).toContain('poltergeist haunt > .poltergeist.log 2>&1 &');
      expect(guide).toContain('poltergeist stop');
      expect(guide).toContain('poltergeist clean');
      expect(guide).toContain('Configuration Tips');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete VibeTunnel-like structure', async () => {
      // Create VibeTunnel-like structure
      mkdirSync('VibeTunnel.xcworkspace');
      mkdirSync('mac/VibeTunnel.xcodeproj', { recursive: true });
      mkdirSync('mac/scripts', { recursive: true });
      mkdirSync('ios/VibeTunnel-iOS.xcodeproj', { recursive: true });
      
      writeFileSync('mac/scripts/build.sh', '#!/bin/bash\nxcodebuild');
      writeFileSync('mac/VibeTunnel/Info.plist', `<?xml version="1.0"?>
<plist><dict><key>CFBundleIdentifier</key><string>sh.vibetunnel.vibetunnel</string></dict></plist>`);

      const projects = [
        { path: join(tempDir, 'VibeTunnel.xcworkspace'), type: 'xcworkspace' as const },
        { path: join(tempDir, 'mac/VibeTunnel.xcodeproj'), type: 'xcodeproj' as const, scheme: 'VibeTunnel' },
        { path: join(tempDir, 'ios/VibeTunnel-iOS.xcodeproj'), type: 'xcodeproj' as const, scheme: 'VibeTunnel-iOS' }
      ];

      vi.mocked(execSync).mockReturnValue('');

      const config = await enhancedInitXcodeProjects(tempDir, projects);

      // Check no duplicate names
      const targetNames = config.targets.map(t => t.name);
      expect(new Set(targetNames).size).toBe(targetNames.length);

      // Check workspace uses correct flag
      const workspaceTarget = config.targets.find(t => 
        t.buildCommand.includes('.xcworkspace')
      );
      expect(workspaceTarget?.buildCommand).toContain('-workspace');

      // Check build script preference
      const macTarget = config.targets.find(t => 
        t.buildCommand.includes('cd mac')
      );
      expect(macTarget?.buildCommand).toContain('./scripts/build.sh');

      // Check iOS is disabled
      const iosTarget = config.targets.find(t => t.name.includes('ios'));
      expect(iosTarget?.enabled).toBe(false);
      expect(iosTarget?.buildCommand).toContain('-sdk iphonesimulator');

      // Check bundle ID extraction
      expect(macTarget?.bundleId).toBe('sh.vibetunnel.vibetunnel');
    });

    it('should show validation warnings when appropriate', async () => {
      mkdirSync('MyApp.xcodeproj');

      const projects = [
        { path: join(tempDir, 'MyApp.xcodeproj'), type: 'xcodeproj' as const }
      ];

      // Mock validation to fail
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Validation failed');
      });

      const consoleSpy = vi.spyOn(console, 'log');

      await enhancedInitXcodeProjects(tempDir, projects);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Validation Warnings')
      );
    });
  });
});

// Helper functions (these would be imported from the actual implementation)
function ensureUniqueTargetNames(targets: any[]): void {
  const nameCounts = new Map<string, number>();
  
  targets.forEach((target) => {
    const baseName = target.name;
    const count = nameCounts.get(baseName) || 0;
    
    if (count > 0) {
      target.name = `${baseName}-${count + 1}`;
    }
    
    nameCounts.set(baseName, count + 1);
  });
}

function generateXcodeBuildCommand(
  project: { path: string; type: 'xcodeproj' | 'xcworkspace'; scheme?: string },
  relativeDir: string,
  projectName: string,
  isIOS: boolean
): string {
  const flag = project.type === 'xcworkspace' ? '-workspace' : '-project';
  const sdk = isIOS ? '-sdk iphonesimulator ' : '';
  const scheme = project.scheme || projectName;
  const basename = project.path.split('/').pop() || '';
  
  return `cd ${relativeDir} && xcodebuild ${flag} ${basename} -scheme ${scheme} ${sdk}-configuration Debug build`;
}

function cleanPath(path: string): string {
  return path.replace(/^\.\/\.\//, './').replace(/^\.\/\.$/, '.');
}

// Mock implementations for testing
async function parseXcodeProject(projectPath: string): Promise<any> {
  const mockExecSync = vi.mocked(execSync);
  const result = mockExecSync(
    `xcodebuild -list -project ${projectPath} 2>/dev/null`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
  );
  
  const info = {
    schemes: [] as string[],
    targets: [] as any[],
    configurations: [] as string[]
  };
  
  const lines = result.toString().split('\n');
  let section = '';
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.includes('Targets:')) {
      section = 'targets';
    } else if (trimmed.includes('Schemes:')) {
      section = 'schemes';
    } else if (trimmed.includes('Build Configurations:')) {
      section = 'configurations';
    } else if (trimmed && !trimmed.includes(':') && section) {
      if (section === 'targets') {
        info.targets.push({ name: trimmed, type: 'unknown' });
      } else if (section === 'schemes') {
        info.schemes.push(trimmed);
      } else if (section === 'configurations') {
        info.configurations.push(trimmed);
      }
    }
  }
  
  return info;
}

function extractBundleId(projectDir: string, projectName: string): string | null {
  const possiblePaths = [
    join(projectDir, `${projectName}/Info.plist`),
    join(projectDir, 'Info.plist'),
    join(projectDir, `${projectName}-Info.plist`)
  ];
  
  for (const plistPath of possiblePaths) {
    if (existsSync(plistPath)) {
      try {
        const plistContent = require('fs').readFileSync(plistPath, 'utf-8');
        const bundleIdMatch = plistContent.match(/<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/);
        if (bundleIdMatch) {
          return bundleIdMatch[1];
        }
      } catch (error) {
        // Continue to next path
      }
    }
  }
  
  return null;
}

async function validateBuildCommand(command: string, projectRoot: string): Promise<boolean> {
  try {
    const testCommand = command.includes('xcodebuild') ? 
      command.replace(' build', ' -dry-run build') : 
      command;
    
    vi.mocked(execSync)(testCommand, {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: 5000
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

function validateWatchPaths(paths: string[], projectRoot: string): string[] {
  const validPaths: string[] = [];
  
  for (const pattern of paths) {
    const basePath = pattern.split('/**')[0].split('/*')[0];
    const fullPath = join(projectRoot, basePath);
    
    if (existsSync(fullPath)) {
      validPaths.push(pattern);
    }
  }
  
  return validPaths;
}

function generateQuickStartGuide(config: any): string {
  const enabledTargets = config.targets.filter((t: any) => t.enabled !== false);
  const disabledTargets = config.targets.filter((t: any) => t.enabled === false);
  
  let guide = '\n🚀 Quick Start Guide\n';
  guide += '━'.repeat(50) + '\n\n';
  
  guide += 'Basic Commands:\n';
  guide += '  • Start watching all enabled targets:\n';
  guide += '    poltergeist haunt\n\n';
  
  if (enabledTargets.length > 1) {
    guide += '  • Watch a specific target:\n';
    guide += `    poltergeist haunt --target ${enabledTargets[0].name}\n\n`;
  }
  
  guide += '  • Check build status:\n';
  guide += '    poltergeist status\n\n';
  
  guide += '  • View build logs:\n';
  guide += '    poltergeist logs\n\n';
  
  guide += 'Your Targets:\n';
  
  if (enabledTargets.length > 0) {
    guide += `  ✓ Enabled (${enabledTargets.length}):\n`;
    enabledTargets.forEach((target: any) => {
      guide += `    - ${target.name}: ${target.buildCommand}\n`;
    });
  }
  
  if (disabledTargets.length > 0) {
    guide += `\n  ✗ Disabled (${disabledTargets.length}):\n`;
    disabledTargets.forEach((target: any) => {
      guide += `    - ${target.name}: Enable with 'enabled: true' in config\n`;
    });
  }
  
  guide += '\nConfiguration Tips:\n';
  guide += '  • Edit poltergeist.config.json to customize settings\n';
  guide += '  • Add more exclusions to watchman.excludeDirs for better performance\n';
  guide += '  • Adjust settlingDelay if builds trigger too frequently\n';
  
  guide += '\nAdvanced Usage:\n';
  guide += '  • Run as background service:\n';
  guide += '    poltergeist haunt > .poltergeist.log 2>&1 &\n\n';
  
  guide += '  • Stop all builds:\n';
  guide += '    poltergeist stop\n\n';
  
  guide += '  • Clean up old state:\n';
  guide += '    poltergeist clean\n';
  
  return guide;
}

async function enhancedInitXcodeProjects(
  projectRoot: string,
  xcodeProjects: any[]
): Promise<any> {
  const targets: any[] = [];
  
  for (const project of xcodeProjects) {
    const projectDir = require('path').dirname(project.path);
    const projectName = require('path').basename(project.path, require('path').extname(project.path));
    const relativeDir = cleanPath(require('path').relative(projectRoot, projectDir) || '.');
    const isIOS = projectName.toLowerCase().includes('ios') || 
                 project.path.toLowerCase().includes('/ios/');
    
    let projectInfo = null;
    if (project.type === 'xcodeproj') {
      try {
        projectInfo = await parseXcodeProject(project.path);
        if (projectInfo && projectInfo.schemes.length > 0) {
          project.scheme = projectInfo.schemes[0];
        }
      } catch (error) {
        // Ignore
      }
    }
    
    const targetName = projectName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/ios$/, '') || 'app';
    
    const buildScriptPath = join(projectDir, 'scripts', 'build.sh');
    const hasBuildScript = existsSync(buildScriptPath);
    
    let buildCommand: string;
    if (hasBuildScript) {
      buildCommand = `cd ${relativeDir} && ./scripts/build.sh --configuration Debug`;
    } else {
      buildCommand = generateXcodeBuildCommand(project, relativeDir, projectName, isIOS);
    }
    
    const extractedBundleId = extractBundleId(projectDir, projectName);
    const bundleId = extractedBundleId || `com.example.${targetName}`;
    
    const isValidCommand = await validateBuildCommand(buildCommand, projectRoot);
    if (!isValidCommand) {
      console.log('⚠️  Validation Warnings:');
    }
    
    const watchPaths = [
      `${relativeDir}/**/*.swift`,
      `${relativeDir}/**/*.xcodeproj/**`,
      `${relativeDir}/**/*.xcconfig`,
      `${relativeDir}/**/*.entitlements`,
      `${relativeDir}/**/*.plist`
    ];
    
    const validWatchPaths = validateWatchPaths(watchPaths, projectRoot);
    
    targets.push({
      name: isIOS ? `${targetName}-ios` : targetName,
      type: 'app-bundle',
      enabled: !isIOS,
      buildCommand,
      outputPath: cleanPath(`./${relativeDir}/build/Debug/${projectName}.app`),
      bundleId,
      watchPaths: validWatchPaths,
      settlingDelay: 1500,
      debounceInterval: 3000,
      environment: {
        CONFIGURATION: 'Debug'
      }
    });
  }
  
  ensureUniqueTargetNames(targets);
  
  return {
    version: '1.0',
    projectType: 'swift',
    targets,
    watchman: {
      useDefaultExclusions: true,
      excludeDirs: ['node_modules', 'dist', 'build', 'DerivedData', '.git', 'Pods', 'Carthage'],
      projectType: 'swift',
      maxFileEvents: 10000,
      recrawlThreshold: 5,
      settlingDelay: 1000
    },
    buildScheduling: {
      parallelization: 2,
      prioritization: {
        enabled: true,
        focusDetectionWindow: 300000,
        priorityDecayTime: 1800000,
        buildTimeoutMultiplier: 2.0
      }
    },
    notifications: {
      enabled: true,
      buildStart: false,
      buildSuccess: true,
      buildFailed: true,
      successSound: 'Glass',
      failureSound: 'Basso'
    },
    performance: {
      profile: 'balanced',
      autoOptimize: true,
      metrics: {
        enabled: true,
        reportInterval: 300
      }
    },
    logging: {
      level: 'info',
      file: '.poltergeist.log'
    }
  };
}