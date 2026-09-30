#!/usr/bin/env python3
"""Regenerate the native Xcode project without external dependencies."""
from pathlib import Path
import hashlib, json
root = Path(__file__).resolve().parent.parent
objects = {}
def uid(s): return hashlib.sha1(s.encode()).hexdigest()[:24].upper()
def obj(key, body):
    ident = uid(key); objects[ident] = body; return ident
def q(s): return json.dumps(str(s), ensure_ascii=False)
def arr(xs): return '(' + ', '.join(xs) + ',)' if xs else '()'
app_product=obj('product.app','isa = PBXFileReference; explicitFileType = wrapper.application; path = ChihayaPet.app; sourceTree = BUILT_PRODUCTS_DIR;')
test_product=obj('product.tests','isa = PBXFileReference; explicitFileType = wrapper.cfbundle; path = ChihayaPetTests.xctest; sourceTree = BUILT_PRODUCTS_DIR;')
app_sources=[]; test_sources=[]; refs=[]
for path in sorted(root.glob('ChihayaPet/**/*.swift')) + sorted(root.glob('ChihayaPetTests/*.swift')):
    rel=path.relative_to(root).as_posix()
    ref=obj(rel,'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = '+q(rel)+'; sourceTree = SOURCE_ROOT;')
    refs.append(ref)
    build=obj('build.'+rel,'isa = PBXBuildFile; fileRef = '+ref+';')
    (test_sources if rel.startswith('ChihayaPetTests/') else app_sources).append(build)
resources=[]
resource_specs=[('ChihayaPet/Resources/Assets.xcassets','folder.assetcatalog'),('ChihayaPet/Resources/fansitekit-notice-original.txt','text'),('ChihayaPet/Resources/CharacterSprites','folder')]
expansion_rel='ChihayaPet/Resources/CharacterExpansion'
if (root/expansion_rel).is_dir():
    resource_specs.append((expansion_rel,'folder'))
for rel, typ in resource_specs:
    ref=obj(rel,'isa = PBXFileReference; lastKnownFileType = '+typ+'; path = '+q(rel)+'; sourceTree = SOURCE_ROOT;'); refs.append(ref)
    resources.append(obj('build.'+rel,'isa = PBXBuildFile; fileRef = '+ref+';'))
