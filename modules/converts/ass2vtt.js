//get default value only
function ass2vtt(assText){
  if(!assText) throw `assText is empty!`;
  const lines = assText.split(/\r?\n/);

  //getSubtitle
  //.ssa
  //Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  //Dialogue: Marked=0,0:00:19.10,0:00:21.10,NORMAL,00,0000,0000,0000,,"La lámpara del cuerpo es el ojo.
  //.ass
  //Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
  //Dialogue: 0,0:00:01.92,0:00:05.76,Narration,Narrator,0000,0000,0000,,،العالم مليء بالكثير من الألعاب
  const re_ass = /dialogue: (?:marked=)?(\d),(\d+:\d\d:\d\d.\d\d),(\d+:\d\d:\d\d.\d\d),.*?,.*?,.*?,.*?,.*?,(.*?),(.*)$/i
  const subs = [];
  for(const line of lines) {
    if(re_ass.test(line)) {
      const r = re_ass.exec(line);
      if(!r) throw `bad line: ${line}`;
      let layer = r[1], start = r[2], end = r[3] , effect = r[4], text = r[5];

      if(!effect && layer == '0') {
        const re_newLine = /\\N+/g;
        const re_text_tag = /\{.*?\}/g;
        const re_hardspace = /\\h/g;

        text = text.replace(re_newLine, '\n');
        text = text.replace(re_text_tag, '');
        text = text.replace(re_hardspace, '&nbsp;');
        subs.push({
          start: start,
          end: end,
          text: text
        });
      }
    }
  }
  if(subs.length) {
    const resort = resortSubs(subs);
    for(const index in resort) {
      resort[index] = index + '\n' +
        '0' + resort[index].start + '0' + ' --> ' + '0' + resort[index].end + '0' + '\n' +
        resort[index].text + '\n';
    }
    resort.unshift('WEBVTT\n');
    return resort.join('\n');
  }
  else {
    throw `.ssa/.ass convert failed`;
  }
}

function resortSubs(subs){
  const resort = [];
  let lastEnd = {
    endHour: 0,
    endMin: 0,
    endSecond: 0,
    endMillisecond: 0
  };
  do {
    const sub = subs.shift();
    const starts = sub.start.split(':');
    const startTime = {
      startHour: starts[0],
      startMin: starts[1],
      startSecond: starts[2].split('.')[0],
      startMillisecond: starts[2].split('.')[1]
    };
    const ends = sub.end.split(':');
    const endTime = {
      endHour: ends[0],
      endMin: ends[1],
      endSecond: ends[2].split('.')[0],
      endMillisecond: ends[2].split('.')[1]
    };
    sub.startTime = startTime;
    sub.endTime = endTime;

    if(toTime(startTime) >= toTime(lastEnd)) {
      //add new line
      resort.push(sub);
      lastEnd = endTime;
    } else {
      //try find the dublicate, replace text
      const findIndex = resort.findIndex(x =>
        JSON.stringify(x.startTime) === JSON.stringify(startTime) &&
        JSON.stringify(x.endTime) === JSON.stringify(endTime)
      );
      if(findIndex !== -1) {
        resort[findIndex].text = sub.text;
      } else { //if not duplicate, insert sub!
        const findIndex = [...resort].reverse().findIndex(x => 
          toTime(startTime) >= toTime(x.endTime)
        );
        if(findIndex !== -1) resort.splice((resort.length - findIndex), 0, sub); //insert to middle
        else resort.unshift(sub); //insert to first
      }
    }
  } while (subs.length);

  return resort;
}

function toTime(Time) {
  //1s = 100ms this sub =))
  Time = Object.values(Time).map(Number);
  return (Time[3] + Time[2] * 100 + Time[1] * 60 * 100 + Time[0] * 60 * 60 * 100);
}

module.exports = ass2vtt

