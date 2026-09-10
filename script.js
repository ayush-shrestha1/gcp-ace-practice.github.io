const FILE_MANIFEST = [
  { path: 'json/default.json', label: 'Default Questions', type: 'weekly' },
  { path: 'json/practice_sets/pre_exam_quiz_1.json', label: 'Practice: Pre-Exam 1', type: 'practice' },
  { path: 'json/practice_sets/pre_exam_quiz_2.json', label: 'Practice: Pre-Exam 2', type: 'practice' },
  { path: 'json/practice_sets/sample_quiz.json', label: 'Practice: Sample Quiz', type: 'practice' },
  { path: 'json/weekly_sets/week2_quiz.json', label: 'Weekly: Week 2', type: 'weekly' },
  { path: 'json/weekly_sets/week3_quiz.json', label: 'Weekly: Week 3', type: 'weekly' },
  { path: 'json/weekly_sets/week4_quiz.json', label: 'Weekly: Week 4', type: 'weekly' },
  { path: 'json/weekly_sets/week5_quiz.json', label: 'Weekly: Week 5', type: 'weekly' },
  { path: 'json/weekly_sets/week6_quiz.json', label: 'Weekly: Week 6', type: 'weekly' }
];

class GCPQuizEngine {
  constructor() {
    this.allQuestions = [];
    this.practicePool = [];
    this.weeklyPool = [];
    this.activeQuestions = [];
    this.currentIndex = 0;
    this.userAnswers = {};
    this.submittedAnswers = {};
    this.mode = 'practice';
    this.timer = null;
    this.timeLeft = 0;

    this.init();
  }

  async init() {
    this.populateDropdown();
    await this.loadAllQuestions();
  }

  populateDropdown() {
    const select = document.getElementById('individual-set-select');
    if (!select) return;
    FILE_MANIFEST.forEach((item, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = item.label;
      select.appendChild(opt);
    });
  }

  async loadAllQuestions() {
    for (const file of FILE_MANIFEST) {
      try {
        const res = await fetch(file.path);
        if (!res.ok) continue;
        const data = await res.json();
        
        const taggedData = data.map(q => ({
          ...q,
          sourceLabel: file.label,
          sourceType: file.type,
          domain: this.classifyQuestion(q)
        }));

        this.allQuestions.push(...taggedData);
        if (file.type === 'practice') {
          this.practicePool.push(...taggedData);
        } else {
          this.weeklyPool.push(...taggedData);
        }
      } catch (e) {
        console.warn(`Could not load file: ${file.path}`);
      }
    }
  }

  shuffle(array) {
    return array.map(v => ({ v, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ v }) => v);
  }

  classifyQuestion(q) {
    const content = (q.question + ' ' + (q.options ? q.options.join(' ') : '') + ' ' + (q.explanation || '')).toLowerCase();
    
    // Section 5: Access & Security
    if (content.match(/iam|role|permission|service account|workload identity|secret manager|audit log|kms|key|encrypt|signed url|access control|binary authorization|organization policy|firewall/i)) {
      return 'Section 5: Access & Security';
    }
    // Section 4: Ensuring Successful Operation
    if (content.match(/monitor|logging|stackdriver|alert|metric|autoscal|health check|backup|snapshot|troubleshoot|quota|billing alert|cost|trace|debugger/i)) {
      return 'Section 4: Ensuring Successful Operation';
    }
    // Section 3: Deploying & Implementing
    if (content.match(/deploy|cloud build|gke|kubernetes|container|cloud function|cloud run|terraform|deployment manager|ci\/cd|pipeline|mig|instance group/i)) {
      return 'Section 3: Deploying & Implementing';
    }
    // Section 2: Planning & Configuring
    if (content.match(/plan|calculator|pricing|storage class|nearline|coldline|archive|cloud sql|spanner|bigtable|firestore|subnet|vpc|load balancer|redis|memorystore/i)) {
      return 'Section 2: Planning & Configuring';
    }
    // Section 1: Setting up Environment
    return 'Section 1: Setting up Environment';
  }

