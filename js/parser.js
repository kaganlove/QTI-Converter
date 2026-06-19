function splitInlineChoices(trimmed) {
  const entireBoldRegex = /^\*\*\s*(.*?)\s*\*\*$/;
  let checkTrimmed = trimmed;
  let isWholeBold = false;
  if (entireBoldRegex.test(trimmed)) {
    checkTrimmed = trimmed.replace(entireBoldRegex, '$1').trim();
    isWholeBold = true;
  }
  
  let firstPrefix = '';
  if (checkTrimmed.startsWith('**')) {
    firstPrefix = '**';
    checkTrimmed = checkTrimmed.substring(2).trim();
  } else if (checkTrimmed.startsWith('*')) {
    firstPrefix = '*';
    checkTrimmed = checkTrimmed.substring(1).trim();
  }

  const match = checkTrimmed.match(/^([a-zA-Z])[\s).:-]+\s*(.*)$/);
  if (!match) return null;
  const firstLetter = match[1].toLowerCase();
  const text = match[2].trim();
  
  let nextLetterCode = firstLetter.charCodeAt(0) + 1;
  let parts = [];
  let currentIdx = 0;
  
  while (nextLetterCode <= 122) {
    const letterChar = String.fromCharCode(nextLetterCode);
    const regex = new RegExp(`(?:^|\\s)(\\*\\*|\\*)?(${letterChar})[\\s).:-]+\\s*`, 'i');
    const searchArea = text.substring(currentIdx);
    const matchIdx = searchArea.search(regex);
    if (matchIdx !== -1) {
      const absoluteIdx = currentIdx + matchIdx;
      const matchResult = searchArea.match(regex);
      const matchStr = matchResult[0];
      const hasAsterisk = !!matchResult[1];
      
      parts.push({
        letter: letterChar,
        index: absoluteIdx + (matchStr.startsWith(' ') ? 1 : 0),
        length: matchStr.trim().length,
        isCorrect: hasAsterisk || isWholeBold
      });
      currentIdx = absoluteIdx + matchStr.length;
      nextLetterCode++;
    } else {
      break;
    }
  }
  
  if (parts.length > 0) {
    const choices = [];
    let firstText = text.substring(0, parts[0].index).trim();
    const isFirstCorrect = firstPrefix !== '' || isWholeBold;
    if (isFirstCorrect && firstText.endsWith('**')) {
      firstText = firstText.substring(0, firstText.length - 2).trim();
    }
    choices.push({ 
      letter: firstLetter, 
      text: firstText, 
      isCorrect: isFirstCorrect 
    });
    
    for (let i = 0; i < parts.length; i++) {
      const start = parts[i].index + parts[i].length;
      const end = (i + 1 < parts.length) ? parts[i + 1].index : text.length;
      let partText = text.substring(start, end).trim();
      
      if (parts[i].isCorrect && partText.endsWith('**')) {
        partText = partText.substring(0, partText.length - 2).trim();
      }
      
      choices.push({ 
        letter: parts[i].letter, 
        text: partText, 
        isCorrect: parts[i].isCorrect 
      });
    }
    return choices;
  }
  return null;
}

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

    // Detect table-embedded question blocks (Section L)
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx].trim();
      if (line === '#' || line.toLowerCase() === 'no.' || line.toLowerCase() === 'id') {
        let peekIdx = idx + 1;
        let foundQuestion = false;
        let choiceHeaders = [];
        
        while (peekIdx < Math.min(lines.length, idx + 5)) {
          const l = lines[peekIdx].trim();
          if (l === '') { peekIdx++; continue; }
          if (l.toLowerCase() === 'question' || l.toLowerCase() === 'prompt' || l.toLowerCase() === 'text') {
            foundQuestion = true;
            peekIdx++;
            break;
          }
          break;
        }
        
        if (foundQuestion) {
          while (peekIdx < Math.min(lines.length, idx + 10)) {
            const l = lines[peekIdx].trim();
            if (l === '') { peekIdx++; continue; }
            if (/^[a-fA-F]$/.test(l) || /^choice\s*[a-fA-F0-9]$/i.test(l)) {
              choiceHeaders.push(l);
              peekIdx++;
            } else {
              break;
            }
          }
        }
        
        if (foundQuestion && choiceHeaders.length >= 2) {
          const numChoices = choiceHeaders.length;
          let rIdx = peekIdx;
          let processedLines = [];
          
          while (rIdx < lines.length) {
            while (rIdx < lines.length && lines[rIdx].trim() === '') { rIdx++; }
            if (rIdx >= lines.length) break;
            
            const numLine = lines[rIdx].trim();
            if (!/^\d+$/.test(numLine)) {
              break;
            }
            
            let qTextIdx = rIdx + 1;
            while (qTextIdx < lines.length && lines[qTextIdx].trim() === '') { qTextIdx++; }
            if (qTextIdx >= lines.length) break;
            const qText = lines[qTextIdx].trim();
            
            let choiceLines = [];
            let cIdx = qTextIdx + 1;
            for (let c = 0; c < numChoices; c++) {
              while (cIdx < lines.length && lines[cIdx].trim() === '') { cIdx++; }
              if (cIdx >= lines.length) break;
              choiceLines.push(lines[cIdx].trim());
              cIdx++;
            }
            
            if (choiceLines.length === numChoices) {
              processedLines.push(`${numLine}. ${qText}`);
              choiceLines.forEach((choice, cIndex) => {
                let isCorrect = false;
                let cText = choice;
                if (cText.startsWith('*')) {
                  isCorrect = true;
                  cText = cText.substring(1).trim();
                }
                const letter = String.fromCharCode(97 + cIndex);
                const prefix = isCorrect ? '*' : '';
                processedLines.push(`${prefix}${letter}) ${cText}`);
              });
              processedLines.push('');
              rIdx = cIdx;
            } else {
              break;
            }
          }
          
          if (processedLines.length > 0) {
            lines.splice(idx, rIdx - idx, ...processedLines);
            idx += processedLines.length - 1;
          }
        }
      }
    }
    
    // 1. Scan for Answer Keys anywhere in the text (grouped and standard formats)
    const answerKeyMap = {};
    const answerKeyLines = new Set();
    const answerKeyRegex = /(answer\s*key|answers):\s*(.*)$/i;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const cleanLineForMatch = line.replace(/\*\*/g, '').trim();
      
      // Look for grouped format: a) correct: Q1, Q3, Q6
      const groupMatch = cleanLineForMatch.match(/^\s*([a-zA-Z])\)?\s*(?:correct|answers?):\s*(.*)$/i);
      if (groupMatch) {
        answerKeyLines.add(i);
        const letter = groupMatch[1].toUpperCase();
        const qNums = groupMatch[2].match(/\d+/g);
        if (qNums) {
          qNums.forEach(num => {
            answerKeyMap[num] = letter;
          });
        }
        continue;
      }
      
      // Check standard answer keys
      const match = cleanLineForMatch.match(answerKeyRegex);
      if (match) {
        answerKeyLines.add(i);
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
    let choiceCount = 0;

    const questionStartRegex = /^(\d+)[\s).:-]+\s*(.*)$/;
    const choiceRegex = /^([a-zA-Z])[\s).:-]+\s*(.*)$/;
    const romanChoiceRegex = /^(\*?)(i{1,3}|iv|v|vi{1,3}|ix|x)[\s).:-]+\s*(.*)$/i;
    const sectionHeaderRegex = /^(section|part|chapter|unit)\s+\w+[\s-:]*/i;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      let trimmed = line.trim();

      if (answerKeyLines.has(i)) {
        output.push('% ' + line);
        continue;
      }

      if (trimmed === '') {
        output.push('');
        continue;
      }

      const entireBoldRegex = /^\*\*\s*(.*?)\s*\*\*$/;
      let checkTrimmed = trimmed;
      let isBoldLine = false;
      if (entireBoldRegex.test(trimmed)) {
        checkTrimmed = trimmed.replace(entireBoldRegex, '$1').trim();
        isBoldLine = true;
      }

      if (checkTrimmed.includes('\t')) {
        const cells = checkTrimmed.split('\t').map(c => c.trim()).filter(c => c.length > 0);
        if (cells.length > 0 && (cells[0] === '#' || cells[0].toLowerCase() === 'no.' || cells[0].toLowerCase() === 'id')) {
          output.push('% ' + line);
          continue;
        }
        if (cells.length >= 3 && /^\d+$/.test(cells[0])) {
          const qNum = cells[0];
          const qText = cells[1];
          const choices = cells.slice(2);
          
          output.push(`${qNum}. ${qText}`);
          choices.forEach((choice, idx) => {
            let isCorrect = false;
            let choiceText = choice;
            if (choiceText.startsWith('*')) {
              isCorrect = true;
              choiceText = choiceText.substring(1).trim();
            }
            const letter = String.fromCharCode(97 + idx);
            const prefix = isCorrect ? '*' : '';
            output.push(`${prefix}${letter}) ${choiceText}`);
          });
          output.push('');
          continue;
        }
      }

      // Heuristic: ignore section headers and prevent them from appending to previous questions
      if (checkTrimmed.match(sectionHeaderRegex)) {
        output.push('');
        output.push('% ' + trimmed);
        output.push('');
        currentQuestionNum = null;
        currentCorrectLetter = null;
        continue;
      }

      // Heuristic: Table question detection (number on a line by itself, followed by text, followed by choices)
      if (/^\d+$/.test(checkTrimmed)) {
        const qNum = checkTrimmed;
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

      let qMatch = checkTrimmed.match(questionStartRegex);
      if (qMatch) {
        currentQuestionNum = qMatch[1];
        let qText = qMatch[2];
        currentCorrectLetter = null;
        choiceCount = 0;

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
          
          const textToPush = isBoldLine ? `**${qText}**` : qText;
          output.push(`${currentQuestionNum}. ${textToPush}`);
          if (tfAnswer === 'true') {
            output.push('*a) True');
            output.push('b) False');
          } else {
            output.push('a) True');
            output.push('*b) False');
          }
          continue;
        }

        // Peek ahead to see if this is a matching question in table format or an ordering list!
        let isMatchingTable = false;
        let isOrderingList = false;
        
        let peekLines = [];
        let peekIndices = [];
        for (let k = i + 1; k < Math.min(lines.length, i + 60); k++) {
          const l = lines[k].trim();
          if (l !== '') {
            peekLines.push(l);
            peekIndices.push(k);
          }
        }
        
        const isOrderingPrompt = /order|sequence|arrange|sort/i.test(qText);
        if (isOrderingPrompt && peekLines.length >= 2 && peekLines.slice(0, 5).every((l) => {
          return /^\d+[\s).:-]/.test(l);
        })) {
          isOrderingList = true;
        }
        
        const isMatchingPrompt = /match|description|term|associate/i.test(qText);
        let hasTabSeparated = peekLines.length >= 2 && peekLines.slice(0, 5).some(l => l.includes('\t'));
        
        if (isMatchingPrompt || hasTabSeparated) {
          const isStandardChoices = peekLines.length >= 2 && peekLines.slice(0, 2).every(l => choiceRegex.test(l) || splitInlineChoices(l));
          if (!isStandardChoices) {
            isMatchingTable = true;
          }
        }
        
        if (isOrderingList) {
          const textToPush = isBoldLine ? `**${qText}**` : qText;
          output.push(`${currentQuestionNum}. ${textToPush}`);
          let lastK = i;
          for (let idx = 0; idx < peekLines.length; idx++) {
            const l = peekLines[idx];
            if (!/^\d+[\s).:-]/.test(l)) {
              break;
            }
            const stepText = l.replace(/^\d+[\s).:-]+\s*/, '');
            output.push(`~ ${stepText}`);
            lastK = peekIndices[idx];
          }
          i = lastK;
          continue;
        }
        
        if (isMatchingTable) {
          const textToPush = isBoldLine ? `**${qText}**` : qText;
          output.push(`${currentQuestionNum}. ${textToPush}`);
          let lastK = i;
          
          if (hasTabSeparated) {
            for (let idx = 0; idx < peekLines.length; idx++) {
              const l = peekLines[idx];
              if (/^\d+\./.test(l) || /^(section|part|chapter|unit)\s+/i.test(l)) {
                break;
              }
              const cells = l.split('\t').map(c => c.trim()).filter(c => c.length > 0);
              if (cells.length >= 2) {
                if (idx === 0 && /term|match|distractor|correct/i.test(cells[0]) && /term|match|distractor|correct/i.test(cells[1])) {
                  lastK = peekIndices[idx];
                  continue;
                }
                output.push(`> ${cells[0]} -> ${cells[1]}`);
                if (cells[2]) {
                  output.push(`> _ -> ${cells[2]}`);
                }
                lastK = peekIndices[idx];
              } else {
                break;
              }
            }
          } else {
            let startIdx = 0;
            if (peekLines.length >= 3 && 
                /term|prompt/i.test(peekLines[0]) && 
                /match|correct/i.test(peekLines[1])
            ) {
              if (/distractor|notes/i.test(peekLines[2])) {
                startIdx = 3;
              } else {
                startIdx = 2;
              }
            }
            
            const dataLines = peekLines.slice(startIdx);
            const dataIndices = peekIndices.slice(startIdx);
            
            let step = 2;
            if (dataLines.length >= 3 && peekLines.length >= 3 && /distractor|notes/i.test(peekLines[2])) {
              step = 3;
            }
            
            for (let k = 0; k < dataLines.length; k += step) {
              const termLine = dataLines[k];
              if (!termLine || /^\d+\./.test(termLine.trim()) || /^(section|part|chapter|unit)\s+/i.test(termLine.trim())) {
                break;
              }
              
              if (k + 1 < dataLines.length) {
                const term = termLine;
                const match = dataLines[k+1];
                
                if (/^\d+\./.test(match.trim()) || /^(section|part|chapter|unit)\s+/i.test(match.trim())) {
                  break;
                }
                
                output.push(`> ${term} -> ${match}`);
                
                if (step === 3 && k + 2 < dataLines.length) {
                  const distractor = dataLines[k+2];
                  if (distractor && /^\d+\./.test(distractor.trim())) {
                    break;
                  }
                  if (distractor && distractor.trim() && distractor.trim() !== '_') {
                    output.push(`> _ -> ${distractor}`);
                  }
                  lastK = dataIndices[Math.min(k + step - 1, dataLines.length - 1)];
                } else {
                  lastK = dataIndices[Math.min(k + 1, dataLines.length - 1)];
                }
              } else {
                break;
              }
            }
          }
          i = lastK;
          continue;
        }

        const textToPush = isBoldLine ? `**${qText}**` : qText;
        output.push(`${currentQuestionNum}. ${textToPush}`);
        continue;
      }

      // Check separate-line correct answer declarations: * A, * B, Correct: A
      let correctMatch = checkTrimmed.match(/^(?:\*|correct|answer):\s*([a-zA-Z])\s*$/i);
      if (correctMatch) {
        const correctLetter = correctMatch[1].toLowerCase();
        let choiceLines = [];
        let questionIdx = -1;
        for (let k = output.length - 1; k >= 0; k--) {
          const outLine = output[k].trim();
          if (outLine.match(/^\d+[\s).:-]+\s*(.*)$/)) {
            questionIdx = k;
            break;
          }
          const choiceMatch = outLine.match(/^([a-zA-Z])[\s).:-]+\s*(.*)$/);
          if (choiceMatch) {
            choiceLines.unshift({ index: k, letter: choiceMatch[1].toLowerCase() });
          }
        }
        
        let matchedChoice = choiceLines.find(c => c.letter === correctLetter);
        if (!matchedChoice) {
          const charIndex = correctLetter.charCodeAt(0) - 97;
          if (charIndex >= 0 && charIndex < choiceLines.length) {
            matchedChoice = choiceLines[charIndex];
          }
        }
        
        if (matchedChoice) {
          output[matchedChoice.index] = '*' + output[matchedChoice.index].trim();
        }
        continue;
      }

      // Check inline choices
      const inlineChoices = splitInlineChoices(trimmed);
      if (inlineChoices) {
        inlineChoices.forEach(c => {
          let isCorrect = false;
          if (currentCorrectLetter && c.letter.toUpperCase() === currentCorrectLetter) {
            isCorrect = true;
          }
          const prefix = isCorrect ? '*' : '';
          output.push(`${prefix}${c.letter}) ${c.text}`);
        });
        continue;
      }

      let isBoldChoice = isBoldLine;

      // Strip leading asterisk * if present (indicating correct choice)
      let hasLeadingAsterisk = false;
      if (checkTrimmed.startsWith('*') && !checkTrimmed.startsWith('**')) {
        checkTrimmed = checkTrimmed.substring(1).trim();
        hasLeadingAsterisk = true;
      }

      // Check roman numeral choices
      let rMatch = checkTrimmed.match(romanChoiceRegex);
      if (rMatch && !/^\d+/.test(checkTrimmed)) {
        let isCorrect = isBoldChoice || hasLeadingAsterisk;
        let choiceText = rMatch[3].trim();

        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
          isCorrect = true;
        } else if (entireBoldRegex.test(choiceText)) {
          choiceText = choiceText.replace(entireBoldRegex, '$1').trim();
          isCorrect = true;
        }

        let suffixCorrectMatch = choiceText.match(/(.*?)\s*(\(correct\)|<--\s*correct|\(correct\s*answer\)|\*\*)\s*$/i);
        if (suffixCorrectMatch) {
          choiceText = suffixCorrectMatch[1].trim();
          isCorrect = true;
        }

        if (trimmed.startsWith('*') || checkTrimmed.startsWith('*')) {
          isCorrect = true;
        }

        const letter = String.fromCharCode(97 + choiceCount);
        choiceCount++;

        const prefix = isCorrect ? '*' : '';
        output.push(`${prefix}${letter}) ${choiceText}`);
        continue;
      }

      let cMatch = checkTrimmed.match(choiceRegex);
      if (cMatch && !/^\d+/.test(checkTrimmed)) {
        let letter = cMatch[1].toUpperCase();
        let choiceText = cMatch[2].trim();
        
        const stdLetter = String.fromCharCode(97 + choiceCount);
        choiceCount++;

        let isCorrect = isBoldChoice || hasLeadingAsterisk;

        if (currentCorrectLetter) {
          const targetLetter = currentCorrectLetter.toLowerCase();
          if (targetLetter === stdLetter || targetLetter.charCodeAt(0) - 97 === (choiceCount - 1)) {
            isCorrect = true;
          }
        }

        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
          isCorrect = true;
        } else if (entireBoldRegex.test(choiceText)) {
          choiceText = choiceText.replace(entireBoldRegex, '$1').trim();
          isCorrect = true;
        }

        let suffixCorrectMatch = choiceText.match(/(.*?)\s*(\(correct\)|<--\s*correct|\(correct\s*answer\)|\*\*)\s*$/i);
        if (suffixCorrectMatch) {
          choiceText = suffixCorrectMatch[1].trim();
          isCorrect = true;
        }

        if (trimmed.startsWith('*') || checkTrimmed.startsWith('*')) {
          isCorrect = true;
        }

        const prefix = isCorrect ? '*' : '';
        output.push(`${prefix}${stdLetter}) ${choiceText}`);
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

      let isBoldTf = false;
      let tfText = trimmed;
      if (entireBoldRegex.test(trimmed)) {
        tfText = trimmed.replace(entireBoldRegex, '$1').trim();
        isBoldTf = true;
      }

      if (tfText === '*True' || tfText === '*true' || (tfText.toLowerCase() === 'true' && isBoldTf)) {
        output.push('*a) True');
        continue;
      }
      if (tfText === 'True' || tfText === 'true') {
        output.push('a) True');
        continue;
      }
      if (tfText === '*False' || tfText === '*false' || (tfText.toLowerCase() === 'false' && isBoldTf)) {
        output.push('*b) False');
        continue;
      }
      if (tfText === 'False' || tfText === 'false') {
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

      let expectedKeywordsMatch = trimmed.match(/^expected\s*(keywords|answers?):\s*(.*)$/i);
      if (expectedKeywordsMatch) {
        const keywords = expectedKeywordsMatch[2].split(/[,;]/).map(k => k.trim());
        keywords.forEach(keyword => {
          if (keyword) {
            output.push(`* ${keyword}`);
          }
        });
        continue;
      }

      output.push(line);
    }

    // Post-process: Convert multiple correct answer MC/TF questions to MA syntax
    let idx = 0;
    while (idx < output.length) {
      let line = output[idx];
      let trimmed = line.trim();
      
      if (/^\d+[\s).:-]+\s*(.*)$/.test(trimmed)) {
        let choiceLines = [];
        let j = idx + 1;
        
        while (j < output.length) {
          let nextLine = output[j];
          let nextTrimmed = nextLine.trim();
          
          if (nextTrimmed === '') {
            j++;
            continue;
          }
          
          if (/^\d+[\s).:-]+\s*(.*)$/.test(nextTrimmed) || nextTrimmed.match(sectionHeaderRegex)) {
            break;
          }
          
          const isMcChoice = nextTrimmed.match(/^(\*?)([a-zA-Z]|i{1,3}|iv|v|vi{1,3}|ix|x)[\s).:-]+\s*(.*)$/i);
          const isMaChoice = nextTrimmed.startsWith('[*]') || nextTrimmed.startsWith('[ ]');
          
          if (isMcChoice || isMaChoice) {
            choiceLines.push({
              index: j,
              lineText: nextLine,
              isCorrect: isMaChoice ? nextTrimmed.startsWith('[*]') : !!isMcChoice[1],
              choiceContent: isMaChoice ? nextTrimmed.substring(3).trim() : isMcChoice[3]
            });
            j++;
          } else {
            j++;
          }
        }
        
        const correctCount = choiceLines.filter(c => c.isCorrect).length;
        if (correctCount > 1) {
          choiceLines.forEach(c => {
            const nextTrimmed = output[c.index].trim();
            if (!nextTrimmed.startsWith('[*]') && !nextTrimmed.startsWith('[ ]')) {
              const prefix = c.isCorrect ? '[*]' : '[ ]';
              const indent = output[c.index].match(/^\s*/)[0];
              output[c.index] = `${indent}${prefix} ${c.choiceContent}`;
            }
          });
        }
        
        idx = j;
      } else {
        idx++;
      }
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

    let cleanedText = text.replace(/\r\n/g, '\n');

    if (format === 'auto') {
      format = this.detectFormat(cleanedText);
    }

    if (format === 'auto' || format === 'markdown') {
      // First, parse raw text to collect formatting warnings for the user editor
      const rawParser = new QuestionParser();
      rawParser.parseMarkdown(cleanedText);
      // Keep only the raw-text warnings (formatting observations like ignored lines,
      // dangling text, missing type defaults). These help the user understand what
      // the parser saw in their original text.
      const rawWarnings = rawParser.warnings;

      // Clean the text under the hood for actual parsing/rendering
      cleanedText = QuestionParser.cleanText(cleanedText);

      // Parse the cleaned text - this produces accurate validation results
      // because cleanText has already standardized inline choices, answer keys,
      // bold markers, roman numerals, etc.
      try {
        const questions = this.parseMarkdown(cleanedText);
        // Use errors from the cleaned-text parse (accurate validation)
        // and merge in warnings from both passes (deduplicating by message+line)
        const cleanedWarnings = this.warnings;
        const seenWarnings = new Set();
        const mergedWarnings = [];
        for (const w of [...rawWarnings, ...cleanedWarnings]) {
          // Skip raw warnings that are likely false positives corrected by cleanText
          if (rawWarnings.includes(w)) {
            if (w.message.includes("no specified type") || w.message.includes("dangling line")) {
              continue;
            }
          }
          const key = `${w.line}:${w.message}`;
          if (!seenWarnings.has(key)) {
            seenWarnings.add(key);
            mergedWarnings.push(w);
          }
        }
        this.warnings = mergedWarnings;
        return questions;
      } catch (err) {
        // If the cleaned parse fails, fall back to raw warnings/errors
        this.warnings = rawWarnings;
        this.errors.push({
          line: 0,
          message: `Parsing failed critically: ${err.message}`
        });
        return [];
      }
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
    const questionRegex = /^(\d+)[\s).:-]+\s*(.*)$/;
    const titleRegex = /^[Tt]itle:\s*(.*)$/;
    const pointsRegex = /^[Pp]oints:\s*(.*)$/;
    const sectionHeaderRegex = /^(section|part|chapter|unit)\s+\w+[\s-:]*/i;
    
    // Choice Regexes
    const mctfCorrectRegex = /^\*(i{1,3}|iv|v|vi{1,3}|ix|x|[a-zA-Z])[\s).:-]+\s*(.*)$/i;
    const mctfIncorrectRegex = /^(i{1,3}|iv|v|vi{1,3}|ix|x|[a-zA-Z])[\s).:-]+\s*(.*)$/i;
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

      // Check if the entire line is bolded (e.g. **choice**)
      let checkLine = line;
      let isBoldChoice = false;
      const entireBoldRegex = /^\*\*\s*(.*?)\s*\*\*$/;
      if (entireBoldRegex.test(line)) {
        checkLine = line.replace(entireBoldRegex, '$1').trim();
        isBoldChoice = true;
      }

      // Check quiz-wide headers
      let match;
      if (match = checkLine.match(quizTitleRegex)) {
        quizTitle = match[1].trim();
        continue;
      }
      if (match = checkLine.match(quizDescRegex)) {
        quizDescription = match[1].trim();
        continue;
      }
      if (match = checkLine.match(shuffleRegex)) {
        settings.shuffle_answers = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = checkLine.match(showCorrectRegex)) {
        settings.show_correct_answers = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = checkLine.match(oneQuestionRegex)) {
        settings.one_question_at_a_time = this.cleanBoolString(match[1]);
        continue;
      }
      if (match = checkLine.match(cantGoBackRegex)) {
        settings.cant_go_back = this.cleanBoolString(match[1]);
        continue;
      }

      // Check section headers (resets context and finishes current question)
      if (match = checkLine.match(sectionHeaderRegex)) {
        if (currentQuestion) {
          this.finalizeQuestion(currentQuestion, currentQuestion.startLine);
          questions.push(currentQuestion);
          currentQuestion = null;
        }
        continue;
      }

      // Question metadata
      if (match = checkLine.match(titleRegex)) {
        nextTitle = match[1].trim();
        continue;
      }
      if (match = checkLine.match(pointsRegex)) {
        const p = parseFloat(match[1].trim());
        nextPoints = isNaN(p) ? 1 : p;
        continue;
      }

      // Start of a question
      if (match = checkLine.match(questionRegex)) {
        // Finalize previous question if any
        if (currentQuestion) {
          this.finalizeQuestion(currentQuestion, currentQuestion.startLine);
          questions.push(currentQuestion);
        }

        const qText = isBoldChoice ? `**${match[2].trim()}**` : match[2].trim();

        currentQuestion = {
          id: `q_${Math.random().toString(36).substr(2, 9)}`,
          title: nextTitle || 'Question',
          text: qText,
          type: null, // to be determined by options
          points: nextPoints !== null ? nextPoints : 1,
          choices: [],
          feedback: null,
          correctFeedback: null,
          incorrectFeedback: null,
          startLine: lineNum
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
      if (match = checkLine.match(numericalRegex)) {
        currentQuestion.type = 'numerical_question';
        this.parseNumericalConstraint(currentQuestion, match[1].trim(), lineNum);
        continue;
      }

      // Check multiple choice / true-false correct choice (*a) choice text)
      if (match = checkLine.match(mctfCorrectRegex)) {
        currentQuestion.type = currentQuestion.type || 'multiple_choice_question';
        let choiceText = match[2].trim();
        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
        }
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: choiceText,
          correct: true,
          feedback: null,
          syntax: 'mc'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple choice / true-false incorrect choice (a) choice text)
      if (match = checkLine.match(mctfIncorrectRegex)) {
        currentQuestion.type = currentQuestion.type || 'multiple_choice_question';
        let choiceText = match[2].trim();
        let isCorrect = isBoldChoice;
        
        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
          isCorrect = true;
        }
        
        let suffixCorrectMatch = choiceText.match(/(.*?)\s*(\(correct\)|<--\s*correct|\(correct\s*answer\)|\*\*)\s*$/i);
        if (suffixCorrectMatch) {
          choiceText = suffixCorrectMatch[1].trim();
          isCorrect = true;
        }

        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: choiceText,
          correct: isCorrect,
          feedback: null,
          syntax: 'mc'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple answer correct choice ([*] choice text)
      if (match = checkLine.match(multansCorrectRegex)) {
        currentQuestion.type = 'multiple_answers_question';
        let choiceText = match[1].trim();
        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
        }
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: choiceText,
          correct: true,
          feedback: null,
          syntax: 'ma'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check multiple answer incorrect choice ([ ] choice text)
      if (match = checkLine.match(multansIncorrectRegex)) {
        currentQuestion.type = 'multiple_answers_question';
        let choiceText = match[1].trim();
        let isCorrect = isBoldChoice;
        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
          isCorrect = true;
        }
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: choiceText,
          correct: isCorrect,
          feedback: null,
          syntax: 'ma'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check short answer / fill in blank response (* acceptable answer)
      if (match = checkLine.match(shortansCorrectRegex)) {
        currentQuestion.type = 'short_answer_question';
        let choiceText = match[1].trim();
        if (choiceText.startsWith('**') && choiceText.endsWith('**')) {
          choiceText = choiceText.substring(2, choiceText.length - 2).trim();
        }
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: choiceText,
          correct: true,
          feedback: null,
          syntax: 'sa'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check matching pair (> Left -> Right)
      if (checkLine.startsWith('>')) {
        currentQuestion.type = 'matching_question';
        currentQuestion.choices = currentQuestion.choices || [];
        
        const rawContent = checkLine.substring(1).trim();
        let left = '';
        let right = '';
        
        const splitIdx = rawContent.indexOf('->');
        const eqIdx = rawContent.indexOf('=');
        
        if (splitIdx !== -1) {
          left = rawContent.substring(0, splitIdx).trim();
          right = rawContent.substring(splitIdx + 2).trim();
        } else if (eqIdx !== -1) {
          left = rawContent.substring(0, eqIdx).trim();
          right = rawContent.substring(eqIdx + 1).trim();
        } else {
          left = '';
          right = rawContent;
        }

        if (left.startsWith('**') && left.endsWith('**')) {
          left = left.substring(2, left.length - 2).trim();
        }
        if (right.startsWith('**') && right.endsWith('**')) {
          right = right.substring(2, right.length - 2).trim();
        }
        
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          left: left,
          right: right,
          correct: true,
          syntax: 'mat'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check ordering step (~ Step text)
      if (checkLine.startsWith('~')) {
        currentQuestion.type = 'matching_question';
        currentQuestion.choices = currentQuestion.choices || [];
        let stepText = checkLine.substring(1).trim();
        if (stepText.startsWith('**') && stepText.endsWith('**')) {
          stepText = stepText.substring(2, stepText.length - 2).trim();
        }
        currentQuestion.choices.push({
          id: `c_${Math.random().toString(36).substr(2, 9)}`,
          text: stepText,
          correct: true,
          syntax: 'ord'
        });
        canAppendToLastChoice = true;
        continue;
      }

      // Check correct feedback (+)
      if (match = checkLine.match(correctFeedbackRegex)) {
        currentQuestion.correctFeedback = match[1].trim();
        continue;
      }

      // Check incorrect feedback (-)
      if (match = checkLine.match(incorrectFeedbackRegex)) {
        currentQuestion.incorrectFeedback = match[1].trim();
        continue;
      }

      // Check general feedback (...)
      if (match = checkLine.match(feedbackRegex)) {
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
      this.finalizeQuestion(currentQuestion, currentQuestion.startLine);
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
      const cleanPrompt = q.text.trim().toLowerCase();
      if (cleanPrompt.startsWith('essay:') || cleanPrompt.startsWith('essay -') || cleanPrompt === 'essay') {
        q.type = 'essay_question';
      } else if (cleanPrompt.startsWith('short answer:') || cleanPrompt.startsWith('short answer -') || cleanPrompt.startsWith('fill in the blank:') || cleanPrompt.startsWith('fill in the blank -')) {
        q.type = 'short_answer_question';
      } else if (cleanPrompt.startsWith('numeric answer:') || cleanPrompt.startsWith('numerical answer:') || cleanPrompt.startsWith('numeric:') || cleanPrompt.startsWith('numerical:')) {
        q.type = 'numerical_question';
      } else if (cleanPrompt.startsWith('matching:') || cleanPrompt.startsWith('match:')) {
        q.type = 'matching_question';
      } else if (cleanPrompt.startsWith('true/false:') || cleanPrompt.startsWith('t/f:') || cleanPrompt.startsWith('true or false:')) {
        q.type = 'true_false_question';
      } else if (cleanPrompt.startsWith('multiple choice:') || cleanPrompt.startsWith('mc:')) {
        q.type = 'multiple_choice_question';
      } else if (cleanPrompt.startsWith('multiple response:') || cleanPrompt.startsWith('multiple answers:') || cleanPrompt.startsWith('select all:') || cleanPrompt.startsWith('select all that apply:')) {
        q.type = 'multiple_answers_question';
      } else if (q.choices.length > 0) {
        const hasMat = q.choices.some(c => c.syntax === 'mat');
        const hasOrd = q.choices.some(c => c.syntax === 'ord');
        if (hasMat || hasOrd) {
          q.type = 'matching_question';
        } else {
          q.type = 'multiple_choice_question';
        }
      } else {
        q.type = 'essay_question';
        this.warnings.push({
          line: lineNum,
          message: `Question has no specified type or answer choices. Defaulting to Essay question.`
        });
      }
    }

    if (q.type === 'matching_question') {
      const isOrd = q.choices.some(c => c.syntax === 'ord');
      q.matches = q.matches || [];
      q.distractors = q.distractors || [];
      
      if (isOrd) {
        q.isOrdering = true;
        q.choices.forEach((c, idx) => {
          if (c.syntax === 'ord') {
            q.matches.push({
              left: c.text,
              right: (q.matches.length + 1).toString()
            });
          }
        });
      } else {
        q.choices.forEach(c => {
          if (c.syntax === 'mat') {
            if (c.left === '' || c.left === '_' || c.left.toLowerCase() === '[distractor]') {
              q.distractors.push(c.right);
            } else {
              q.matches.push({
                left: c.left,
                right: c.right
              });
            }
          }
        });
      }
      
      q.choices = [];
      
      if (q.matches.length === 0) {
        this.errors.push({
          line: lineNum,
          message: `Matching question "${q.text.substring(0, 30)}..." must have at least one valid match pair (> Left -> Right) or step (~ Step).`
        });
      } else {
        const lefts = q.matches.map(m => m.left);
        const duplicates = lefts.filter((item, index) => lefts.indexOf(item) !== index);
        if (duplicates.length > 0) {
          this.warnings.push({
            line: lineNum,
            message: `Matching question "${q.text.substring(0, 30)}..." has duplicate left stems: "${duplicates.join(', ')}". Each stem should be unique.`
          });
        }
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
      
      const hasMcChoice = q.choices.some(c => c.syntax === 'mc');
      if (hasMcChoice) {
        this.errors.push({
          line: lineNum,
          message: `Multiple Answer question "${q.text.substring(0, 30)}..." mixes checkbox syntax ([ ] or [*]) with multiple choice syntax (*a) or a)). Please use only checkbox syntax for all choices.`
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
      let isOrdering = false;
      if (rawType.includes('multiple choice') || rawType === 'mc') type = 'multiple_choice_question';
      else if (rawType.includes('true') || rawType === 'tf') type = 'true_false_question';
      else if (rawType.includes('multiple answer') || rawType.includes('checkbox') || rawType === 'ma') type = 'multiple_answers_question';
      else if (rawType.includes('fill') || rawType.includes('short') || rawType === 'fitb' || rawType === 'sa') type = 'short_answer_question';
      else if (rawType.includes('essay')) type = 'essay_question';
      else if (rawType.includes('upload') || rawType.includes('file')) type = 'file_upload_question';
      else if (rawType.includes('numerical') || rawType === 'num') type = 'numerical_question';
      else if (rawType.includes('matching') || rawType === 'match' || rawType === 'mt') type = 'matching_question';
      else if (rawType.includes('ordering') || rawType === 'order' || rawType === 'ord') {
        type = 'matching_question';
        isOrdering = true;
      }
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
        incorrectFeedback: null,
        isOrdering: isOrdering
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
      } else if (type === 'matching_question') {
        const matches = [];
        const distractors = [];
        
        choiceIndices.forEach(({ index }) => {
          const val = row[index];
          if (val && val.trim()) {
            const raw = val.trim();
            if (questionObj.isOrdering) {
              matches.push({
                left: raw,
                right: (matches.length + 1).toString()
              });
            } else {
              const splitIdx = raw.indexOf('->');
              const eqIdx = raw.indexOf('=');
              let left = '';
              let right = '';
              
              if (splitIdx !== -1) {
                left = raw.substring(0, splitIdx).trim();
                right = raw.substring(splitIdx + 2).trim();
              } else if (eqIdx !== -1) {
                left = raw.substring(0, eqIdx).trim();
                right = raw.substring(eqIdx + 1).trim();
              } else {
                left = '';
                right = raw;
              }
              
              if (left === '' || left === '_' || left.toLowerCase() === '[distractor]') {
                distractors.push(right);
              } else {
                matches.push({ left, right });
              }
            }
          }
        });
        
        questionObj.matches = matches;
        questionObj.distractors = distractors;
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
