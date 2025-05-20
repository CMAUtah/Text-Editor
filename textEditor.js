// textEditor.js
(function () {
    let savedRange = null;
  
    const undoStack = [];
    let undoIndex = -1;
    function pushUndoState(action) {
      undoStack.splice(undoIndex+1);
      undoStack.push(action);
      undoIndex = undoStack.length - 1;
      if (undoStack.length > 100) {
        undoStack.shift();
        undoIndex--;
      }
    }
    
    function pushDOMUndoState({ target, from, to }) {
      const id = target.dataset.uid || (target.dataset.uid = Math.random().toString(36).slice(2));
      pushUndoState({
        type: "dom-change",
        id,
        from,
        to,
        target,
      });
    }    
  
    function applyUndoAction(action, direction = "undo") {
      const editor = window.editor;
      const delta  = direction === "undo" ? action.from : action.to;
    
      // re-assign UID only if we have a node
      if (action.node && action.id) {
        action.node.dataset.uid = action.id;
      }
    
      if (action.type === "move-image") {
        const target = editor.querySelector(`.resizable[data-uid="${action.id}"]`);
        if (target) {
          target.style.left = delta.left;
          target.style.top  = delta.top;
        }
        // styleObserver will auto-save this
      }
      else if (action.type === "resize-image") {
        const target = editor.querySelector(`.resizable[data-uid="${action.id}"]`);
        if (target) {
          target.style.width  = delta.width;
          target.style.height = delta.height;
        }
        // styleObserver will auto-save this
      }
      else if (action.type === "dom-change") {
        if (action.target) action.target.innerHTML = delta;
        localStorage.setItem('editorContent', editor.innerHTML);
      }

      else if (action.type === "delete-image") {
        const { id, node, parent, nextSibling } = action;
    
        if (direction === "undo") {
          // re-insert the same wrapper
          node.dataset.uid = id;
          if (nextSibling && parent.contains(nextSibling)) {
            parent.insertBefore(node, nextSibling);
          } else {
            parent.appendChild(node);
          }
          // 🚀 reset its observer flag so attachDragHandle will re-observe
          node._resizeObserved = false;
          node._resizeObserver = null;
          attachDragHandle(node);
        } else {
          const wrapper = editor.querySelector(`.resizable[data-uid="${id}"]`);
          if (wrapper) {
            // cleanup its ResizeObserver
            if (wrapper._resizeObserver) {
              wrapper._resizeObserver.unobserve(wrapper);
              wrapper._resizeObserver.disconnect();
            }
            wrapper.remove();
          }
        }
        localStorage.setItem("editorContent", editor.innerHTML);
      }
    
      else if (action.type === "delete-tab") {
        const { node, parent, nextSibling } = action;
        if (direction === "undo") {
          // re-insert the tab stop
          parent.insertBefore(node, nextSibling);
          // if you ever observe it, reset flags here too
          node._resizeObserved = false;
          node._resizeObserver = null;
          attachDragHandle?.(node);
        } else {
          // cleanup any observer just in case
          if (node._resizeObserver) {
            node._resizeObserver.unobserve(node);
            node._resizeObserver.disconnect();
          }
          node.remove();
        }
        localStorage.setItem("editorContent", editor.innerHTML);
      }

      else if (action.type === "insert-tab") {
        if (direction === "undo") {
          action.node.remove();
        } else {
          action.parent.insertBefore(action.node, action.nextSibling);
        }
        localStorage.setItem('editorContent', editor.innerHTML);
      }

      else if (action.type === "margin-change") {
        // 1️ Apply the margins visually
        Object.assign(action.target.style, {
          paddingTop:    delta.top,
          paddingRight:  delta.right,
          paddingBottom: delta.bottom,
          paddingLeft:   delta.left,
        });
      
        // 2️ Persist those margins so a reload respects your undo
        const m = {
          top:    parseFloat(delta.top),
          right:  parseFloat(delta.right),
          bottom: parseFloat(delta.bottom),
          left:   parseFloat(delta.left),
        };
        localStorage.setItem("editorMargins", JSON.stringify(m));
      
        // 3️ Also save the content in case you rely on it elsewhere
        localStorage.setItem("editorContent", editor.innerHTML);
      }
      
    }
                

    // exec wrapper
    function exec(command, value = null) {
      document.execCommand(command, false, value);
      window.editor.focus();
    }
    window.exec = exec;
  
    window.handleUndo = function () {
      if (undoIndex >= 0) {
        const action = undoStack[undoIndex];
        applyUndoAction(action, "undo");
        undoIndex--;
      } else {
        exec("undo");
      }
    };
    
    
  
    window.handleRedo = function () {
      if (undoIndex + 1 < undoStack.length) {
        const action = undoStack[undoIndex + 1];
        applyUndoAction(action, "redo");
        undoIndex++;
      } else {
        exec("redo");
      }
    };
    
    
  
    document.addEventListener("DOMContentLoaded", () => {
      // grab all relevant nodes once
      const editor = document.getElementById("editor");
      const toolbar = document.getElementById("toolbar");
      const toggleLockBtn = document.getElementById("toggleLockBtn");
  
      const linkModal = document.getElementById("linkModal");
      const linkText = document.getElementById("linkText");
      const linkURL = document.getElementById("linkURL");
      const linkOk = document.getElementById("linkOk");
      const linkCancel = document.getElementById("linkCancel");
  
      const marginModal = document.getElementById("marginModal");
      const marginTop = document.getElementById("marginTop");
      const marginRight = document.getElementById("marginRight");
      const marginBottom = document.getElementById("marginBottom");
      const marginLeft = document.getElementById("marginLeft");
      const marginOk = document.getElementById("marginOk");
      const marginCancel = document.getElementById("marginCancel");
  
      const imageUploader = document.getElementById("imageUploader");
      const spacingMenu = document.getElementById("spacingMenu");
  
      const pickBtn = document.getElementById("pickBehind");
  
      // expose editor globally
      window.editor = editor;
  
      let isLocked = true;
      let pickMode = false;
      let selectedWrapper = null;
      let savedRange = null;
  
      // select wrappers on click instead of mousedown
      editor.addEventListener("click", (e) => {
        if (isLocked) return;
        const wrapper = e.target.closest(".resizable");
        if (selectedWrapper && selectedWrapper !== wrapper) {
          selectedWrapper.classList.remove("selected");
        }
        if (wrapper) {
          selectedWrapper = wrapper;
          wrapper.classList.add("selected");
        } else {
          selectedWrapper = null;
        }
      });
  
      // restore saved content
      const saved = localStorage.getItem("editorContent");
      if (saved) editor.innerHTML = saved;
  
      // auto-save on input
      function debounce(fn, delay) {
        let timer;
        return function (...args) {
          clearTimeout(timer);
          timer = setTimeout(() => fn.apply(this, args), delay);
        };
      }
      
      const saveContent = debounce(() => {
        localStorage.setItem("editorContent", editor.innerHTML);
      }, 500);
      
      editor.addEventListener("input", saveContent);
      
  
      // persist inline style changes
      const styleObserver = new MutationObserver(saveContent);
      styleObserver.observe(editor, {
        subtree: true,
        attributes: true,
        attributeFilter: ["style"],
      });
      

  
      // restore saved margins
      const savedM = localStorage.getItem("editorMargins");
      if (savedM) {
        const m = JSON.parse(savedM);
        editor.style.paddingTop = m.top + "in";
        editor.style.paddingRight = m.right + "in";
        editor.style.paddingBottom = m.bottom + "in";
        editor.style.paddingLeft = m.left + "in";
      }
  
      // clear any leftover selection on load
      document
        .querySelectorAll(".resizable.selected")
        .forEach((w) => w.classList.remove("selected"));
      selectedWrapper = null;
  
      // lock/unlock editing
      editor.style.position = "relative";
      editor.contentEditable = "false";
      editor.style.border = "1px solid #ccc";
      toolbar.style.display = "none";
      toggleLockBtn.textContent = "🔓 Unlock Editing";
  
      toggleLockBtn.addEventListener("click", () => {
        isLocked = !isLocked;
      
        if (isLocked) {
          document.querySelectorAll(".resizable.selected").forEach((w) => w.classList.remove("selected"));
          selectedWrapper = null;
        }
      
        editor.contentEditable = (!isLocked).toString();
        toolbar.style.display = isLocked ? "none" : "";
        editor.style.border = isLocked ? "1px solid #ccc" : "3px solid #888";
        toggleLockBtn.textContent = isLocked ? "🔓 Unlock Editing" : "🔒 Lock Editing";
      
        // Toggle cursor style
        editor.classList.toggle("editor-unlocked", !isLocked);
      
        // Re-attach or disable drag handles
        document.querySelectorAll(".resizable").forEach((w) => attachDragHandle(w));
      });
      
  
      // --- LINK PROMPT ---
      window.linkPrompt = function () {
        const sel = window.getSelection();
        if (sel.rangeCount) savedRange = sel.getRangeAt(0);
        const anchor =
          sel.anchorNode && typeof sel.anchorNode.closest === "function"
            ? sel.anchorNode.closest("a")
            : null;
        linkText.value = anchor ? anchor.textContent : sel.toString();
        linkURL.value = anchor ? anchor.href : "";
        linkModal.style.display = "flex";
      };

      linkCancel.addEventListener("click", () => {
        linkModal.style.display = "none";
      });

      linkOk.addEventListener("click", () => {
        const before = editor.innerHTML;
        linkModal.style.display = "none";
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
        }
        let text = linkText.value.trim();
        let url = linkURL.value.trim();
        if (!text || !url) return;
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;
        const sel2 = window.getSelection();
        const anchor =
          sel2.anchorNode && typeof sel2.anchorNode.closest === "function"
            ? sel2.anchorNode.closest("a")
            : null;
        if (anchor) {
          anchor.href = url;
          anchor.textContent = text;
          anchor.target = "_blank";
        } else {
          exec("insertHTML", `<a href="${url}" target="_blank">${text}</a>`);
        }
        const after = editor.innerHTML;
        pushDOMUndoState({ target: editor, from: before, to: after });
      });
  
      // --- IMAGE BY URL ---
      window.imagePrompt = function () {
        const url = prompt("Enter image URL:");
        if (!url) return;
      
        const before = editor.innerHTML;
      
        // 1️⃣ create the wrapper + img
        const wrapper = document.createElement("div");
        wrapper.className = "resizable";
        const img = document.createElement("img");
        img.src = url;
        wrapper.appendChild(img);
      
        // 2️⃣ insert it at the current cursor (or at end)
        const sel = window.getSelection();
        if (sel.rangeCount) {
          sel.getRangeAt(0).insertNode(wrapper);
        } else {
          editor.appendChild(wrapper);
        }
      
        // 3️⃣ wire up handles
        attachDragHandle(wrapper);
      
        // 4️⃣ save undo state
        const after = editor.innerHTML;
        pushDOMUndoState({ target: editor, from: before, to: after });
      };
      
  
      // --- TABLE PROMPT ---
      const tableBtn = document.getElementById('tableBtn');
      const picker   = document.createElement('div');
      picker.id      = 'tablePicker';
      picker.className = 'table-picker';
      picker.style.display = 'none';
      toolbar.appendChild(picker);
      
      let pickRows = 0, pickCols = 0;
      
      // build grid + label
      for (let r = 1; r <= 10; r++) {
        for (let c = 1; c <= 10; c++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          cell.dataset.r = r;
          cell.dataset.c = c;
          picker.appendChild(cell);
        }
      }
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = '0 × 0';
      picker.appendChild(label);
      
      // show picker
      tableBtn.addEventListener('click', (e) => {
        // save current cursor location
        const sel = window.getSelection();
        if (sel.rangeCount) savedRange = sel.getRangeAt(0);
      
        // show the grid
        const rect = tableBtn.getBoundingClientRect();
        picker.style.top  = rect.bottom + 4 + 'px';
        picker.style.left = rect.left  + 'px';
        picker.style.display = 'grid';
      });
      
      
      
      // hide on outside click
      document.addEventListener('click', e => {
        if (!picker.contains(e.target) && e.target !== tableBtn) {
          picker.style.display = 'none';
        }
      });
      
      // hover to set size
      picker.addEventListener('mouseover', e => {
        if (!e.target.classList.contains('cell')) return;
        pickRows = +e.target.dataset.r;
        pickCols = +e.target.dataset.c;
        label.textContent = `${pickRows} × ${pickCols}`;
        picker.querySelectorAll('.cell').forEach(div => {
          const r = +div.dataset.r, c = +div.dataset.c;
          div.classList.toggle('hover', r <= pickRows && c <= pickCols);
        });
      });
      
      // click to insert table + undo
      picker.addEventListener('click', e => {
        if (!e.target.classList.contains('cell')) return;
        picker.style.display = 'none';
      
        // restore cursor
        if (savedRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
          savedRange = null;
        }
      
        const before = editor.innerHTML;
        let html = '<table><tbody>';
        for (let r = 0; r < pickRows; r++) {
          html += '<tr>';
          for (let c = 0; c < pickCols; c++) {
            html += '<td><br></td>';
          }
          html += '</tr>';
        }
        html += '</tbody></table>';
      
        exec('insertHTML', html);

        // ★ resize handles
        const tables = editor.querySelectorAll('table');
        const newTable = tables[tables.length - 1];
        attachTableResizers(newTable);

        pushDOMUndoState({ target: editor, from: before, to: editor.innerHTML });
      });
      

      
      function attachTableResizers(table) {
        // — wrap the table in a relative container —
        let wrapper = table.parentElement;
        if (!wrapper.classList.contains('table-wrapper')) {
          wrapper = document.createElement('div');
          wrapper.classList.add('table-wrapper');
          Object.assign(wrapper.style, {
            position:   'relative',
            display:    'inline-block',
            userSelect: 'auto',      // allow selection on children
            pointerEvents: 'none'    // wrapper itself ignores pointer events
          });
          table.parentNode.insertBefore(wrapper, table);
          wrapper.appendChild(table);
        }
      
        // — restore events & selection on the table —
        Object.assign(table.style, {
          tableLayout: 'fixed',
          userSelect:  'text',
          pointerEvents: 'auto'
        });
      
        // — clear old handles —
        wrapper.querySelectorAll('.col-resizer, .row-resizer')
               .forEach(h => h.remove());
      
        // —— vertical handles ——  
        let cumW = table.offsetLeft;
        const firstRow = table.rows[0] || { cells: [] };
        Array.from(firstRow.cells).forEach(cell => {
          cumW += cell.offsetWidth;
          const h = document.createElement('div');
          h.className = 'col-resizer';
          Object.assign(h.style, {
            position:   'absolute',
            top:        '0',
            left:       `${cumW - 3}px`,
            width:      '6px',
            height:     '100%',
            cursor:     'col-resize',
            zIndex:     '10',
            background: 'transparent', // you can swap this for 'rgba(0,0,0,0.1)' while debugging
            pointerEvents: 'auto'      // let the handle catch the mousedown
          });
          wrapper.appendChild(h);
      
          let startX, startW;
          h.addEventListener('mousedown', e => {
            e.preventDefault();
            startX = e.clientX;
            startW = cell.offsetWidth;
            function onMove(ev) {
              cell.style.width = (startW + ev.clientX - startX) + 'px';
            }
            function onUp() {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              attachTableResizers(table); // reflow your handles
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });
        });
      
        // —— horizontal handles ——  
        let cumH = table.offsetTop;
        Array.from(table.rows).forEach(row => {
          cumH += row.offsetHeight;
          const h = document.createElement('div');
          h.className = 'row-resizer';
          Object.assign(h.style, {
            position:   'absolute',
            left:       '0',
            top:        `${cumH - 3}px`,
            width:      '100%',
            height:     '6px',
            cursor:     'row-resize',
            zIndex:     '10',
            background: 'transparent', // or a light color during dev
            pointerEvents: 'auto'
          });
          wrapper.appendChild(h);
      
          let startY, startH;
          h.addEventListener('mousedown', e => {
            e.preventDefault();
            startY = e.clientY;
            startH = row.offsetHeight;
            function onMove(ev) {
              row.style.height = (startH + ev.clientY - startY) + 'px';
            }
            function onUp() {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              attachTableResizers(table);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          });
        });
      }
            
      // re-run on window resize too
      window.addEventListener('resize', () => {
        document.querySelectorAll('table').forEach(t => attachTableResizers(t));
      });
      
      
      
      
      
  
      // --- PRINT CONTENT ---
      window.printContent = function () {
        const original = editor;
        const clone = original.cloneNode(true);
        clone.id = "editor-print";
  
        const discount = document.getElementById("discountedAmountA").textContent;
        clone.innerHTML = clone.innerHTML.replace(/\[Option1\]/g, discount);
  
        // insert clone & hide the real editor
        original.parentNode.insertBefore(clone, original.nextSibling);
        original.style.display = "none";
  
        const style = document.createElement("style");
        style.id = "print-styles";
        style.textContent = `
              @page { margin: 0; }
              @media print {
                  html, body { margin:0!important; padding:0!important; }
          
                  /* force colors */
                  #editor-print, #editor-print * {
                  -webkit-print-color-adjust: exact!important;
                  print-color-adjust: exact!important;
                  }
          
                  /* hide everything but the clone */
                  body > *:not(#editor-print) { display: none!important; }
          
                  /* allow the clone’s inline padding to show */
                  #editor-print {
                  position: relative!important;
                  margin: 0!important;
                  /* ✂️ removed padding:0!important; */
                  border: none!important;
                  box-shadow: none!important;
                  width: auto!important;
                  overflow: visible!important;
                  }
          
                  /* preserve your .resizable/image styling */
                  #editor-print .resizable {
                  position: absolute!important;
                  display: block!important;
                  overflow: visible!important;
                  border: none!important;
                  box-shadow: none!important;
                  }
                  #editor-print .resizable img {
                  display: block!important;
                  width: 100%!important;
                  height: 100%!important;
                  object-fit: fill!important;
                  }
                  #editor-print .resizable .resize-handle {
                    display: none !important;
                  }

                  #editor-print .resizable .drag-handle { display: none!important; }
              }
              `;
        document.head.appendChild(style);
  
        window.print();
  
        // clean up immediately
        document.head.removeChild(style);
        clone.remove();
        original.style.display = "";
      };
  
      //Export to pdf
      window.downloadAsPDF = function () {
        const original = editor;
        const clone = original.cloneNode(true);
        clone.id = "editor-print";
  
        const discount = document.getElementById("discountedAmountA").textContent;
        clone.innerHTML = clone.innerHTML.replace(/\[Option1\]/g, discount);
  
        // Clean up inline styles like you would for print
        clone.querySelectorAll(".resizable").forEach((w) => {
          w.style.position = "absolute";
          w.style.display = "block";
          w.style.overflow = "visible";
          w.style.border = "none";
          w.style.boxShadow = "none";
          const handle = w.querySelector(".drag-handle");
          if (handle) handle.remove();
        });
  
        // Create a wrapper for html2pdf with injected styles
        const wrapper = document.createElement("div");
        wrapper.appendChild(clone);
  
        const style = document.createElement("style");
        style.textContent = `
              * {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
              }
              #editor-print {
                  position: relative !important;
                  margin: 0 !important;
                  border: none !important;
                  box-shadow: none !important;
                  width: auto !important;
                  overflow: visible !important;
                  background: white;
                  color: black;
              }
              #editor-print .resizable {
                  position: absolute !important;
                  display: block !important;
                  overflow: visible !important;
                  border: none !important;
                  box-shadow: none !important;
              }
              #editor-print .resizable img {
                  display: block !important;
                  width: 100% !important;
                  height: 100% !important;
                  object-fit: fill !important;
              }
              #editor-print .resizable .resize-handle {
                  display: none !important;
              }
              #editor-print .resizable .drag-handle {
                  display: none !important;
              }
              `;
        wrapper.appendChild(style);
  
        const opt = {
          margin: 0,
          filename: "document.pdf",
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        };
  
        html2pdf().from(wrapper).set(opt).save();
      };
  
      // --- VIEW SOURCE ---
      window.viewSource = function () {
        // 1) Tokenize data-URIs
        const raw = editor.innerHTML;
        const dataUris = [];
        const tokenized = raw.replace(
          /(<img\b[^>]*\bsrc=")(data:[^"]+)("(?:[^>]*>))/gi,
          (_, pre, uri, post) => {
            const idx = dataUris.push(uri) - 1;
            return `${pre}__IMG_${idx}__${post}`;
          },
        );
        const htmlEsc = tokenized.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
        // 2) Open a bigger window
        const w = window.open("", "_blank", "width=900,height=700");
        w.dataUris = dataUris;
  
        // 3) Write flex-based HTML/CSS so textarea fills all but the bottom button
        w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Source</title>
          <style>
            html, body { margin:0; padding:0; width:100%; height:100%; }
            body { display:flex; flex-direction:column; }
            textarea {
              flex:1;
              width:100%;
              font-family: monospace;
              padding:10px;
              box-sizing: border-box;
              border: none;
              resize: none;
            }
            button {
              height:45px;
              border:none;
              background:#007BFF;
              color:#fff;
              font-size:16px;
              cursor:pointer;
            }
          </style>
        </head>
        <body>
          <textarea id="sourceArea">${htmlEsc}</textarea>
          <button id="saveBtn">Save</button>
          <script>
            document.getElementById('saveBtn').addEventListener('click', function() {
              let val = document.getElementById('sourceArea').value;
              const full = window.dataUris;
              val = val.replace(/__IMG_(\\d+)__/g, (_,n) => full[+n] || '');
              const unescaped = val.replace(/&lt;/g,'<').replace(/&gt;/g,'>');
              const doc = window.opener.document;
              window.opener.focus();
              doc.execCommand('selectAll', false, null);
              doc.execCommand('insertHTML', false, unescaped);
              window.close();
            });
          <\/script>
        </body>
        </html>`);
        w.document.close();
        w.focus();
      };
  
      // --- PAGE MARGINS ---
      window.showMarginModal = function () {
        const cs = getComputedStyle(editor);
        marginTop.value = (parseFloat(cs.paddingTop) / 96).toFixed(2);
        marginRight.value = (parseFloat(cs.paddingRight) / 96).toFixed(2);
        marginBottom.value = (parseFloat(cs.paddingBottom) / 96).toFixed(2);
        marginLeft.value = (parseFloat(cs.paddingLeft) / 96).toFixed(2);
        marginModal.style.display = "flex";
      };
      marginCancel.addEventListener(
        "click",
        () => (marginModal.style.display = "none"),
      );

      marginOk.addEventListener("click", () => {
        // capture old padding
        const beforeStyles = {
          top:    editor.style.paddingTop,
          right:  editor.style.paddingRight,
          bottom: editor.style.paddingBottom,
          left:   editor.style.paddingLeft,
        };

        // apply new margins
        editor.style.paddingTop    = marginTop.value    + "in";
        editor.style.paddingRight  = marginRight.value  + "in";
        editor.style.paddingBottom = marginBottom.value + "in";
        editor.style.paddingLeft   = marginLeft.value   + "in";
        marginModal.style.display  = "none";

        // persist settings
        localStorage.setItem(
          "editorMargins",
          JSON.stringify({
            top:    marginTop.value,
            right:  marginRight.value,
            bottom: marginBottom.value,
            left:   marginLeft.value,
          })
        );

        // capture new padding
        const afterStyles = {
          top:    editor.style.paddingTop,
          right:  editor.style.paddingRight,
          bottom: editor.style.paddingBottom,
          left:   editor.style.paddingLeft,
        };

        // push custom undo state
        pushUndoState({
          type:   "margin-change",
          from:   beforeStyles,
          to:     afterStyles,
          target: editor,
        });
      });

  
      // --- WRAP EXISTING IMAGES + attach handles ---
      (function wrapExistingImages() {
        const parentRect = editor.getBoundingClientRect();
        Array.from(editor.querySelectorAll("img")).forEach((img) => {
          if (img.closest(".resizable")) return;
          const imgRect = img.getBoundingClientRect();
          const wrapper = document.createElement("div");
          wrapper.className = "resizable";
          Object.assign(wrapper.style, {
            position: "absolute",
            left: imgRect.left - parentRect.left + "px",
            top: imgRect.top - parentRect.top + "px",
            width: imgRect.width + "px",
            height: imgRect.height + "px",
            zIndex: "10",
          });
          img.parentNode.insertBefore(wrapper, img);
          wrapper.appendChild(img);
          attachDragHandle(wrapper);
        });
      })();
  
      // --- DRAG HANDLE LOGIC ---
      function attachDragHandle(wrapper) {
        if (isLocked) {
          wrapper.style.pointerEvents = "none";
          wrapper.querySelectorAll(".resize-handle").forEach(h => h.style.display = "none");
          return;
        }
      
        wrapper.style.pointerEvents = "auto";
        wrapper.style.position = wrapper.style.position || "absolute";
      
        // Make the entire wrapper draggable
        if (!wrapper._dragInit) {
          wrapper._dragInit = true;
      
          wrapper.addEventListener("mousedown", (e) => {
            if (e.target.classList.contains("resize-handle")) return;
            if (e.button !== 0) return;
      
            e.preventDefault();
      
            const parentRect = editor.getBoundingClientRect();
            const startRect = wrapper.getBoundingClientRect();
            const startX = e.clientX;
            const startY = e.clientY;
            const origX = startRect.left - parentRect.left;
            const origY = startRect.top - parentRect.top;
      
            const id = wrapper.dataset.uid || (wrapper.dataset.uid = Math.random().toString(36).slice(2));
            const startLeft = wrapper.style.left;
            const startTop = wrapper.style.top;
      
            function onMouseMove(ev) {
              let newX = origX + (ev.clientX - startX);
              let newY = origY + (ev.clientY - startY);
              const pRect = editor.getBoundingClientRect();
              const wRect = wrapper.getBoundingClientRect();
              newX = Math.max(0, Math.min(newX, pRect.width - wRect.width));
              newY = Math.max(0, Math.min(newY, pRect.height - wRect.height));
              wrapper.style.left = newX + "px";
              wrapper.style.top = newY + "px";
            }
      
            function onMouseUp() {
              const endLeft = wrapper.style.left;
              const endTop = wrapper.style.top;
              if (startLeft !== endLeft || startTop !== endTop) {
                pushUndoState({
                  type: "move-image",
                  id,
                  from: { left: startLeft, top: startTop },
                  to: { left: endLeft, top: endTop },
                });
              }
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
            }
      
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          });
        }
      
        // Show and set up resize handles
        const positions = ['tl', 'tr', 'bl', 'br', 't', 'r', 'b', 'l'];
        positions.forEach(pos => {
          let h = wrapper.querySelector(`.resize-handle.${pos}`);
          if (!h) {
            h = document.createElement("div");
            h.className = `resize-handle ${pos}`;
            wrapper.appendChild(h);
          }
          h.style.display = "";
      
          if (h._initResize) return;
          h._initResize = true;
      
          h.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
      
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = parseFloat(wrapper.style.width);
            const startH = parseFloat(wrapper.style.height);
            const startLeft = parseFloat(wrapper.style.left);
            const startTop = parseFloat(wrapper.style.top);
            const id = wrapper.dataset.uid || (wrapper.dataset.uid = Math.random().toString(36).slice(2));
      
            function onMouseMove(ev) {
              let dx = ev.clientX - startX;
              let dy = ev.clientY - startY;
              let newW = startW;
              let newH = startH;
              let newLeft = startLeft;
              let newTop = startTop;
      
              if (pos.includes("r")) newW = startW + dx;
              if (pos.includes("l")) {
                newW = startW - dx;
                newLeft = startLeft + dx;
              }
              if (pos.includes("b")) newH = startH + dy;
              if (pos.includes("t")) {
                newH = startH - dy;
                newTop = startTop + dy;
              }
      
              newW = Math.max(20, newW);
              newH = Math.max(20, newH);
              wrapper.style.width = newW + "px";
              wrapper.style.height = newH + "px";
              wrapper.style.left = newLeft + "px";
              wrapper.style.top = newTop + "px";
            }
      
            function onMouseUp() {
              document.removeEventListener("mousemove", onMouseMove);
              document.removeEventListener("mouseup", onMouseUp);
      
              const endW = wrapper.style.width;
              const endH = wrapper.style.height;
              const endL = wrapper.style.left;
              const endT = wrapper.style.top;
      
              if (startW !== parseFloat(endW) || startH !== parseFloat(endH)) {
                pushUndoState({
                  type: "resize-image",
                  id,
                  from: { width: startW + "px", height: startH + "px", left: startLeft + "px", top: startTop + "px" },
                  to: { width: endW, height: endH, left: endL, top: endT }
                });
              }
            }
      
            document.addEventListener("mousemove", onMouseMove);
            document.addEventListener("mouseup", onMouseUp);
          });
        });
      
        // ⏱️ Only observe resizing once per wrapper
        if (!wrapper._resizeObserved) {
          wrapper._resizeObserved = true;

          const ro = new ResizeObserver((entries) => {
            for (const ent of entries) {
              const target = ent.target;

              // 🚫 If the element is no longer in the DOM, stop observing
              if (!document.body.contains(target)) {
                ro.unobserve(target); // just stop observing this one, not all
                return;
              }

              const wRect = ent.contentRect;
              const pRect = editor.getBoundingClientRect();
              const left = target.offsetLeft;
              const top = target.offsetTop;

              // Keep within editor bounds
              if (wRect.width > pRect.width - left)
                target.style.width = pRect.width - left + "px";
              if (wRect.height > pRect.height - top)
                target.style.height = pRect.height - top + "px";

              const id = target.dataset.uid || (target.dataset.uid = Math.random().toString(36).slice(2));
              const width = target.style.width;
              const height = target.style.height;

              if (!target._resizeState) {
                target._resizeState = {
                  from: { width, height },
                  timeout: null,
                };
              }

              clearTimeout(target._resizeState.timeout);

              target._resizeState.timeout = setTimeout(() => {
                const from = target._resizeState.from;
                const to = {
                  width: target.style.width,
                  height: target.style.height,
                };
                if (from.width !== to.width || from.height !== to.height) {
                  pushUndoState({
                    type: "resize-image",
                    id,
                    from,
                    to,
                  });
                }
                target._resizeState = null;
              }, 300);
            }
          });
          ro.observe(wrapper);

          // 💾 Store reference for manual cleanup if needed later
          wrapper._resizeObserver = ro;
        }
      }
      
      
      
  
      // --- FILE UPLOADER ---
      imageUploader.addEventListener("change", () => {
        const file = imageUploader.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const before = editor.innerHTML;
          const wrapper = document.createElement("div");
          wrapper.className = "resizable";
          wrapper.contentEditable = "false";
          Object.assign(wrapper.style, {
            position: "absolute",
            left: "0px",
            top: "0px",
            width: "200px",
            height: "200px",
            zIndex: "10",
          });
          const img = document.createElement("img");
          img.src = reader.result;
          wrapper.appendChild(img);
          const sel = window.getSelection();
          if (sel.rangeCount) sel.getRangeAt(0).insertNode(wrapper);
          else editor.appendChild(wrapper);
          attachDragHandle(wrapper);
          const after = editor.innerHTML;
          pushDOMUndoState({ target: editor, from: before, to: after });

        };
        reader.readAsDataURL(file);
        imageUploader.value = "";
      });
  
      // --- IMAGE IN FRONT OR BEHIND TEXT ---
      window.setImageZIndex = function (mode) {
        const w = document.querySelector(".resizable.selected");
        if (!w) return;
        w.classList.remove("front", "back");
        w.classList.add(mode === "front" ? "front" : "back");
      };
  
      // --- SPACING MENU ---      
      spacingMenu.addEventListener("change", () => {
        const before = editor.innerHTML;
        switch (spacingMenu.value) {
          case "ls-1":
            setLineSpacing("1");
            break;
          case "ls-1.15":
            setLineSpacing("1.15");
            break;
          case "ls-1.5":
            setLineSpacing("1.5");
            break;
          case "ls-2":
            setLineSpacing("2");
            break;
        }
        spacingMenu.value = "";
        const after = editor.innerHTML;
        pushDOMUndoState({ target: editor, from: before, to: after });
      });
      function getClosestBlock() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        let node = sel.anchorNode;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        return node.closest("p, li, td, th");
      }
      function setLineSpacing(value) {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
      
        const range = sel.getRangeAt(0);
        const contents = range.cloneContents();
      
        // Find all block-level elements inside the selection
        const blocks = Array.from(contents.querySelectorAll('p, div, li, td, th'));
      
        // If none found, fallback to the closest block
        if (blocks.length === 0) {
          let node = sel.anchorNode;
          if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
          while (node && node !== editor && !['P', 'DIV', 'LI', 'TD', 'TH'].includes(node.tagName)) {
            node = node.parentElement;
          }
          if (node && node !== editor) {
            node.style.lineHeight = value;
          }
          return;
        }
      
        // Apply line-height to each block in selection
        blocks.forEach(block => {
          const match = Array.from(editor.querySelectorAll(block.tagName)).find(el => el.textContent === block.textContent);
          if (match) {
            match.style.lineHeight = value;
          }
        });
      }
      
      // — UPDATE your existing click listener to include both “pick hidden image” and “ctrl-click link” logic:
      editor.addEventListener("click", (e) => {
        const isCmdClick = e.ctrlKey || e.metaKey;

        // 1️⃣ Pick hidden-back image (your existing code):
        if (isCmdClick && !e.target.closest(".resizable")) {
          const { clientX: x, clientY: y } = e;
          for (let w of editor.querySelectorAll(".resizable.back")) {
            const r = w.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
              document
                .querySelectorAll(".resizable.selected")
                .forEach(n => n.classList.remove("selected"));
              w.classList.add("selected");
              window.selectedWrapper = w;
              e.preventDefault();
              return;
            }
          }
        }

        // 2️⃣ Ctrl/Cmd-click on a link → open in new tab
        const anchor = e.target.closest("a");
        if (anchor && isCmdClick) {
          e.preventDefault();
          window.open(anchor.href, "_blank");
          return;
        }

        // 3️⃣ Deselect wrapper if clicked outside
        if (!e.target.closest(".resizable") && window.selectedWrapper && !isLocked) {
          window.selectedWrapper.classList.remove("selected");
          window.selectedWrapper = null;
        }
      });      
  

  
      // 3) 🔍 button → one-shot pick-behind mode
      // one-shot pick mode toggle
      pickBtn.addEventListener("click", () => {
        pickMode = true;
        pickBtn.classList.add("active");
        pickBtn.textContent = "🖱️…";
      });
  
      // pick or ctrl-click to select hidden image
      editor.addEventListener("mousedown", (e) => {
        if (!(e.ctrlKey || pickMode)) return;
        const wasPick = pickMode;
        pickMode = false;
        if (wasPick) {
          pickBtn.classList.remove("active");
          pickBtn.textContent = "🔍";
        }
  
        const { clientX: x, clientY: y } = e;
        const els = document.elementsFromPoint(x, y);
        const wrapper = els.find(
          (el) =>
            el.classList?.contains("resizable") && el.classList.contains("back"),
        );
        if (wrapper) {
          document
            .querySelectorAll(".resizable.selected")
            .forEach((w) => w.classList.remove("selected"));
          wrapper.classList.add("selected");
          window.selectedWrapper = wrapper;
          e.preventDefault();
        }
      });

  
      editor.addEventListener("mousedown", (e) => {
        if (!pickMode) return;
        pickMode = false;
        pickBtn.classList.remove("active");
        const x = e.clientX,
          y = e.clientY;
        for (let w of editor.querySelectorAll(".resizable.back")) {
          const r = w.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            document
              .querySelectorAll(".resizable.selected")
              .forEach((n) => n.classList.remove("selected"));
            w.classList.add("selected");
            window.selectedWrapper = w;
            e.preventDefault();
            break;
          }
        }
      });
  
  
      // --- KEYDOWN HANDLING ---
      document.addEventListener("keydown", (e) => {
        if (!editor.contains(document.activeElement)) return;

        // handle Backspace/Delete
        if (["Backspace", "Delete"].includes(e.key)) {
          const sel = window.getSelection();
          if (sel.isCollapsed && sel.rangeCount) {
            let node = sel.anchorNode;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        
            // — delete a table if we're inside one —
            const tableWrapper = node.closest(".table-wrapper");
            if (tableWrapper) {
              e.preventDefault();
              const before = editor.innerHTML;
              tableWrapper.remove();
              localStorage.setItem("editorContent", editor.innerHTML);
              pushDOMUndoState({
                target: editor,
                from: before,
                to:   editor.innerHTML
              });
              return;
            }
        
            // — Delete resizable wrapper (image) —
            const w = node.closest(".resizable");
            if (w) {
              e.preventDefault();
        
              // ensure stable UID
              const uid = w.dataset.uid || (w.dataset.uid = Math.random().toString(36).slice(2));
              const parent = w.parentNode;
              const nextSibling = w.nextSibling;
        
              // push undo
              pushUndoState({
                type: "delete-image",
                id:   uid,
                node: w,
                parent,
                nextSibling
              });
        
              // cleanup observer + remove
              if (w._resizeObserver) {
                w._resizeObserver.unobserve(w);
                w._resizeObserver.disconnect();
              }
              w.remove();
        
              // persist
              localStorage.setItem("editorContent", editor.innerHTML);
              return;
            }
        
            // — Backspace before visual tab stop —
            if (e.key === "Backspace") {
              const prev = node.previousSibling || node.childNodes[sel.anchorOffset - 1];
              if (prev?.classList.contains("visual-tab-stop")) {
                e.preventDefault();
                pushUndoState({
                  type:       "delete-tab",
                  id:         prev.dataset.uid,
                  node:       prev,
                  parent:     prev.parentNode,
                  nextSibling: prev.nextSibling
                });
                prev.remove();
                localStorage.setItem("editorContent", editor.innerHTML);
                return;
              }
            }
        
            // — Delete when cursor is before a visual tab stop —
            if (e.key === "Delete") {
              const next = node.nextSibling || node.childNodes[sel.anchorOffset];
              if (next?.classList.contains("visual-tab-stop")) {
                e.preventDefault();
                pushUndoState({
                  type:       "delete-tab",
                  id:         next.dataset.uid,
                  node:       next,
                  parent:     next.parentNode,
                  nextSibling: next.nextSibling
                });
                next.remove();
                localStorage.setItem("editorContent", editor.innerHTML);
                return;
              }
            }
          }
        }
        

        // helper to insert a visual tab stop
        function insertVisualTabStop() {
          const sel = window.getSelection();
          if (!sel.rangeCount) return;
          const range = sel.getRangeAt(0);
          range.deleteContents();

          const tab = document.createElement("span");
          tab.className = "visual-tab-stop";
          tab.contentEditable = "false";
          tab.innerHTML = "\u200B"; // zero-width space
          tab.style.display = "inline-block";
          tab.style.width   = "0.5in";
          tab.style.height  = "1px";
          tab.style.verticalAlign = "baseline";
          tab.style.whiteSpace     = "nowrap";
          tab.style.userSelect     = "none";
          tab.style.pointerEvents  = "none";
          tab.style.overflow       = "hidden";

          range.insertNode(tab);

          // single undo entry
          const id = Math.random().toString(36).slice(2);
          tab.dataset.uid = id;
          pushUndoState({
            type:       "insert-tab",
            id,
            node:       tab,
            parent:     tab.parentNode,
            nextSibling: tab.nextSibling
          });

          range.setStartAfter(tab);
          range.setEndAfter(tab);
          sel.removeAllRanges();
          sel.addRange(range);
          localStorage.setItem("editorContent", editor.innerHTML);
        }

        // Tab indent/outdent or insert visual tab
        if (e.key === "Tab") {
          e.preventDefault();
          const li = getClosestBlock();
          if (e.shiftKey) exec("outdent");
          else if (li) exec("indent");
          else insertVisualTabStop();
          return;
        }

        // backspace at start of list → outdent
        if (e.key === "Backspace") {
          const sel2 = window.getSelection();
          if (sel2.isCollapsed && sel2.rangeCount) {
            const r = sel2.getRangeAt(0);
            if (r.startOffset === 0 && getClosestBlock()?.tagName === "LI") {
              e.preventDefault();
              exec("outdent");
              return;
            }
          }
        }

        // Ctrl/Cmd shortcuts
        if (e.ctrlKey || e.metaKey) {
          switch (e.key.toLowerCase()) {
            case "b":
              e.preventDefault();
              const beforeBold = editor.innerHTML;
              exec("bold");
              pushDOMUndoState({ target: editor, from: beforeBold, to: editor.innerHTML });
              break;
            case "i":
              e.preventDefault();
              const beforeItalic = editor.innerHTML;
              exec("italic");
              pushDOMUndoState({ target: editor, from: beforeItalic, to: editor.innerHTML });
              break;
            case "u":
              e.preventDefault();
              const beforeUnderline = editor.innerHTML;
              exec("underline");
              pushDOMUndoState({ target: editor, from: beforeUnderline, to: editor.innerHTML });
              break;
            case "z":
              e.preventDefault();
              if (undoIndex >= 0) {
                applyUndoAction(undoStack[undoIndex], "undo");
                undoIndex--;
              } else {
                exec("undo");
              }
              break;
            case "y":
              e.preventDefault();
              if (undoIndex + 1 < undoStack.length) {
                applyUndoAction(undoStack[undoIndex + 1], "redo");
                undoIndex++;
              } else {
                exec("redo");
              }
              break;
            case "p":
              e.preventDefault();
              printContent();
              break;
          }
        }
      });
      // --- KEYUP AUTOLINK ---
      editor.addEventListener("keyup", function onKeyupAutolink(e) {
        if (e.key !== " " && e.key !== "Enter") return;
        const reg = /(https?:\/\/[^\s]+)/g;
        const sel = window.getSelection();
        const n = sel.anchorNode;
        if (!n || n.nodeType !== Node.TEXT_NODE) return;
        const m = reg.exec(n.textContent);
        if (!m) return;
        const u = m[0];
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + u.length);
        sel.removeAllRanges();
        sel.addRange(r);
        exec("createLink", u);
        const a = sel.anchorNode.closest
          ? sel.anchorNode.closest("a")
          : sel.anchorNode.parentElement;
        if (a && a.tagName === "A") a.setAttribute("target", "_blank");
        sel.collapseToEnd();
      });

    });
  })();
  