  startFullSet(mode) {
    this.mode = mode;
    if (this.allQuestions.length === 0) {
      alert('Questions are still loading or failed to load. Please verify your web server/file paths.');
      return;
    }

    if (mode === 'mock') {
      const targets = {
        'Section 1: Setting up Environment': 11,
        'Section 2: Planning & Configuring': 10,
        'Section 3: Deploying & Implementing': 15,
        'Section 4: Ensuring Successful Operation': 12,
        'Section 5: Access & Security': 12
      };

      let mockQuestions = [];
      Object.keys(targets).forEach(domain => {
        const pool = this.shuffle(this.allQuestions.filter(q => q.domain === domain));
        mockQuestions.push(...pool.slice(0, targets[domain]));
      });

      if (mockQuestions.length < 60) {
        const selectedIds = new Set(mockQuestions.map(q => q.id));
        const remaining = this.shuffle(this.allQuestions.filter(q => !selectedIds.has(q.id)));
        mockQuestions.push(...remaining.slice(0, 60 - mockQuestions.length));
      }

      this.prepareQuizState(mockQuestions);
    } else {
      const shuffled = this.shuffle([...this.allQuestions]);
      this.prepareQuizState(shuffled.slice(0, Math.min(60, shuffled.length)));
    }
  }

  startIndividualSet(mode) {
    const selectIdx = document.getElementById('individual-set-select').value;
    if (selectIdx === "") {
      alert("Please select a question set first.");
      return;
    }
    const file = FILE_MANIFEST[selectIdx];
    this.mode = mode;

    const filtered = this.allQuestions.filter(q => q.sourceLabel === file.label);
    if (filtered.length === 0) {
      alert("No questions found for the selected set.");
      return;
    }
    this.prepareQuizState(filtered);
  }

  prepareQuizState(questions) {
    this.currentIndex = 0;
    this.userAnswers = {};
    this.submittedAnswers = {};

    this.activeQuestions = this.shuffle(questions).map(q => {
      const optionsWithIdx = q.options.map((text, idx) => ({ text, originalIndex: idx }));
      const shuffledOptions = this.shuffle(optionsWithIdx);
      return {
        ...q,
        shuffledOptions,
        newCorrectIndex: shuffledOptions.findIndex(o => {
          if (Array.isArray(q.correct)) return q.correct.includes(o.originalIndex);
          return o.originalIndex === q.correct;
        })
      };
    });

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('quiz-meta').classList.remove('hidden');

    if (this.mode === 'mock') {
      this.startTimer(120 * 60);
      document.getElementById('action-btn').classList.add('hidden');
      document.getElementById('submit-exam-btn').classList.remove('hidden');
    } else {
      document.getElementById('action-btn').classList.remove('hidden');
      document.getElementById('submit-exam-btn').classList.add('hidden');
    }

    this.renderQuestion();
    this.renderPalette();
  }

