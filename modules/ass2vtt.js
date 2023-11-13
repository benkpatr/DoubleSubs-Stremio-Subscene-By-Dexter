//get default value only
function ass2vtt(assText){
  if(!assText) throw `assText is empty!`;
  const lines = assText.split(/\r?\n/);

  //getSubtitle
  const tag_ass = /^dialogue.*default/i;
  const re_ass = new RegExp("Dialogue:\\s\\d," + // get time and subtitle
    "(\\d+:\\d\\d:\\d\\d.\\d\\d)," +     // start time
    "(\\d+:\\d\\d:\\d\\d.\\d\\d)," +     // end time
    ".*," + //name marginL marginR marginV effect
    "(.*)$", "i");
  const subs = [];
  for(const line of lines) {
    if(tag_ass.test(line)) {
      const r = re_ass.exec(line);
      if(!r) throw `bad line: ${line}`;
      const start = r[1], end = r[2];
      let text = r[3];
      let dtext = "0" + start + "0 --> 0" + end + "0" + "\n";

      const re_newLine = /\\N/g;
      const re_text_tag = /\{.*\}/g;
      text = text.replace(re_newLine, '\n');
      text = text.replace(re_text_tag, '');
      dtext += text + '\n\n';
      subs.push(dtext);
    }
  }

  if(subs.length) {
    for(const index in subs) {
      subs[index] = index + '\n' + subs[index];
    }
    subs.unshift('WEBVTT\n');
    return subs.join('\n');
  }
  else {
    throw `.ass not match default style!`;
  }
}
module.exports = ass2vtt

