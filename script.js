// IndexedDB 数据库配置
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// 全局变量
let currentCategory = '';
let editingNoteId = null;
let db = null;

// 检测是否在iOS设备上
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
// 检测是否在微信环境中
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

// 安全的console.log包装函数
function safeLog(message) {
  if (typeof console !== 'undefined' && console.log) {
    console.log(message);
  }
}

// 初始化数据库
function initDB() {
  return new Promise((resolve, reject) => {
    try {
      // 检查浏览器是否支持IndexedDB
      if (!window.indexedDB) {
        safeLog('浏览器不支持IndexedDB，使用localStorage作为后备方案');
        resolve({ type: 'localStorage' });
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        safeLog('IndexedDB初始化失败:', event.target.error);
        // 如果是iOS设备且IndexedDB失败，使用localStorage作为后备方案
        if (isIOS) {
          safeLog('iOS设备IndexedDB失败，使用localStorage作为后备方案');
          resolve({ type: 'localStorage' });
        } else {
          reject(event.target.error);
        }
      };
      
      request.onsuccess = (event) => {
        safeLog('IndexedDB初始化成功');
        db = event.target.result;
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          safeLog('创建对象存储成功');
        }
      };
    } catch (error) {
      safeLog('初始化数据库时发生错误:', error);
      // 发生任何错误都使用localStorage作为后备方案
      resolve({ type: 'localStorage' });
    }
  });
}

// 数据库操作函数
async function getDB() {
  if (!db) {
    db = await initDB();
  }
  return db;
}

// 从localStorage获取所有笔记
function getAllNotesFromLocalStorage() {
  try {
    const notes = localStorage.getItem('notes');
    return notes ? JSON.parse(notes) : [];
  } catch (error) {
    safeLog('从localStorage读取笔记失败:', error);
    return [];
  }
}

// 保存笔记到localStorage
function saveNoteToLocalStorage(note) {
  try {
    const notes = getAllNotesFromLocalStorage();
    const existingIndex = notes.findIndex(n => n.id === note.id);
    
    if (existingIndex >= 0) {
      notes[existingIndex] = note;
    } else {
      notes.push(note);
    }
    
    localStorage.setItem('notes', JSON.stringify(notes));
    return note.id;
  } catch (error) {
    safeLog('保存笔记到localStorage失败:', error);
    throw error;
  }
}

// 从localStorage删除笔记
function deleteNoteFromLocalStorage(id) {
  try {
    const notes = getAllNotesFromLocalStorage();
    const filteredNotes = notes.filter(n => n.id !== id);
    localStorage.setItem('notes', JSON.stringify(filteredNotes));
  } catch (error) {
    safeLog('从localStorage删除笔记失败:', error);
    throw error;
  }
}

async function getAllNotes() {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return getAllNotesFromLocalStorage();
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        safeLog('获取笔记失败:', event.target.error);
        reject(event.target.error);
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      resolve(getAllNotesFromLocalStorage());
    }
  });
}

async function saveNoteToDB(note) {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return saveNoteToLocalStorage(note);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        safeLog('保存笔记失败:', event.target.error);
        // 如果IndexedDB失败，尝试使用localStorage
        try {
          const result = saveNoteToLocalStorage(note);
          resolve(result);
        } catch (localError) {
          reject(event.target.error);
        }
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      resolve(saveNoteToLocalStorage(note));
    }
  });
}

async function deleteNoteFromDB(id) {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return deleteNoteFromLocalStorage(id);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        safeLog('删除笔记失败:', event.target.error);
        // 如果IndexedDB失败，尝试使用localStorage
        try {
          deleteNoteFromLocalStorage(id);
          resolve();
        } catch (localError) {
          reject(event.target.error);
        }
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      deleteNoteFromLocalStorage(id);
      resolve();
    }
  });
}

// 主题切换
const themeInput = document.getElementById('themeColor');
themeInput.addEventListener('input', () => {
  document.documentElement.style.setProperty('--primary-color', themeInput.value);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(themeInput.value, -20));
  localStorage.setItem('theme', themeInput.value);
});

// 调整颜色亮度
function adjustBrightness(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// 加载主题
window.onload = async () => {
  const savedTheme = localStorage.getItem('theme') || '#2196F3';
  document.documentElement.style.setProperty('--primary-color', savedTheme);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(savedTheme, -20));
  themeInput.value = savedTheme;
  
  await initApp();
};

