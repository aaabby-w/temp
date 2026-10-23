const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const venv = path.join(root, '.venv-atlas');
const venvPython = path.join(venv, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const run = (cmd,args) => {
  const result=spawnSync(cmd,args,{cwd:root,stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1)}
  if(result.status!==0)process.exit(result.status||1);
};
const action=process.argv[2];
if(action==='setup'){
  if(!existsSync(venvPython)) run(process.env.ATLAS_PYTHON||'python3',['-m','venv',venv]);
  run(venvPython,['-m','pip','install','-r','scripts/requirements-editing.txt']);
  console.log('制图环境已就绪。以后只需 pnpm atlas:build，不必重复安装。');
}else{
  const python=process.env.ATLAS_PYTHON||(existsSync(venvPython)?venvPython:'python3');
  const check=spawnSync(python,['-c','import shapely, svgelements, numpy'],{stdio:'ignore'});
  if(check.error||check.status!==0){console.error('缺少离线制图环境。请先安装 Python 3.11+，运行 pnpm atlas:setup。已有环境可设置 ATLAS_PYTHON。');process.exit(1)}
  if(action==='build'){
    run(python,['scripts/build-atlas.py',...process.argv.slice(3)]);
    run(python,['scripts/validate-vector-atlas.py']);
  }else if(action==='test')run(python,['scripts/test-atlas-editing.py']);
  else{console.error('Usage: atlas-tools.cjs setup|build|test');process.exit(1)}
}
