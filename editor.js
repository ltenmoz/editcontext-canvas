'use strict';

const canvas = document.getElementById('canvas');
const resizer = document.getElementById('resizer');
const alt = document.getElementById('alt');


const ctx = canvas.getContext('2d');
const editContext = canvas.editContext = new EditContext();
const charHeight = 18;
const margin = 5;
ctx.font = charHeight + 'px sans-serif';
const lineSpacing = charHeight * 1.25;
let textFormats = [];

function updateControlBounds() {
  editContext.updateControlBounds(canvas.getBoundingClientRect());
}
updateControlBounds();

function updateSelectionBounds() {
  const {text, selectionStart, selectionEnd} = editContext;
  const {row: startRow, column: startColumn} =
    charIndexToRowColumn(selectionStart);
  const {row: endRow, column: endColumn} =
    charIndexToRowColumn(selectionEnd);
  let canvasRect = canvas.getBoundingClientRect();
  canvasRect.x += margin;
  canvasRect.y += margin;
  canvasRect.width -= 2 * margin;
  canvasRect.height -= 2 * margin;
  const startPos = characterPos(selectionStart);
  const endPos = characterPos(selectionEnd);
  if (startRow === endRow) {
    editContext.updateSelectionBounds(new DOMRect(
      canvasRect.left + startPos.x,
      canvasRect.top + startPos.y,
      endPos.x - startPos.x,
      charHeight
    ));
  } else {
    // give the rectangle containing the full lines as the selection bounds
    editContext.updateSelectionBounds(new DOMRect(
      canvasRect.left,
      canvasRect.top + startPos.y,
      canvasRect.width,
      endPos.y + charHeight - startPos.y,
    ));
  }
}

function setSelection(selectionStart, selectionEnd) {
  editContext.updateSelection(selectionStart, selectionEnd);
  updateSelectionBounds();
}

// Get index of start of word at character index i.
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

// Get index of end of word at character index i.
function wordForwards(i) {
  const text = editContext.text;
  while (i < text.length && /\s/.test(text[i]))
    i++;
  while (i < text.length && !/\s/.test(text[i]))
    i++;
  return i;
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
  if (row < 0) return 0;
  const {text} = editContext;
  const lines = text.split('\n');
  let index = 0;
  for (let i = 0; i < row; i++) {
    index += lines[i].length + 1;
  }
  return index + Math.min(column, lines[row]?.length || 0);
}

// Get index of text at coordinate (x, y)
function hitTest(x, y) {
  x -= margin;
  y -= margin;
  const lineIndex = Math.floor(y / lineSpacing);
  const {text} = editContext;
  const lines = text.split('\n');
  const line = lines[lineIndex];
  if (line === undefined) return text.length;
  let lineOffset = 0;
  for (let i = 0; i < lineIndex; i++) {
    lineOffset += lines[i].length + 1;
  }
  // This isn't ideal for performance - ideally some kind of binary search would be involved.
  // Handling all scripts and mixed directionality correctly is quite tricky!
  let prevWidth = 0;
  for (let i = 0; i <= line.length; i++) {
    let {width} = ctx.measureText(line.substring(0, i));
    if (width > x || i === line.length) {
      if (i > 0 && x < (prevWidth + width) / 2) {
        // Clicked on the left side of the character - so
        // return the previous index.
        return lineOffset + i - 1;
      }
      return lineOffset + i;
    }
    prevWidth = width;
  }
}

// Get position of character at index i
function characterPos(i) {
  const {row, column} = charIndexToRowColumn(i);
  const lineText = editContext.text.split('\n')[row];
  return {
    x: ctx.measureText(lineText.substring(0, column)).width + margin,
    y: row * lineSpacing + margin,
  };
}

function updateRendering() {
  const isFocused = document.activeElement === canvas;
  const {text, selectionStart, selectionEnd} = editContext;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let y = charHeight + margin;
  ctx.fillStyle = '#acf';
  if (selectionStart !== selectionEnd && isFocused) {
    // draw selection
    let {row, column} = charIndexToRowColumn(Math.min(selectionStart, selectionEnd));
    const {row: endRow, column: endColumn} = charIndexToRowColumn(Math.max(selectionStart, selectionEnd));
    for (; row <= endRow; row++) {
      let start = characterPos(rowColumnToCharIndex(row, column));
      let end = characterPos(rowColumnToCharIndex(row, row === endRow ? endColumn : Infinity));
      if (row !== endRow) {
        // Add a bit of extra highlighted area to indicate that line break is selected.
        end.x += charHeight / 2;
      }
      ctx.fillRect(start.x, start.y, end.x - start.x, charHeight + 2);
      column = 0;
    }
  }
  ctx.fillStyle = '#000';
  for (let line of text.split('\n')) {
    ctx.fillText(line, margin, y);
    y += lineSpacing;
  }
  if (selectionStart === selectionEnd && isFocused) {
    // draw caret
    const caretPos = characterPos(selectionStart);
    ctx.fillRect(caretPos.x, caretPos.y, 1, charHeight + 1);
  }
  for (const textFormat of textFormats) {
    // XXX: For simplicity, this doesn't handle textFormat.underlineStyle,
    //      but it should.
    const startPos = characterPos(textFormat.rangeStart);
    const endPos = characterPos(textFormat.rangeEnd);
    const thickness = textFormat.underlineStyle === 'thick' ? 2 : 1;
    ctx.fillRect(startPos.x, startPos.y + charHeight,
      endPos.x - startPos.x, thickness);
  }
  updateSelectionBounds();
  alt.textContent = text;
  getSelection().setBaseAndExtent(alt.firstChild, selectionStart,
                                  alt.firstChild, selectionEnd);
}