// 初始化应用
async function initApp() {
  try {
    safeLog('开始初始化应用...');
    
    // 显示加载状态
    const container = document.getElementById('notesList');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <p>正在加载笔记...</p>
        </div>
      `;
    }
    
    // 延迟初始化，确保DOM完全加载
    setTimeout(async () => {
      try {
        await renderNotes();
        await updateCategoryCounts();
        bindEvents();
        initializeCategoryFilter();
        
        safeLog('应用初始化成功');
        
        // 为iOS设备添加特殊处理
        if (isIOS) {
          safeLog('检测到iOS设备，应用特殊优化');
          // 修复iOS Safari的滚动问题
          document.body.style.overflow = 'auto';
          document.body.style.position = 'relative';
        }
        
        // 为微信环境添加特殊处理
        if (isWeChat) {
          safeLog('检测到微信环境，应用特殊优化');
          // 禁用微信的默认下拉刷新
          document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
              e.preventDefault();
            }
          }, { passive: false });
        }
        
      } catch (initError) {
        safeLog('应用初始化失败:', initError);
        if (container) {
          container.innerHTML = `
            <div class="empty-state">
              <p>加载失败，请刷新页面重试</p>
            </div>
          `;
        }
      }
    }, 100);
    
  } catch (error) {
    safeLog('应用初始化失败:', error);
    alert('应用初始化失败，请刷新页面重试');
  }
}

// 初始化分类筛选下拉框
function initializeCategoryFilter() {
  const filterSelect = document.getElementById('categoryFilter');
  const categories = ['', '工作', '生活', '学习'];
  
  filterSelect.innerHTML = '';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category || '选择分类';
    filterSelect.appendChild(option);
  });
}

// 绑定事件
function bindEvents() {
  try {
    // 侧边栏切换 - 支持触摸事件
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
      sidebarToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleSidebar();
      }, { passive: false });
    }
    
    // 搜索功能
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
      searchInput.addEventListener('change', handleSearch); // 确保在移动设备上也能触发
    }
    
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) {
      dateFilter.addEventListener('change', handleDateFilter);
    }
    
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', handleCategoryFilter);
    }
    
    // 侧边栏搜索功能
    const sidebarSearch = document.getElementById('sidebarSearch');
    const sidebarDateFilter = document.getElementById('sidebarDateFilter');
    
    if (sidebarSearch) {
      sidebarSearch.addEventListener('input', handleSearch);
      sidebarSearch.addEventListener('change', handleSearch);
    }
    
    if (sidebarDateFilter) {
      sidebarDateFilter.addEventListener('change', handleDateFilter);
    }
    
    // 分类点击事件 - 支持触摸事件
    document.querySelectorAll('.category-item').forEach(item => {
      if (!item.classList.contains('add-category')) {
        item.addEventListener('click', () => {
          const category = item.dataset.category;
          selectCategory(category);
        });
        
        item.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const category = item.dataset.category;
          selectCategory(category);
        }, { passive: false });
      }
    });
    
    // 悬浮按钮事件 - 支持触摸事件
    const floatingBtn = document.querySelector('.floating-add-btn');
    if (floatingBtn) {
      floatingBtn.addEventListener('click', showAddDialog);
      floatingBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        showAddDialog();
      }, { passive: false });
    }
    
    // 模态框关闭按钮 - 支持触摸事件
    document.querySelectorAll('.close').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.classList.remove('show');
        }
      });
      
      closeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.classList.remove('show');
        }
      }, { passive: false });
    });
    
    // 模态框外部点击关闭
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
        }
      });
      
      modal.addEventListener('touchstart', (e) => {
        if (e.target === modal) {
          e.preventDefault();
          modal.classList.remove('show');
        }
      }, { passive: false });
    });
    
    safeLog('事件绑定成功');
  } catch (error) {
    safeLog('绑定事件时发生错误:', error);
  }
}

// 侧边栏切换（仅桌面端）
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const isMobile = window.innerWidth <= 768;
  
  // 仅在桌面端执行折叠/展开操作
  if (!isMobile) {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('collapsed');
  }
}

// 选择分类
async function selectCategory(category) {
  currentCategory = category;
  
  // 更新选中状态
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.category === category) {
      item.classList.add('active');
    }
  });
  
  // 更新标题
  const title = document.getElementById('current-category-title');
  switch(category) {
    case '':
      title.textContent = '全部笔记';
      break;
    case '工作':
      title.textContent = '工作笔记';
      break;
    case '生活':
      title.textContent = '生活笔记';
      break;
    case '学习':
      title.textContent = '学习笔记';
      break;
    default:
      title.textContent = category + '笔记';
  }
  
  // 渲染笔记
  await renderNotes();
}

// 处理搜索
async function handleSearch() {
  // 同步两个搜索框的值
  const mainSearch = document.getElementById('search');
  const sidebarSearch = document.getElementById('sidebarSearch');
  
  if (mainSearch && sidebarSearch) {
    if (event.target === mainSearch) {
      sidebarSearch.value = mainSearch.value;
    } else if (event.target === sidebarSearch) {
      mainSearch.value = sidebarSearch.value;
    }
  }
  
  await renderNotes();
}

// 处理日期筛选
async function handleDateFilter() {
  // 同步两个日期选择器的值
  const mainDateFilter = document.getElementById('dateFilter');
  const sidebarDateFilter = document.getElementById('sidebarDateFilter');
  
  if (mainDateFilter && sidebarDateFilter) {
    if (event.target === mainDateFilter) {
      sidebarDateFilter.value = mainDateFilter.value;
    } else if (event.target === sidebarDateFilter) {
      mainDateFilter.value = sidebarDateFilter.value;
    }
  }
  
  await renderNotes();
}

// 处理分类筛选
async function handleCategoryFilter() {
  const filterCategory = document.getElementById('categoryFilter').value;
  if (filterCategory) {
    await selectCategory(filterCategory);
  }
}

// 渲染笔记
async function renderNotes() {
  const notes = await getAllNotes();
  const searchTerm = document.getElementById('search').value.toLowerCase();
  const dateFilter = document.getElementById('dateFilter').value;
  const categoryFilter = document.getElementById('categoryFilter').value;
  
  // 应用筛选
  let filteredNotes = notes.filter(note => {
    // 搜索筛选
    const matchesSearch = !searchTerm || 
      note.title.toLowerCase().includes(searchTerm) || 
      note.content.toLowerCase().includes(searchTerm);
    
    // 日期筛选
    const matchesDate = !dateFilter || 
      note.createDate === dateFilter || 
      new Date(note.createTime).toISOString().split('T')[0] === dateFilter;
    
    // 分类筛选
    const matchesCategory = !currentCategory || note.category === currentCategory;
    const matchesFilterCategory = !categoryFilter || note.category === categoryFilter;
    
    return matchesSearch && matchesDate && matchesCategory && matchesFilterCategory;
  });
  
  // 按时间倒序排列
  filteredNotes.sort((a, b) => new Date(b.createTime || b.id) - new Date(a.createTime || a.id));
  
  // 渲染笔记卡片
  const container = document.getElementById('notesList');
  container.innerHTML = '';
  
  if (filteredNotes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无笔记，点击右下角"+"按钮添加</p>
      </div>
    `;
    return;
  }
  
  filteredNotes.forEach(note => {
    const card = createNoteCard(note);
    container.appendChild(card);
  });
}

