//AI recommendtion !!!
(function () {
  
  // State
  let studyData = {};
  let activeSubject = 'all';
  let activeStatus = 'all'; // 'all' | 'watched' | 'unwatched'
  let searchQuery = '';
  let watchedVideos = new Set();

  // DOM Elements
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const subjectTabs = document.getElementById('subjectTabs');
  const statusButtons = document.querySelectorAll('.status-btn');
  const videosGrid = document.getElementById('videosGrid');
  const emptyState = document.getElementById('emptyState');
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const activeSubjectHeading = document.getElementById('activeSubjectHeading');
  const resultsCount = document.getElementById('resultsCount');

  // Stats Elements
  const statSubjects = document.getElementById('statSubjects');
  const statVideos = document.getElementById('statVideos');
  const statProgressText = document.getElementById('statProgressText');
  const progressBarFill = document.getElementById('progressBarFill');

  // Modal Elements
  const videoModal = document.getElementById('videoModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const videoIframe = document.getElementById('videoIframe');
  const modalSubject = document.getElementById('modalSubject');
  const modalTitle = document.getElementById('modalTitle');
  const modalSource = document.getElementById('modalSource');
  const modalExternalLink = document.getElementById('modalExternalLink');

  // --------------------------------------------------------------------------
  // 1. Initialization & LocalStorage
  // --------------------------------------------------------------------------
  function initTheme() {
    const savedTheme = localStorage.getItem('mystudies_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('mystudies_theme', nextTheme);
  }

  function loadWatchedState() {
    try {
      const stored = localStorage.getItem('mystudies_watched');
      if (stored) {
        watchedVideos = new Set(JSON.parse(stored));
      }
    } catch (e) {
      console.warn('Could not parse watched state from localStorage', e);
    }
  }

  function saveWatchedState() {
    try {
      localStorage.setItem('mystudies_watched', JSON.stringify(Array.from(watchedVideos)));
    } catch (e) {
      console.warn('Could not save watched state to localStorage', e);
    }
    updateStats();
  }

  // --------------------------------------------------------------------------
  // 2. Data Loading & Markdown Parsing
  // --------------------------------------------------------------------------
 
  function parseMarkdownData(mdContent) {
    const data = {};
    const lines = mdContent.split(/\r?\n/);
    let currentSubject = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (line.startsWith('## ')) {
        currentSubject = line.substring(3).trim();
        if (currentSubject && !data[currentSubject]) {
          data[currentSubject] = [];
        }
        continue;
      }

      if (currentSubject && line.startsWith('- **')) {
        const match = line.match(/^-\s+\*\*(.+?)\*\*:\s+\[(.+?)\]\((https:\/\/youtu\.be\/([a-zA-Z0-9_-]+))\)/);
        if (match) {
          const [, pdf, title, url, videoId] = match;
          data[currentSubject].push({
            pdf: pdf.trim(),
            title: title.trim(),
            url: url.trim(),
            videoId: videoId.trim()
          });
        }
      }
    }
    return data;
  }

  /**
   * Loads data: attempts to fetch MyStudies_Videos.md directly,
   * with fallback to window.STUDY_VIDEOS_DATA (videos_data.js) for file:/// compatibility.
   */
  async function loadData() {
    let loaded = false;

    // Check if window.STUDY_VIDEOS_DATA is available right away
    if (window.STUDY_VIDEOS_DATA && Object.keys(window.STUDY_VIDEOS_DATA).length > 0) {
      studyData = window.STUDY_VIDEOS_DATA;
      loaded = true;
    }

    // Attempt to fetch MyStudies_Videos.md for live sync if available
    try {
      const response = await fetch('MyStudies_Videos.md');
      if (response.ok) {
        const text = await response.text();
        const parsed = parseMarkdownData(text);
        if (Object.keys(parsed).length > 0) {
          studyData = parsed;
          loaded = true;
        }
      }
    } catch (err) {
      // Fetch blocked by local CORS policy (file:// protocol), safely fallback to window.STUDY_VIDEOS_DATA
      console.log('Serving from bundled video data (local environment)');
    }

    if (!loaded) {
      resultsCount.textContent = 'Unable to load study data.';
      return;
    }

    buildSubjectTabs();
    updateStats();
    renderVideos();
  }

  // --------------------------------------------------------------------------
  // 3. UI Helpers & Stats
  // --------------------------------------------------------------------------
  function getSubjectClass(subjectName) {
    const s = subjectName.toLowerCase();
    if (s.includes('calculus')) return 'badge-calculus';
    if (s.includes('chemistry')) return 'badge-chemistry';
    if (s.includes('computer')) return 'badge-cs';
    if (s.includes('drawing')) return 'badge-drawing';
    if (s.includes('general')) return 'badge-general';
    if (s.includes('mechanics')) return 'badge-mechanics';
    if (s.includes('physics')) return 'badge-physics';
    return 'badge-general';
  }

  function extractYouTubeId(url) {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : url.trim();
  }

  function getAllVideos() {
    const all = [];
    for (const [subject, list] of Object.entries(studyData)) {
      if (!Array.isArray(list)) continue;
      for (const rawItem of list) {
        const url = rawItem.url || rawItem.link || '';
        const videoId = rawItem.videoId || extractYouTubeId(url);
        const pdf = rawItem.pdf || 'Custom Video';
        const title = rawItem.title || 'Untitled Video';
        all.push({
          ...rawItem,
          title,
          url: url || (videoId ? `https://youtu.be/${videoId}` : '#'),
          videoId,
          pdf,
          subject
        });
      }
    }
    return all;
  }

  function updateStats() {
    const subjects = Object.keys(studyData);
    const allVideos = getAllVideos();
    const totalCount = allVideos.length;

    let watchedCount = 0;
    for (const v of allVideos) {
      if (watchedVideos.has(v.videoId)) {
        watchedCount++;
      }
    }

    statSubjects.textContent = subjects.length;
    statVideos.textContent = totalCount;
    statProgressText.textContent = `${watchedCount} / ${totalCount} watched`;

    const percentage = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;
    progressBarFill.style.width = `${percentage}%`;
  }

  function buildSubjectTabs() {
    subjectTabs.innerHTML = '';

    // "All Subjects" Tab
    const allBtn = document.createElement('button');
    allBtn.className = 'tab-btn active';
    allBtn.dataset.subject = 'all';
    allBtn.textContent = 'All Subjects';
    subjectTabs.appendChild(allBtn);

    for (const [subject, list] of Object.entries(studyData)) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.dataset.subject = subject;
      btn.textContent = `${subject} (${list.length})`;
      subjectTabs.appendChild(btn);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Rendering Video Cards
  // --------------------------------------------------------------------------
  function renderVideos() {
    const allVideos = getAllVideos();
    const query = searchQuery.trim().toLowerCase();

    // Filter
    const filtered = allVideos.filter(item => {
      // Subject filter
      if (activeSubject !== 'all' && item.subject !== activeSubject) {
        return false;
      }

      // Status filter
      const isWatched = watchedVideos.has(item.videoId);
      if (activeStatus === 'watched' && !isWatched) return false;
      if (activeStatus === 'unwatched' && isWatched) return false;

      // Search query filter
      if (query) {
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchPdf = item.pdf.toLowerCase().includes(query);
        const matchSubject = item.subject.toLowerCase().includes(query);
        if (!matchTitle && !matchPdf && !matchSubject) {
          return false;
        }
      }
      return true;
    });

    // Update Headings & Count
    activeSubjectHeading.textContent = activeSubject === 'all' ? 'All Subjects' : activeSubject;
    resultsCount.textContent = `Showing ${filtered.length} lesson${filtered.length === 1 ? '' : 's'}`;

    if (filtered.length === 0) {
      videosGrid.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    videosGrid.innerHTML = '';

    const fragment = document.createDocumentFragment();

    filtered.forEach(item => {
      const isWatched = watchedVideos.has(item.videoId);
      const card = document.createElement('article');
      card.className = `video-card ${isWatched ? 'watched' : ''}`;
      card.dataset.videoId = item.videoId;

      const thumbUrl = `https://img.youtube.com/vi/${item.videoId}/mqdefault.jpg`;
      card.innerHTML = `
        <div class="card-thumbnail-wrap" title="Click to watch: ${escapeHtml(item.title)}">
          <img class="card-thumbnail" src="${thumbUrl}" alt="${escapeHtml(item.title)}" loading="lazy">
          <div class="play-overlay">
            <div class="play-circle">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
        </div>
        <div class="card-content">
          <div class="card-source-pdf" title="${escapeHtml(item.pdf)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span>${escapeHtml(item.pdf)}</span>
          </div>
          <h3 class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h3>
          <div class="card-footer">
            <button class="btn-watch" type="button">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              Watch
            </button>
            <div class="watched-toggle-wrap">
              <div class="checkbox-wrapper-12">
                <div class="cbx">
                  <input type="checkbox" id="cbx-${escapeHtml(item.videoId)}" class="watch-checkbox" ${isWatched ? 'checked' : ''}>
                  <label for="cbx-${escapeHtml(item.videoId)}"></label>
                  <svg fill="none" viewBox="0 0 15 14" height="14" width="15">
                    <path d="M2 8.36364L6.23077 12L13 2"></path>
                  </svg>
                </div>
              </div>
              <label for="cbx-${escapeHtml(item.videoId)}" class="watched-text">Watched</label>
            </div>
          </div>
        </div>
      `;

      // Event: Click to Watch
      const thumbWrap = card.querySelector('.card-thumbnail-wrap');
      const titleElem = card.querySelector('.card-title');
      const watchBtn = card.querySelector('.btn-watch');

      const openPlayer = () => openVideoModal(item);
      thumbWrap.addEventListener('click', openPlayer);
      titleElem.addEventListener('click', openPlayer);
      watchBtn.addEventListener('click', openPlayer);

      // Event: Watched Checkbox
      const checkbox = card.querySelector('.watch-checkbox');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          watchedVideos.add(item.videoId);
          card.classList.add('watched');
        } else {
          watchedVideos.delete(item.videoId);
          card.classList.remove('watched');
        }
        saveWatchedState();
      });

      fragment.appendChild(card);
    });

    videosGrid.appendChild(fragment);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --------------------------------------------------------------------------
  // 5. Video Player Modal
  // --------------------------------------------------------------------------
  function openVideoModal(item) {
    modalSubject.textContent = item.subject;
    modalTitle.textContent = item.title;
    modalSource.textContent = `PDF Assignment: ${item.pdf}`;
    modalExternalLink.href = item.url;

    // Use youtube-nocookie embed with autoplay enabled
    videoIframe.src = `https://www.youtube-nocookie.com/embed/${item.videoId}?autoplay=1`;
    videoModal.classList.add('active');
    videoModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeVideoModal() {
    videoModal.classList.remove('active');
    videoModal.setAttribute('aria-hidden', 'true');
    // Clear iframe src to stop video playback immediately
    videoIframe.src = '';
    document.body.style.overflow = '';
  }

  // --------------------------------------------------------------------------
  // 6. Event Listeners
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // Theme Toggle
    themeToggleBtn.addEventListener('click', toggleTheme);

    // Subject Tabs
    subjectTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab-btn');
      if (!tab) return;
      subjectTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      tab.classList.add('active');
      activeSubject = tab.dataset.subject;
      renderVideos();
    });

    // Status Filter Buttons (All, Unwatched, Watched)
    statusButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        statusButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeStatus = btn.dataset.status;
        renderVideos();
      });
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      clearSearchBtn.style.display = searchQuery ? 'block' : 'none';
      renderVideos();
    });

    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      clearSearchBtn.style.display = 'none';
      searchInput.focus();
      renderVideos();
    });

    // Reset Filters
    resetFiltersBtn.addEventListener('click', () => {
      searchQuery = '';
      searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      activeSubject = 'all';
      activeStatus = 'all';

      subjectTabs.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.subject === 'all');
      });
      statusButtons.forEach(b => {
        b.classList.toggle('active', b.dataset.status === 'all');
      });

      renderVideos();
    });

    // Modal Close Events
    closeModalBtn.addEventListener('click', closeVideoModal);

    videoModal.addEventListener('click', (e) => {
      if (e.target === videoModal) {
        closeVideoModal();
      }
    });

    // Global Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && videoModal.classList.contains('active')) {
        closeVideoModal();
      } else if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

 
  initTheme();
  loadWatchedState();
  setupEventListeners();
  loadData();
})();

