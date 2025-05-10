// textEditor.js

// Expose exec globally so popups (like source view) can call it
window.exec = exec;

// We'll save and restore the user’s selection when showing the link modal
let savedRange = null;

/**
 * Core exec helper
 * Wraps document.execCommand and re-focuses the editor
 */
function exec(command, value = null) {
  document.execCommand(command, false, value);
  editor.focus();  // keep cursor in the editor after the command
}

/* Open the link-editing modal
 - Saves current selection
 - Prefills the modal with existing link text & URL if caret is on an <a> 
*/
function linkPrompt() {
  const selection = window.getSelection();
  if (selection.rangeCount) {
    savedRange = selection.getRangeAt(0);
  }

  // If we’re inside an <a>, grab its href & text
  const anchor = selection.anchorNode.closest
    ? selection.anchorNode.closest('a')
    : (selection.anchorNode.parentElement.tagName === 'A' && selection.anchorNode.parentElement);

  linkText.value = anchor ? anchor.textContent : selection.toString();
  linkURL.value  = anchor ? anchor.href        : '';
  linkModal.style.display = 'flex';
}

/* Prompt for an image URL and insert it as a resizable block */
function imagePrompt() {
  const url = prompt('Enter image URL:');
  if (url) {
    exec('insertHTML',
      `<div class="resizable"><img src="${url}" /></div>`
    );
  }
}

/* Prompt for table dimensions and insert an HTML table */
function tablePrompt() {
    // 1) Ask for initial size
    const rows = parseInt(prompt('Rows?', '5'), 10);
    const cols = parseInt(prompt('Cols?', '5'), 10);
    if (!rows || !cols) return;
  
    // 2) Build the modal backdrop
    const modal = document.createElement('div');
    Object.assign(modal.style, {
      position: 'fixed', top: 0, left: 0,
      width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999
    });
    document.body.appendChild(modal);
  
    // 3) Sheet container
    const holder = document.createElement('div');
    Object.assign(holder.style, {
      background: '#fff', padding: '20px', borderRadius: '4px',
      width: '80vw', height: '80vh',
      display: 'flex', flexDirection: 'column'
    });
    modal.appendChild(holder);
  
    // 4) Jspreadsheet container
    const jspContainer = document.createElement('div');
    Object.assign(jspContainer.style, { flex: '1', overflow: 'hidden' });
    holder.appendChild(jspContainer);
  
    // 5) Build a rows×cols empty grid
    const data = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '')
    );
  
    // 6) Initialize jspreadsheet‐CE
    const hot = jspreadsheet(jspContainer, {
      data,
      rowResize: true,            // drag to resize rows
      columnResize: true,         // drag to resize columns
      mergeCells: true,           // enable merge/unmerge
      contextMenu: true,          // full right-click menu
      defaultColWidth: 100,
      defaultRowHeight: 24,
      allowInsertRow: true,
      allowInsertColumn: true,
      allowDeleteRow: true,
      allowDeleteColumn: true,
      allowEditBorder: true       // let users style cell borders
    });
  
    // 7) OK / Cancel buttons
    const btnBar = document.createElement('div');
    Object.assign(btnBar.style, { textAlign: 'right', marginTop: '8px' });
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    cancelBtn.style.marginRight = '8px';
    btnBar.append(cancelBtn, okBtn);
    holder.appendChild(btnBar);
  
    // 8) Cancel: tear down
    cancelBtn.addEventListener('click', () => modal.remove());
  
    // 9) OK: dump static <table> into editor and tear down
    okBtn.addEventListener('click', () => {
      // jspreadsheet‐CE v4 exposes getHtml() for a plain HTML table
      const htmlTable = hot.getHtml();
      exec('insertHTML', htmlTable);
      modal.remove();
    });
}
  
  
  

