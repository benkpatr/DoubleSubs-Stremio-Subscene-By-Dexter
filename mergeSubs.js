function mergeSubs(subs1, subs2) {
  let mergedSubs = "";

  function writeBlock(i, start, end, text) {
    mergedSubs +=
      i + "\n" + start.join(":") + " --> " + end.join(":") + "\n" + text + "\n";
  }

  let block1 = validateHeader(subs1);
  let block2 = validateHeader(subs2);

  if (block1.done || block2.done) throw new Error("Empty subtitle file");

  block1 = loadBlock(subs1, block1.subsCur);
  block2 = loadBlock(subs2, block2.subsCur);
  if (block1.done || block2.done) throw new Error("Empty subtitle file");
  let i = 1;
  while (true) {
    if (block1.done && block2.done) break;
    else if (block1.done) {
      while (!block2.done) {
        writeBlock(i, block2.start, block2.end, block2.text);
        i++;
        block2 = loadBlock(subs2, block2.subsCur);
      }
    } else if (block2.done) {
      while (!block1.done) {
        writeBlock(i, block1.start, block1.end, block1.text);
        i++;
        block1 = loadBlock(subs1, block1.subsCur);
      }
    } else {
      const rel = relation(block1.start, block2.start);
      if (rel === "=") {
        const endRel = relation(block1.end, block2.end);
        if (endRel === "=") {
          writeBlock(i, block2.start, block2.end, block1.text + block2.text);
          i++;
          block1 = loadBlock(subs1, block1.subsCur);
          block2 = loadBlock(subs2, block2.subsCur);
        } else if (endRel === "<") {
          writeBlock(i, block2.start, block1.end, block1.text + block2.text);
          i++;
          block2.start = block1.end;
          if (block2.start === block2.end)
            block2 = loadBlock(subs2, block2.subsCur);
          block1 = loadBlock(subs1, block1.subsCur);
        } else if (endRel === ">") {
          writeBlock(i, block2.start, block2.end, block1.text + block2.text);
          i++;
          block1.start = block2.end;
          if (block1.start === block1.end)
            block1 = loadBlock(subs1, block1.subsCur);
          block2 = loadBlock(subs2, block2.subsCur);
        } else {
          throw new Error("Unexpected");
        }
      } else if (rel === "<") {
        const endRel = relation(block1.end, block2.start);
        if (endRel === "=") {
          writeBlock(i, block1.start, block2.start, block1.text);
          i++;
          block1 = loadBlock(subs1, block1.subsCur);
        } else if (endRel === "<") {
          writeBlock(i, block1.start, block1.end, block1.text);
          i++;
          block1 = loadBlock(subs1, block1.subsCur);
        } else if (endRel === ">") {
          writeBlock(i, block1.start, block2.start, block1.text);
          i++;
          block1.start = block2.start;
        } else {
          throw new Error("Unexpected");
        }
      } else if (rel === ">") {
        const endRel = relation(block2.end, block1.start);
        if (endRel === "=") {
          writeBlock(i, block2.start, block2.end, block2.text);
          i++;
          block2 = loadBlock(subs2, block2.subsCur);
        } else if (endRel === "<") {
          writeBlock(i, block2.start, block2.end, block2.text);
          i++;
          block2 = loadBlock(subs2, block2.subsCur);
        } else if (endRel === ">") {
          writeBlock(i, block2.start, block1.start, block2.text);
          i++;
          block2.start = block1.start;
        } else {
          throw new Error("Unexpected");
        }
      } else {
        throw new Error("Unexpected");
      }
    }
  }
  return mergedSubs;
}

function validateHeader(subs) {
  let subsCur = 0;
  while (true) {
    if (subsCur === subs.length) return { done: true };
    if (subs[subsCur] !== "") break;
    subsCur++;
  }
  if (subs[subsCur] !== "WEBVTT") throw new Error(subs[subsCur]);
  subsCur++;
  return { subsCur, done: false };
}

function loadBlock(subs, subsCur) {
  while (true) {
    if (subsCur === subs.length) return { done: true };
    if (subs[subsCur] !== "") break;
    subsCur++;
  }

  if (isNaN(subs[subsCur])) throw new Error("Wrong subtitle format");
  subsCur++;

  if (subsCur === subs.length) throw new Error("Wrong subtitle format");

  const [startString, endString] = subs[subsCur].split(" --> ");
  const start = startString.split(":");
  const end = endString.split(":");

  subsCur++;

  let text = "";
  while (true) {
    if (subsCur === subs.length || subs[subsCur] === "") break;
    text += subs[subsCur] + "\n";
    subsCur++;
  }

  if (!text) throw new Error("Wrong subtitle format");

  return { start, end, text, subsCur, done: false };
}

function relation(time1, time2) {
  const seconds1 =
    Number(time1[0]) * 3600 +
    Number(time1[1]) * 60 +
    Number(time1[2].slice(0, 2)) +
    Number(time1[2].slice(3)) / 1000;
  const seconds2 =
    Number(time2[0]) * 3600 +
    Number(time2[1]) * 60 +
    Number(time2[2].slice(0, 2)) +
    Number(time2[2].slice(3)) / 1000;
  if (Math.abs(seconds1 - seconds2) <= 0.2) return "=";
  else if (seconds1 < seconds2) return "<";
  else return ">";
}

module.exports.mergeSubs = mergeSubs;
