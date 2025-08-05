// Enhanced CLI init implementation for Poltergeist
// This file contains improvements for items 1, 2, 6, and Quick Start Guide

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, extname, relative } from 'path';
import type { PoltergeistConfig } from '../types';

// Fix 1: Deduplication mechanism for target names
function ensureUniqueTargetNames(targets: any[]): void {
  const nameCounts = new Map<string, number>();
  
  targets.forEach((target, index) => {
    const baseName = target.name;
    const count = nameCounts.get(baseName) || 0;
    
    if (count > 0) {
      // Add suffix to make it unique
      target.name = `${baseName}-${count + 1}`;
    }
    
    nameCounts.set(baseName, count + 1);
  });
}

// Fix 1: Detect workspace vs project and use correct build command
function generateXcodeBuildCommand(
  project: { path: string; type: 'xcodeproj' | 'xcworkspace'; scheme?: string },
  relativeDir: string,
  projectName: string,
  isIOS: boolean
): string {
  const flag = project.type === 'xcworkspace' ? '-workspace' : '-project';
  const sdk = isIOS ? '-sdk iphonesimulator ' : '';
  const scheme = project.scheme || projectName;
  
  return `cd ${relativeDir} && xcodebuild ${flag} ${basename(project.path)} -scheme ${scheme} ${sdk}-configuration Debug build`;
}

