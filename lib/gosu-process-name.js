/**
 * List running process name in windows using native calls. See more here:
 * https://docs.microsoft.com/en-us/windows/win32/psapi/enumerating-all-processes
 */

'use strict';

var ffi = require('ffi');
var ref = require('ref');

const ArrayType = require('ref-array');
const DWord = ref.types.ulong;
const Bool = ref.types.byte;
const Handle = ref.refType(ref.types.void);
const HandleArray = ArrayType(Handle);
const HandlePtr = ref.refType(Handle);

const DWordArray = ArrayType(DWord);
const DWordPtr = ref.refType(DWord);

const QUERY_SIZE = 2048;
const MAX_PROCESS_NAME_LENGTH = 32;

const PROCESS_QUERY_INFORMATION = 0x0400;
const PROCESS_VM_READ = 0x0010;

var psapi = ffi.Library('psapi', {
  'EnumProcesses': [ref.types.void, [DWordArray, DWord, DWordPtr]],
  'EnumProcessModules': [Bool, [Handle, HandleArray, DWord, DWordPtr]]
});

var kernel32 = ffi.Library('kernel32', {
  'OpenProcess': [Handle, [DWord, ref.types.byte, DWord]],
  'K32GetModuleBaseNameA': [DWord, [Handle, Handle, ref.types.CString, DWord]]
});


function _retrieveNProcesses(n) {
  let cbNeeded = ref.alloc(DWord);
  let aProcesses = new DWordArray(n);
  psapi.EnumProcesses(aProcesses, DWord.size * n, cbNeeded);
  return [aProcesses, cbNeeded.deref() / DWord.size];
}


function getProcessIDList() {
  let expectedProcessNum = QUERY_SIZE / 2;
  let processNum = 0;
  let aProcesses = [];
  /**
   * There is no indication given when the buffer is too small to store all
   * process identifiers, that's why we try until `expectedProcessNum` is
   * equal to returned value `processNum` (buffer is full).
   */
  do {
    expectedProcessNum *= 2;
    [aProcesses, processNum] = _retrieveNProcesses(expectedProcessNum);
  } while (processNum === expectedProcessNum)
  aProcesses.length = processNum;
  return aProcesses.toArray();
}


function getProcessName(pid) {
  let hProcess = kernel32.OpenProcess(
    PROCESS_QUERY_INFORMATION | PROCESS_VM_READ,
    0,
    pid
  );

  if (hProcess) {
    /**
     * `EnumProcessModules` returning all `.dll` libs `hProcess` linked to.
     * But we need only first value, which is just executable name.
     */
    let hMod = new HandleArray(1);
    let cbNeeded = ref.alloc(DWord);
    let success = psapi.EnumProcessModules(
      hProcess, hMod, ref.sizeof.pointer, cbNeeded
    )

    if (success) {
      let theStringBuffer = Buffer.alloc(MAX_PROCESS_NAME_LENGTH);
      theStringBuffer.fill(0);
      kernel32.K32GetModuleBaseNameA(hProcess, hMod[0], theStringBuffer, theStringBuffer.length);
      return ref.readCString(theStringBuffer, 0);
    }
  }
}


function* processNameIterator() {
  let processIDList = getProcessIDList();
  for (var i = 0; i < processIDList.length; i++) {
    let name = getProcessName(processIDList[i]);
    if (name) {
      yield name;
    }
  }
}


function getProcessNameList() {
  return [...processNameIterator()];
}


function checkProcessIsRunning(processName) {
  for (let runningProcessName of processNameIterator()) {
    if (runningProcessName === processName) {
      return true;
    }
  }
  return false;
}

module.exports = {
  checkProcessIsRunning,
  getProcessNameList,
  processNameIterator,
}
