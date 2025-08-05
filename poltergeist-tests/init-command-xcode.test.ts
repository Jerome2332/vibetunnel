// Additional tests to add to /Users/steipete/Projects/poltergeist/test/init-command.test.ts

describe('Xcode project detection', () => {
  it('should detect single .xcodeproj', () => {
    // Create Xcode project structure
    mkdirSync('MyApp.xcodeproj', { recursive: true });
    writeFileSync('MyApp.xcodeproj/project.pbxproj', 'mock pbxproj content');
    mkdirSync('MyApp', { recursive: true });
    writeFileSync('MyApp/AppDelegate.swift', 'import UIKit');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.projectType).toBe('swift');
    expect(config.targets).toHaveLength(1);
    expect(config.targets[0].name).toBe('myapp');
    expect(config.targets[0].type).toBe('app-bundle');
    expect(config.targets[0].buildCommand).toContain('xcodebuild -project MyApp.xcodeproj');
    expect(config.targets[0].bundleId).toBe('com.example.myapp');
    expect(config.targets[0].watchPaths).toContain('./**/*.swift');
  });

  it('should detect .xcworkspace and use correct build command', () => {
    mkdirSync('MyApp.xcworkspace', { recursive: true });
    writeFileSync('MyApp.xcworkspace/contents.xcworkspacedata', 'mock workspace');
    mkdirSync('MyApp', { recursive: true });
    writeFileSync('MyApp/main.swift', 'print("Hello")');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.projectType).toBe('swift');
    expect(config.targets[0].buildCommand).toContain('xcodebuild -workspace MyApp.xcworkspace');
  });

  it('should handle iOS projects in subdirectory', () => {
    mkdirSync('ios/MyApp-iOS.xcodeproj', { recursive: true });
    writeFileSync('ios/MyApp-iOS.xcodeproj/project.pbxproj', 'mock pbxproj');
    writeFileSync('ios/Info.plist', '<plist></plist>');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.targets[0].name).toBe('myapp-ios');
    expect(config.targets[0].enabled).toBe(false); // iOS disabled by default
    expect(config.targets[0].buildCommand).toContain('cd ios &&');
    expect(config.targets[0].bundleId).toContain('.ios');
  });

  it('should detect build script and prefer it over xcodebuild', () => {
    mkdirSync('mac/MyApp.xcodeproj', { recursive: true });
    mkdirSync('mac/scripts', { recursive: true });
    writeFileSync('mac/MyApp.xcodeproj/project.pbxproj', 'mock pbxproj');
    writeFileSync('mac/scripts/build.sh', '#!/bin/bash\nxcodebuild');
    require('fs').chmodSync('mac/scripts/build.sh', '755');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.targets[0].buildCommand).toBe('cd mac && ./scripts/build.sh --configuration Debug');
    expect(config.targets[0].buildCommand).not.toContain('xcodebuild -project');
  });

  it('should handle multiple Xcode projects', () => {
    // Create multiple projects
    mkdirSync('App.xcodeproj', { recursive: true });
    writeFileSync('App.xcodeproj/project.pbxproj', 'mock');
    
    mkdirSync('ios/App-iOS.xcodeproj', { recursive: true });
    writeFileSync('ios/App-iOS.xcodeproj/project.pbxproj', 'mock');
    
    mkdirSync('mac/App-Mac.xcodeproj', { recursive: true });
    writeFileSync('mac/App-Mac.xcodeproj/project.pbxproj', 'mock');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.targets).toHaveLength(3);
    expect(config.targets.map(t => t.name)).toContain('app');
    expect(config.targets.map(t => t.name)).toContain('app-ios');
    expect(config.targets.map(t => t.name)).toContain('appmac');
    
    // iOS should be disabled
    const iosTarget = config.targets.find(t => t.name.includes('ios'));
    expect(iosTarget?.enabled).toBe(false);
    
    // Others should be enabled
    const otherTargets = config.targets.filter(t => !t.name.includes('ios'));
    otherTargets.forEach(target => {
      expect(target.enabled).toBe(true);
    });
  });

  it('should generate unique target names for duplicate project names', () => {
    mkdirSync('VibeTunnel.xcworkspace', { recursive: true });
    writeFileSync('VibeTunnel.xcworkspace/contents.xcworkspacedata', 'mock');
    
    mkdirSync('mac/VibeTunnel.xcodeproj', { recursive: true });
    writeFileSync('mac/VibeTunnel.xcodeproj/project.pbxproj', 'mock');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    // Should have unique names
    const targetNames = config.targets.map(t => t.name);
    expect(new Set(targetNames).size).toBe(targetNames.length);
  });

  it('should detect VibeTunnel-specific bundle IDs', () => {
    mkdirSync('vibetunnel/VibeTunnel.xcodeproj', { recursive: true });
    writeFileSync('vibetunnel/VibeTunnel.xcodeproj/project.pbxproj', 'mock');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    expect(config.targets[0].bundleId).toBe('sh.vibetunnel.vibetunnel');
  });

  it('should create comprehensive Swift configuration', () => {
    mkdirSync('MyApp.xcodeproj', { recursive: true });
    writeFileSync('MyApp.xcodeproj/project.pbxproj', 'mock');

    execSync(`node ${cli} init --auto`, { stdio: 'pipe' });
    
    const config: PoltergeistConfig = JSON.parse(
      readFileSync('poltergeist.config.json', 'utf-8')
    );

    // Check comprehensive config structure
    expect(config.watchman).toMatchObject({
      useDefaultExclusions: true,
      excludeDirs: expect.arrayContaining(['DerivedData', '.git', 'build']),
      projectType: 'swift',
      maxFileEvents: 10000,
      recrawlThreshold: 5,
      settlingDelay: 1000
    });

    expect(config.buildScheduling).toMatchObject({
      parallelization: 2,
      prioritization: {
        enabled: true,
        focusDetectionWindow: 300000,
        priorityDecayTime: 1800000,
        buildTimeoutMultiplier: 2.0
      }
    });

    expect(config.notifications).toMatchObject({
      enabled: true,
      buildStart: false,
      buildSuccess: true,
      buildFailed: true,
      successSound: 'Glass',
      failureSound: 'Basso'
    });

    expect(config.performance).toMatchObject({
      profile: 'balanced',
      autoOptimize: true,
      metrics: {
        enabled: true,
        reportInterval: 300
      }
    });

    expect(config.logging).toMatchObject({
      level: 'info',
      file: '.poltergeist.log'
    });
  });
});