// Fix 1: Clean up path components
function cleanPath(path: string): string {
  // Remove redundant ./ and handle empty paths
  return path.replace(/^\.\/\.\//, './').replace(/^\.\/\.$/, '.');
}

// Enhancement 2: Parse .xcodeproj file to extract project information
interface XcodeProjectInfo {
  schemes: string[];
  targets: Array<{ name: string; type: string; bundleId?: string }>;
  configurations: string[];
}

async function parseXcodeProject(projectPath: string): Promise<XcodeProjectInfo | null> {
  try {
    // Use xcodebuild to list schemes and targets
    const listOutput = execSync(
      `xcodebuild -list -project ${projectPath} 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    
    const info: XcodeProjectInfo = {
      schemes: [],
      targets: [],
      configurations: []
    };
    
    // Parse the output
    const lines = listOutput.split('\n');
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
  } catch (error) {
    // If parsing fails, return null
    return null;
  }
}

// Enhancement 2: Detect actual bundle ID from Info.plist
function extractBundleId(projectDir: string, projectName: string): string | null {
  const possiblePaths = [
    join(projectDir, `${projectName}/Info.plist`),
    join(projectDir, 'Info.plist'),
    join(projectDir, `${projectName}-Info.plist`)
  ];
  
  for (const plistPath of possiblePaths) {
    if (existsSync(plistPath)) {
      try {
        const plistContent = readFileSync(plistPath, 'utf-8');
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

// Enhancement 6: Validate build command
async function validateBuildCommand(command: string, projectRoot: string): Promise<boolean> {
  try {
    // Test with dry-run flag if available
    const testCommand = command.includes('xcodebuild') ? 
      command.replace(' build', ' -dry-run build') : 
      command;
    
    execSync(testCommand, {
      cwd: projectRoot,
      stdio: 'ignore',
      timeout: 5000
    });
    
    return true;
  } catch (error) {
    return false;
  }
}

// Enhancement 6: Validate paths exist
function validateWatchPaths(paths: string[], projectRoot: string): string[] {
  const validPaths: string[] = [];
  const warnings: string[] = [];
  
  for (const pattern of paths) {
    // Extract base path from pattern
    const basePath = pattern.split('/**')[0].split('/*')[0];
    const fullPath = join(projectRoot, basePath);
    
    if (existsSync(fullPath)) {
      validPaths.push(pattern);
    } else {
      warnings.push(`Watch path does not exist: ${pattern}`);
    }
  }
  
  return validPaths;
}

// Quick Start Guide generator
function generateQuickStartGuide(config: PoltergeistConfig): string {
  const enabledTargets = config.targets.filter(t => t.enabled !== false);
  const disabledTargets = config.targets.filter(t => t.enabled === false);
  
  let guide = '\n' + chalk.bold.green('🚀 Quick Start Guide') + '\n';
  guide += chalk.gray('━'.repeat(50)) + '\n\n';
  
  // Basic commands
  guide += chalk.bold('Basic Commands:\n');
  guide += chalk.gray('  • Start watching all enabled targets:\n');
  guide += chalk.cyan('    poltergeist haunt\n\n');
  
  if (enabledTargets.length > 1) {
    guide += chalk.gray('  • Watch a specific target:\n');
    guide += chalk.cyan(`    poltergeist haunt --target ${enabledTargets[0].name}\n\n`);
  }
  
  guide += chalk.gray('  • Check build status:\n');
  guide += chalk.cyan('    poltergeist status\n\n');
  
  guide += chalk.gray('  • View build logs:\n');
  guide += chalk.cyan('    poltergeist logs\n\n');
  
  // Target information
  guide += chalk.bold('Your Targets:\n');
  
  if (enabledTargets.length > 0) {
    guide += chalk.green(`  ✓ Enabled (${enabledTargets.length}):\n`);
    enabledTargets.forEach(target => {
      guide += chalk.gray(`    - ${target.name}: ${target.buildCommand}\n`);
    });
  }
  
  if (disabledTargets.length > 0) {
    guide += chalk.gray(`\n  ✗ Disabled (${disabledTargets.length}):\n`);
    disabledTargets.forEach(target => {
      guide += chalk.gray(`    - ${target.name}: Enable with 'enabled: true' in config\n`);
    });
  }
  
  // Configuration tips
  guide += '\n' + chalk.bold('Configuration Tips:\n');
  guide += chalk.gray('  • Edit poltergeist.config.json to customize settings\n');
  guide += chalk.gray('  • Add more exclusions to watchman.excludeDirs for better performance\n');
  guide += chalk.gray('  • Adjust settlingDelay if builds trigger too frequently\n');
  
  // Advanced usage
  guide += '\n' + chalk.bold('Advanced Usage:\n');
  guide += chalk.gray('  • Run as background service:\n');
  guide += chalk.cyan('    poltergeist haunt > .poltergeist.log 2>&1 &\n\n');
  
  guide += chalk.gray('  • Stop all builds:\n');
  guide += chalk.cyan('    poltergeist stop\n\n');
  
  guide += chalk.gray('  • Clean up old state:\n');
  guide += chalk.cyan('    poltergeist clean\n');
  
  return guide;
}

// Main enhanced init function
export async function enhancedInitXcodeProjects(
  projectRoot: string,
  xcodeProjects: Array<{ path: string; type: 'xcodeproj' | 'xcworkspace'; scheme?: string }>
): Promise<PoltergeistConfig> {
  console.log(chalk.green(`✅ Found ${xcodeProjects.length} Xcode project(s)`));
  
  const targets: any[] = [];
  const validationWarnings: string[] = [];
  
  for (const project of xcodeProjects) {
    const projectDir = dirname(project.path);
    const projectName = basename(project.path, extname(project.path));
    const relativeDir = cleanPath(relative(projectRoot, projectDir) || '.');
    const isIOS = projectName.toLowerCase().includes('ios') || 
                 project.path.toLowerCase().includes('/ios/');
    
    // Parse project info
    let projectInfo: XcodeProjectInfo | null = null;
    if (project.type === 'xcodeproj') {
      projectInfo = await parseXcodeProject(project.path);
      if (projectInfo && projectInfo.schemes.length > 0) {
        project.scheme = projectInfo.schemes[0]; // Use first available scheme
      }
    }
    
    // Create a sanitized target name
    const targetName = projectName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/ios$/, '') || 'app';
    
    // Check for build script
    const buildScriptPath = join(projectDir, 'scripts', 'build.sh');
    const hasBuildScript = existsSync(buildScriptPath);
    
    // Generate build command
    let buildCommand: string;
    if (hasBuildScript) {
      buildCommand = `cd ${relativeDir} && ./scripts/build.sh --configuration Debug`;
    } else {
      buildCommand = generateXcodeBuildCommand(project, relativeDir, projectName, isIOS);
    }
    
    // Extract or guess bundle ID
    const extractedBundleId = extractBundleId(projectDir, projectName);
    const bundleId = extractedBundleId || guessBundleId(projectName, project.path);
    
    // Validate build command
    const isValidCommand = await validateBuildCommand(buildCommand, projectRoot);
    if (!isValidCommand) {
      validationWarnings.push(`Warning: Build command may not be valid for ${projectName}`);
    }
    
    // Define watch paths
    const watchPaths = [
      `${relativeDir}/**/*.swift`,
      `${relativeDir}/**/*.xcodeproj/**`,
      `${relativeDir}/**/*.xcconfig`,
      `${relativeDir}/**/*.entitlements`,
      `${relativeDir}/**/*.plist`
    ];
    
    // Validate watch paths
    const validWatchPaths = validateWatchPaths(watchPaths, projectRoot);
    if (validWatchPaths.length < watchPaths.length) {
      validationWarnings.push(`Some watch paths don't exist for ${projectName}`);
    }
    
    targets.push({
      name: isIOS ? `${targetName}-ios` : targetName,
      type: 'app-bundle',
      enabled: !isIOS, // Enable macOS by default, disable iOS
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
  
  // Ensure unique target names
  ensureUniqueTargetNames(targets);
  
  // Show validation warnings
  if (validationWarnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Validation Warnings:'));
    validationWarnings.forEach(warning => {
      console.log(chalk.yellow(`   - ${warning}`));
    });
  }
  
  const config: PoltergeistConfig = {
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
  
  return config;
}

// Import chalk for styling
declare const chalk: any;