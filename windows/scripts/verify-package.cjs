'use strict';
const fs=require('node:fs');const path=require('node:path');const {sha256,assertPE,walk,verifySprites,verifyZip}=require('./package-lib.cjs');
async function verify(directory){
 const asar=await import('@electron/asar');const pkg=require('../package.json');const archive=path.join(directory,'resources','app.asar');
 assertPE(fs.readFileSync(path.join(directory,'ChihayaPet.exe')));
 if(fs.readFileSync(path.join(directory,'version'),'utf8').trim()!==pkg.buildConfig.electronVersion)throw Error('Wrong Electron runtime version');
 for(const file of ['chrome_100_percent.pak','chrome_200_percent.pak','icudtl.dat','resources.pak','v8_context_snapshot.bin','ffmpeg.dll','d3dcompiler_47.dll','dxcompiler.dll','dxil.dll','vk_swiftshader.dll','vulkan-1.dll','locales/zh-CN.pak','LICENSE','LICENSES.chromium.html'])if(!fs.existsSync(path.join(directory,file)))throw Error(`Missing runtime ${file}`);
 if(fs.existsSync(path.join(directory,'resources/default_app.asar')))throw Error('Default Electron app still bundled');
 const entries=asar.listPackage(archive).map(p=>p.replaceAll('\\','/').replace(/^\//,''));
 const allowed=new Set(['package.json']);
 const appRoot=path.resolve(__dirname,'..');
 for(const file of walk(path.join(appRoot,'src')))allowed.add(path.relative(appRoot,file).split(path.sep).join('/'));
 const sourceRoot=path.resolve(appRoot,'../ChihayaPet/Resources/CharacterSprites');const manifest=verifySprites(sourceRoot);
 for(const file of Object.keys(manifest.assetHashes))allowed.add('resources/CharacterSprites/'+file);
 for(const file of ['resources/CharacterSprites/manifest.json','resources/fansitekit-notice-original.txt','resources/tray.png'])allowed.add(file);
 const files=entries.filter(entry=>!asar.statFile(archive,entry).files);
 if(files.length!==allowed.size||files.some(file=>!allowed.has(file)))throw Error('Application archive does not match resource whitelist');
 for(const file of files){
  if(/(^|\/)(config\.json|persona\.md|Music|node_modules|OriginalCharacterSprites|\.env)(\/|$)/i.test(file))throw Error(`Private/unwanted entry ${file}`);
  if(file.startsWith('src/')){if(!asar.extractFile(archive,file).equals(fs.readFileSync(path.join(appRoot,file))))throw Error(`Stale source in package ${file}`);}
 }
 for(const [file,hash] of Object.entries(manifest.assetHashes))if(sha256(asar.extractFile(archive,'resources/CharacterSprites/'+file))!==hash)throw Error(`Packaged asset mismatch ${file}`);
 const metadata=JSON.parse(asar.extractFile(archive,'package.json'));
 if(metadata.main!=='src/main.cjs'||metadata.version!==pkg.version||metadata.dependencies)throw Error('Wrong packaged application metadata');
 const packagedManifest=asar.extractFile(archive,'resources/CharacterSprites/manifest.json');
 if(!packagedManifest.equals(fs.readFileSync(path.join(sourceRoot,'manifest.json'))))throw Error('Stale manifest');
 if(!asar.extractFile(archive,'resources/fansitekit-notice-original.txt').equals(fs.readFileSync(path.resolve(sourceRoot,'../fansitekit-notice-original.txt'))))throw Error('Missing source notice');
 console.log(`Verified Windows x64 PE, Electron runtime, ${files.length} allowlisted application files, 326 sprite hashes; no personal data.`);
 return {files:files.length,asarSHA256:sha256(fs.readFileSync(archive)),exeSHA256:sha256(fs.readFileSync(path.join(directory,'ChihayaPet.exe')))};
}
if(require.main===module)(async()=>{
 const directory=path.resolve(process.argv[2]||path.join(__dirname,'../dist/ChihayaPet-win32-x64'));
 await verify(directory);
 const zip=path.join(path.dirname(directory),`ChihayaPet-${require('../package.json').version}-win11-x64.zip`);
 if(fs.existsSync(zip))await verifyZip(zip,directory);
})().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verify};
