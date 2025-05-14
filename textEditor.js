// textEditor.js
(function () {
    let savedRange = null;
  
    const undoStack = [];
    let undoIndex = -1;
  
    function pushUndoState(action) {
      // Remove anything ahead of current undo position
      undoStack.splice(undoIndex + 1);
      undoStack.push(action);
      undoIndex = undoStack.length - 1;
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
        if (action?.type === "move-image") {
          const target = editor.querySelector(
            `.resizable[data-uid="${action.id}"]`,
          );
          if (target) {
            target.style.left = action.from.left;
            target.style.top = action.from.top;
          }
        }
        undoIndex--;
      } else {
        exec("undo");
      }
    };
  
    window.handleRedo = function () {
      if (undoIndex + 1 < undoStack.length) {
        const action = undoStack[undoIndex + 1];
        if (action?.type === "move-image") {
          const target = editor.querySelector(
            `.resizable[data-uid="${action.id}"]`,
          );
          if (target) {
            target.style.left = action.to.left;
            target.style.top = action.to.top;
          }
        }
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
      editor.addEventListener("input", () => {
        localStorage.setItem("editorContent", editor.innerHTML);
      });
  
      // persist inline style changes
      const styleObserver = new MutationObserver(() => {
        localStorage.setItem("editorContent", editor.innerHTML);
      });
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
  
        // as soon as we lock, clear any blue highlight
        if (isLocked) {
          document
            .querySelectorAll(".resizable.selected")
            .forEach((w) => w.classList.remove("selected"));
          selectedWrapper = null;
        }
  
        editor.contentEditable = (!isLocked).toString();
        toolbar.style.display = isLocked ? "none" : "";
        editor.style.border = isLocked ? "1px solid #ccc" : "3px solid #888";
        toggleLockBtn.textContent = isLocked
          ? "🔓 Unlock Editing"
          : "🔒 Lock Editing";
  
        // re-attach or disable drag handles as needed
        document
          .querySelectorAll(".resizable")
          .forEach((w) => attachDragHandle(w));
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
      });
  
      // --- IMAGE BY URL ---
      window.imagePrompt = function () {
        const url = prompt("Enter image URL:");
        if (url) {
          exec("insertHTML", `<div class="resizable"><img src="${url}"/></div>`);
        }
      };
  
      // --- TABLE PROMPT ---
      window.tablePrompt = function () {
        const rows = parseInt(prompt("Rows?", "5"), 10);
        const cols = parseInt(prompt("Cols?", "5"), 10);
        if (!rows || !cols) return;
        // build modal + jspreadsheet as before…
        const modal = document.createElement("div");
        Object.assign(modal.style, {
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        });
        document.body.appendChild(modal);
        const holder = document.createElement("div");
        Object.assign(holder.style, {
          background: "#fff",
          padding: "20px",
          borderRadius: "4px",
          width: "80vw",
          height: "80vh",
          display: "flex",
          flexDirection: "column",
        });
        modal.appendChild(holder);
        const jspContainer = document.createElement("div");
        Object.assign(jspContainer.style, { flex: "1", overflow: "hidden" });
        holder.appendChild(jspContainer);
        const data = Array.from({ length: rows }, () =>
          Array.from({ length: cols }, () => ""),
        );
        const hot = jspreadsheet(jspContainer, {
          data,
          rowResize: true,
          columnResize: true,
          mergeCells: true,
          contextMenu: true,
          defaultColWidth: 100,
          defaultRowHeight: 24,
          allowInsertRow: true,
          allowInsertColumn: true,
          allowDeleteRow: true,
          allowDeleteColumn: true,
          allowEditBorder: true,
        });
        const btnBar = document.createElement("div");
        Object.assign(btnBar.style, { textAlign: "right", marginTop: "8px" });
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "Cancel";
        const okBtn = document.createElement("button");
        okBtn.textContent = "OK";
        cancelBtn.style.marginRight = "8px";
        btnBar.append(cancelBtn, okBtn);
        holder.appendChild(btnBar);
        cancelBtn.addEventListener("click", () => modal.remove());
        okBtn.addEventListener("click", () => {
          const htmlTable =
            typeof hot.getHtml === "function" ? hot.getHtml() : "";
          if (htmlTable) exec("insertHTML", htmlTable);
          modal.remove();
        });
      };
  
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
        editor.style.paddingTop = marginTop.value + "in";
        editor.style.paddingRight = marginRight.value + "in";
        editor.style.paddingBottom = marginBottom.value + "in";
        editor.style.paddingLeft = marginLeft.value + "in";
        marginModal.style.display = "none";
        localStorage.setItem(
          "editorMargins",
          JSON.stringify({
            top: marginTop.value,
            right: marginRight.value,
            bottom: marginBottom.value,
            left: marginLeft.value,
          }),
        );
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
          const h = wrapper.querySelector(".drag-handle");
          if (h) h.style.display = "none";
          return;
        }
        wrapper.style.pointerEvents = "auto";
        wrapper.style.position = wrapper.style.position || "absolute";
        let handle = wrapper.querySelector(".drag-handle");
        if (!handle) {
          handle = document.createElement("div");
          handle.className = "drag-handle";
          wrapper.appendChild(handle);
        }
        handle.style.display = "";
        if (handle._dragInit) return;
        handle._dragInit = true;
  
        handle.addEventListener("mousedown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const parentRect = editor.getBoundingClientRect();
          const startRect = wrapper.getBoundingClientRect();
          const startX = e.clientX;
          const startY = e.clientY;
          const origX = startRect.left - parentRect.left;
          const origY = startRect.top - parentRect.top;
  
          const id =
            wrapper.dataset.uid ||
            (wrapper.dataset.uid = Math.random().toString(36).slice(2));
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
  
        const ro = new ResizeObserver((entries) => {
          entries.forEach((ent) => {
            const target = ent.target; // renamed from wrapper ➝ target
            const wRect = ent.contentRect;
            const pRect = editor.getBoundingClientRect();
            const left = target.offsetLeft;
            const top = target.offsetTop;
  
            // Enforce size boundaries
            if (wRect.width > pRect.width - left)
              target.style.width = pRect.width - left + "px";
            if (wRect.height > pRect.height - top)
              target.style.height = pRect.height - top + "px";
  
            // Debounced undo tracking
            const id =
              target.dataset.uid ||
              (target.dataset.uid = Math.random().toString(36).slice(2));
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
          });
        });
        ro.observe(wrapper);
      }
  
      // --- FILE UPLOADER ---
      imageUploader.addEventListener("change", () => {
        const file = imageUploader.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
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
          case "pb-toggle":
            toggleSpacingBefore();
            break;
          case "pa-toggle":
            toggleSpacingAfter();
            break;
        }
        spacingMenu.value = "";
      });
      function getClosestBlock() {
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        let node = sel.anchorNode;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        return node.closest("p, li, td, th");
      }
      function setLineSpacing(v) {
        const b = getClosestBlock();
        if (b) b.style.lineHeight = v;
      }
      function toggleSpacingBefore() {
        const b = getClosestBlock();
        if (!b) return;
        const p = ["TD", "TH"].includes(b.tagName) ? "paddingTop" : "marginTop";
        const c = parseFloat(getComputedStyle(b)[p]) || 0;
        b.style[p] = (c > 0 ? 0 : 8) + "px";
      }
      function toggleSpacingAfter() {
        const b = getClosestBlock();
        if (!b) return;
        const p = ["TD", "TH"].includes(b.tagName)
          ? "paddingBottom"
          : "marginBottom";
        const c = parseFloat(getComputedStyle(b)[p]) || 0;
        b.style[p] = (c > 0 ? 0 : 8) + "px";
      }
  
      // 1) Ctrl/Cmd+click to pick hidden images
      editor.addEventListener("click", (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.target.closest(".resizable")) return;
        const { clientX: x, clientY: y } = e;
        for (let w of editor.querySelectorAll(".resizable.back")) {
          const r = w.getBoundingClientRect();
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            document
              .querySelectorAll(".resizable.selected")
              .forEach((n) => n.classList.remove("selected"));
            w.classList.add("selected");
            window.selectedWrapper = w;
            e.preventDefault();
            e.stopImmediatePropagation(); // so the link-handler won’t run
            return;
          }
        }
      });
  
      // 2) Ctrl+click open-link (runs only if not handled above)
      editor.addEventListener("click", (e) => {
        if (e.defaultPrevented) return;
        const a = e.target.closest("a");
        if (a && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          window.open(a.href, "_blank");
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
  
      editor.addEventListener("click", (e) => {
        if (isLocked) return;
        if (!e.target.closest(".resizable") && selectedWrapper) {
          selectedWrapper.classList.remove("selected");
          selectedWrapper = null;
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
  
      // 2) Ctrl+click open link
      editor.addEventListener("click", (e) => {
        if (e.defaultPrevented) return; // skip if pick-behind already ran
        const a = e.target.closest("a");
        if (a && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          window.open(a.href, "_blank");
        }
      });
  
      // --- KEYDOWN HANDLING ---
      document.addEventListener("keydown", (e) => {
        if (document.activeElement !== editor) return;
  
        // delete wrapper on backspace/delete
        if (["Backspace", "Delete"].includes(e.key)) {
          const sel = window.getSelection();
          if (sel.isCollapsed && sel.rangeCount) {
            let n = sel.anchorNode;
            if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
            const w = n.closest(".resizable");
            if (w) {
              e.preventDefault();
              const r = document.createRange();
              r.selectNode(w);
              sel.removeAllRanges();
              sel.addRange(r);
              exec("insertHTML", "");
              return;
            }
          }
        }
  
        // Tab indent/outdent
        if (e.key === "Tab") {
          e.preventDefault();
          const li = getClosestBlock();
          if (e.shiftKey) exec("outdent");
          else if (li) exec("indent");
          else exec("insertHTML", "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;");
          return;
        }
  
        // backspace at start of list → outdent
        if (e.key === "Backspace") {
          const sel = window.getSelection();
          if (sel.isCollapsed && sel.rangeCount) {
            const r = sel.getRangeAt(0);
            if (r.startOffset === 0 && getClosestBlock()?.tagName === "LI") {
              e.preventDefault();
              exec("outdent");
              return;
            }
          }
        }
  
        // ctrl shortcuts
        switch (e.key.toLowerCase()) {
          case "b":
            e.preventDefault();
            exec("bold");
            break;
          case "i":
            e.preventDefault();
            exec("italic");
            break;
          case "u":
            e.preventDefault();
            exec("underline");
            break;
  
          case "z":
            e.preventDefault();
            if (undoIndex >= 0) {
              const action = undoStack[undoIndex];
              if (action?.type === "move-image") {
                const target = editor.querySelector(
                  `.resizable[data-uid="${action.id}"]`,
                );
                if (target) {
                  target.style.left = action.from.left;
                  target.style.top = action.from.top;
                }
              } else if (action?.type === "resize-image") {
                const target = editor.querySelector(
                  `.resizable[data-uid="${action.id}"]`,
                );
                if (target) {
                  target.style.width = action.from.width;
                  target.style.height = action.from.height;
                }
              }
              undoIndex--;
            } else {
              exec("undo");
            }
            break;
  
          case "y":
            e.preventDefault();
            if (undoIndex + 1 < undoStack.length) {
              const action = undoStack[undoIndex + 1];
              if (action?.type === "move-image") {
                const target = editor.querySelector(
                  `.resizable[data-uid="${action.id}"]`,
                );
                if (target) {
                  target.style.left = action.to.left;
                  target.style.top = action.to.top;
                }
              } else if (action?.type === "resize-image") {
                const target = editor.querySelector(
                  `.resizable[data-uid="${action.id}"]`,
                );
                if (target) {
                  target.style.width = action.to.width;
                  target.style.height = action.to.height;
                }
              }
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
  
        // --- KEYUP AUTOLINK ---
        editor.addEventListener("keyup", (e) => {
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
    });
  })();
  
