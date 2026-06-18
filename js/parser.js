/**
 * QTI Converter - Parser Module
 * Handles parsing of Aiken, text2qti Markdown, and Tabular CSV/TSV formats.
 */

export class QuestionParser {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Smart clean-up for messy, non-standard quiz formats.
   * Standardizes inline correct answers, true/false choices, checkbox formats,
   * answer keys, and numeric answers.
   */
  static cleanText(text) {
    if (!text || !text.trim()) return '';
    
    // Normalize newlines
    let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let lines = normalized.split('\n');
    
    // 1. Scan for Answer Key at the bottom
    const answerKeyMap = {};
    const answerKeyRegex = /(answer\s*key|answers):\s*(.*)$/i;
    let answerKeyLineIdx = -1;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const match = line.match(answerKeyRegex);
      if (match) {
        answerKeyLineIdx = i;
        const keyContent = match[2];
        const pairs = keyContent.match(/(\d+)[\s.:-]*([a-zA-Z])/g);
        if (pairs) {
          pairs.forEach(pair => {
            const m = pair.match(/(\d+)[\s.:-]*([a-zA-Z])/);
            if (m) {
              answerKeyMap[m[1]] = m[2].toUpperCase();
            }
          });
        }
      }
    }

    let output = [];
    let currentQuestionNum = null;
    let currentCorrectLetter = null;