// 创建笔记卡片
function createNoteCard(note) {
  try {
    const card = document.createElement('div');
    card.className = 'note-card';
    
    const date = note.createDate || new Date(note.id).toLocaleDateString('zh-CN');
    const time = note.createTime ? new Date(note.createTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    
    // 使用安全的HTML构建
    const headerDiv = document.createElement('div');
    headerDiv.className = 'note-header';
    
    const titleH3 = document.createElement('h3');
    titleH3.className = 'note-title';
    titleH3.textContent = note.title || '无标题';
    
    const categorySpan = document.createElement('span');
    categorySpan.className = 'note-category-badge';
    categorySpan.textContent = note.category || '未分类';
    
    headerDiv.appendChild(titleH3);
    headerDiv.appendChild(categorySpan);
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'note-content';
    contentDiv.textContent = note.content || '';
    
    const footerDiv = document.createElement('div');
    footerDiv.className = 'note-footer';
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'note-date';
    
    const dateSpan = document.createElement('span');
    dateSpan.textContent = `📅 ${date}`;
    
    dateDiv.appendChild(dateSpan);
    
    if (time) {
      const timeSpan = document.createElement('span');
      timeSpan.textContent = `⏰ ${time}`;
      dateDiv.appendChild(timeSpan);
    }
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'note-action-btn';
    editBtn.title = '编辑';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => editNote(note.id);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'note-action-btn';
    deleteBtn.title = '删除';
    deleteBtn.textContent = '🗑️';
    deleteBtn.onclick = () => deleteNote(note.id);
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    
    footerDiv.appendChild(dateDiv);
    footerDiv.appendChild(actionsDiv);
    
    card.appendChild(headerDiv);
    card.appendChild(contentDiv);
    
    // 处理图片
    if (note.img) {
      try {
        const img = document.createElement('img');
        img.src = note.img;
        img.className = 'note-image';
        img.alt = '笔记图片';
        img.onerror = () => {
          safeLog('图片加载失败:', note.img);
          img.style.display = 'none';
        };
        card.appendChild(img);
      } catch (imgError) {
        safeLog('创建图片元素失败:', imgError);
      }
    }
    
    card.appendChild(footerDiv);
    
    // 点击卡片查看详情 - 支持触摸事件
    const handleCardClick = (e) => {
      if (!e.target.closest('.note-actions')) {
        showNoteDetail(note);
      }
    };
    
    card.addEventListener('click', handleCardClick);
    card.addEventListener('touchstart', (e) => {
      e.preventDefault();
      handleCardClick(e);
    }, { passive: false });
    
    // 为编辑和删除按钮添加触摸事件支持
    editBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      editNote(note.id);
    }, { passive: false });
    
    deleteBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      deleteNote(note.id);
    }, { passive: false });
    
    return card;
  } catch (error) {
    safeLog('创建笔记卡片失败:', error);
    // 返回一个简单的错误卡片
    const errorCard = document.createElement('div');
    errorCard.className = 'note-card';
    errorCard.textContent = '加载笔记失败';
    return errorCard;
  }
}