/* Open a new window with printable content and call window.print() */
function printContent() {
    // 1) Pull the raw editor HTML
    let content = editor.innerHTML;
  
    // 2) Define your placeholder→span-ID mapping
    const placeholderMap = {
      Option1: 'discountedAmountA',
      // add more as needed, e.g.:
      // Option2: 'someOtherSpanId',
    };
  
    // 3) Replace each [Key] with the matching span’s textContent
    for (const [key, spanId] of Object.entries(placeholderMap)) {
      const span = document.getElementById(spanId);
      const val  = span ? span.textContent : '';
      // global replace of [Option1], etc.
      content = content.replace(
        new RegExp(`\\[${key}\\]`, 'g'),
        val
      );
    }
  
    // 4) Open the print preview as before, using the substituted content
    const w = window.open('', '_blank', 'width=800,height=600');
  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Print</title>
        <style>
          /* force backgrounds (i.e. your hiliteColor spans) to print */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          body   { font-family: sans-serif; margin: 20px; }
          table  { border-collapse: collapse; }
          td, th { border: 1px solid #000; padding: 4px; }
          .resizable {
            overflow: hidden !important;
            box-sizing: border-box !important;
          }
          .resizable img {
            width: 100% !important;
            height: 100% !important;
            object-fit: fill !important;
            display: block;
          }
            /* hide the drag-handle box when printing */
          .resizable .drag-handle {
            display: none !important;
          }

        </style>
      </head>
      <body>${content}</body>
    </html>
  `);
    w.document.close();
    w.focus();
    w.print();
    w.close();
  }
  
  


/**
 * Open a source-view popup allowing raw HTML edit
 */
function viewSource() {
  const content = editor.innerHTML;
  const w = window.open('', '_blank', 'width=800,height=600');

  w.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Source</title>
        <style>
          body { margin: 0; }
          textarea {
            width: 100%;
            height: 90%;
            font-family: monospace;
            padding: 10px;
            box-sizing: border-box;
          }
          button {
            width: 100%;
            padding: 10px;
            border: none;
            background: #007BFF;
            color: #fff;
            font-size: 16px;
            cursor: pointer;
          }
        </style>
      </head>
      <body>
        <textarea id="sourceArea">
${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
        </textarea>
        <button id="saveBtn">Save</button>
        <script>
          // When Save is clicked, replace editor content in opener
          document.getElementById('saveBtn').addEventListener('click', function() {
            const val = document.getElementById('sourceArea').value;
            const html = val.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
            const op = window.opener;
            op.focus();
            op.document.execCommand('selectAll', false, null);
            op.exec('insertHTML', html);
            window.close();
          });
        <\/script>
      </body>
    </html>
  `);

  w.document.close();
  w.focus();
}

/**
 * Find the closest block-level element we want to adjust spacing on:
 * <p>, <li>, <td>, or <th>
 */
function getClosestBlock() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;

  let node = sel.anchorNode;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }
  return node.closest('p, li, td, th');
}

/** Set CSS line-height on the current block */
function setLineSpacing(value) {
  const blk = getClosestBlock();
  if (blk) {
    blk.style.lineHeight = value;
  }
}

/** Toggle space before: margin-top for p/li, padding-top for table cells */
function toggleSpacingBefore() {
  const blk = getClosestBlock();
  if (!blk) return;

  const prop = (blk.tagName === 'TD' || blk.tagName === 'TH')
    ? 'paddingTop'
    : 'marginTop';
  const curr = parseFloat(getComputedStyle(blk)[prop]) || 0;
  blk.style[prop] = (curr > 0 ? 0 : 8) + 'px';
}

/** Toggle space after: margin-bottom for p/li, padding-bottom for table cells */
function toggleSpacingAfter() {
  const blk = getClosestBlock();
  if (!blk) return;

  const prop = (blk.tagName === 'TD' || blk.tagName === 'TH')
    ? 'paddingBottom'
    : 'marginBottom';
  const curr = parseFloat(getComputedStyle(blk)[prop]) || 0;
  blk.style[prop] = (curr > 0 ? 0 : 8) + 'px';
}

