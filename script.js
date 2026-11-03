//AI recommendtion !!!
(function () {

  
  let studyData = {};
  let activeSubject = 'all';
  let activeStatus = 'all';
  let searchQuery = '';
  let watchedVideos = new Set();

  // DOM 
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

  // Stats 
  const statSubjects = document.getElementById('statSubjects');
  const statVideos = document.getElementById('statVideos');
  const statProgressText = document.getElementById('statProgressText');
  const progressBarFill = document.getElementById('progressBarFill');

  // Modal 
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

    // Check if user has saved live changes via YTB_Control
    try {
      const custom = localStorage.getItem('mystudies_custom_data');
      if (custom) {
        const parsedCustom = JSON.parse(custom);
        if (parsedCustom && Object.keys(parsedCustom).length > 0) {
          studyData = parsedCustom;
          loaded = true;
        }
      }
    } catch (e) {}

    // Check if window.STUDY_VIDEOS_DATA is available right away
    if (!loaded && window.STUDY_VIDEOS_DATA && Object.keys(window.STUDY_VIDEOS_DATA).length > 0) {
      studyData = JSON.parse(JSON.stringify(window.STUDY_VIDEOS_DATA));
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
      resultsCount.textContent = 'Ro7 Zakre F7etta Tanwa !!! <3';
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
    if (s.includes('MATH')) return 'badge-MATH';
    if (s.includes('chemistry')) return 'badge-chemistry';
    if (s.includes('computer')) return 'badge-cs';
    if (s.includes('drawing')) return 'badge-drawing';
    if (s.includes('general')) return 'badge-general';
    if (s.includes('mechanics')) return 'badge-mechanics';
    if (s.includes('physics')) return 'badge-physics';
    return 'badge-general';
  }

  // Cache for authentic YouTube titles
  const youtubeTitleCache = {};
  try {
    const cached = localStorage.getItem('mystudies_yt_titles');
    if (cached) Object.assign(youtubeTitleCache, JSON.parse(cached));
  } catch (e) {}

  function saveTitleCache() {
    try {
      localStorage.setItem('mystudies_yt_titles', JSON.stringify(youtubeTitleCache));
    } catch (e) {}
  }

  async function fetchRealYouTubeTitle(videoId, callback) {
    if (!videoId) return;
    if (youtubeTitleCache[videoId]) {
      callback(youtubeTitleCache[videoId]);
      return;
    }
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.title) {
          youtubeTitleCache[videoId] = data.title;
          saveTitleCache();
          callback(data.title);
        }
      }
    } catch (e) {
      // Offline or network error fallback
    }
  }

  function extractYouTubeId(url) {
    if (!url) return '';
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : url.trim();
  }

  function getAllVideos() {
    const all = [];
    const seenVideos = new Set();

    for (const [subject, list] of Object.entries(studyData)) {
      if (!Array.isArray(list)) continue;
      for (const rawItem of list) {
        const url = rawItem.url || rawItem.link || '';
        const videoId = rawItem.videoId || extractYouTubeId(url);

        // Deduplicate: ignore repeated videos within the same subject
        const dedupKey = `${subject}:::${videoId || url}`;
        if (dedupKey && seenVideos.has(dedupKey)) {
          continue;
        }
        if (dedupKey) {
          seenVideos.add(dedupKey);
        }

        const pdf = rawItem.pdf || 'Custom Video';
        const title = (videoId && youtubeTitleCache[videoId]) || rawItem.title || 'YouTube Video';
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

      // Auto-fetch and sync the authentic YouTube title
      if (item.videoId) {
        fetchRealYouTubeTitle(item.videoId, (realTitle) => {
          if (realTitle && titleElem.textContent !== realTitle) {
            titleElem.textContent = realTitle;
            titleElem.title = realTitle;
            item.title = realTitle;
          }
        });
      }

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
    if (modalSource) modalSource.textContent = '';
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


  // --------------------------------------------------------------------------
  // 7. YTB_Control: Live Browser Console Controller
  // --------------------------------------------------------------------------
  window.YTB_Control = async function (category, url) {
    if (!category) {
      console.log(
        '%c[YTB_Control Guide]%c\n' +
        '• Add Video:    YTB_Control("MATH 1", "https://www.youtube.com/watch?v=...")\n' +
        '• Delete Video: YTB_Control("Del", "https://www.youtube.com/watch?v=...")\n' +
        '• Export Data:  YTB_Control("export")\n' +
        '• Reset Data:   YTB_Control("reset")',
        'color: #3b82f6; font-weight: bold; font-size: 1.05em;', 'color: inherit;'
      );
      return 'YTB_Control ready. Pass a category and URL to add/delete.';
    }

    const catNormalized = String(category).trim();

    // Command: Export code for videos_data.js
    if (catNormalized.toLowerCase() === 'export') {
      const code = 'window.STUDY_VIDEOS_DATA = ' + JSON.stringify(studyData, null, 2) + ';\n';
      console.log('%c[YTB_Control Export] Copy and paste this directly into videos_data.js:%c', 'color: #10b981; font-weight: bold;', '');
      console.log(code);
      return code;
    }

    // Command: Reset back to original videos_data.js
    if (catNormalized.toLowerCase() === 'reset') {
      localStorage.removeItem('mystudies_custom_data');
      if (window.STUDY_VIDEOS_DATA) {
        studyData = JSON.parse(JSON.stringify(window.STUDY_VIDEOS_DATA));
      }
      buildSubjectTabs();
      updateStats();
      renderVideos();
      console.log('%c[YTB_Control] Reset website back to default videos_data.js!%c', 'color: #f59e0b; font-weight: bold;', '');
      return 'Reset successful.';
    }

    if (!url) {
      console.warn('[YTB_Control] Please provide a YouTube URL.\nExample: YTB_Control("MATH 1", "https://www.youtube.com/watch?v=...")');
      return 'Missing URL.';
    }

    const cleanUrl = String(url).trim();
    const targetId = extractYouTubeId(cleanUrl);

    // Command: Delete Video ("Del", "del", "delete", "remove")
    if (['del', 'delete', 'remove'].includes(catNormalized.toLowerCase())) {
      let removedCount = 0;
      let removedFrom = [];

      for (const [subKey, items] of Object.entries(studyData)) {
        if (!Array.isArray(items)) continue;
        const initialLen = items.length;
        studyData[subKey] = items.filter(item => {
          const itemUrl = item.url || item.link || '';
          const itemId = item.videoId || extractYouTubeId(itemUrl);
          const isMatch = (targetId && itemId === targetId) || (itemUrl && itemUrl === cleanUrl);
          return !isMatch;
        });
        if (studyData[subKey].length < initialLen) {
          removedCount += (initialLen - studyData[subKey].length);
          removedFrom.push(subKey);
        }
      }

      if (removedCount > 0) {
        localStorage.setItem('mystudies_custom_data', JSON.stringify(studyData));
        buildSubjectTabs();
        updateStats();
        renderVideos();

        console.log(
          `%c[YTB_Control] Successfully deleted video from [${removedFrom.join(', ')}]!%c`,
          'color: #ef4444; font-weight: bold;', ''
        );
        console.log('Updated videos_data.js code (saved to browser storage):');
        console.log('window.STUDY_VIDEOS_DATA = ' + JSON.stringify(studyData, null, 2) + ';');
        return `Deleted ${removedCount} video(s) matching "${cleanUrl}".`;
      } else {
        console.warn(`[YTB_Control] No video found matching: ${cleanUrl}`);
        return 'Video not found.';
      }
    }

    // Command: Add Video to Category
    let targetCategory = Object.keys(studyData).find(
      key => key.toLowerCase() === catNormalized.toLowerCase()
    );

    if (!targetCategory) {
      targetCategory = catNormalized;
      studyData[targetCategory] = [];
    }

    // Check if video is already in this category
    const alreadyExists = studyData[targetCategory].some(item => {
      const itemUrl = item.url || item.link || '';
      const itemId = item.videoId || extractYouTubeId(itemUrl);
      return (targetId && itemId === targetId) || (itemUrl && itemUrl === cleanUrl);
    });

    if (alreadyExists) {
      console.warn(`[YTB_Control] Video already exists in "${targetCategory}"!`);
      return `Video already exists in "${targetCategory}".`;
    }

    // Auto-fetch real YouTube title
    let videoTitle = 'YouTube Video';
    if (targetId) {
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(targetId)}&format=json`;
        const resp = await fetch(oembedUrl);
        if (resp.ok) {
          const odata = await resp.json();
          if (odata && odata.title) {
            videoTitle = odata.title;
            youtubeTitleCache[targetId] = odata.title;
            saveTitleCache();
          }
        }
      } catch (e) {}
    }

    const newVideo = {
      title: videoTitle,
      url: cleanUrl,
      videoId: targetId
    };

    studyData[targetCategory].push(newVideo);

    // Save to localStorage so it persists across page reloads on live web
    localStorage.setItem('mystudies_custom_data', JSON.stringify(studyData));

    buildSubjectTabs();
    updateStats();
    renderVideos();

    console.log(
      `%c[YTB_Control] Added video to "${targetCategory}"!%c\nTitle: ${videoTitle}\nURL: ${cleanUrl}`,
      'color: #10b981; font-weight: bold;', ''
    );
    console.log('Updated videos_data.js code (saved to browser storage):');
    console.log('window.STUDY_VIDEOS_DATA = ' + JSON.stringify(studyData, null, 2) + ';');

    return `Added to "${targetCategory}": ${videoTitle}`;
  };

  initTheme();
  loadWatchedState();
  setupEventListeners();
  loadData();
})();