  renderQuestion() {
    const q = this.activeQuestions[this.currentIndex];
    if (!q) return;

    document.getElementById('progress-display').textContent = `Question ${this.currentIndex + 1} of ${this.activeQuestions.length}`;
    document.getElementById('source-badge').textContent = q.sourceLabel;
    document.getElementById('q-text').textContent = q.question;

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    const isSubmitted = !!this.submittedAnswers[this.currentIndex];
    const isFlashcard = this.mode === 'flashcard';

    if (isFlashcard) {
      document.getElementById('flashcard-reveal').classList.remove('hidden');
      document.getElementById('action-btn').classList.add('hidden');
    } else {
      document.getElementById('flashcard-reveal').classList.add('hidden');
    }

    q.shuffledOptions.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = `option-btn ${this.userAnswers[this.currentIndex] === idx ? 'selected' : ''}`;

      if (isSubmitted || (isFlashcard && this.submittedAnswers[this.currentIndex])) {
        const isCorrect = Array.isArray(q.correct) 
          ? q.correct.includes(opt.originalIndex) 
          : opt.originalIndex === q.correct;

        if (isCorrect) btn.classList.add('correct');
        else if (idx === this.userAnswers[this.currentIndex]) btn.classList.add('incorrect');
      }

      btn.textContent = `${String.fromCharCode(65 + idx)}) ${opt.text}`;
      btn.onclick = () => {
        if (!isSubmitted) this.selectOption(idx);
      };
      optionsContainer.appendChild(btn);
    });

    const expBox = document.getElementById('explanation-box');
    if (isSubmitted || (isFlashcard && this.submittedAnswers[this.currentIndex])) {
      document.getElementById('explanation-text').textContent = q.explanation || '';
      expBox.classList.remove('hidden');
    } else {
      expBox.classList.add('hidden');
    }

    this.updatePalette();
  }

  selectOption(idx) {
    this.userAnswers[this.currentIndex] = idx;
    this.renderQuestion();
  }

  handlePrimaryAction() {
    if (this.mode === 'practice') {
      if (this.userAnswers[this.currentIndex] === undefined) {
        alert("Please select an answer first.");
        return;
      }
      this.submittedAnswers[this.currentIndex] = true;
      this.renderQuestion();
    }
  }

  revealFlashcard() {
    this.submittedAnswers[this.currentIndex] = true;
    this.renderQuestion();
  }

  navigate(dir) {
    const nextIdx = this.currentIndex + dir;
    if (nextIdx >= 0 && nextIdx < this.activeQuestions.length) {
      this.currentIndex = nextIdx;
      this.renderQuestion();
    }
  }

  renderPalette() {
    const grid = document.getElementById('question-palette');
    grid.innerHTML = '';
    this.activeQuestions.forEach((_, idx) => {
      const node = document.createElement('div');
      node.className = 'p-node';
      node.textContent = idx + 1;
      node.onclick = () => { this.currentIndex = idx; this.renderQuestion(); };
      grid.appendChild(node);
    });
  }

  updatePalette() {
    const nodes = document.querySelectorAll('.p-node');
    nodes.forEach((node, idx) => {
      node.className = 'p-node';
      if (idx === this.currentIndex) node.classList.add('current');
      if (this.userAnswers[idx] !== undefined) node.classList.add('answered');
    });
  }

  startTimer(seconds) {
    if (this.timer) clearInterval(this.timer);
    this.timeLeft = seconds;
    this.timer = setInterval(() => {
      this.timeLeft--;
      const mins = Math.floor(this.timeLeft / 60);
      const secs = this.timeLeft % 60;
      document.getElementById('timer-display').textContent = 
        `⏱️ ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.finishQuiz();
      }
    }, 1000);
  }

  finishQuiz() {
    if (this.mode === 'mock') {
      const confirmSubmit = confirm("Are you sure you want to submit your final exam now?");
      if (!confirmSubmit) return;
    }

    if (this.timer) clearInterval(this.timer);
    let correctCount = 0;

    this.activeQuestions.forEach((q, idx) => {
      const userChoice = this.userAnswers[idx];
      if (userChoice !== undefined) {
        const chosenOriginalIdx = q.shuffledOptions[userChoice].originalIndex;
        const isCorrect = Array.isArray(q.correct)
          ? q.correct.includes(chosenOriginalIdx)
          : chosenOriginalIdx === q.correct;
        if (isCorrect) correctCount++;
      }
    });

    const scorePct = this.activeQuestions.length > 0 
      ? Math.round((correctCount / this.activeQuestions.length) * 100) 
      : 0;

    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('quiz-meta').classList.add('hidden');
    document.getElementById('results-screen').classList.remove('hidden');

    const circle = document.getElementById('score-circle');
    document.getElementById('final-score').textContent = `${scorePct}%`;

    const passed = scorePct >= 85;
    circle.className = `score-circle ${passed ? 'pass' : 'fail'}`;
    document.getElementById('pass-fail-msg').textContent = passed
      ? '🎉 PASSED! Outstanding readiness for the GCP ACE Exam.'
      : '❌ FAILED. Review your mistakes below and re-test.';

    this.renderReviewList();
  }

  renderDomainBreakdown() {
    const domainStats = {};

    this.activeQuestions.forEach((q, idx) => {
      if (!domainStats[q.domain]) {
        domainStats[q.domain] = { total: 0, correct: 0 };
      }
      domainStats[q.domain].total++;

      const userChoice = this.userAnswers[idx];
      if (userChoice !== undefined) {
        const chosenOriginalIdx = q.shuffledOptions[userChoice].originalIndex;
        const isCorrect = Array.isArray(q.correct)
          ? q.correct.includes(chosenOriginalIdx)
          : chosenOriginalIdx === q.correct;
        if (isCorrect) domainStats[q.domain].correct++;
      }
    });

    let breakdownHtml = '<h3>Domain Performance Breakdown</h3><div class="domain-report">';
    Object.keys(domainStats).forEach(domain => {
      const stats = domainStats[domain];
      const pct = Math.round((stats.correct / stats.total) * 100) || 0;
      const statusClass = pct >= 85 ? 'text-success' : 'text-danger';

      breakdownHtml += `
        <div class="domain-card">
          <strong>${domain}</strong>
          <div>Score: <span class="${statusClass}">${pct}%</span> (${stats.correct}/${stats.total})</div>
        </div>
      `;
    });
    breakdownHtml += '</div>';

    return breakdownHtml;
  }

  renderReviewList() {
    const reviewList = document.getElementById('review-list');
    let contentHtml = this.renderDomainBreakdown();
    contentHtml += '<h3 style="margin-top:2rem;">Detailed Answer Breakdown</h3>';

    this.activeQuestions.forEach((q, qIdx) => {
      const userChoice = this.userAnswers[qIdx];
      const chosenOriginalIdx = userChoice !== undefined ? q.shuffledOptions[userChoice].originalIndex : null;
      const isCorrect = userChoice !== undefined && (
        Array.isArray(q.correct) ? q.correct.includes(chosenOriginalIdx) : chosenOriginalIdx === q.correct
      );

      let optionsHtml = '<ul class="review-options">';
      q.shuffledOptions.forEach((opt, optIdx) => {
        let badgeClass = '';
        let tag = '';

        const isOptCorrect = Array.isArray(q.correct)
          ? q.correct.includes(opt.originalIndex)
          : opt.originalIndex === q.correct;

        if (isOptCorrect) {
          badgeClass = 'badge-correct';
          tag = ' (Correct Answer)';
        }
        if (optIdx === userChoice) {
          if (!isCorrect) badgeClass = 'badge-incorrect';
          tag += ' 👈 Your Choice';
        }

        optionsHtml += `<li class="${badgeClass}">${String.fromCharCode(65 + optIdx)}) ${opt.text} <strong>${tag}</strong></li>`;
      });
      optionsHtml += '</ul>';

      contentHtml += `
        <div class="review-card ${isCorrect ? 'review-correct' : 'review-incorrect'}">
          <div style="display:flex; justify-content:space-between;">
            <h4>Q${qIdx + 1}: ${q.question}</h4>
            <span class="badge">${q.sourceLabel}</span>
          </div>
          ${optionsHtml}
          <div class="explanation">
            <strong>Explanation:</strong> ${q.explanation || ''}
          </div>
        </div>
      `;
    });

    reviewList.innerHTML = contentHtml;
  }

  resetToMenu() {
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-meta').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }

  exitToMenu() {
    if (this.mode === 'mock') {
      const confirmExit = confirm("Are you sure you want to exit the exam? Your current progress and timer will be reset.");
      if (!confirmExit) return;
    }

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('quiz-meta').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }
}

const app = new GCPQuizEngine();