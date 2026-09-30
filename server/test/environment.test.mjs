import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadServerEnvironment} from '../environment.mjs';
test('env loader uses explicit module-relative default and preserves process overrides',()=>{
 const dir=mkdtempSync(join(tmpdir(),'signbridge-env-test-')),file=join(dir,'test.env');
 try{
  writeFileSync(file,'SIGNBRIDGE_ENV_TEST=file\nSIGNBRIDGE_SECOND_TEST=loaded\n');
  const moduleUrl=new URL('../environment.mjs',import.meta.url).href;
  const result=execFileSync(process.execPath,['--input-type=module','-e',`import {loadServerEnvironment} from ${JSON.stringify(moduleUrl)}; loadServerEnvironment(process.argv[1]); console.log(JSON.stringify([process.env.SIGNBRIDGE_ENV_TEST,process.env.SIGNBRIDGE_SECOND_TEST]));`,file],{cwd:tmpdir(),env:{...process.env,SIGNBRIDGE_ENV_TEST:'process'},encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),['process','loaded']);
  assert.equal(loadServerEnvironment(join(dir,'missing.env')),false);
 }finally{unlinkSync(file);rmdirSync(dir);}
});