editContext.addEventListener('textupdate', e => {
  // Workaround for https://issues.chromium.org/issues/529413105
  editContext.updateSelection(e.selectionStart, e.selectionEnd);
  updateRendering();
});

editContext.addEventListener('characterboundsupdate', e => {
  const {text} = editContext;
  let rects = [];
  let pos = characterPos(e.rangeStart);
  // Get character bounds from e.rangeStart to e.rangeEnd
  for (let i = e.rangeStart; i < e.rangeEnd; i++) {
    let posNext = characterPos(i+1);
    // For the bounds of '\n', we will just use a rectangle with width 1.
    rects.push(new DOMRect(pos.x, pos.y,
      i + 1 >= text.length || text[i] === '\n' ?
        1 : posNext.x - pos.x,
      charHeight));
    pos = posNext;
  }
  e.updateCharacterBounds(e.rangeStart, rects);
});

editContext.addEventListener('textformatupdate', e => {
  textFormats = e.getTextFormats();
  updateRendering();
});

canvas.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const start = editContext.selectionStart;
    editContext.updateText(start, editContext.selectionEnd, '\n');
    editContext.updateSelection(start + 1, start + 1);
    updateRendering();
  } else if (e.key === 'ArrowLeft') {
    const end = editContext.selectionEnd;
    const newEnd = Math.max(0, e.ctrlKey ? wordBackwards(end) : end - 1);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'ArrowRight') {
    const end = editContext.selectionEnd;
    const newEnd = Math.min(e.ctrlKey ? wordForwards(end) : end + 1, editContext.text.length);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'ArrowUp') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    const newEnd = rowColumnToCharIndex(row - 1, column);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'ArrowDown') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    const newEnd = rowColumnToCharIndex(row + 1, column);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'Home') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    const newEnd = e.ctrlKey ? 0 : rowColumnToCharIndex(row, 0);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'End') {
    const end = editContext.selectionEnd;
    const {row, column} = charIndexToRowColumn(end);
    const newEnd = e.ctrlKey ? editContext.text.length
      : rowColumnToCharIndex(row, Infinity);
    editContext.updateSelection(
      e.shiftKey ? editContext.selectionStart : newEnd,
      newEnd);
    updateRendering();
  } else if (e.key === 'a' && e.ctrlKey) {
    editContext.updateSelection(0, editContext.text.length);
    updateRendering();
  }
});
canvas.addEventListener('mousedown', e => {
  const charClicked = hitTest(e.offsetX, e.offsetY);
  editContext.updateSelection(charClicked, charClicked);
  updateRendering();
});
canvas.addEventListener('click', e => {
  if (editContext.selectionStart !== editContext.selectionEnd) {
    // user dragged
    return;
  }
  const charClicked = hitTest(e.offsetX, e.offsetY);
  let selectionStart, selectionEnd;
  switch (e.detail % 3) {
  case 1:
    // Single-click - collapse selection at charClicked
    selectionStart = charClicked;
    selectionEnd = charClicked;
    break;
  case 2:
    // Double-click - select word at charClicked
    selectionStart = wordBackwards(charClicked);
    selectionEnd = wordForwards(charClicked);
    break;
  case 0:
    // Triple-click - select line at charClicked
    const {row, column} = charIndexToRowColumn(charClicked);
    selectionStart = rowColumnToCharIndex(row, 0);
    selectionEnd = rowColumnToCharIndex(row, Infinity);
    break;
  }
  editContext.updateSelection(selectionStart, selectionEnd);
  updateRendering();
});

canvas.addEventListener('mousemove', e => {
  if (e.buttons & 1) {
    editContext.updateSelection(editContext.selectionStart, hitTest(e.offsetX, e.offsetY));
    updateRendering();
  }
});

canvas.focus();
// When focus changes, we want to re-render, since the selection
// should either disappear or reappear.
canvas.addEventListener('focus', updateRendering);
canvas.addEventListener('blur', updateRendering);

new ResizeObserver(() => {
  canvas.width = parseInt(resizer.style.width);
  canvas.height = parseInt(resizer.style.height);
  ctx.font = charHeight + 'px sans-serif';
  updateControlBounds();
  updateRendering();
}).observe(resizer);
