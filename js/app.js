import { QuestionParser } from './parser.js';
import { QTIGenerator } from './qti-generator.js';

// Application State
const state = {
  questions: [],
  format: 'auto', // 'auto', 'markdown', 'aiken', 'tsv'
  quizOptions: {
    title: 'TSTC Question Bank',
    description: 'Generated QTI Question Bank for Canvas.',
    shuffleAnswers: true,
    showCorrectAnswers: true,
    oneQuestionAtATime: false,
    cantGoBack: false
  },
  spreadsheetRows: [],
  approvedWarnings: new Set() // Track approved/dismissed warnings
};

// Initial Demo Content
const demoMarkdown = `Quiz Title: TSTC Tech Quiz
Quiz Description: A sample question bank for Instructional Designers at TSTC.

Title: Cloud Computing
Points: 1
1. Which of the following is a primary service model in cloud computing?
*a) Infrastructure as a Service (IaaS)
b) Network as a Service (Naas)
c) Operating System as a Service (OSaaS)
d) Hardware as a Service (HaaS)
... IaaS provides virtualization, storage, and networking resources.

Title: True/False Question
Points: 1
2. Canvas Classic Quizzes require QTI 1.2 format for XML imports.
*a) True
b) False
... Correct! Canvas imports classic quizzes strictly using the QTI 1.2 specification.

Title: SRE Multiple Answers
Points: 2
3. Identify the core pillars of DevOps culture. (Select all that apply)
[*] Shared responsibility
[*] Continuous improvement
[ ] Strict silos
[*] Automation of testing

Title: Short Answer / Blank
Points: 1
4. What is the acronym for Learning Management System?
* LMS
* L.M.S.

Title: Python Code Essay
Points: 5
5. Write a python function to check if a number is prime.
___

Title: File Upload
Points: 5
6. Upload your project design PDF.
^^^^

Title: Math Calculation
Points: 2
7. What is 25 * 4?
= 100 +- 0.5
`;

// Column headers for spreadsheet grid
const spreadsheetHeaders = [
  'Question Text', 'Type (MC, TF, MA, FITB, Essay, Num)', 'Points', 
  'Correct Answer(s)', 'Choice A', 'Choice B', 'Choice C', 'Choice D', 'General Feedback'
];