/**
 * Main initialization:
 * - Grabs elements
 * - Restores saved content
 * - Wires all event handlers
*/
document.addEventListener('DOMContentLoaded', () => {
  // References to key elements
  window.editor     = document.getElementById('editor');
  const linkModal   = document.getElementById('linkModal');
  const linkText    = document.getElementById('linkText');
  const linkURL     = document.getElementById('linkURL');
  const linkOk      = document.getElementById('linkOk');
  const linkCancel  = document.getElementById('linkCancel');
  const uploader    = document.getElementById('imageUploader');
  const spacingMenu = document.getElementById('spacingMenu');
  const marginModal   = document.getElementById('marginModal');
  const marginTop     = document.getElementById('marginTop');
  const marginRight   = document.getElementById('marginRight');
  const marginBottom  = document.getElementById('marginBottom');
  const marginLeft    = document.getElementById('marginLeft');
  const marginOk      = document.getElementById('marginOk');
  const marginCancel  = document.getElementById('marginCancel');
  const editor        = document.getElementById('editor');
  const toolbar       = document.getElementById('toolbar');
  const toggleLockBtn = document.getElementById('toggleLockBtn');

  // Restore content from localStorage, if present
  const saved = localStorage.getItem('editorContent');
  if (saved) {
    editor.innerHTML = saved;
  }

  // Auto-save on any input/change
  editor.addEventListener('input', () => {
    localStorage.setItem('editorContent', editor.innerHTML);
  });

    const styleObserver = new MutationObserver(() => {
        // save any inline style changes (e.g. your resized image wrappers)
        localStorage.setItem('editorContent', editor.innerHTML);
    });
    styleObserver.observe(editor, {
        subtree: true,
        attributes: true,
        attributeFilter: ['style']
    });
    // restore saved margins (if any)
        const savedM = localStorage.getItem('editorMargins');
        if (savedM) {
        const m = JSON.parse(savedM);
        editor.style.paddingTop    = m.top    + 'in';
        editor.style.paddingRight  = m.right  + 'in';
        editor.style.paddingBottom = m.bottom + 'in';
        editor.style.paddingLeft   = m.left   + 'in';
        }

        // 1) start locked
        let isLocked = true;
        editor.contentEditable    = 'false';
        editor.style.border       = '1px solid #ccc';
        toolbar.style.display     = 'none';
        toggleLockBtn.textContent = '🔓 Unlock Editing';

    // 2) Toggle handler
    toggleLockBtn.addEventListener('click', () => {
        isLocked = !isLocked;

        // editing on/off
        editor.contentEditable = (!isLocked).toString();

        // hide/show entire toolbar
        toolbar.style.display = isLocked ? 'none' : '';

        // border thickness indicator
        editor.style.border = isLocked
        ? '1px solid #ccc'
        : '3px solid #888';

        // update toggle text
        toggleLockBtn.textContent = isLocked
        ? '🔓 Unlock Editing'
        : '🔒 Lock Editing';
    });

    // Close the link modal
    linkCancel.addEventListener('click', () => {
        linkModal.style.display = 'none';
    });

  //-------------------------------------------------------------------------------------------------------

  // Link modal: OK button handler
  linkOk.addEventListener('click', () => {
    linkModal.style.display = 'none';
    // Restore the selection so we can insert/update
    if (savedRange) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
    // Read text & URL from inputs
    const text = linkText.value.trim();
    let url = linkURL.value.trim();
    if (!text || !url) return;
    // Auto-prefix protocol if missing
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    // If editing an existing <a>, update it; otherwise insert new
    const sel2 = window.getSelection();
    const anchor = sel2.anchorNode.closest
      ? sel2.anchorNode.closest('a')
      : (sel2.anchorNode.parentElement.tagName === 'A' && sel2.anchorNode.parentElement);

    if (anchor) {
      anchor.href = url;
      anchor.textContent = text;
      anchor.target = '_blank';
    } else {
      exec('insertHTML', `<a href="${url}" target="_blank">${text}</a>`);
    }
  });
  //-------------------------------------------------------------------------------------------------------
    function showMarginModal() {
    const cs = getComputedStyle(editor);
    document.getElementById('marginTop').value    = (parseFloat(cs.paddingTop)    / 96).toFixed(2);
    document.getElementById('marginRight').value  = (parseFloat(cs.paddingRight)  / 96).toFixed(2);
    document.getElementById('marginBottom').value = (parseFloat(cs.paddingBottom) / 96).toFixed(2);
    document.getElementById('marginLeft').value   = (parseFloat(cs.paddingLeft)   / 96).toFixed(2);
    marginModal.style.display = 'flex';
    }
    window.showMarginModal = showMarginModal;  // so your inline onclick can see it

    marginOk.addEventListener('click', () => {
        editor.style.paddingTop    = marginTop.value    + 'in';
        editor.style.paddingRight  = marginRight.value  + 'in';
        editor.style.paddingBottom = marginBottom.value + 'in';
        editor.style.paddingLeft   = marginLeft.value   + 'in';
        marginModal.style.display  = 'none';
      
        // persist for next load
        localStorage.setItem('editorMargins', JSON.stringify({
          top:    marginTop.value,
          right:  marginRight.value,
          bottom: marginBottom.value,
          left:   marginLeft.value
        }));
      });
      

    marginCancel.addEventListener('click', () => {
        marginModal.style.display = 'none';
    });
  //-------------------------------------------------------------------------------------------------------
  // 0) After you grab `editor` but before the uploader handler:

    // Wrap any <img> already in the editor that aren’t yet in a .resizable
    editor.querySelectorAll('img').forEach(img => {
        if (!img.closest('.resizable')) {
        // create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'resizable';
        wrapper.style.left = '0px';
        wrapper.style.top  = '0px';
        // move the image into it
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        // now hook up drag & clamp
        attachDragHandle(wrapper);
        }
    });
  
  
    function attachDragHandle(wrapper) {
        // 1) find existing handle or make one
        let handle = wrapper.querySelector('.drag-handle');
        if (!handle) {
          handle = document.createElement('div');
          handle.className = 'drag-handle';
          wrapper.appendChild(handle);
        }
      
        // 2) avoid adding multiple listeners
        if (handle._dragInit) return;
        handle._dragInit = true;
      
        // 3) wire up drag start
        handle.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          e.preventDefault();
      
          const parentRect = editor.getBoundingClientRect();
          const rect       = wrapper.getBoundingClientRect();
          const startX     = e.clientX;
          const startY     = e.clientY;
          const origX      = rect.left - parentRect.left;
          const origY      = rect.top  - parentRect.top;
      
          function onMouseMove(ev) {
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            let newX = origX + dx;
            let newY = origY + dy;
      
            // clamp to editor bounds
            const pRect = editor.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            newX = Math.min(Math.max(0, newX), pRect.width  - wRect.width);
            newY = Math.min(Math.max(0, newY), pRect.height - wRect.height);
      
            wrapper.style.left = newX + 'px';
            wrapper.style.top  = newY + 'px';
          }
      
          function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup',   onMouseUp);
          }
      
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup',   onMouseUp);
        });

        const ro = new ResizeObserver(entries => {
        for (let ent of entries) {
            const wRect = ent.contentRect;
            const parentRect = editor.getBoundingClientRect();
            // compute the element's current offset
            const offsetLeft = ent.target.offsetLeft;
            const offsetTop  = ent.target.offsetTop;
            // max allowed dimensions
            const maxW = parentRect.width  - offsetLeft;
            const maxH = parentRect.height - offsetTop;
    
            // clamp width/height if needed
            if (wRect.width  > maxW) ent.target.style.width  = maxW + 'px';
            if (wRect.height > maxH) ent.target.style.height = maxH + 'px';
        }
        });
        ro.observe(wrapper);
    }
    Array.from(editor.querySelectorAll('.resizable')).forEach(attachDragHandle);

    (function wrapExistingImages() {
        // editor must be in the DOM and laid out to get correct rects
        const parentRect = editor.getBoundingClientRect();
        Array.from(editor.querySelectorAll('img')).forEach(img => {
          // skip images already wrapped
          if (img.closest('.resizable')) return;
    
          const imgRect = img.getBoundingClientRect();
          const wrapper = document.createElement('div');
          wrapper.className = 'resizable';
    
          // position & size the wrapper to match the img
          wrapper.style.position = 'absolute';
          wrapper.style.left   = (imgRect.left   - parentRect.left) + 'px';
          wrapper.style.top    = (imgRect.top    - parentRect.top)  + 'px';
          wrapper.style.width  = imgRect.width  + 'px';
          wrapper.style.height = imgRect.height + 'px';
    
          // move the image into the wrapper
          img.parentNode.insertBefore(wrapper, img);
          wrapper.appendChild(img);
        });
        })();

    // B) On file-upload, insert + then wire up the new wrapper:
    uploader.addEventListener('change', function() {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          exec('insertHTML',
            `<div class="resizable" contenteditable="false" style="left:0;top:0;width:200px;height:200px;">
               <img src="${reader.result}" />
             </div>`
          );
          setTimeout(() => {
            const wraps = editor.querySelectorAll('.resizable');
            attachDragHandle(wraps[wraps.length - 1]);
          }, 0);
        };
        reader.readAsDataURL(file);
        this.value = '';
      });

  
  
  
  //-------------------------------------------------------------------------------------------------------

  // Spacing menu handler
  spacingMenu.addEventListener('change', () => {
    switch (spacingMenu.value) {
      case 'ls-1':     setLineSpacing('1');     break;
      case 'ls-1.15':  setLineSpacing('1.15');  break;
      case 'ls-1.5':   setLineSpacing('1.5');   break;
      case 'ls-2':     setLineSpacing('2');     break;
      case 'pb-toggle': toggleSpacingBefore();  break;
      case 'pa-toggle': toggleSpacingAfter();   break;
    }
    // Reset dropdown to default
    spacingMenu.value = '';
  });

  // Ctrl+Click on a link opens it in a new tab
  editor.addEventListener('click', e => {
    const a = e.target.closest('a');
    if (a && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(a.href, '_blank');
    }
  });
    //-------------------------------------------------------------------------------------------------------


  // Keydown: Tab/Shift+Tab for indent, Backspace in lists, and Ctrl shortcuts
  document.addEventListener('keydown', e => {
    if (document.activeElement !== editor) return;

    // inside document.addEventListener('keydown', e => { …
    if ((e.key === 'Backspace' || e.key === 'Delete') && document.activeElement === editor) {
        const sel = window.getSelection();
        if (sel.isCollapsed && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        // get the element under the caret
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        const wrapper = node.closest('.resizable');
        if (wrapper) {
            e.preventDefault();

            // select the entire .resizable wrapper
            const delRange = document.createRange();
            delRange.selectNode(wrapper);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(delRange);

            // delete it via execCommand (undoable)
            exec('insertHTML', '');
            return;
        }
        }
    }
  
  //-------------------------------------------------------------------------------------------------------

    // Helper to find nearest <li> for list-level indent/outdent
    const getLI = () => {
      const s = window.getSelection();
      if (!s.rangeCount) return null;
      const n = s.anchorNode;
      return (n.nodeType === 3 ? n.parentElement : n).closest('li');
    };

    // Tab and Shift+Tab
    if (e.key === 'Tab') {
      e.preventDefault();
      const li = getLI();
      if (e.shiftKey)        exec('outdent');
      else if (li)           exec('indent');
      else                   exec('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;');
      return;
    }
  //-------------------------------------------------------------------------------------------------------

    // Backspace at start of a list item → outdent instead of delete
    if (e.key === 'Backspace') {
      const s = window.getSelection();
      if (s.isCollapsed && s.rangeCount) {
        const r = s.getRangeAt(0);
        if (r.startOffset === 0 && getLI()) {
          e.preventDefault();
          exec('outdent');
          return;
        }
      }
    }
  //-------------------------------------------------------------------------------------------------------

    // Ctrl/Cmd shortcuts (e.g. Ctrl+B, Ctrl+Z, etc.)
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); exec('bold');      break;
        case 'i': e.preventDefault(); exec('italic');    break;
        case 'u': e.preventDefault(); exec('underline'); break;
        case 'z': e.preventDefault(); exec('undo');      break;
        case 'y': e.preventDefault(); exec('redo');      break;
        case 'p': e.preventDefault(); printContent();    break;
      }
    }
  });
  //-------------------------------------------------------------------------------------------------------

  // Auto-link plain URLs when typing space or Enter
  editor.addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'Enter') {
      const urlReg = /(https?:\/\/[^\s]+)/g;
      const s = window.getSelection();
      const n = s.anchorNode;
      if (!n || n.nodeType !== Node.TEXT_NODE) return;

      const m = urlReg.exec(n.textContent);
      if (!m) return;

      const u = m[0];
      const range = document.createRange();
      range.setStart(n, m.index);
      range.setEnd(n, m.index + u.length);
      s.removeAllRanges();
      s.addRange(range);

      exec('createLink', u);

      const a = s.anchorNode.closest
        ? s.anchorNode.closest('a')
        : s.anchorNode.parentElement;
      if (a && a.tagName === 'A') {
        a.setAttribute('target', '_blank');
      }
      s.collapseToEnd();
    }
  });
});