// 显示笔记详情
function showNoteDetail(note) {
  const modal = document.getElementById('detailModal');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('noteDetail');
  
  title.textContent = note.title;
  
  const date = note.createDate || new Date(note.id).toLocaleDateString('zh-CN');
  const time = note.createTime ? new Date(note.createTime).toLocaleTimeString('zh-CN') : '';
  
  content.innerHTML = `
    <div class="detail-content">
      <p class="detail-meta">
        <span class="detail-category">分类：${note.category || '未分类'}</span>
        <span class="detail-date">日期：${date}</span>
        ${time ? `<span class="detail-time">时间：${time}</span>` : ''}
      </p>
      <div class="detail-text">${escapeHtml(note.content).replace(/\n/g, '<br>')}</div>
      ${note.img ? `<img src="${note.img}" class="detail-image" alt="笔记图片">` : ''}
      ${note.comments && note.comments.length > 0 ? `
        <div class="detail-comments">
          <h4>评论 (${note.comments.length})</h4>
          ${note.comments.map(comment => `<div class="comment">${escapeHtml(comment)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  modal.classList.add('show');
}

// 关闭详情对话框
function closeDetailDialog() {
  document.getElementById('detailModal').classList.remove('show');
}

// 显示新增对话框
function showAddDialog(noteId = null) {
  const modal = document.getElementById('addModal');
  const title = document.getElementById('modal-title');
  const formTitle = document.getElementById('title');
  const formContent = document.getElementById('content');
  const formCategory = document.getElementById('noteCategory');
  const formFile = document.getElementById('imgUpload');
  
  editingNoteId = noteId;
  
  // 重置表单
  formTitle.value = '';
  formContent.value = '';
  formCategory.value = currentCategory || '工作';
  formFile.value = '';
  
  if (noteId) {
    title.textContent = '编辑笔记';
    // 加载笔记数据
    loadNoteForEdit(noteId);
  } else {
    title.textContent = '新增笔记';
  }
  
  modal.classList.add('show');
}

// 加载笔记进行编辑
async function loadNoteForEdit(noteId) {
  const notes = await getAllNotes();
  const note = notes.find(n => n.id === noteId);
  
  if (note) {
    document.getElementById('title').value = note.title;
    document.getElementById('content').value = note.content;
    document.getElementById('noteCategory').value = note.category || '工作';
  }
}

// 关闭新增对话框
function closeAddDialog() {
  document.getElementById('addModal').classList.remove('show');
  editingNoteId = null;
}

// 关闭详情对话框
function closeDetailDialog() {
  document.getElementById('detailModal').classList.remove('show');
}

// 保存笔记
async function saveNote() {
  const title = document.getElementById('title').value.trim();
  const content = document.getElementById('content').value.trim();
  const category = document.getElementById('noteCategory').value;
  const file = document.getElementById('imgUpload').files[0];
  
  if (!title) {
    alert('请填写笔记标题');
    return;
  }
  
  if (!content) {
    alert('请填写笔记内容');
    return;
  }
  
  let img = '';
  let existingNote = null;
  
  // 如果是编辑模式，先获取现有笔记数据
  if (editingNoteId) {
    const notes = await getAllNotes();
    existingNote = notes.find(n => n.id === editingNoteId);
    if (existingNote) {
      img = existingNote.img || '';
    }
  }
  
  // 如果有新文件，读取新图片
  if (file) {
    try {
      img = await readFileAsDataURL(file);
    } catch (error) {
      console.error('读取图片文件失败:', error);
      alert('图片文件读取失败，请重试');
      return;
    }
  }
  
  const noteData = {
    title,
    content,
    category,
    img,
    comments: existingNote ? existingNote.comments : [],
    createTime: existingNote ? existingNote.createTime : new Date().toISOString(),
    createDate: existingNote ? existingNote.createDate : new Date().toLocaleDateString('zh-CN')
  };
  
  if (editingNoteId) {
    noteData.id = editingNoteId;
  } else {
    noteData.id = Date.now();
  }
  
  try {
    await saveNoteToDB(noteData);
    closeAddDialog();
    await renderNotes();
    await updateCategoryCounts();
  } catch (error) {
    console.error('保存笔记失败:', error);
    alert('保存失败，请重试');
  }
}

// 读取文件为DataURL - 增强版，支持iOS设备
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    try {
      // 检查文件大小限制（10MB）
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        safeLog('文件大小超过限制');
        alert('图片大小不能超过10MB');
        reject(new Error('文件大小超过限制'));
        return;
      }

      // 检查文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/jpg'];
      if (!allowedTypes.includes(file.type)) {
        safeLog('不支持的文件类型:', file.type);
        alert('只支持JPG、PNG、GIF、WebP格式的图片');
        reject(new Error('不支持的文件类型'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const result = e.target.result;
          // 检查结果是否有效
          if (!result || typeof result !== 'string' || !result.startsWith('data:image')) {
            safeLog('文件读取结果无效');
            reject(new Error('文件读取失败'));
            return;
          }
          
          // 对于iOS设备，可能需要额外的处理
          if (isIOS) {
            safeLog('iOS设备文件读取成功，大小:', result.length);
          }
          
          resolve(result);
        } catch (loadError) {
          safeLog('处理文件读取结果时发生错误:', loadError);
          reject(loadError);
        }
      };
      
      reader.onerror = (e) => {
        safeLog('文件读取失败:', e);
        reject(new Error('文件读取失败'));
      };
      
      reader.onabort = () => {
        safeLog('文件读取被中止');
        reject(new Error('文件读取被中止'));
      };
      
      // 开始读取文件
      reader.readAsDataURL(file);
      
    } catch (error) {
      safeLog('创建文件读取器时发生错误:', error);
      reject(error);
    }
  });
}

// 编辑笔记
function editNote(noteId) {
  showAddDialog(noteId);
}

// 删除笔记
async function deleteNote(noteId) {
  if (confirm('确定要删除这条笔记吗？')) {
    await deleteNoteFromDB(noteId);
    await renderNotes();
    await updateCategoryCounts();
  }
}

// 更新分类计数
async function updateCategoryCounts() {
  const notes = await getAllNotes();
  
  const counts = {
    total: notes.length,
    work: notes.filter(n => n.category === '工作').length,
    life: notes.filter(n => n.category === '生活').length,
    study: notes.filter(n => n.category === '学习').length
  };
  
  document.getElementById('total-count').textContent = counts.total;
  document.getElementById('work-count').textContent = counts.work;
  document.getElementById('life-count').textContent = counts.life;
  document.getElementById('study-count').textContent = counts.study;
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 点击模态框外部关闭
window.onclick = (event) => {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    if (event.target === modal) {
      modal.classList.remove('show');
    }
  });
};

// 按ESC键关闭模态框
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const modals = document.querySelectorAll('.modal.show');
    modals.forEach(modal => {
      modal.classList.remove('show');
    });
  }
});