// Initialize UI
document.addEventListener('DOMContentLoaded', () => {
  const parser = new QuestionParser();
  const generator = new QTIGenerator();
  
  // DOM Elements
  const textEditor = document.getElementById('text-editor');
  const previewBody = document.getElementById('preview-body');
  const alertContainer = document.getElementById('alert-container');
  const quizTitleInput = document.getElementById('quiz-title');
  const quizDescInput = document.getElementById('quiz-description');
  const shuffleSwitch = document.getElementById('opt-shuffle');
  const showAnswersSwitch = document.getElementById('opt-show-answers');
  const oneQuestionSwitch = document.getElementById('opt-one-question');
  const cantGoBackSwitch = document.getElementById('opt-cant-back');
  
  const tabMarkdown = document.getElementById('tab-markdown');
  const tabSpreadsheet = document.getElementById('tab-spreadsheet');
  const contentMarkdown = document.getElementById('content-markdown');
  const contentSpreadsheet = document.getElementById('content-spreadsheet');
  
  const btnDownload = document.getElementById('btn-download');
  const btnDemo = document.getElementById('btn-load-demo');
  const btnHelp = document.getElementById('btn-show-help');
  const btnAutoClean = document.getElementById('btn-auto-clean');
  const modalHelp = document.getElementById('modal-help');
  const modalClose = document.getElementById('modal-close');
  
  const gridTableBody = document.getElementById('grid-table-body');
  const btnAddRow = document.getElementById('btn-add-row');
  const btnClearGrid = document.getElementById('btn-clear-grid');

  // File Upload Elements
  const uploadZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');
  const uploadZoneContent = document.getElementById('upload-zone-content');
  const uploadFileInfo = document.getElementById('upload-file-info');
  const uploadFileName = document.getElementById('upload-file-name');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  const charCountSpan = document.getElementById('editor-char-count');

  // Set initial input states
  quizTitleInput.value = state.quizOptions.title;
  quizDescInput.value = state.quizOptions.description;
  shuffleSwitch.checked = state.quizOptions.shuffleAnswers;
  showAnswersSwitch.checked = state.quizOptions.showCorrectAnswers;
  oneQuestionSwitch.checked = state.quizOptions.oneQuestionAtATime;
  cantGoBackSwitch.checked = state.quizOptions.cantGoBack;

  // Helper to update character count
  function updateCharCount() {
    if (charCountSpan && textEditor) {
      charCountSpan.innerText = `${textEditor.value.length} character${textEditor.value.length !== 1 ? 's' : ''}`;
    }
  }

  // Initialize spreadsheet grid rows (start with 5 empty rows)
  initializeGrid(5);

  // File Upload Event Listeners
  uploadZone.addEventListener('click', (e) => {
    if (e.target.closest('#btn-remove-file')) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.value = '';
    uploadFileInfo.style.display = 'none';
    uploadZoneContent.style.display = 'block';
    
    // Clear editors
    textEditor.value = '';
    updateCharCount();
    state.approvedWarnings.clear();
    initializeGrid(5);
    triggerParse();
    showToast("Uploaded file removed.", "info");
  });

  // Tab switching
  tabMarkdown.addEventListener('click', () => {
    tabMarkdown.classList.add('active');
    tabSpreadsheet.classList.remove('active');
    contentMarkdown.classList.add('active');
    contentSpreadsheet.classList.remove('active');
    state.format = 'auto';
    triggerParse();
  });

  tabSpreadsheet.addEventListener('click', () => {
    tabSpreadsheet.classList.add('active');
    tabMarkdown.classList.remove('active');
    contentSpreadsheet.classList.add('active');
    contentMarkdown.classList.remove('active');
    state.format = 'tsv';
    triggerParse();
  });

  // Help Modal
  btnHelp.addEventListener('click', () => {
    modalHelp.style.display = 'flex';
  });
  modalClose.addEventListener('click', () => {
    modalHelp.style.display = 'none';
  });
  window.addEventListener('click', (e) => {
    if (e.target === modalHelp) {
      modalHelp.style.display = 'none';
    }
  });

  // Auto-Clean Text Button Listener
  btnAutoClean.addEventListener('click', () => {
    if (!contentMarkdown.classList.contains('active')) {
      showToast("Auto-Clean is only supported for text in the Text Editor tab.", "info");
      return;
    }
    const currentText = textEditor.value;
    if (!currentText.trim()) {
      showToast("Please enter some text in the Text Editor to clean up first.", "info");
      return;
    }
    const cleaned = QuestionParser.cleanText(currentText);
    textEditor.value = cleaned;
    updateCharCount();
    triggerParse();
    showToast("Text cleaned and standardized successfully!", "success");
  });

  // Settings change listeners
  quizTitleInput.addEventListener('input', (e) => {
    state.quizOptions.title = e.target.value || 'TSTC Question Bank';
  });
  quizDescInput.addEventListener('input', (e) => {
    state.quizOptions.description = e.target.value || '';
  });
  shuffleSwitch.addEventListener('change', (e) => {
    state.quizOptions.shuffleAnswers = e.target.checked;
  });
  showAnswersSwitch.addEventListener('change', (e) => {
    state.quizOptions.showCorrectAnswers = e.target.checked;
  });
  oneQuestionSwitch.addEventListener('change', (e) => {
    state.quizOptions.oneQuestionAtATime = e.target.checked;
  });
  cantGoBackSwitch.addEventListener('change', (e) => {
    state.quizOptions.cantGoBack = e.target.checked;
  });

  // Parser Debouncer
  let parseTimeout = null;
  textEditor.addEventListener('input', () => {
    updateCharCount();
    clearTimeout(parseTimeout);
    parseTimeout = setTimeout(triggerParse, 400);
  });

  // Load Demo Content
  btnDemo.addEventListener('click', () => {
    state.approvedWarnings.clear();
    if (contentMarkdown.classList.contains('active')) {
      textEditor.value = demoMarkdown;
      updateCharCount();
      triggerParse();
      showToast("Demo markdown loaded successfully!", "success");
    } else {
      loadDemoToGrid();
      triggerParse();
      showToast("Demo spreadsheet data loaded successfully!", "success");
    }
  });

  // Grid Controls
  btnAddRow.addEventListener('click', () => {
    addGridRow();
    triggerParse();
  });
  btnClearGrid.addEventListener('click', () => {
    if (confirm("Are you sure you want to clear the spreadsheet data?")) {
      initializeGrid(5);
      state.approvedWarnings.clear();
      triggerParse();
      showToast("Spreadsheet cleared.", "info");
    }
  });

  // Parser activation logic
  function triggerParse() {
    let parsed = [];
    if (contentMarkdown.classList.contains('active')) {
      // Parse markdown text
      parsed = parser.parse(textEditor.value, 'auto');
      
      // If the markdown file set quiz headers, synchronize the UI fields!
      if (parsed.quizTitle && parsed.quizTitle !== 'Quiz') {
        state.quizOptions.title = parsed.quizTitle;
        quizTitleInput.value = parsed.quizTitle;
      }
      if (parsed.quizDescription) {
        state.quizOptions.description = parsed.quizDescription;
        quizDescInput.value = parsed.quizDescription;
      }
      if (parsed.settings) {
        state.quizOptions.shuffleAnswers = parsed.settings.shuffle_answers === 'true';
        shuffleSwitch.checked = state.quizOptions.shuffleAnswers;
        
        state.quizOptions.showCorrectAnswers = parsed.settings.show_correct_answers === 'true';
        showAnswersSwitch.checked = state.quizOptions.showCorrectAnswers;

        state.quizOptions.oneQuestionAtATime = parsed.settings.one_question_at_a_time === 'true';
        oneQuestionSwitch.checked = state.quizOptions.oneQuestionAtATime;

        state.quizOptions.cantGoBack = parsed.settings.cant_go_back === 'true';
        cantGoBackSwitch.checked = state.quizOptions.cantGoBack;
      }
    } else {
      // Parse from Grid
      const tsvText = convertGridToTSV();
      parsed = parser.parse(tsvText, 'tsv');
    }

    state.questions = parsed;
    renderPreview();
    renderValidationLogs(parser.errors, parser.warnings);
  }

  // Generate spreadsheet grid
  function initializeGrid(rowCount) {
    gridTableBody.innerHTML = '';
    state.spreadsheetRows = [];
    for (let r = 0; r < rowCount; r++) {
      addGridRow();
    }
  }

  function addGridRow(data = null) {
    const rowIdx = state.spreadsheetRows.length;
    const tr = document.createElement('tr');
    const cols = [];

    spreadsheetHeaders.forEach((_, cIdx) => {
      const td = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.row = rowIdx;
      input.dataset.col = cIdx;
      input.value = data ? (data[cIdx] || '') : '';
      
      input.addEventListener('input', (e) => {
        const r = parseInt(e.target.dataset.row);
        const c = parseInt(e.target.dataset.col);
        state.spreadsheetRows[r][c] = e.target.value;
        
        // Auto add row if editing the last row
        if (r === state.spreadsheetRows.length - 1 && e.target.value.trim() !== '') {
          addGridRow();
        }

        clearTimeout(parseTimeout);
        parseTimeout = setTimeout(triggerParse, 400);
      });

      // Paste handler to split grid cell copy/pastes
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text');
        handleGridPaste(rowIdx, cIdx, pasteData);
      });

      td.appendChild(input);
      tr.appendChild(td);
      cols.push(input.value);
    });

    gridTableBody.appendChild(tr);
    state.spreadsheetRows.push(cols);
  }

  function handleGridPaste(startRow, startCol, pasteText) {
    const rows = pasteText.split('\n');
    rows.forEach((rowText, rOffset) => {
      if (!rowText.trim()) return;
      const cells = rowText.split('\t');
      const targetRow = startRow + rOffset;

      // Add rows if they don't exist
      while (targetRow >= state.spreadsheetRows.length) {
        addGridRow();
      }

      cells.forEach((cellValue, cOffset) => {
        const targetCol = startCol + cOffset;
        if (targetCol < spreadsheetHeaders.length) {
          state.spreadsheetRows[targetRow][targetCol] = cellValue.trim();
          
          // Update DOM input directly
          const input = gridTableBody.querySelector(`input[data-row="${targetRow}"][data-col="${targetCol}"]`);
          if (input) {
            input.value = cellValue.trim();
          }
        }
      });
    });

    triggerParse();
    showToast("Pasted data mapped successfully!", "success");
  }

  function convertGridToTSV() {
    // Generate TSV string
    const headerRow = spreadsheetHeaders.join('\t');
    const dataRows = state.spreadsheetRows
      .filter(row => row.some(cell => cell.trim() !== '')) // skip completely empty rows
      .map(row => row.join('\t'));
    
    return [headerRow, ...dataRows].join('\n');
  }

  function loadDemoToGrid() {
    const demoData = [
      ['Which of the following is a TSTC brand color?', 'MC', '1', 'A', 'Royal Blue', 'Green', 'Maroon', 'Red', 'Royal blue is the primary TSTC brand color.'],
      ['Short-Answer (FITB) questions support multiple alternate correct values.', 'TF', '1', 'True', 'True', 'False', '', '', 'Correct! Fill-in-the-blank maps all alternate choices as 100% correct.'],
      ['Check all that are valid QTI question types.', 'MA', '2', 'A, C, D', 'Essay', 'Aiken', 'Numerical', 'File Upload', 'Canvas supports essays, numericals, uploads, etc.'],
      ['What is the value of 5 + 5?', 'FITB', '1', '10', 'ten', '', '', '', 'Accepts 10 or ten.'],
      ['Provide a summary of your curriculum mapping plan.', 'Essay', '5', '', '', '', '', '', 'Essays must be graded manually.'],
      ['What is 50 / 2?', 'Num', '1', '25 +- 0.1', '', '', '', '', 'Exact match is 25. Acceptable range is 24.9 - 25.1.']
    ];

    initializeGrid(0);
    demoData.forEach(row => addGridRow(row));
  }

  // Render question cards in preview pane
  function renderPreview() {
    previewBody.innerHTML = '';
    
    // Update stats headers
    document.getElementById('stat-q-count').innerText = state.questions.length;
    const totalPoints = state.questions.reduce((acc, q) => acc + q.points, 0);
    document.getElementById('stat-points').innerText = totalPoints;

    if (state.questions.length === 0) {
      previewBody.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-file-import"></i>
          <h3>No Questions Parsed</h3>
          <p>Paste text, upload a file, or enter questions to see a real-time visual preview of your Canvas question bank.</p>
        </div>`;
      return;
    }

    state.questions.forEach((q, qIdx) => {
      const card = document.createElement('div');
      card.className = 'question-card';
      card.dataset.index = qIdx;

      // Header block
      const typeLabel = getTypeLabel(q.type);
      const typeClass = getTypeBadgeClass(q.type);
      
      const header = document.createElement('div');
      header.className = 'question-card-header';
      header.innerHTML = `
        <span class="question-badge ${typeClass}">${typeLabel}</span>
        <span class="question-points editable" data-field="points" data-index="${qIdx}">${q.points} pt${q.points !== 1 ? 's' : ''}</span>
      `;
      card.appendChild(header);

      // Question Text block
      const textDiv = document.createElement('div');
      textDiv.className = 'question-text editable';
      textDiv.dataset.field = 'text';
      textDiv.dataset.index = qIdx;
      textDiv.innerText = `${qIdx + 1}. ${q.text}`;
      card.appendChild(textDiv);

      // Choices or specific answers rendering
      if (['multiple_choice_question', 'true_false_question', 'multiple_answers_question', 'short_answer_question'].includes(q.type)) {
        const list = document.createElement('div');
        list.className = 'choices-list';

        q.choices.forEach((c, cIdx) => {
          const item = document.createElement('div');
          item.className = `choice-item ${c.correct ? 'correct' : ''}`;
          
          let icon = '<i class="far fa-circle choice-icon choice-icon-incorrect"></i>';
          if (q.type === 'multiple_answers_question') {
            icon = c.correct 
              ? '<i class="fas fa-check-square choice-icon choice-icon-correct"></i>' 
              : '<i class="far fa-square choice-icon choice-icon-incorrect"></i>';
          } else if (c.correct) {
            icon = '<i class="fas fa-check-circle choice-icon choice-icon-correct"></i>';
          }

          item.innerHTML = `
            ${icon}
            <span class="choice-text editable" data-field="choice" data-qindex="${qIdx}" data-cindex="${cIdx}">${c.text}</span>
          `;
          
          list.appendChild(item);

          // Add choice feedback inline if present
          if (c.feedback) {
            const fbBox = document.createElement('div');
            fbBox.className = 'feedback-box';
            fbBox.innerHTML = `<i class="far fa-comment-dots"></i> Choice Feedback: ${c.feedback}`;
            list.appendChild(fbBox);
          }
        });

        card.appendChild(list);
      } else if (q.type === 'numerical_question') {
        const numSpec = document.createElement('div');
        numSpec.className = 'choice-item correct';
        let desc = '';
        if (q.numericalExact !== undefined && q.numericalExact !== null) {
          desc = `Exact Answer: <strong>${q.numericalExact}</strong> (Range: ${q.numericalMin} to ${q.numericalMax})`;
        } else {
          desc = `Range Constraint: <strong>[${q.numericalMin}, ${q.numericalMax}]</strong>`;
        }
        numSpec.innerHTML = `<i class="fas fa-calculator choice-icon choice-icon-correct"></i> <span class="choice-text">${desc}</span>`;
        card.appendChild(numSpec);
      } else if (q.type === 'essay_question') {
        const essaySpec = document.createElement('div');
        essaySpec.className = 'choice-item';
        essaySpec.innerHTML = `<i class="fas fa-align-left choice-icon choice-icon-incorrect"></i> <span class="choice-text" style="color: var(--text-muted)">Essay input area will be provided in Canvas.</span>`;
        card.appendChild(essaySpec);
      } else if (q.type === 'file_upload_question') {
        const uploadSpec = document.createElement('div');
        uploadSpec.className = 'choice-item';
        uploadSpec.innerHTML = `<i class="fas fa-cloud-upload-alt choice-icon choice-icon-incorrect"></i> <span class="choice-text" style="color: var(--text-muted)">File upload dropzone will be provided in Canvas.</span>`;
        card.appendChild(uploadSpec);
      }

      // Add general feedbacks
      if (q.feedback) {
        const fb = document.createElement('div');
        fb.className = 'feedback-box';
        fb.innerHTML = `<i class="far fa-comment-dots"></i> Explanation: ${q.feedback}`;
        card.appendChild(fb);
      }
      if (q.correctFeedback) {
        const fb = document.createElement('div');
        fb.className = 'feedback-box correct';
        fb.innerHTML = `<i class="far fa-comment-dots"></i> Correct Feedback: ${q.correctFeedback}`;
        card.appendChild(fb);
      }
      if (q.incorrectFeedback) {
        const fb = document.createElement('div');
        fb.className = 'feedback-box incorrect';
        fb.innerHTML = `<i class="far fa-comment-dots"></i> Incorrect Feedback: ${q.incorrectFeedback}`;
        card.appendChild(fb);
      }

      previewBody.appendChild(card);
    });

    bindInlineEditors();
  }

  // Helper bindings for the preview inline click-to-edit
  function bindInlineEditors() {
    const editables = previewBody.querySelectorAll('.editable');
    
    editables.forEach(elem => {
      elem.addEventListener('click', function(e) {
        // Prevent nesting editor creation
        if (this.querySelector('input')) return;

        const field = this.dataset.field;
        const qIdx = parseInt(this.dataset.index);
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input-inline';

        if (field === 'points') {
          input.value = state.questions[qIdx].points;
          input.style.width = '60px';
          input.addEventListener('blur', function() {
            const val = parseFloat(this.value);
            if (!isNaN(val) && val > 0) {
              state.questions[qIdx].points = val;
            }
            renderPreview();
          });
        } else if (field === 'text') {
          input.value = state.questions[qIdx].text;
          input.addEventListener('blur', function() {
            if (this.value.trim()) {
              state.questions[qIdx].text = this.value.trim();
            }
            renderPreview();
          });
        } else if (field === 'choice') {
          const qIdx = parseInt(this.dataset.qindex);
          const cIdx = parseInt(this.dataset.cindex);
          input.value = state.questions[qIdx].choices[cIdx].text;
          input.addEventListener('blur', function() {
            if (this.value.trim()) {
              state.questions[qIdx].choices[cIdx].text = this.value.trim();
            }
            renderPreview();
          });
        }

        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') {
            this.blur();
          }
        });

        this.innerHTML = '';
        this.appendChild(input);
        input.focus();
        e.stopPropagation();
      });
    });
  }

  // Type labels translations
  function getTypeLabel(type) {
    switch (type) {
      case 'multiple_choice_question': return 'Multiple Choice';
      case 'true_false_question': return 'True/False';
      case 'multiple_answers_question': return 'Multiple Answers';
      case 'short_answer_question': return 'Short Answer';
      case 'numerical_question': return 'Numerical';
      case 'essay_question': return 'Essay';
      case 'file_upload_question': return 'File Upload';
      default: return 'Question';
    }
  }

  function getTypeBadgeClass(type) {
    switch (type) {
      case 'multiple_choice_question': return 'badge-mc';
      case 'true_false_question': return 'badge-tf';
      case 'multiple_answers_question': return 'badge-ma';
      case 'short_answer_question': return 'badge-fitb';
      case 'numerical_question': return 'badge-num';
      case 'essay_question': return 'badge-essay';
      case 'file_upload_question': return 'badge-upload';
      default: return '';
    }
  }

  // Helper to scroll the editor to a specific line and highlight it
  function scrollToLine(lineNum) {
    if (!textEditor || !lineNum) return;
    if (!contentMarkdown.classList.contains('active')) {
      switchToMarkdownTab();
    }
    
    const text = textEditor.value;
    const lines = text.split('\n');
    if (lineNum > lines.length) return;
    
    let offset = 0;
    for (let i = 0; i < lineNum - 1; i++) {
      offset += lines[i].length + 1; // +1 for the newline character
    }
    
    textEditor.focus();
    const lineLength = lines[lineNum - 1].length;
    textEditor.setSelectionRange(offset, offset + lineLength);
    
    try {
      const style = window.getComputedStyle(textEditor);
      const div = document.createElement('div');
      
      const properties = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
        'wordSpacing', 'letterSpacing', 'textIndent', 'textTransform',
        'lineHeight', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
        'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth',
        'boxSizing'
      ];
      
      properties.forEach(prop => {
        div.style[prop] = style[prop];
      });
      
      div.style.position = 'absolute';
      div.style.visibility = 'hidden';
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordBreak = 'break-word';
      div.style.overflow = 'hidden';
      div.style.width = textEditor.clientWidth + 'px';
      
      document.body.appendChild(div);
      
      div.textContent = text.substring(0, offset);
      
      const span = document.createElement('span');
      span.textContent = text.substring(offset, offset + (lineLength || 1)) || '.';
      div.appendChild(span);
      
      const topPos = span.offsetTop;
      document.body.removeChild(div);
      
      // Center the highlighted line inside the textEditor viewport
      textEditor.scrollTop = topPos - (textEditor.clientHeight / 2);
    } catch (e) {
      console.error("Failed to compute precise caret position, falling back:", e);
      const lineHeight = parseFloat(window.getComputedStyle(textEditor).lineHeight) || 22.8;
      const topPos = (lineNum - 1) * lineHeight;
      textEditor.scrollTop = topPos - (textEditor.clientHeight / 2);
    }
  }

  // Render compilation validator diagnostics logs
  function renderValidationLogs(errors, warnings) {
    alertContainer.innerHTML = '';
    
    // Filter out warnings that have been approved/dismissed by the user
    const activeWarnings = warnings.filter(warn => {
      const key = `${warn.line || 0}|${warn.message}`;
      return !state.approvedWarnings.has(key);
    });

    if (errors.length === 0 && activeWarnings.length === 0) {
      return;
    }

    errors.forEach(err => {
      const alert = document.createElement('div');
      alert.className = 'alert alert-error';
      alert.title = err.line ? `Click to jump to line ${err.line}` : '';
      alert.innerHTML = `<i class="fas fa-exclamation-circle"></i> <div><strong>Line ${err.line || 'Unknown'}:</strong> ${err.message}</div>`;
      
      if (err.line) {
        alert.addEventListener('click', () => {
          scrollToLine(err.line);
        });
      }
      
      alertContainer.appendChild(alert);
    });

    activeWarnings.forEach(warn => {
      const alert = document.createElement('div');
      alert.className = 'alert alert-warning';
      alert.title = warn.line ? `Click to jump to line ${warn.line}` : '';
      alert.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i> 
        <div style="flex: 1;"><strong>Line ${warn.line || 'Unknown'}:</strong> ${warn.message}</div>
        <button class="btn-approve-alert" title="Approve Warning"><i class="fas fa-check"></i></button>
      `;

      alert.addEventListener('click', (e) => {
        if (e.target.closest('.btn-approve-alert')) return;
        if (warn.line) {
          scrollToLine(warn.line);
        }
      });

      const approveBtn = alert.querySelector('.btn-approve-alert');
      approveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = `${warn.line || 0}|${warn.message}`;
        state.approvedWarnings.add(key);
        
        alert.classList.add('fade-out');
        setTimeout(() => {
          alert.remove();
        }, 300);
      });

      alertContainer.appendChild(alert);
    });
  }

  // Download Trigger
  btnDownload.addEventListener('click', async () => {
    if (state.questions.length === 0) {
      showToast("There are no questions to export. Add some questions first!", "error");
      return;
    }

    if (parser.errors.length > 0) {
      if (!confirm("You have critical validation errors. The QTI package might fail to import or grade correctly in Canvas. Do you want to download anyway?")) {
        return;
      }
    }

    try {
      btnDownload.disabled = true;
      btnDownload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Packaging...';

      const result = await generator.generateZip(state.questions, state.quizOptions);
      
      // Client-side file trigger download
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showToast(`Success! Question bank package "${result.filename}" downloaded.`, "success");
    } catch (err) {
      showToast(`Failed to generate QTI: ${err.message}`, "error");
      console.error(err);
    } finally {
      btnDownload.disabled = false;
      btnDownload.innerHTML = '<i class="fas fa-download"></i> Download QTI Zip';
    }
  });

  // UI Toast notifications
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '<i class="fas fa-check-circle" style="color: var(--success)"></i>';
    if (type === 'error') {
      icon = '<i class="fas fa-times-circle" style="color: var(--danger)"></i>';
    } else if (type === 'info') {
      icon = '<i class="fas fa-info-circle" style="color: var(--primary-color)"></i>';
    }

    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = '0.3s ease';
      setTimeout(() => {
        container.removeChild(toast);
      }, 300);
    }, 4000);
  }

  // File Processing Helpers
  function handleFileUpload(file) {
    state.approvedWarnings.clear();
    const ext = file.name.split('.').pop().toLowerCase();
    
    uploadFileName.innerText = file.name;
    uploadZoneContent.style.display = 'none';
    uploadFileInfo.style.display = 'flex';

    showToast(`Processing file: ${file.name}...`, "info");

    const reader = new FileReader();

    if (ext === 'txt' || ext === 'csv' || ext === 'tsv') {
      reader.onload = (e) => {
        const text = e.target.result;
        if (ext === 'csv' || ext === 'tsv') {
          switchToSpreadsheetTab();
          populateGridFromText(text, ext === 'csv' ? ',' : '\t');
        } else {
          switchToMarkdownTab();
          textEditor.value = text;
          updateCharCount();
          triggerParse();
        }
      };
      reader.readAsText(file);
    } else if (ext === 'docx') {
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        if (!window.mammoth) {
          showToast("Mammoth.js library is not loaded.", "error");
          resetUploadUI();
          return;
        }
        window.mammoth.extractRawText({ arrayBuffer: arrayBuffer })
          .then((result) => {
            switchToMarkdownTab();
            textEditor.value = result.value;
            updateCharCount();
            triggerParse();
            showToast("Word document text loaded successfully!", "success");
          })
          .catch((err) => {
            showToast(`Word parsing failed: ${err.message}`, "error");
            resetUploadUI();
          });
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'pdf') {
      reader.onload = async (e) => {
        const arrayBuffer = e.target.result;
        if (!window.pdfjsLib) {
          showToast("PDF.js library is not loaded.", "error");
          resetUploadUI();
          return;
        }
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          
          let fullText = '';
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            
            let lastY = -1;
            let pageText = '';
            for (let item of textContent.items) {
              if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
                pageText += '\n';
              }
              pageText += item.str + ' ';
              lastY = item.transform[5];
            }
            fullText += pageText + '\n';
          }
          
          switchToMarkdownTab();
          textEditor.value = fullText.trim();
          updateCharCount();
          triggerParse();
          showToast("PDF text extracted successfully!", "success");
        } catch (err) {
          showToast(`PDF parsing failed: ${err.message}`, "error");
          resetUploadUI();
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        if (!window.XLSX) {
          showToast("SheetJS library is not loaded.", "error");
          resetUploadUI();
          return;
        }
        try {
          const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const tsvText = window.XLSX.utils.sheet_to_txt(worksheet);

          switchToSpreadsheetTab();
          populateGridFromText(tsvText, '\t');
          showToast("Excel spreadsheet mapped to grid successfully!", "success");
        } catch (err) {
          showToast(`Excel parsing failed: ${err.message}`, "error");
          resetUploadUI();
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      showToast(`Unsupported file type: .${ext}`, "error");
      resetUploadUI();
    }
  }

  function resetUploadUI() {
    fileInput.value = '';
    uploadFileInfo.style.display = 'none';
    uploadZoneContent.style.display = 'block';
  }

  function switchToMarkdownTab() {
    tabMarkdown.classList.add('active');
    tabSpreadsheet.classList.remove('active');
    contentMarkdown.classList.add('active');
    contentSpreadsheet.classList.remove('active');
    state.format = 'auto';
  }

  // Define tab switcher for spreadsheet
  function switchToSpreadsheetTab() {
    tabSpreadsheet.classList.add('active');
    tabMarkdown.classList.remove('active');
    contentSpreadsheet.classList.add('active');
    contentMarkdown.classList.remove('active');
    state.format = 'tsv';
  }

  // Populate interactive grid from raw CSV or TSV text
  function populateGridFromText(text, separator) {
    const lines = text.split('\n');
    if (lines.length === 0) return;

    initializeGrid(0);

    let startIdx = 0;
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('question') || firstLine.includes('type') || firstLine.includes('points')) {
      startIdx = 1;
    }

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let cells = [];
      if (separator === ',') {
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
          const char = line[j];
          if (char === '"') inQuotes = !inQuotes;
          else if (char === ',' && !inQuotes) {
            cells.push(current.trim().replace(/^"|"$/g, ''));
            current = '';
          } else {
            current += char;
          }
        }
        cells.push(current.trim().replace(/^"|"$/g, ''));
      } else {
        cells = line.split('\t');
      }

      addGridRow(cells);
    }

    addGridRow();
    triggerParse();
  }
});