products=obj('products','isa = PBXGroup; children = '+arr([app_product,test_product])+'; name = Products; sourceTree = "<group>";')
group=obj('mainGroup','isa = PBXGroup; children = '+arr(refs+[products])+'; sourceTree = "<group>";')
def configs(name, extra):
    configs=[]
    for conf in ['Debug','Release']:
        settings={'ARCHS':'arm64','SDKROOT':'macosx','MACOSX_DEPLOYMENT_TARGET':'26.0','SWIFT_VERSION':'5.0','CLANG_ENABLE_MODULES':'YES','SWIFT_OPTIMIZATION_LEVEL':'-Onone' if conf=='Debug' else '-O','DEBUG_INFORMATION_FORMAT':'dwarf' if conf=='Debug' else 'dwarf-with-dsym','ENABLE_TESTABILITY':'YES','CODE_SIGN_IDENTITY':'-','CODE_SIGN_STYLE':'Manual','SWIFT_ACTIVE_COMPILATION_CONDITIONS':'DEBUG' if conf=='Debug' else '',**extra}
        configs.append(obj(name+'.'+conf,'isa = XCBuildConfiguration; buildSettings = {'+''.join(k+' = '+q(v)+';' for k,v in settings.items())+'}; name = '+conf+';'))
    return obj(name+'.configs','isa = XCConfigurationList; buildConfigurations = '+arr(configs)+'; defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
projconfigs=configs('project',{})
appconfigs=configs('app',{'PRODUCT_BUNDLE_IDENTIFIER':'local.ChihayaPet','PRODUCT_NAME':'$(TARGET_NAME)','INFOPLIST_FILE':'ChihayaPet/Info.plist','GENERATE_INFOPLIST_FILE':'NO','LD_RUNPATH_SEARCH_PATHS':'$(inherited) @executable_path/../Frameworks','ENABLE_APP_SANDBOX':'NO'})
testconfigs=configs('tests',{'PRODUCT_BUNDLE_IDENTIFIER':'local.ChihayaPetTests','PRODUCT_NAME':'$(TARGET_NAME)','GENERATE_INFOPLIST_FILE':'YES','TEST_HOST':'$(BUILT_PRODUCTS_DIR)/ChihayaPet.app/Contents/MacOS/ChihayaPet','BUNDLE_LOADER':'$(TEST_HOST)','LD_RUNPATH_SEARCH_PATHS':'$(inherited) @executable_path/../Frameworks @loader_path/../Frameworks'})
def phase(name,isa,files): return obj(name,'isa = '+isa+'; buildActionMask = 2147483647; files = '+arr(files)+'; runOnlyForDeploymentPostprocessing = 0;')
app_id=uid('appTarget'); project_id=uid('project')
proxy=obj('proxy','isa = PBXContainerItemProxy; containerPortal = '+project_id+'; proxyType = 1; remoteGlobalIDString = '+app_id+'; remoteInfo = ChihayaPet;')
dep=obj('dep','isa = PBXTargetDependency; target = '+app_id+'; targetProxy = '+proxy+';')
for name,prod,conf,sources,res,deps in [('app',app_product,appconfigs,app_sources,resources,[]),('test',test_product,testconfigs,test_sources,[],[dep])]:
    phases=[phase(name+'.sources','PBXSourcesBuildPhase',sources),phase(name+'.frameworks','PBXFrameworksBuildPhase',[]),phase(name+'.resources','PBXResourcesBuildPhase',res)]
    if name == 'app':
        phases.insert(0, obj('validate.resources', 'isa = PBXShellScriptBuildPhase; buildActionMask = 2147483647; files = (); inputPaths = (); outputPaths = (); runOnlyForDeploymentPostprocessing = 0; alwaysOutOfDate = 1; name = '+q('Validate character resources')+'; shellPath = /bin/sh; shellScript = '+q('python3 \"$SRCROOT/scripts/verify_resources.py\" --source-only')+';'))
    obj('appTarget' if name=='app' else 'testTarget','isa = PBXNativeTarget; buildConfigurationList = '+conf+'; buildPhases = '+arr(phases)+'; buildRules = (); dependencies = '+arr(deps)+'; name = '+('ChihayaPet' if name=='app' else 'ChihayaPetTests')+'; productName = '+('ChihayaPet' if name=='app' else 'ChihayaPetTests')+'; productReference = '+prod+'; productType = '+q('com.apple.product-type.application' if name=='app' else 'com.apple.product-type.bundle.unit-test')+';')
obj('project','isa = PBXProject; attributes = {LastUpgradeCheck = 2660;}; buildConfigurationList = '+projconfigs+'; compatibilityVersion = "Xcode 14.0"; developmentRegion = zh-Hans; hasScannedForEncodings = 0; knownRegions = ("zh-Hans", en, Base); mainGroup = '+group+'; productRefGroup = '+products+'; projectDirPath = ""; projectRoot = ""; targets = '+arr([app_id,uid('testTarget')])+';')
project=root/'ChihayaPet.xcodeproj'; project.mkdir(exist_ok=True)
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+''.join(k+' = {'+v+'};\n' for k,v in objects.items())+'}; rootObject = '+project_id+';}\n')
schemes=project/'xcshareddata/xcschemes'; schemes.mkdir(parents=True,exist_ok=True)
def reference(ident,name): return f'<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ident}" BuildableName="{name}" BlueprintName="{name.split(".")[0]}" ReferencedContainer="container:ChihayaPet.xcodeproj"/>'
a=reference(app_id,'ChihayaPet.app'); t=reference(uid('testTarget'),'ChihayaPetTests.xctest')
(schemes/'ChihayaPet.xcscheme').write_text(f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2660" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES">{a}</BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv="YES"><EnvironmentVariables><EnvironmentVariable key="CHIHAYA_TESTING" value="1" isEnabled="YES"/></EnvironmentVariables><Testables><TestableReference skipped="NO">{t}</TestableReference></Testables></TestAction><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{a}</BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0">{a}</BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>''')
print('Generated ChihayaPet.xcodeproj')
