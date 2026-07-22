'use strict';

const canvas = document.getElementById('canvas');
const alt = document.getElementById('alt');

const ctx = canvas.getContext('2d');
const editContext = canvas.editContext = new EditContext();
const charHeight = 18;
const margin = 5;
ctx.font = charHeight + 'px monospace'; // use a monospace font to make hit testing easier
const charWidth = ctx.measureText('a').width;
const lineSpacing = charHeight * 1.25;

function wordBackwards(i) {
  const text = editContext.text;
  i--;
  while (i > 0 && /\s/.test(text[i]))
    i--;
  while (i > 0 && !/\s/.test(text[i]))
    i--;
  if (i > 0 && /\s/.test(text[i])) {
    return i + 1;
  }
  return i;
}

function wordForwards(i) {
  const text = editContext.text;
  while (i < text.length && /\s/.test(text[i]))
    i++;
  while (i < text.length && !/\s/.test(text[i]))
    i++;
  return i;
}

// Get index of text at coordinate (x, y)
function hitTest(x, y) {
  x -= margin;
  y -= margin;
  const lineIndex = Math.floor(y / lineSpacing);
  const {text} = editContext;
  const lines = text.split('\n');
  const line = lines[lineIndex];
  if (!line) return text.length;
  let lineOffset = 0;
  for (let i = 0; i < lineIndex; i++) {
    lineOffset += lines[i].length + 1;
  }
  return lineOffset + Math.min(Math.round(x / charWidth), line.length);
}


function charIndexToRowColumn(i) {
  const {text} = editContext;
  let startOfLine = i;
  while (startOfLine > 0 && text[startOfLine - 1] !== '\n')
    startOfLine--;
  return {
    row: (text.substring(0, i).match(/\n/g) || []).length,
    column: i - startOfLine,
  };
}

function rowColumnToCharIndex(row, column) {
  const {text} = editContext;
  const lines = text.split('\n');
  let index = 0;
  for (let i = 0; i < row; i++) {
    index += lines[i].length + 1;
  }
  return index + Math.min(column, lines[row]?.length || 0);
}

// Get position of character at index i
function characterPos(i) {
  const {row, column} = charIndexToRowColumn(i);
  return {
    x: column * charWidth + margin,
    y: row * lineSpacing + margin,
  };
}

function updateCanvas() {
  const {text, selectionStart, selectionEnd} = editContext;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let y = charHeight + margin;
  ctx.fillStyle = '#acf';
  if (selectionStart !== selectionEnd) {
    // draw selection
    let {row, column} = charIndexToRowColumn(Math.min(selectionStart, selectionEnd));
    const {row: endRow, column: endColumn} = charIndexToRowColumn(Math.max(selectionStart, selectionEnd));
    for (; row <= endRow; row++) {
      let start = characterPos(rowColumnToCharIndex(row, column));
      let end = characterPos(rowColumnToCharIndex(row, row === endRow ? endColumn : Infinity));
      ctx.fillRect(start.x, start.y, end.x - start.x, charHeight + 2);
      column = 0;
    }
  }
  ctx.fillStyle = '#000';
  for (let line of text.split('\n')) {
    ctx.fillText(line, margin, y);
    y += lineSpacing;
  }
  if (selectionStart === selectionEnd) {
    // draw caret
    const caretPos = characterPos(selectionStart);
    ctx.fillRect(caretPos.x, caretPos.y, 1, charHeight + 1);
  }
  alt.textContent = text;
  getSelection().setBaseAndExtent(alt.firstChild, selectionStart,
                                  alt.firstChild, selectionEnd);
}

editContext.ontextupdate = e => {
  // work around https://issues.chromium.org/issues/529413105
  editContext.updateSelection(e.selectionStart, e.selectionEnd);
  updateCanvas();
};
editContext.oncharacterboundsupdate = () => {
  editContext.updateCharacterBounds(0,
    new Array(editContext.text.length).fill().map((_, i) => new DOMRect(i*20,0,20,10)));
};

canvas.onkeydown = e => {
  if (e.key === 'Enter') {
    const start = editContext.selectionStart;
    editContext.updateText(start, editContext.selectionEnd, '\n');
    editContext.updateSelection(start + 1, start + 1);
    updateCanvas();
  } else if (e.key === 'ArrowLeft') {
    const end = editContext.selectionEnd;
    const newEnd = Math.max(0, e.ctrlKey ? wordBackwards(end) : end - 1);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateCanvas();
  } else if (e.key === 'ArrowRight') {
    const end = editContext.selectionEnd;
    const newEnd = Math.min(e.ctrlKey ? wordForwards(end) : end + 1, editContext.text.length);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateCanvas();
  } else if (e.key === 'ArrowUp') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    if (row === 0) return;
    const newEnd = rowColumnToCharIndex(row - 1, column);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateCanvas();
  } else if (e.key === 'ArrowDown') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    const newEnd = rowColumnToCharIndex(row + 1, column);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateCanvas();
  } else if (e.key === 'a' &&  e.ctrlKey) {
    editContext.updateSelection(0, editContext.text.length);
    updateCanvas();
  }
};
canvas.onclick = e => {
  const charClicked = hitTest(e.offsetX, e.offsetY);
  editContext.updateSelection(charClicked, charClicked);
  updateCanvas();
};
canvas.focus();
