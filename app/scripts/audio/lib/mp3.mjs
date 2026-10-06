export function duration(bytes) {
  let at = bytes.subarray(0,3).toString()==='ID3' ? 10 + ((bytes[6]&127)<<21 | (bytes[7]&127)<<14 | (bytes[8]&127)<<7 | bytes[9]&127) : 0;
  let seconds=0, frames=0;
  while(at+4<=bytes.length) {
    const h=bytes.readUInt32BE(at), version=(h>>>19)&3, layer=(h>>>17)&3, rate=(h>>>12)&15, frequency=(h>>>10)&3;
    if ((h>>>21)!==2047 || version===1 || layer!==1 || rate===0 || rate===15 || frequency===3) { at++; continue; }
    const sample=[44100,48000,32000][frequency]/(version===3?1:version===2?2:4);
    const bitrate=(version===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[rate]*1000;
    const length=Math.floor((version===3?144:72)*bitrate/sample)+((h>>>9)&1);
    if(at+length>bytes.length) break;
    seconds+=(version===3?1152:576)/sample;frames++;at+=length;
  }
  if(!frames) throw Error('No MPEG audio frames');
  return Math.round(seconds*1000)/1000;
}
