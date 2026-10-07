// Node-side verification of the kage-cpp WASM module.
const createKageModule = require('./kage-node.js');

const TEST_GLYPH = [
  '1:12:13:25:28:24:95',
  '1:2:2:25:28:81:28',
  '1:22:23:81:28:80:95',
  '1:32:32:53:28:52:95',
  '1:0:0:12:61:100:61',
  '1:2:2:24:95:80:95',
  '1:0:4:108:21:110:93',
  '1:0:0:165:23:165:46',
  '1:0:413:142:15:132:63',
  '1:2:0:132:63:175:57',
  '1:0:313:139:79:139:99',
  '1:2:2:139:99:160:99',
  '1:0:24:160:66:160:99',
  '2:0:7:30:130:27:167:11:187',
  '2:0:7:27:184:47:178:65:165',
  '2:0:5:37:110:44:133:57:152',
  '2:7:4:119:104:135:117:135:134',
  '2:32:7:84:106:77:124:62:142',
  '1:0:2:59:106:102:106',
  '3:22:5:102:106:96:165:122:165',
  '3:0:0:78:140:76:180:117:180',
  '4:0:5:164:109:131:179:177:179',
  '6:7:8:132:106:155:112:146:145:171:139',
  '7:0:7:184:14:184:88:184:146:166:171',
].join('$');

(async () => {
  const Module = await createKageModule();
  const engine = new Module.KageEngine(0); // mincho

  // 1. whole SVG at 1000px
  const svg = engine.renderSvg(TEST_GLYPH, 1000);
  console.log('SVG length:', svg.length);
  console.log('1000x1000:', svg.includes('width="1000"') && svg.includes('height="1000"'));
  console.log('viewBox kept:', svg.includes('viewBox="0 0 200 200"'));
  console.log('has cubic C:', /\sC[\d.]/.test(svg));
  const pathCount = (svg.match(/<path/g) || []).length;
  console.log('path count:', pathCount);

  // 2. per-line separated strokes
  const sep = JSON.parse(engine.renderStrokePaths(TEST_GLYPH));
  console.log('lines rendered:', sep.length, '(expect', TEST_GLYPH.split('$').length + ')');
  console.log('first line contours:', sep[0].length, sep[0][0] && sep[0][0][0].slice(0, 50));
  const emptyLines = sep.filter((l) => l.length === 0).length;
  console.log('empty lines:', emptyLines);

  // 3. merged paths for export
  const paths = JSON.parse(engine.renderPaths(TEST_GLYPH));
  console.log('merged path count:', paths.length);

  // 4. gothic font
  const g = new Module.KageEngine(1);
  const gsvg = g.renderSvg(TEST_GLYPH, 1000);
  console.log('gothic svg length:', gsvg.length);

  // 5. component references via db callback
  engine.setDbSearch((name) => {
    if (name === 'u6c35-07') return '2:7:8:33:20:59:28:69:41$2:7:8:12:68:38:75:49:89$2:7:8:14:133:54:142:50:184$2:12:7:47:143:49:138:86:58';
    if (name === 'u26c29-07') return '1:0:0:18:29:187:29$1:0:0:73:10:73:48$1:0:0:132:10:132:48$1:12:13:44:59:44:87$1:2:2:44:59:163:59$1:22:23:163:59:163:87$1:2:2:44:87:163:87$1:0:0:32:116:176:116$1:0:0:21:137:190:137$7:32:7:102:59:102:123:102:176:10:190$2:7:0:105:137:126:169:181:182';
    return '';
  });
  engine.pushBuhin('u6f22', '99:150:0:9:12:73:200:u6c35-07:0:-10:50$99:0:0:54:10:190:199:u26c29-07');
  const refSvg = engine.renderSvgByName('u6f22', 1000);
  console.log('reference svg length:', refSvg.length, '(expect >0 when callback works)');
  console.log('check u6f22:', engine.checkGlyph('u6f22'));

  // timing
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) engine.renderStrokePaths(TEST_GLYPH);
  console.log('20x renderStrokePaths:', Date.now() - t0, 'ms');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
