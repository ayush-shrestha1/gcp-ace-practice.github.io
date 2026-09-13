const FILE_MANIFEST = [
  { path: 'json/default.json', label: 'Default Questions', type: 'weekly' },
  { path: 'json/practice_sets/pre_exam_quiz_1.json', label: 'Pre-Exam 1', type: 'practice' },
  { path: 'json/practice_sets/pre_exam_quiz_2.json', label: 'Pre-Exam 2', type: 'practice' },
  { path: 'json/practice_sets/sample_quiz.json', label: 'Sample Quiz', type: 'practice' },
  { path: 'json/weekly_sets/week1_quiz.json', label: 'Week 1 Quiz', type: 'weekly' },
  { path: 'json/weekly_sets/week2_dq.json', label: 'Week 2 Diagnostic Questions', type: 'dq' },
  { path: 'json/weekly_sets/week2_kc.json', label: 'Week 2 Knowledge Check', type: 'kc' },
  { path: 'json/weekly_sets/week2_quiz.json', label: 'Week 2 Quiz', type: 'weekly' },
  { path: 'json/weekly_sets/week3_dq.json', label: 'Week 3 Diagnostic Questions', type: 'dq' },
  { path: 'json/weekly_sets/week3_kc.json', label: 'Week 3 Knowledge Check', type: 'kc' },
  { path: 'json/weekly_sets/week3_quiz.json', label: 'Week 3 Quiz', type: 'weekly' },
  { path: 'json/weekly_sets/week4_dq.json', label: 'Week 4 Diagnostic Questions', type: 'dq' },
  { path: 'json/weekly_sets/week4_kc.json', label: 'Week 4 Knowledge Check', type: 'kc' },
  { path: 'json/weekly_sets/week4_quiz.json', label: 'Week 4 Quiz', type: 'weekly' },
  { path: 'json/weekly_sets/week5_dq.json', label: 'Week 5 Diagnostic Questions', type: 'dq' },
  { path: 'json/weekly_sets/week5_kc.json', label: 'Week 5 Knowledge Check', type: 'kc' },
  { path: 'json/weekly_sets/week5_quiz.json', label: 'Week 5 Quiz', type: 'weekly' },
  { path: 'json/weekly_sets/week6_dq.json', label: 'Week 6 Diagnostic Questions', type: 'dq' },
  { path: 'json/weekly_sets/week6_kc.json', label: 'Week 6 Knowledge Check', type: 'kc' },
  { path: 'json/weekly_sets/week6_quiz.json', label: 'Week 6 Quiz', type: 'weekly' }
];

class GCPQuizEngine {
  constructor() {
    this.allQuestions = [];
    this.activeQuestions = [];
    this.currentIndex = 0;
    this.userAnswers = {};
    this.submittedAnswers = {};
    this.mode = 'practice';
    this.timer = null;
    this.timeLeft = 0;

    // Study Guide State
    this.guideData = null;
    this.activeGuideTab = 'keywords';
    this.deckCardIndex = 0;
    this.deckFlipped = false;

    this.init();
  }

  async init() {
    if (localStorage.getItem('gcp_theme') === 'dark') {
      document.body.classList.add('dark-mode');
      this.updateThemeButton();
    }
    await this.loadAllQuestions();
    this.populateDropdown();
  }

  showModal({ title = 'Notice', message = '', isConfirm = false, onConfirm = null }) {
    const backdrop = document.getElementById('modal-backdrop');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const confirmBtn = document.getElementById('modal-confirm-btn');

    titleEl.textContent = title;
    msgEl.textContent = message;

    if (isConfirm) {
      cancelBtn.classList.remove('hidden');
    } else {
      cancelBtn.classList.add('hidden');
    }

    backdrop.classList.remove('hidden');

    const cleanup = () => {
      backdrop.classList.add('hidden');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      cleanup();
      if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
      cleanup();
    };
  }

  toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('gcp_theme', isDark ? 'dark' : 'light');
    this.updateThemeButton();
  }

  updateThemeButton() {
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
      const isDark = document.body.classList.contains('dark-mode');
      btn.innerHTML = `<span class="material-symbols-outlined">${isDark ? 'light_mode' : 'dark_mode'}</span> ${isDark ? 'Light' : 'Dark'}`;
    }
  }

  populateDropdown() {
    const select = document.getElementById('individual-set-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Choose a Set or Group --</option>';

    const groupOptgroup = document.createElement('optgroup');
    groupOptgroup.label = '⚡ Combined Question Groups';
    const groups = [
      { value: 'group:kc', label: 'ALL Knowledge Checks (KC)' },
      { value: 'group:dq', label: 'ALL Diagnostic Questions (DQ)' },
      { value: 'group:weekly', label: 'ALL Weekly Quizzes' },
      { value: 'group:practice', label: 'ALL Practice Sets' }
    ];
    groups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.value;
      opt.textContent = g.label;
      groupOptgroup.appendChild(opt);
    });
    select.appendChild(groupOptgroup);

    const categories = [
      { key: 'practice', label: 'Practice Sets' },
      { key: 'dq', label: 'Diagnostic Questions (DQ)' },
      { key: 'kc', label: 'Knowledge Checks (KC)' },
      { key: 'weekly', label: 'Weekly Quizzes' }
    ];

    categories.forEach(cat => {
      const og = document.createElement('optgroup');
      og.label = `📁 ${cat.label}`;
      const items = FILE_MANIFEST.filter(item => item.type === cat.key);
      items.forEach(item => {
        const globalIdx = FILE_MANIFEST.indexOf(item);
        const opt = document.createElement('option');
        opt.value = globalIdx;
        opt.textContent = item.label;
        og.appendChild(opt);
      });
      if (items.length > 0) {
        select.appendChild(og);
      }
    });
  }

  async loadAllQuestions() {
    this.allQuestions = [];
    const seenQuestions = new Set();
    const failedFiles = [];

    for (const file of FILE_MANIFEST) {
      try {
        const res = await fetch(file.path);
        if (!res.ok) {
          failedFiles.push(file.label);
          continue;
        }
        const data = await res.json();
        
        const taggedData = [];
        data.forEach(q => {
          const normalizedText = q.question.trim().toLowerCase();
          if (!seenQuestions.has(normalizedText)) {
            seenQuestions.add(normalizedText);
            taggedData.push({
              ...q,
              sourceLabel: file.label,
              sourceType: file.type,
              domain: this.classifyQuestion(q)
            });
          }
        });

        this.allQuestions.push(...taggedData);
      } catch (e) {
        failedFiles.push(file.label);
      }
    }

    if (failedFiles.length > 0) {
      this.showModal({
        title: 'Dataset Warning',
        message: `Some question sets could not be loaded (${failedFiles.join(', ')}). Please run on a web server or check file paths.`
      });
    }
  }

  /* --- STUDY GUIDE ENGINE --- */
  async openStudyGuide() {
    if (!this.guideData) {
      try {
        const res = await fetch('json/guide.json');
        if (!res.ok) throw new Error('Could not load guide.json');
        this.guideData = await res.json();
      } catch (err) {
        this.showModal({
          title: 'Guide Load Error',
          message: 'Unable to load guide.json. Please verify the file is present in your web root.'
        });
        return;
      }
    }

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('guide-screen').classList.remove('hidden');

    // Show Home navbar button
    document.getElementById('home-btn').classList.remove('hidden');

    this.renderGuideContent();
  }

  switchGuideTab(tabName, el) {
    this.activeGuideTab = tabName;
    document.querySelectorAll('.guide-tab-btn').forEach(btn => btn.classList.remove('active'));
    if (el) el.classList.add('active');
    this.renderGuideContent();
  }

  filterGuideContent() {
    this.renderGuideContent();
  }

  renderGuideContent() {
    const container = document.getElementById('guide-tab-content');
    const search = (document.getElementById('guide-search-input')?.value || '').toLowerCase();
    container.innerHTML = '';

    if (!this.guideData) return;

    switch (this.activeGuideTab) {
      case 'keywords':
        const filteredKw = this.guideData.tips_and_tricks_keyword_mappings.filter(item => 
          item.keywords.some(k => k.toLowerCase().includes(search)) ||
          item.likely_answer.toLowerCase().includes(search) ||
          item.reasoning.toLowerCase().includes(search)
        );
        filteredKw.forEach(item => {
          const div = document.createElement('div');
          div.className = 'keyword-card';
          div.innerHTML = `
            <div class="tag-cloud">${item.keywords.map(k => `<span class="keyword-tag">${k}</span>`).join('')}</div>
            <div class="answer-highlight-box">
              <span class="material-symbols-outlined">check_circle</span>
              <span>Likely Target: ${item.likely_answer}</span>
            </div>
            <div class="reasoning-text">${item.reasoning}</div>
          `;
          container.appendChild(div);
        });
        break;

      case 'matrices':
        this.guideData.decision_trees_and_matrices.forEach(group => {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'matrix-group';
          const matchingScenarios = group.scenarios.filter(s =>
            s.requirement.toLowerCase().includes(search) || s.chosen_service.toLowerCase().includes(search)
          );

          if (matchingScenarios.length > 0) {
            let cardsHtml = matchingScenarios.map(s => `
              <div class="matrix-card">
                <div class="matrix-req">${s.requirement}</div>
                <div class="matrix-target">
                  <span class="material-symbols-outlined">arrow_forward</span>
                  <span>${s.chosen_service}</span>
                </div>
              </div>
            `).join('');

            groupDiv.innerHTML = `
              <h3><span class="material-symbols-outlined">account_tree</span> ${group.category}</h3>
              <div class="matrix-grid">${cardsHtml}</div>
            `;
            container.appendChild(groupDiv);
          }
        });
        break;

      case 'scenarios':
        const filteredScenarios = this.guideData.important_and_repeated_question_patterns.filter(s =>
          s.scenario.toLowerCase().includes(search) ||
          s.question_pattern.toLowerCase().includes(search) ||
          s.correct_answer_pattern.toLowerCase().includes(search)
        );
        filteredScenarios.forEach(s => {
          const div = document.createElement('div');
          div.className = 'scenario-card';
          div.innerHTML = `
            <div class="scenario-title"><span class="material-symbols-outlined icon-inline" style="color:var(--md-primary);">quiz</span> ${s.scenario}</div>
            <div class="scenario-q">${s.question_pattern}</div>
            <div class="callout-box callout-success">
              <span class="material-symbols-outlined">check_circle</span>
              <div><strong>Correct Answer Strategy:</strong> ${s.correct_answer_pattern}</div>
            </div>
            <div class="callout-box callout-danger">
              <span class="material-symbols-outlined">warning</span>
              <div><strong>Exam Distractor Trap:</strong> ${s.distractor_trap}</div>
            </div>
          `;
          container.appendChild(div);
        });
        break;

      case 'traps':
        const filteredTraps = this.guideData.common_exam_traps_and_gotchas.filter(t =>
          t.trap.toLowerCase().includes(search) || t.fact.toLowerCase().includes(search)
        );
        filteredTraps.forEach(t => {
          const div = document.createElement('div');
          div.className = 'trap-card-split';
          div.innerHTML = `
            <div class="trap-side">
              <div class="trap-side-title">
                <span class="material-symbols-outlined">cancel</span> Common Exam Trap
              </div>
              <div>${t.trap}</div>
            </div>
            <div class="fact-side">
              <div class="fact-side-title">
                <span class="material-symbols-outlined">check_circle</span> The Real GCP Fact
              </div>
              <div>${t.fact}</div>
            </div>
          `;
          container.appendChild(div);
        });
        break;

      case 'roles':
        const filteredRoles = this.guideData.iam_predefined_roles_quick_reference.filter(r =>
          r.role_name.toLowerCase().includes(search) ||
          r.title.toLowerCase().includes(search) ||
          r.use_case.toLowerCase().includes(search)
        );
        filteredRoles.forEach(r => {
          const div = document.createElement('div');
          div.className = 'card';
          div.style.marginTop = '0';
          div.innerHTML = `
            <span class="badge-type">${r.title}</span>
            <div class="code-block">${r.role_name}</div>
            <div style="font-size:0.88rem; color:var(--md-on-surface-variant); margin-top:0.4rem;">
              <strong>Key Use Case:</strong> ${r.use_case}
            </div>
          `;
          container.appendChild(div);
        });
        break;

      case 'cli':
        const filteredCli = this.guideData.cli_and_console_commands.filter(c =>
          c.command.toLowerCase().includes(search) ||
          c.purpose.toLowerCase().includes(search) ||
          c.category.toLowerCase().includes(search)
        );
        filteredCli.forEach(c => {
          const div = document.createElement('div');
          div.className = 'card';
          div.style.marginTop = '0';
          div.innerHTML = `
            <span class="badge-type">${c.category}</span>
            <div class="code-block">${c.command}</div>
            <div style="font-size:0.88rem; color:var(--md-on-surface-variant);">${c.purpose}</div>
          `;
          container.appendChild(div);
        });
        break;

      case 'deck':
        const cards = this.guideData.flashcards;
        if (!cards || cards.length === 0) return;
        
        const card = cards[this.deckCardIndex];
        const deckDiv = document.createElement('div');
        deckDiv.className = 'deck-container';
        deckDiv.innerHTML = `
          <div class="flashcard-3d-wrapper ${this.deckFlipped ? 'flipped' : ''}" onclick="app.toggleDeckFlip()">
            <div class="flashcard-3d-card">
              <div class="flashcard-face flashcard-face-front">
                <span class="card-hint-pill">
                  <span class="material-symbols-outlined" style="font-size:1rem;">quiz</span> Question / Concept
                </span>
                <div class="card-main-text">${card.front}</div>
                <small style="color:var(--md-secondary);">Click card to flip 🔄</small>
              </div>
              <div class="flashcard-face flashcard-face-back">
                <span class="card-hint-pill" style="background:var(--md-surface); color:var(--md-primary);">
                  <span class="material-symbols-outlined" style="font-size:1rem;">lightbulb</span> Answer & Reasoning
                </span>
                <div class="card-main-text">${card.back}</div>
                <small style="opacity:0.8;">Click card to flip 🔄</small>
              </div>
            </div>
          </div>

          <div class="deck-controls">
            <button class="btn-secondary" onclick="app.navigateDeck(-1)" ${this.deckCardIndex === 0 ? 'disabled' : ''}>
              <span class="material-symbols-outlined">arrow_back</span> Prev
            </button>
            <button class="btn-primary" onclick="app.toggleDeckFlip()">
              <span class="material-symbols-outlined">sync</span> Flip Card
            </button>
            <button class="btn-secondary" onclick="app.shuffleFlashcards()">
              <span class="material-symbols-outlined">shuffle</span> Shuffle
            </button>
            <button class="btn-secondary" onclick="app.navigateDeck(1)" ${this.deckCardIndex === cards.length - 1 ? 'disabled' : ''}>
              Next <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
          <small style="color:var(--md-on-surface-variant);">Card ${this.deckCardIndex + 1} of ${cards.length}</small>
        `;
        container.appendChild(deckDiv);
        break;
    }
  }

  toggleDeckFlip() {
    this.deckFlipped = !this.deckFlipped;
    this.renderGuideContent();
  }

  shuffleFlashcards() {
    if (this.guideData?.flashcards) {
      this.guideData.flashcards = this.shuffle(this.guideData.flashcards);
      this.deckCardIndex = 0;
      this.deckFlipped = false;
      this.renderGuideContent();
    }
  }

  navigateDeck(dir) {
    const cards = this.guideData?.flashcards || [];
    const nextIdx = this.deckCardIndex + dir;
    if (nextIdx >= 0 && nextIdx < cards.length) {
      this.deckCardIndex = nextIdx;
      this.deckFlipped = false;
      this.renderGuideContent();
    }
  }

  /* --- QUIZ ENGINE METHODS --- */
  shuffle(array) {
    return array.map(v => ({ v, sort: Math.random() }))
                .sort((a, b) => a.sort - b.sort)
                .map(({ v }) => v);
  }

  classifyQuestion(q) {
    const content = (q.question + ' ' + (q.options ? q.options.join(' ') : '') + ' ' + (q.explanation || '')).toLowerCase();
    
    if (content.match(/iam|role|permission|service account|workload identity|secret manager|audit log|kms|key|encrypt|signed url|access control|binary authorization|organization policy|firewall/i)) {
      return 'Section 5: Access & Security';
    }
    if (content.match(/monitor|logging|stackdriver|alert|metric|autoscal|health check|backup|snapshot|troubleshoot|quota|billing alert|cost|trace|debugger/i)) {
      return 'Section 4: Ensuring Successful Operation';
    }
    if (content.match(/deploy|cloud build|gke|kubernetes|container|cloud function|cloud run|terraform|deployment manager|ci\/cd|pipeline|mig|instance group/i)) {
      return 'Section 3: Deploying & Implementing';
    }
    if (content.match(/plan|calculator|pricing|storage class|nearline|coldline|archive|cloud sql|spanner|bigtable|firestore|subnet|vpc|load balancer|redis|memorystore/i)) {
      return 'Section 2: Planning & Configuring';
    }
    return 'Section 1: Setting up Environment';
  }

  isMultiAnswer(q) {
    return Array.isArray(q.correct) && q.correct.length > 1;
  }

  isQuestionCorrect(qIdx) {
    const q = this.activeQuestions[qIdx];
    if (!q) return false;

    const userSelected = this.userAnswers[qIdx] || [];
    if (userSelected.length === 0) return false;

    const chosenOriginals = userSelected.map(optIdx => q.shuffledOptions[optIdx].originalIndex).sort((a, b) => a - b);
    const correctOriginals = (Array.isArray(q.correct) ? q.correct : [q.correct]).sort((a, b) => a - b);

    if (chosenOriginals.length !== correctOriginals.length) return false;
    return chosenOriginals.every((val, idx) => val === correctOriginals[idx]);
  }

  startFullSet(mode) {
    this.mode = mode === 'all' ? 'practice' : mode;
    if (this.allQuestions.length === 0) {
      this.showModal({
        title: 'Loading Issue',
        message: 'Questions are still loading or failed to load. Please verify your web server connection.'
      });
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
    } else if (mode === 'all') {
      const shuffled = this.shuffle([...this.allQuestions]);
      this.prepareQuizState(shuffled);
    } else {
      const shuffled = this.shuffle([...this.allQuestions]);
      this.prepareQuizState(shuffled.slice(0, Math.min(60, shuffled.length)));
    }
  }

  startIndividualSet(mode) {
    const selectVal = document.getElementById('individual-set-select').value;
    if (selectVal === "") {
      this.showModal({
        title: 'Selection Required',
        message: 'Please select a question set or group first.'
      });
      return;
    }
    this.mode = mode;
    let filtered = [];

    if (selectVal.startsWith('group:')) {
      const groupType = selectVal.split(':')[1];
      filtered = this.allQuestions.filter(q => q.sourceType === groupType);
    } else {
      const selectIdx = parseInt(selectVal, 10);
      const file = FILE_MANIFEST[selectIdx];
      filtered = this.allQuestions.filter(q => q.sourceLabel === file.label);
    }

    if (filtered.length === 0) {
      this.showModal({
        title: 'No Questions',
        message: 'No questions found for the selected option.'
      });
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
        shuffledOptions
      };
    });

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('guide-screen').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('quiz-screen').classList.remove('hidden');
    document.getElementById('quiz-meta').classList.remove('hidden');
    document.getElementById('home-btn').classList.remove('hidden');

    const submitBtn = document.getElementById('submit-exam-btn');
    if (this.mode === 'mock') {
      this.startTimer(120 * 60);
      document.getElementById('action-btn').classList.add('hidden');
      submitBtn.textContent = 'Submit Final Exam';
    } else {
      document.getElementById('action-btn').classList.remove('hidden');
      submitBtn.textContent = 'Finish & View Results';
    }

    this.renderQuestion();
    this.renderPalette();
  }

  renderQuestion() {
    const q = this.activeQuestions[this.currentIndex];
    if (!q) return;

    const isMulti = this.isMultiAnswer(q);
    const correctCount = Array.isArray(q.correct) ? q.correct.length : 1;

    document.getElementById('progress-display').textContent = `Question ${this.currentIndex + 1} of ${this.activeQuestions.length}`;
    document.getElementById('source-badge').textContent = q.sourceLabel;
    
    const typeBadge = document.getElementById('question-type-badge');
    typeBadge.textContent = isMulti ? `Select ${correctCount} Options` : 'Single Choice';

    document.getElementById('q-text').textContent = q.question;

    const optionsContainer = document.getElementById('options-container');
    optionsContainer.innerHTML = '';

    const isSubmitted = !!this.submittedAnswers[this.currentIndex];
    const isFlashcard = this.mode === 'flashcard';
    const userSelected = this.userAnswers[this.currentIndex] || [];

    if (isFlashcard) {
      document.getElementById('flashcard-reveal').classList.remove('hidden');
      document.getElementById('action-btn').classList.add('hidden');
    } else {
      document.getElementById('flashcard-reveal').classList.add('hidden');
    }

    q.shuffledOptions.forEach((opt, idx) => {
      const btn = document.createElement('button');
      const isSelected = userSelected.includes(idx);
      btn.className = `option-btn ${isSelected ? 'selected' : ''}`;

      if (isSubmitted || (isFlashcard && this.submittedAnswers[this.currentIndex])) {
        const isOptCorrect = Array.isArray(q.correct)
          ? q.correct.includes(opt.originalIndex)
          : opt.originalIndex === q.correct;

        if (isOptCorrect) {
          btn.classList.add('correct');
        } else if (isSelected) {
          btn.classList.add('incorrect');
        }
      }

      const prefix = isMulti ? (isSelected ? '☑ ' : '☐ ') : '';
      btn.textContent = `${prefix}${String.fromCharCode(65 + idx)}) ${opt.text}`;
      
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
    const q = this.activeQuestions[this.currentIndex];
    const isMulti = this.isMultiAnswer(q);
    let current = this.userAnswers[this.currentIndex] || [];

    if (isMulti) {
      if (current.includes(idx)) {
        current = current.filter(i => i !== idx);
      } else {
        current.push(idx);
      }
    } else {
      current = [idx];
    }

    this.userAnswers[this.currentIndex] = current;
    this.renderQuestion();
  }

  handlePrimaryAction() {
    if (this.mode === 'practice') {
      const userSelected = this.userAnswers[this.currentIndex] || [];
      if (userSelected.length === 0) {
        this.showModal({
          title: 'Selection Required',
          message: 'Please select an answer option before submitting.'
        });
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

      const isSubmitted = !!this.submittedAnswers[idx];
      const isAnswered = (this.userAnswers[idx] || []).length > 0;

      if (isSubmitted) {
        if (this.isQuestionCorrect(idx)) {
          node.classList.add('palette-correct');
        } else {
          node.classList.add('palette-incorrect');
        }
      } else if (isAnswered) {
        node.classList.add('answered');
      }
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
        this.executeFinishQuiz();
      }
    }, 1000);
  }

  finishQuiz() {
    const confirmMsg = this.mode === 'mock' 
      ? "Are you sure you want to submit your final exam now?" 
      : "Are you sure you want to end practice mode and view your overall score?";

    this.showModal({
      title: 'Finish Session',
      message: confirmMsg,
      isConfirm: true,
      onConfirm: () => this.executeFinishQuiz()
    });
  }

  executeFinishQuiz() {
    if (this.timer) clearInterval(this.timer);
    let correctCount = 0;

    this.activeQuestions.forEach((_, idx) => {
      if (this.isQuestionCorrect(idx)) {
        correctCount++;
      }
    });

    const scorePct = this.activeQuestions.length > 0 
      ? Math.round((correctCount / this.activeQuestions.length) * 100) 
      : 0;

    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('quiz-meta').classList.add('hidden');
    document.getElementById('results-screen').classList.remove('hidden');
    document.getElementById('home-btn').classList.remove('hidden');

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

      if (this.isQuestionCorrect(idx)) {
        domainStats[q.domain].correct++;
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
      const userSelected = this.userAnswers[qIdx] || [];
      const isCorrect = this.isQuestionCorrect(qIdx);

      let optionsHtml = '<ul class="review-options">';
      q.shuffledOptions.forEach((opt, optIdx) => {
        let badgeClass = '';
        let tag = '';

        const isOptCorrect = Array.isArray(q.correct)
          ? q.correct.includes(opt.originalIndex)
          : opt.originalIndex === q.correct;

        const isUserChoice = userSelected.includes(optIdx);

        if (isOptCorrect) {
          badgeClass = 'badge-correct';
          tag = ' (Correct Answer)';
        }
        if (isUserChoice) {
          if (!isOptCorrect) badgeClass = 'badge-incorrect';
          tag += ' 👈 Your Choice';
        }

        optionsHtml += `<li class="${badgeClass}">${String.fromCharCode(65 + optIdx)}) ${opt.text} <strong>${tag}</strong></li>`;
      });
      optionsHtml += '</ul>';

      contentHtml += `
        <div class="review-card ${isCorrect ? 'review-correct' : 'review-incorrect'}">
          <div style="display:flex; justify-content:space-between; align-items:center;">
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
    this.executeExitToMenu();
  }

  exitToMenu() {
    const isQuizActive = !document.getElementById('quiz-screen').classList.contains('hidden');
    
    if (isQuizActive && this.mode === 'mock') {
      this.showModal({
        title: 'Exit Exam',
        message: 'Are you sure you want to exit the exam? Your progress and timer will be reset.',
        isConfirm: true,
        onConfirm: () => this.executeExitToMenu()
      });
    } else {
      this.executeExitToMenu();
    }
  }

  executeExitToMenu() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    document.getElementById('quiz-screen').classList.add('hidden');
    document.getElementById('quiz-meta').classList.add('hidden');
    document.getElementById('results-screen').classList.add('hidden');
    document.getElementById('guide-screen').classList.add('hidden');
    document.getElementById('home-btn').classList.add('hidden'); // Hide Home button when on setup dashboard
    document.getElementById('setup-screen').classList.remove('hidden');
  }

  printResults() {
    window.print();
  }
}

const app = new GCPQuizEngine();