    const questionStartRegex = /^(\d+)\.\s*(.*)$/;
    const choiceRegex = /^([a-zA-Z])[\s).:-]+\s*(.*)$/;
    const sectionHeaderRegex = /^(section|part|chapter|unit)\s+\w+[\s-:]*/i;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let trimmed = line.trim();

      if (i === answerKeyLineIdx) {
        output.push('% ' + line);
        continue;
      }

      if (trimmed === '') {
        output.push('');
        continue;
      }

      // Heuristic: ignore section headers and prevent them from appending to previous questions
      if (trimmed.match(sectionHeaderRegex)) {
        output.push('');
        output.push('% ' + trimmed);
        output.push('');
        currentQuestionNum = null;
        currentCorrectLetter = null;
        continue;
      }

      // Heuristic: Table question detection (number on a line by itself, followed by text, followed by choices)
      if (/^\d+$/.test(trimmed)) {
        const qNum = trimmed;
        let qTextLineIdx = -1;
        
        // Find the next non-empty line as question text
        for (let k = i + 1; k < Math.min(lines.length, i + 5); k++) {
          if (lines[k].trim() !== '') {
            qTextLineIdx = k;
            break;
          }
        }

        if (qTextLineIdx !== -1) {
          const qText = lines[qTextLineIdx].trim();
          
          // Peek ahead for choices
          const choices = [];
          let j = qTextLineIdx + 1;
          let lastChoiceIdx = j;

          for (; j < lines.length; j++) {
            const choiceTrimmed = lines[j].trim();
            if (choiceTrimmed === '') continue;

            // If we hit a number or section header, stop peeking
            if (/^\d+$/.test(choiceTrimmed) || /^\d+\./.test(choiceTrimmed) || choiceTrimmed.match(sectionHeaderRegex)) {
              break;
            }

            choices.push(choiceTrimmed);
            lastChoiceIdx = j;
            if (choices.length >= 6) break;
          }

          if (choices.length >= 2) {
            output.push(`${qNum}. ${qText}`);
            choices.forEach((choice, idx) => {
              let isCorrect = false;
              let choiceText = choice;
              if (choiceText.startsWith('*')) {
                isCorrect = true;
                choiceText = choiceText.substring(1).trim();
              }
              const letter = String.fromCharCode(97 + idx); // a, b, c, d
              const prefix = isCorrect ? '*' : '';
              output.push(`${prefix}${letter}) ${choiceText}`);
            });

            i = lastChoiceIdx;
            currentQuestionNum = qNum;
            currentCorrectLetter = null;
            continue;
          }
        }
      }

      let qMatch = trimmed.match(questionStartRegex);
      if (qMatch) {
        currentQuestionNum = qMatch[1];
        let qText = qMatch[2];
        currentCorrectLetter = null;

        let inlineCorrectMatch = qText.match(/(.*?)\s*\[(correct|answer):\s*([a-zA-Z])\]\s*$/i);
        if (inlineCorrectMatch) {
          qText = inlineCorrectMatch[1].trim();
          currentCorrectLetter = inlineCorrectMatch[3].toUpperCase();
        }

        if (answerKeyMap[currentQuestionNum]) {
          currentCorrectLetter = answerKeyMap[currentQuestionNum];
        }

        let inlineTfMatch = qText.match(/(.*?)\s*Answer:\s*(true|false)\s*$/i);
        if (inlineTfMatch) {
          qText = inlineTfMatch[1].trim();
          const tfAnswer = inlineTfMatch[2].toLowerCase();
          
          output.push(`${currentQuestionNum}. ${qText}`);
          if (tfAnswer === 'true') {
            output.push('*a) True');
            output.push('b) False');
          } else {
            output.push('a) True');
            output.push('*b) False');
          }
          continue;
        }

        output.push(`${currentQuestionNum}. ${qText}`);
        continue;
      }

      let cMatch = trimmed.match(choiceRegex);
      if (cMatch && !/^\d+/.test(trimmed)) {
        let letter = cMatch[1].toUpperCase();
        let choiceText = cMatch[2].trim();
        
        let isCorrect = false;

        if (currentCorrectLetter && letter === currentCorrectLetter) {
          isCorrect = true;
        }

        let suffixCorrectMatch = choiceText.match(/(.*?)\s*(\(correct\)|<--\s*correct|\(correct\s*answer\)|\*\*)\s*$/i);
        if (suffixCorrectMatch) {
          choiceText = suffixCorrectMatch[1].trim();
          isCorrect = true;
        }

        if (trimmed.startsWith('*')) {
          isCorrect = true;
        }

        const prefix = isCorrect ? '*' : '';
        output.push(`${prefix}${letter.toLowerCase()}) ${choiceText}`);
        continue;
      }

      if (trimmed.toLowerCase().startsWith('[x]')) {
        output.push('[*] ' + trimmed.substring(3).trim());
        continue;
      }
      if (trimmed.startsWith('[ ]') || trimmed.startsWith('[]')) {
        output.push('[ ] ' + trimmed.replace(/^\[\s*\]/, '').trim());
        continue;
      }

      if (trimmed === '*True' || trimmed === '*true') {
        output.push('*a) True');
        continue;
      }
      if (trimmed === 'True' || trimmed === 'true') {
        output.push('a) True');
        continue;
      }
      if (trimmed === '*False' || trimmed === '*false') {
        output.push('*b) False');
        continue;
      }
      if (trimmed === 'False' || trimmed === 'false') {
        output.push('b) False');
        continue;
      }

      let answerMatch = trimmed.match(/^(answer|correct\s*answer):\s*(.*)$/i);
      if (answerMatch) {
        const val = answerMatch[2].trim();
        
        if (!isNaN(parseFloat(val)) && !val.includes(' ')) {
          let nextLine = lines[i + 1] ? lines[i + 1].trim() : '';
          let toleranceMatch = nextLine.match(/^(tolerance|margin):\s*(.*)$/i);
          if (toleranceMatch) {
            const marginVal = toleranceMatch[2].match(/(\d+\.?\d*%?)/);
            if (marginVal) {
              output.push(`= ${val} +- ${marginVal[1]}`);
              i++;
            } else {
              output.push(`= ${val}`);
            }
          } else {
            output.push(`= ${val}`);
          }
        } else {
          output.push(`* ${val}`);
        }
        continue;
      }

      let acceptMatch = trimmed.match(/^(accept\s*also|accept):\s*(.*)$/i);
      if (acceptMatch) {
        output.push(`* ${acceptMatch[2].trim()}`);
        continue;
      }

      output.push(line);
    }

    let cleanedOutput = [];
    let prevEmpty = false;
    for (let i = 0; i < output.length; i++) {
      let line = output[i];
      if (line.trim() === '') {
        if (!prevEmpty) {
          cleanedOutput.push('');
          prevEmpty = true;
        }
      } else {
        cleanedOutput.push(line);
        prevEmpty = false;
      }
    }

    return cleanedOutput.join('\n').trim();
  }

  /**
   * Main entry point to parse raw input string.
   * Automatically detects the format or accepts a preferred format.
   * @param {string} text - Raw input text
   * @param {string} format - 'auto', 'markdown', 'aiken', 'tsv'
   * @returns {Array} List of parsed question objects
   */
  parse(text, format = 'auto') {
    this.errors = [];
    this.warnings = [];
    
    if (!text || !text.trim()) {
      return [];
    }

    const cleanedText = text.replace(/\r\n/g, '\n');

    if (format === 'auto') {
      format = this.detectFormat(cleanedText);
    }

    try {
      switch (format) {
        case 'tsv':
          return this.parseTSV(cleanedText);
        case 'aiken':
          return this.parseAiken(cleanedText);
        case 'markdown':
        default:
          return this.parseMarkdown(cleanedText);
      }
    } catch (err) {
      this.errors.push({
        line: 0,
        message: `Parsing failed critically: ${err.message}`
      });
      return [];
    }
  }

  /**
   * Detects the input format based on simple heuristics.
   */
  detectFormat(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) return 'markdown';

    // TSV/CSV heuristic: Check if first line has tabs or commas and looks like header
    const firstLine = lines[0].toLowerCase();
    if (firstLine.includes('\t') && (firstLine.includes('question') || firstLine.includes('type') || firstLine.includes('points'))) {
      return 'tsv';
    }

    // Aiken heuristic: look for "ANSWER:" pattern at the end of some blocks
    let hasAnswerKeyword = false;
    let hasAikenChoices = false;
    const choiceRegex = /^[A-Z][).]\s/;
    
    for (let i = 0; i < Math.min(lines.length, 50); i++) {
      const line = lines[i];
      if (/^ANSWER:\s*[A-Z]/i.test(line)) {
        hasAnswerKeyword = true;
      }
      if (choiceRegex.test(line)) {
        hasAikenChoices = true;
      }
    }

    if (hasAnswerKeyword && hasAikenChoices) {
      return 'aiken';
    }

    return 'markdown'; // Default to text2qti markdown
  }

  /**
   * Parse Aiken format.
   */
  parseAiken(text) {
    const questions = [];
    const lines = text.split('\n');
    let currentQuestion = null;
    let choiceMap = new Map(); // maps A, B, C to choice text
    let tempChoices = [];

    const choiceRegex = /^([A-Z])[).]\s*(.*)$/;
    const answerRegex = /^ANSWER:\s*([A-Z])\s*$/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      if (!line) {
        continue;
      }

      const choiceMatch = line.match(choiceRegex);
      const answerMatch = line.match(answerRegex);

      if (answerMatch) {
        if (!currentQuestion) {
          this.errors.push({ line: lineNum, message: "Found ANSWER: line before a question prompt." });
          continue;
        }

        const correctLetter = answerMatch[1].toUpperCase();
        if (tempChoices.length < 2) {
          this.errors.push({ line: lineNum, message: `Question must have at least 2 choices (found ${tempChoices.length}).` });
        }

        let correctFound = false;
        const finalizedChoices = tempChoices.map(choice => {
          const isCorrect = choice.letter === correctLetter;
          if (isCorrect) correctFound = true;
          return {
            id: `c_${Math.random().toString(36).substr(2, 9)}`,
            text: choice.text,
            correct: isCorrect,
            feedback: null
          };
        });

        if (!correctFound) {
          this.errors.push({ line: lineNum, message: `Correct answer letter "${correctLetter}" does not match any choice letters.` });
        }

        currentQuestion.choices = finalizedChoices;
        currentQuestion.type = 'multiple_choice_question';
        questions.push(currentQuestion);

        // Reset
        currentQuestion = null;
        tempChoices = [];
        choiceMap.clear();
      } else if (choiceMatch) {
        if (!currentQuestion) {
          this.errors.push({ line: lineNum, message: `Found choice "${line}" before a question prompt. Creating an implicit question.` });
          currentQuestion = {
            id: `q_${Math.random().toString(36).substr(2, 9)}`,
            title: 'Question',
            text: 'Implicit Question (missing question prompt)',
            type: 'multiple_choice_question',
            points: 1,
            choices: [],
            feedback: null,
            correctFeedback: null,
            incorrectFeedback: null
          };
        }
        const letter = choiceMatch[1].toUpperCase();
        const choiceText = choiceMatch[2].trim();
        tempChoices.push({ letter, text: choiceText });
        choiceMap.set(letter, choiceText);
      } else {
        // This is a question prompt
        if (currentQuestion) {
          // We found another prompt without an ANSWER line for the previous one
          this.warnings.push({ line: lineNum - 1, message: `Previous question "${currentQuestion.text.substring(0, 30)}..." has no ANSWER line. Defaulting correct to first choice.` });
          
          if (tempChoices.length > 0) {
            currentQuestion.choices = tempChoices.map((c, idx) => ({
              id: `c_${Math.random().toString(36).substr(2, 9)}`,
              text: c.text,
              correct: idx === 0,
              feedback: null
            }));
            currentQuestion.type = 'multiple_choice_question';
            questions.push(currentQuestion);
          }
          tempChoices = [];
          choiceMap.clear();
        }

        currentQuestion = {
          id: `q_${Math.random().toString(36).substr(2, 9)}`,
          title: 'Question',
          text: line,
          type: 'multiple_choice_question',
          points: 1,
          choices: [],
          feedback: null,
          correctFeedback: null,
          incorrectFeedback: null
        };
      }
    }

    // Handle dangling question at end
    if (currentQuestion) {
      this.warnings.push({ line: lines.length, message: `Final question "${currentQuestion.text.substring(0, 30)}..." has no ANSWER line.` });
      if (tempChoices.length > 0) {
        currentQuestion.choices = tempChoices.map((c, idx) => ({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: c.text,
          correct: idx === 0,
          feedback: null
        }));
        currentQuestion.type = 'multiple_choice_question';
        questions.push(currentQuestion);
      }
    }

    return questions;
  }

  /**
   * Parse text2qti Markdown format.
   */
  parseMarkdown(text) {
    const questions = [];
    const lines = text.split('\n');
    
    let quizTitle = "Quiz";
    let quizDescription = "";
    
    let currentQuestion = null;
    let nextTitle = null;
    let nextPoints = null;
    
    // Track whether we can append multi-line content to the last choice
    let canAppendToLastChoice = true;

    // Track global settings
    const settings = {
      shuffle_answers: 'false',
      show_correct_answers: 'true',
      one_question_at_a_time: 'false',
      cant_go_back: 'false'
    };

    // Regex patterns
    const quizTitleRegex = /^[Qq]uiz [Tt]itle:\s*(.*)$/;
    const quizDescRegex = /^[Qq]uiz description:\s*(.*)$/;
    const questionRegex = /^\d+\.\s*(.*)$/;
    const titleRegex = /^[Tt]itle:\s*(.*)$/;
    const pointsRegex = /^[Pp]oints:\s*(.*)$/;
    const sectionHeaderRegex = /^(section|part|chapter|unit)\s+\w+[\s-:]*/i;
    
    // Choice Regexes
    const mctfCorrectRegex = /^\*([a-zA-Z])\)\s*(.*)$/;
    const mctfIncorrectRegex = /^([a-zA-Z])\)\s*(.*)$/;
    const multansCorrectRegex = /^\[\*\]\s*(.*)$/;
    const multansIncorrectRegex = /^\[\s*\]\s*(.*)$/;
    const shortansCorrectRegex = /^\*\s*(.*)$/;
    
    // Feedback and metadata regexes
    const feedbackRegex = /^\.\.\.\s*(.*)$/;
    const correctFeedbackRegex = /^\+\s*(.*)$/;
    const incorrectFeedbackRegex = /^-\s*(.*)$/;
    const numericalRegex = /^=\s*(.*)$/;
    
    const shuffleRegex = /^[Ss]huffle answers:\s*(.*)$/;
    const showCorrectRegex = /^[Ss]how correct answers:\s*(.*)$/;
    const oneQuestionRegex = /^[Oo]ne question at a time:\s*(.*)$/;
    const cantGoBackRegex = /^[Cc]an't go back:\s*(.*)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // An empty line signals the end of choice-appending context
      if (lines[i].trim() === '') {
        canAppendToLastChoice = false;
        continue;
      }

      // Skip comments
      if (line.startsWith('%') || line.startsWith('//')) {
        continue;
      }

      // Check quiz-wide headers
      let match;
      if (match = line.match(quizTitleRegex)) {
        quizTitle = match[1].trim();
        continue;
      }
      if (match = line.match(quizDescRegex)) {
        quizDescription = match[1].trim();
        continue;
      }
      if (match = line.match(shuffleRegex)) {
        settings.shuffle_answers = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = line.match(showCorrectRegex)) {
        settings.show_correct_answers = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = line.match(oneQuestionRegex)) {
        settings.one_question_at_a_time = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = line.match(cantGoBackRegex)) {
        settings.cant_go_back = this.cleanBoolString(match[1]);
        continue;
      }

      // Check section headers (resets context and finishes current question)
      if (match = line.match(sectionHeaderRegex)) {
        if (currentQuestion) {
          this.finalizeQuestion(currentQuestion, lineNum - 1);
          questions.push(currentQuestion);
          currentQuestion = null;
        }
        continue;
      }

      // Question metadata
      if (match = line.match(titleRegex)) {
        nextTitle = match[1].trim();
        continue;
      }
      if (match = line.match(pointsRegex)) {
        const p = parseFloat(match[1].trim());
        nextPoints = isNaN(p) ? 1 : p;
        continue;
      }

      // Start of a question
      if (match = line.match(questionRegex)) {
        // Finalize previous question if any
        if (currentQuestion) {
          this.finalizeQuestion(currentQuestion, lineNum - 1);
          questions.push(currentQuestion);
        }

        currentQuestion = {
          id: `q_${Math.random().toString(36).substr(2, 9)}`,
          title: nextTitle || 'Question',
          text: match[1].trim(),
          type: null, // to be determined by options
          points: nextPoints !== null ? nextPoints : 1,
          choices: [],
          feedback: null,
          correctFeedback: null,
          incorrectFeedback: null
        };

        // Reset metadata
        nextTitle = null;
        nextPoints = null;
        canAppendToLastChoice = false; // Reset on new question
        continue;
      }

      if (!currentQuestion) {
        // If we found content before any question, check if it's text block or ignore it with warning
        this.warnings.push({ line: lineNum, message: `Ignored line outside of questions: "${line.substring(0, 30)}..."` });
        continue;
      }

      // Check essay response (___+)
      if (/^___+$/.test(line)) {
        currentQuestion.type = 'essay_question';
        continue;
      }

      // Check upload response (^^^+)
      if (/^\^\^\^+$/.test(line)) {
        currentQuestion.type = 'file_upload_question';
        continue;
      }

      // Check numerical response (= value)
      if (match = line.match(numericalRegex)) {
        currentQuestion.type = 'numerical_question';
        this.parseNumericalConstraint(currentQuestion, match[1].trim(), lineNum);
        continue;
      }

      // Check multiple choice / true-false correct choice (*a) choice text)
      if (match = line.match(mctfCorrectRegex)) {
        currentQuestion.type = currentQuestion.type || 'multiple_choice_question';
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: match[2].trim(),
          correct: true,
          feedback: null
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple choice / true-false incorrect choice (a) choice text)
      if (match = line.match(mctfIncorrectRegex)) {
        currentQuestion.type = currentQuestion.type || 'multiple_choice_question';
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: match[2].trim(),
          correct: false,
          feedback: null
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple answer correct choice ([*] choice text)
      if (match = line.match(multansCorrectRegex)) {
        currentQuestion.type = 'multiple_answers_question';
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: match[1].trim(),
          correct: true,
          feedback: null
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple answer incorrect choice ([ ] choice text)
      if (match = line.match(multansIncorrectRegex)) {
        currentQuestion.type = 'multiple_answers_question';
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: match[1].trim(),
          correct: false,
          feedback: null
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check short answer / fill in blank response (* acceptable answer)
      if (match = line.match(shortansCorrectRegex)) {
        currentQuestion.type = 'short_answer_question';
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: match[1].trim(),
          correct: true,
          feedback: null
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check correct feedback (+)
      if (match = line.match(correctFeedbackRegex)) {
        currentQuestion.correctFeedback = match[1].trim();
        continue;
      }

      // Check incorrect feedback (-)
      if (match = line.match(incorrectFeedbackRegex)) {
        currentQuestion.incorrectFeedback = match[1].trim();
        continue;
      }

      // Check general feedback (...)
      if (match = line.match(feedbackRegex)) {
        const fbText = match[1].trim();
        if (currentQuestion.choices.length > 0 && currentQuestion.type !== 'short_answer_question') {
          // Attach feedback to the last choice
          currentQuestion.choices[currentQuestion.choices.length - 1].feedback = fbText;
        } else {
          // General question feedback
          currentQuestion.feedback = fbText;
        }
        continue;
      }

      // If we reach here, append the text to the current question text or choice text
      // Multi-line support
      if (canAppendToLastChoice && currentQuestion.choices.length > 0) {
        // Append to the last choice text
        const lastChoice = currentQuestion.choices[currentQuestion.choices.length - 1];
        lastChoice.text += '\n' + line;
      } else if (currentQuestion.choices.length === 0) {
        // Append to the question prompt text
        currentQuestion.text += '\n' + line;
      } else {
        // Ignore dangling text separated by empty lines and log a warning
        this.warnings.push({ line: lineNum, message: `Ignored dangling line in question block: "${line.substring(0, 30)}..."` });
      }
    }

    // Finalize the last question
    if (currentQuestion) {
      this.finalizeQuestion(currentQuestion, lines.length);
      questions.push(currentQuestion);
    }

    // Store settings on the questions array for easier retrieval in app.js
    questions.quizTitle = quizTitle;
    questions.quizDescription = quizDescription;
    questions.settings = settings;

    return questions;
  }

  /**
   * Helper to parse numerical constraint formats.
   */
  parseNumericalConstraint(question, valStr, lineNum) {
    question.numericalRaw = valStr;

    // Check Range format: [min, max]
    if (valStr.startsWith('[') && valStr.endsWith(']')) {
      const parts = valStr.substring(1, valStr.length - 1).split(',');
      if (parts.length === 2) {
        const min = parseFloat(parts[0]);
        const max = parseFloat(parts[1]);
        if (!isNaN(min) && !isNaN(max)) {
          question.numericalMin = min;
          question.numericalMax = max;
          return;
        }
      }
    }

    // Check Margin format: value +- margin or value +- margin%
    if (valStr.includes('+-')) {
      const parts = valStr.split('+-');
      if (parts.length === 2) {
        const val = parseFloat(parts[0]);
        let marginStr = parts[1].trim();
        let isPercent = false;
        
        if (marginStr.endsWith('%')) {
          isPercent = true;
          marginStr = marginStr.substring(0, marginStr.length - 1).trim();
        }

        const margin = parseFloat(marginStr);
        if (!isNaN(val) && !isNaN(margin)) {
          question.numericalExact = val;
          if (isPercent) {
            const absMargin = Math.abs(val) * (margin / 100);
            question.numericalMin = val - absMargin;
            question.numericalMax = val + absMargin;
          } else {
            question.numericalMin = val - margin;
            question.numericalMax = val + margin;
          }
          return;
        }
      }
    }

    // Simple number
    const num = parseFloat(valStr);
    if (!isNaN(num)) {
      question.numericalExact = num;
      question.numericalMin = num;
      question.numericalMax = num;
    } else {
      this.errors.push({
        line: lineNum,
        message: `Invalid numerical answer format: "${valStr}". Use "[min, max]" or "value +- margin" or a number.`
      });
    }
  }

  /**
   * Cleans true/false strings for settings.
   */
  cleanBoolString(str) {
    str = str.trim().toLowerCase();
    return (str === 'true' || str === 'yes' || str === '1') ? 'true' : 'false';
  }

  /**
   * Finalizes and validates a single question.
   */
  finalizeQuestion(q, lineNum) {
    if (!q.type) {
      // Default to Multiple Choice if choices exist, else Essay
      if (q.choices.length > 0) {
        q.type = 'multiple_choice_question';
      } else {
        q.type = 'essay_question';
        this.warnings.push({
          line: lineNum,
          message: `Question has no specified type or answer choices. Defaulting to Essay question.`
        });
      }
    }

    // Final checks
    if (q.type === 'multiple_choice_question') {
      // Check for true/false special case
      const isTF = q.choices.length === 2 && 
        ((q.choices[0].text.toLowerCase() === 'true' && q.choices[1].text.toLowerCase() === 'false') ||
         (q.choices[0].text.toLowerCase() === 'false' && q.choices[1].text.toLowerCase() === 'true'));
      
      if (isTF) {
        q.type = 'true_false_question';
      }

      const correctCount = q.choices.filter(c => c.correct).length;
      if (correctCount === 0) {
        this.errors.push({
          line: lineNum,
          message: `Multiple Choice question "${q.text.substring(0, 30)}..." has no correct answer marked (*).`
        });
      } else if (correctCount > 1) {
        this.errors.push({
          line: lineNum,
          message: `Multiple Choice question "${q.text.substring(0, 30)}..." has multiple correct answers marked. Use checkbox syntax [ ] and [*] for Multiple Answer questions.`
        });
      }
    }

    if (q.type === 'multiple_answers_question') {
      const correctCount = q.choices.filter(c => c.correct).length;
      if (correctCount === 0) {
        this.errors.push({
          line: lineNum,
          message: `Multiple Answer question "${q.text.substring(0, 30)}..." has no correct answers marked ([*]).`
        });
      }
    }

    if (q.type === 'short_answer_question') {
      if (q.choices.length === 0) {
        this.errors.push({
          line: lineNum,
          message: `Fill-in-the-blank question "${q.text.substring(0, 30)}..." must list at least one acceptable answer (*).`
        });
      }
    }
  }

  /**
   * Parse Tabular TSV/CSV format (from spreadsheet paste).
   */
  parseTSV(text) {
    const questions = [];
    const lines = text.split('\n');
    if (lines.length === 0) return [];

    // Detect delimiter: tab or comma
    const delimiter = lines[0].includes('\t') ? '\t' : ',';

    // Parse helper that handles quotes for CSV
    const parseRow = (line) => {
      if (delimiter === '\t') {
        return line.split('\t');
      }
      // Simple CSV parser supporting quotes
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim().replace(/^"|"$/g, ''));
      return result;
    };

    const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim());
    
    // Find column indices
    const idxQuestion = headers.findIndex(h => h.includes('question') || h === 'prompt' || h === 'text');
    const idxType = headers.findIndex(h => h.includes('type') || h === 'kind');
    const idxPoints = headers.findIndex(h => h.includes('points') || h === 'weight');
    const idxCorrect = headers.findIndex(h => h.includes('correct') || h === 'answer' || h === 'key');
    const idxFeedback = headers.findIndex(h => h.includes('feedback') || h === 'explanation');
    
    // Find choice columns (e.g. choice 1, choice 2, or A, B, C...)
    const choiceIndices = [];
    headers.forEach((header, index) => {
      if (header.includes('choice') || header.includes('option') || /^[a-f]$/.test(header)) {
        choiceIndices.push({ index, label: header });
      }
    });

    if (idxQuestion === -1) {
      this.errors.push({ line: 1, message: `Could not find a 'Question' column in spreadsheet. Found columns: ${headers.join(', ')}` });
      return [];
    }

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const row = parseRow(line);
      const lineNum = i + 1;

      // Extract question text
      const qText = row[idxQuestion] || '';
      if (!qText) continue;

      // Extract type (map common synonyms to Canvas QTI question types)
      let rawType = (idxType !== -1 ? row[idxType] : '').toLowerCase().trim();
      let type = 'multiple_choice_question';
      if (rawType.includes('multiple choice') || rawType === 'mc') type = 'multiple_choice_question';
      else if (rawType.includes('true') || rawType === 'tf') type = 'true_false_question';
      else if (rawType.includes('multiple answer') || rawType.includes('checkbox') || rawType === 'ma') type = 'multiple_answers_question';
      else if (rawType.includes('fill') || rawType.includes('short') || rawType === 'fitb' || rawType === 'sa') type = 'short_answer_question';
      else if (rawType.includes('essay')) type = 'essay_question';
      else if (rawType.includes('upload') || rawType.includes('file')) type = 'file_upload_question';
      else if (rawType.includes('numerical') || rawType === 'num') type = 'numerical_question';
      else if (choiceIndices.length > 0) {
        // If there are choice columns, assume Multiple Choice by default
        type = 'multiple_choice_question';
      } else {
        // Else default to Essay
        type = 'essay_question';
      }

      // Extract points
      let points = 1;
      if (idxPoints !== -1 && row[idxPoints]) {
        const p = parseFloat(row[idxPoints]);
        if (!isNaN(p)) points = p;
      }

      // Extract correct answer mapping
      const rawCorrect = (idxCorrect !== -1 ? row[idxCorrect] : '').trim();
      const feedback = idxFeedback !== -1 ? row[idxFeedback] : '';

      const questionObj = {
        id: `q_${Math.random().toString(36).substr(2, 9)}`,
        title: 'Question',
        text: qText,
        type: type,
        points: points,
        choices: [],
        feedback: feedback || null,
        correctFeedback: null,
        incorrectFeedback: null
      };

      // Handle choices extraction
      if (type === 'multiple_choice_question' || type === 'true_false_question' || type === 'multiple_answers_question') {
        const choicesList = [];
        choiceIndices.forEach(({ index, label }) => {
          const cText = row[index];
          if (cText && cText.trim()) {
            choicesList.push({
              text: cText.trim(),
              label: label // e.g. "choice 1" or "a"
            });
          }
        });

        // If no explicit choices columns were found, maybe choices are in correct answers list
        if (choicesList.length === 0 && type === 'true_false_question') {
          choicesList.push({ text: 'True', label: 'true' });
          choicesList.push({ text: 'False', label: 'false' });
        }

        // Determine correct choices
        const correctAnswers = rawCorrect.split(/[,;&]/).map(a => a.trim().toLowerCase());
        
        questionObj.choices = choicesList.map((c, idx) => {
          const cTextLower = c.text.toLowerCase();
          const cLabelLower = c.label.toLowerCase();
          const idxStr1Based = (idx + 1).toString();
          
          let isCorrect = false;
          if (correctAnswers.includes(cTextLower) || 
              correctAnswers.includes(cLabelLower) || 
              correctAnswers.includes(idxStr1Based) ||
              (correctAnswers.length === 1 && correctAnswers[0] === cLabelLower.replace(/choice\s*/, ''))
          ) {
            isCorrect = true;
          }

          return {
            id: `c_${Math.random().toString(36).substr(2, 9)}`,
            text: c.text,
            correct: isCorrect,
            feedback: null
          };
        });

        // Double check true/false mapping if correct wasn't resolved
        if (type === 'true_false_question' && questionObj.choices.filter(c => c.correct).length === 0) {
          const correctLower = rawCorrect.toLowerCase();
          const isTrue = correctLower === 'true' || correctLower === 't' || correctLower === 'yes' || correctLower === 'y' || correctLower === '1';
          questionObj.choices.forEach(c => {
            const isTextTrue = c.text.toLowerCase() === 'true';
            c.correct = isTrue ? isTextTrue : !isTextTrue;
          });
        }

        // Validate choice counts
        if (questionObj.choices.length === 0) {
          this.errors.push({ line: lineNum, message: `Row ${lineNum}: Question is set as ${type} but has no choices.` });
        }
      } else if (type === 'short_answer_question') {
        const answersList = [];
        if (rawCorrect) {
          answersList.push(rawCorrect);
        }
        choiceIndices.forEach(({ index }) => {
          const val = row[index];
          if (val && val.trim() && !answersList.includes(val.trim())) {
            answersList.push(val.trim());
          }
        });

        questionObj.choices = answersList.map(ans => ({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: ans,
          correct: true,
          feedback: null
        }));
      } else if (type === 'numerical_question') {
        this.parseNumericalConstraint(questionObj, rawCorrect, lineNum);
      }

      this.finalizeQuestion(questionObj, lineNum);
      questions.push(questionObj);
    }

    return questions;
  }
}
