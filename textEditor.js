<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple WYSIWYG Editor</title>

  <!-- 1) Jspreadsheet-CE v4 CSS -->
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/jspreadsheet-ce@4/dist/jspreadsheet.min.css"
    type="text/css"
  />

  <!-- 2) jSuites CSS (required by Jspreadsheet) -->
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/jsuites/dist/jsuites.min.css"
    type="text/css"
  />
  <style>
    body { font-family: sans-serif; margin: 20px; }
    #toolbar {
      border: 1px solid #ccc;
      padding: 8px;
      background: #f5f5f5;
      margin-bottom: 5px;
      flex-wrap: wrap;
      display: flex;
      gap: 5px;
    }

    #toolbar .group {
      display: flex;
      gap: 4px;
      align-items: center;
      padding-right: 8px;
      border-right: 1px solid #ddd;
    }
    #toolbar .group:last-child {
      border-right: none;
    }


    #toolbar button,
    #toolbar select,
    #toolbar input[type="color"] {
      margin-right: 5px;
    }
    /* make the editor exactly one letter-size page */
    #editor {
      margin:0 auto;
      width: 8.5in;            /* page width */
      height: 11in;            /* page height */
      padding: .5in;            /* 1" margin */
      box-sizing: border-box;  
      border: 1px solid #888;  /* faint page border */
      position: relative;
      overflow: hidden;        /* hide anything beyond the page */
      background: transparent;
      position: relative; /* keep for stacking */
    }

    #editor::before {
      content: "";
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      background: white;
      z-index: -2;
      pointer-events: none;
    }

    /* optional: show a dashed “printable area” edge at bottom of margin */
    #editor::after {
      content: '';
      position: absolute;
      bottom: 1in;             /* at bottom of content area */
      left: 0;
      width: 100%;
      border-top: 1px dashed #ccc;
    }

    table {
      border-collapse: collapse;
      margin: 5px 0;
    }
    td, th {
      border: 1px solid #000;
      padding: 4px;
    }

    /* Modal styles */
    #linkModal {
      display: none;               /* hidden by default */
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.5);
      align-items: center;
      justify-content: center;
      /* when JS does style.display = 'flex', this becomes a flex container */
    }
    #linkModal > div {
      background: #fff;
      padding: 20px;
      border-radius: 4px;
      max-width: 300px;
      width: 100%;
      box-sizing: border-box;
    }
    #linkModal input {
      width: 100%;
      margin-bottom: 10px;
    }
    #linkModal button {
      margin-right: 5px;
    }

    #marginModal {
      display: none;
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.5);
      align-items: center;
      justify-content: center;
    }
    #marginModal > div {
      background: #fff;
      padding: 20px;
      border-radius: 4px;
      max-width: 320px;
      width: 100%;
      box-sizing: border-box;
    }

    /* Unified resizable wrapper */
    .resizable {
      position: absolute;
      display: inline-block;
      overflow: hidden;
      padding: 0;
      box-sizing: border-box;
    }
    .editor-unlocked .resizable {
      cursor: move;
    }

    .resizable.front { z-index: 10 !important; }
    .resizable.back  { z-index: -1 !important; }

    .resize-handle {
      width: 10px;
      height: 10px;
      background: #444;
      position: absolute;
      z-index: 20;
    }

    .resize-handle.tl { top: -4px; left: -4px; cursor: nwse-resize; }
    .resize-handle.tr { top: -4px; right: -4px; cursor: nesw-resize; }
    .resize-handle.bl { bottom: -4px; left: -4px; cursor: nesw-resize; }
    .resize-handle.br { bottom: -4px; right: -4px; cursor: nwse-resize; }

    .resize-handle.t { top: -4px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
    .resize-handle.r { right: -4px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }
    .resize-handle.b { bottom: -4px; left: 50%; transform: translateX(-50%); cursor: ns-resize; }
    .resize-handle.l { left: -4px; top: 50%; transform: translateY(-50%); cursor: ew-resize; }


    .resizable:not(.selected) .resize-handle,
    .resizable:not(.selected) .drag-handle {
      display: none;
    }


    /* Ensure the image fills its wrapper and doesn’t intercept clicks */
    .resizable img {
      width: 100%;
      height: 100%;
      object-fit: fill;
      display: block;
      user-select: none;
      pointer-events: none;
    }
    .resizable.selected {
      z-index: 1000 !important;
      border: 1px solid #007BFF !important;
    }
    .resizable.back.selected {
      z-index: 1000 !important;
    }

  </style>
</head>
<body>
  <span id="discountedAmountA">Tacotime</span>
  <button id="globalPrintBtn" type="button" onclick="printContent()" 
  title="Print">🖨️ Print</button>
  <button onclick="downloadAsPDF()" title="Download as PDF">📄 PDF</button>
  <!-- Editor locker -->
  <button id="toggleLockBtn" type="button" onmousedown="event.preventDefault()" 
  title="Lock or unlock editing">Lock Editing</button>
  <div id="toolbar">
    <div id="group">
      <button onmousedown="event.preventDefault()"
              onclick="exec('bold')" title="Bold (Ctrl + B)"><b>B</b></button>
      <button onmousedown="event.preventDefault()"
              onclick="exec('italic')" title="Italic (Ctrl + I)"><i>I</i></button>
      <button onmousedown="event.preventDefault()"
              onclick="exec('underline')" title="Underline (Ctrl + U)"><u>U</u></button>
      <button onmousedown="event.preventDefault()"
              onclick="exec('strikeThrough')" title="Strike"><s>S</s></button>        
    </div>  

    <div id="group">
      <select onchange="exec('formatBlock', this.value)">
        <option value="">Normal</option>
        <option value="H1">H1</option>
        <option value="H2">H2</option>
        <option value="H3">H3</option>
        <option value="P">P</option>
      </select>

      <select onchange="exec('fontName', this.value)">
        <option value="">Font</option>
        <option value="Arial">Arial</option>
        <option value="Courier New">Courier New</option>
        <option value="Times New Roman">Times New Roman</option>
      </select>

      <select onchange="exec('fontSize', this.value)">
        <option value="">Size</option>
        <option value="1">1</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5</option>
        <option value="6">6</option>
        <option value="7">7</option>
      </select>
    </div>

    <div id="group">
      <input type="color" onchange="exec('foreColor', this.value)" title="Text color">
      <input type="color" onchange="exec('hiliteColor', this.value)" title="Highlight color">
    </div>

    <div id="group">
      <button onmousedown="event.preventDefault()"
              onclick="exec('justifyLeft')" title="Align left">L</button>
      <button onmousedown="event.preventDefault()"
              onclick="exec('justifyCenter')" title="Center">C</button>
      <button onmousedown="event.preventDefault()"
              onclick="exec('justifyRight')" title="Right">R</button>
    </div>

    <select id="spacingMenu" title="Line Spacing">
      <option value="" hidden selected>Line Spacing</option>
      <option value="ls-1">1x</option>
      <option value="ls-1.15">1.15x</option>
      <option value="ls-1.5">1.5x</option>
      <option value="ls-2">2x</option>
    </select>
    
    
    <button onmousedown="event.preventDefault()"
            onclick="exec('insertUnorderedList')" title="Bullet list">• List</button>
    <button onmousedown="event.preventDefault()"
            onclick="exec('insertOrderedList')" title="Number list">1. List</button>
    <button onmousedown="event.preventDefault()"
            onclick="exec('outdent')" title="Outdent">←</button>
    <button onmousedown="event.preventDefault()"
            onclick="exec('indent')" title="Indent">→</button>

    <button onmousedown="event.preventDefault()"
            onclick="linkPrompt()" title="Insert/edit link">🔗</button>
    <button onmousedown="event.preventDefault()"
            onclick="exec('unlink')" title="Remove link">🔗✖️</button>

    <!-- file-picker for system image upload -->
<!-- put this inside your #toolbar -->
<input
  type="file"
  id="imageUploader"
  accept="image/*"
  style="display:none;"
/>
<button
  type="button"
  onmousedown="event.preventDefault()"
  onclick="setImageZIndex('front')"
  title="Bring image in front of text">⬆️</button>

<button
  type="button"
  onmousedown="event.preventDefault()"
  onclick="setImageZIndex('back')"
  title="Send image behind text">⬇️</button>
<button
id="pickBehind"
type="button"
onmousedown="event.preventDefault()"
title="Select image behind text (Ctrl + click)"
>🔍</button>

<button
  type="button"                       
  onmousedown="event.preventDefault()"
  onclick="document.getElementById('imageUploader').click()"
  title="Upload Image from System">📁</button>


    <button onmousedown="event.preventDefault()"
            onclick="tablePrompt()" title="Insert table">📊 Table</button>
    <button onmousedown="event.preventDefault()"
            onclick="handleUndo()" title="Undo (Ctrl + Z)">↺</button>
    <button onmousedown="event.preventDefault()"
            onclick="handleRedo()" title="Redo (Ctrl + Y)">↻</button>
    <button type="button"
      onmousedown="event.preventDefault()"
      onclick="showMarginModal()"
      title="Page Margins">📐</button>
    <button onmousedown="event.preventDefault()"
            onclick="viewSource()" title="View/Edit HTML">&lt;/&gt;</button>
  </div>

  <div id="editor"
       contenteditable="true"
       spellcheck="true"
       autocorrect="on"
       autocapitalize="words">
  </div>

  <!-- Link modal -->
  <div id="linkModal">
    <div>
      <label>
        Text:<br>
        <input id="linkText" type="text">
      </label><br>
      <label>
        URL:<br>
        <input id="linkURL" type="text">
      </label><br>
      <button id="linkOk">OK</button>
      <button id="linkCancel">Cancel</button>
    </div>
  </div>
    <!-- Page Margins modal -->
  <div id="marginModal">
    <div>
    <label>Top (in):<br>
    <input id="marginTop" type="number" step="0.1" min="0" value=".5">
    </label><br>
    <label>Right (in):<br>
    <input id="marginRight" type="number" step="0.1" min="0" value=".5">
    </label><br>
    <label>Bottom (in):<br>
    <input id="marginBottom" type="number" step="0.1" min="0" value=".5">
    </label><br>
    <label>Left (in):<br>
    <input id="marginLeft" type="number" step="0.1" min="0" value=".5">
    </label><br><br>
    <button id="marginOk">OK</button>
    <button id="marginCancel">Cancel</button>
    </div>
  </div>



  <!-- Pdf download -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>

  <!-- 3) jSuites JS-->
  <!-- <script src="https://cdn.jsdelivr.net/npm/jsuites/dist/jsuites.min.js"></script> -->
  <!-- 4) Jspreadsheet-CE v4 JS -->
  <!-- <script src="https://cdn.jsdelivr.net/npm/jspreadsheet-ce@4/dist/index.min.js"></script> -->
  <!-- 5) Your editor logic -->
  <script src="textEditor.js"></script>
</body>
</html>
